import { z } from "zod";
import { Effect, Layer } from "effect";
import { TRPCError } from "@trpc/server";
import { MIN_FACTS_FOR_QUIZ } from "@/constants/quiz";
import { FactRepository, FactRepositoryLive } from "@/server/effect/fact-repository";
import { gradeQuizItems } from "@/server/effect/quiz-grader";
import {
  QuestionGenerator,
  QuestionGeneratorLive,
} from "@/server/effect/question-generator";
import {
  QuestionRepository,
  QuestionRepositoryLive,
} from "@/server/effect/question-repository";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import {
  QuizRepository,
  QuizRepositoryLive,
} from "@/server/effect/quiz-repository";
import { isIncompleteScheduledQuiz } from "@/lib/quiz-completion";
import {
  QuizSelectSchema,
  CreateManualQuizInputSchema,
  QuizSummarySchema,
} from "@/server/schemas/quiz";
import {
  QuizItemSelectSchema,
  OverrideQuizItemInputSchema,
  OverrideQuizItemOutputSchema,
  SubmitQuizInputSchema,
  SubmitQuizOutputSchema,
} from "@/server/schemas/quiz-item";

const QuizWithItemsSchema = QuizSelectSchema.extend({
  items: z.array(QuizItemSelectSchema),
});

export const quizRouter = router({
  createManual: protectedProcedure
    .input(CreateManualQuizInputSchema)
    .output(QuizWithItemsSchema)
    .mutation(async ({ ctx, input }) => {
      const factLayer = FactRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const ownedFactCount = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.count();
        }).pipe(Effect.provide(factLayer)),
      );

      if (ownedFactCount < MIN_FACTS_FOR_QUIZ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Need at least ${MIN_FACTS_FOR_QUIZ} facts to start a quiz (you have ${ownedFactCount}).`,
        });
      }

      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.createManual(ctx.appUser.id, input.factCount);
        }).pipe(Effect.provide(layer)),
      );
      return result;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(QuizWithItemsSchema.nullable())
    .query(async ({ ctx, input }) => {
      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const row = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.getById(input.id);
        }).pipe(Effect.provide(layer)),
      );
      return row;
    }),

  list: protectedProcedure
    .output(z.array(QuizSummarySchema))
    .query(async ({ ctx }) => {
      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.listByUserId(ctx.appUser.id);
        }).pipe(Effect.provide(layer)),
      );
    }),

  /** Count of scheduled quizzes that are not fully answered (for sidebar badge). */
  incompleteScheduledCount: protectedProcedure
    .output(z.number().int())
    .query(async ({ ctx }) => {
      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const list = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.listByUserId(ctx.appUser.id);
        }).pipe(Effect.provide(layer)),
      );
      return list.filter(isIncompleteScheduledQuiz).length;
    }),

  submitQuiz: protectedProcedure
    .input(SubmitQuizInputSchema)
    .output(SubmitQuizOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const quizLayer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const quiz = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.getById(input.quizId);
        }).pipe(Effect.provide(quizLayer)),
      );

      if (!quiz) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found." });
      }

      const sortedItems = [...quiz.items].sort((a, b) => a.position - b.position);
      if (sortedItems.some((i) => i.answeredAt != null)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This quiz was already submitted.",
        });
      }

      const answerMap = new Map(input.answers.map((a) => [a.quizItemId, a.userAnswer]));
      if (input.answers.length !== sortedItems.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provide an answer for every question.",
        });
      }
      if (new Set(input.answers.map((a) => a.quizItemId)).size !== input.answers.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Duplicate quiz item in answers.",
        });
      }
      for (const item of sortedItems) {
        if (!answerMap.has(item.id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Provide an answer for every question.",
          });
        }
      }
      for (const a of input.answers) {
        if (!sortedItems.some((i) => i.id === a.quizItemId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid quiz item id.",
          });
        }
      }

      const factLayer = FactRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const questionStack = Layer.mergeAll(
        QuestionRepositoryLive,
        QuestionGeneratorLive,
      ).pipe(Layer.provide(ctx.requestDbLayer));

      const gradeInputs: Parameters<typeof gradeQuizItems>[0] = [];

      for (const item of sortedItems) {
        const fact = await Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* FactRepository;
            return yield* repo.getById(item.factId);
          }).pipe(Effect.provide(factLayer)),
        );
        if (!fact) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fact not found." });
        }

        const existing = await Effect.runPromise(
          Effect.gen(function* () {
            const questionRepo = yield* QuestionRepository;
            return yield* questionRepo.findActiveByFactId(item.factId);
          }).pipe(Effect.provide(questionStack)),
        );

        const flashcard =
          existing ??
          (await Effect.runPromise(
            Effect.gen(function* () {
              const repo = yield* QuestionRepository;
              const generator = yield* QuestionGenerator;
              const gen = yield* generator.generateQuestionFromFact(fact.content);
              return yield* repo.create(item.factId, gen.question, gen.answer);
            }).pipe(Effect.provide(questionStack)),
          ));

        gradeInputs.push({
          quizItemId: item.id,
          question: flashcard.question,
          canonicalAnswer: flashcard.canonicalAnswer,
          userAnswer: answerMap.get(item.id) ?? "",
        });
      }

      let graded: Awaited<ReturnType<typeof gradeQuizItems>>;
      try {
        graded = await gradeQuizItems(gradeInputs);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not grade this quiz. Try again later.",
        });
      }

      const gradedPayload = graded.map((g) => ({
        quizItemId: g.quizItemId,
        userAnswer: answerMap.get(g.quizItemId) ?? "",
        aiResult: g.result,
        aiReasoning: g.reasoning,
      }));

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.submitQuizBatch(ctx.appUser.id, {
            quizId: input.quizId,
            graded: gradedPayload,
          });
        }).pipe(Effect.provide(quizLayer)),
      );

      if (!result.ok) {
        if (result.reason === "not_found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quiz not found." });
        }
        if (result.reason === "already_answered") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This quiz was already submitted.",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Answers do not match this quiz.",
        });
      }

      const correctCount = result.items.filter((i) => i.result === "correct").length;

      return {
        items: result.items,
        correctCount,
        totalCount: result.items.length,
      };
    }),

  overrideItemResult: protectedProcedure
    .input(OverrideQuizItemInputSchema)
    .output(OverrideQuizItemOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const out = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.overrideQuizItemResult(ctx.appUser.id, {
            quizItemId: input.quizItemId,
            result: input.result,
          });
        }).pipe(Effect.provide(layer)),
      );

      if (!out.ok) {
        if (out.reason === "not_found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Quiz item not found." });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This question is not graded yet.",
        });
      }

      return { quizItem: out.quizItem };
    }),
});
