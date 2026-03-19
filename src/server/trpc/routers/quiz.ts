import { z } from "zod";
import { Effect, Layer } from "effect";
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
    .mutation(({ ctx, input }) => {
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
