import { z } from "zod";
import { Effect, Layer } from "effect";
import { TRPCError } from "@trpc/server";
import { MIN_FACTS_FOR_QUIZ } from "@/constants/quiz";
import { FactRepository, FactRepositoryLive } from "@/server/effect/fact-repository";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import {
  QuizRepository,
  QuizRepositoryLive,
} from "@/server/effect/quiz-repository";
import { QuizSelectSchema, CreateManualQuizInputSchema } from "@/server/schemas/quiz";
import {
  QuizItemSelectSchema,
  SubmitQuizItemInputSchema,
  SubmitQuizItemOutputSchema,
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

  submitItem: protectedProcedure
    .input(SubmitQuizItemInputSchema)
    .output(SubmitQuizItemOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.submitQuizItemResult(ctx.appUser.id, {
            quizItemId: input.quizItemId,
            result: input.result,
          });
        }).pipe(Effect.provide(layer)),
      );

      if (!result.ok) {
        if (result.reason === "not_found") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Quiz item not found.",
          });
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "Quiz item has already been answered.",
        });
      }

      return { quizItem: result.quizItem, reviewStateUpdated: result.reviewStateUpdated };
    }),
});
