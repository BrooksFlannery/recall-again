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
import { QuizItemSelectSchema } from "@/server/schemas/quiz-item";

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
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.createManual(ctx.appUser.id, input.factCount);
        }).pipe(Effect.provide(layer)),
      );
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(QuizWithItemsSchema.nullable())
    .query(({ ctx, input }) => {
      const layer = QuizRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.getById(input.id);
        }).pipe(Effect.provide(layer)),
      );
    }),
});
