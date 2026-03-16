import { z } from "zod";
import { Effect, Layer } from "effect";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import {
  FactRepository,
  FactRepositoryLive,
} from "@/server/effect/fact-repository";
import {
  FactSelectSchema,
  FactCreateInputSchema,
  FactUpdateInputSchema,
} from "@/server/schemas/fact";

export const factRouter = router({
  create: protectedProcedure
    .input(FactCreateInputSchema)
    .output(FactSelectSchema)
    .mutation(({ ctx, input }) => {
      const layer = FactRepositoryLive.pipe(
        Layer.provide(ctx.requestDbLayer),
      );
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.create(ctx.appUser.id, input.content);
        }).pipe(Effect.provide(layer)),
      );
    }),

  list: protectedProcedure
    .output(z.array(FactSelectSchema))
    .query(({ ctx }) => {
      const layer = FactRepositoryLive.pipe(
        Layer.provide(ctx.requestDbLayer),
      );
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.list();
        }).pipe(Effect.provide(layer)),
      );
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(FactSelectSchema.nullable())
    .query(({ ctx, input }) => {
      const layer = FactRepositoryLive.pipe(
        Layer.provide(ctx.requestDbLayer),
      );
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.getById(input.id);
        }).pipe(Effect.provide(layer)),
      );
    }),

  update: protectedProcedure
    .input(FactUpdateInputSchema)
    .output(FactSelectSchema.nullable())
    .mutation(({ ctx, input }) => {
      const layer = FactRepositoryLive.pipe(
        Layer.provide(ctx.requestDbLayer),
      );
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.update(input.id, input.content);
        }).pipe(Effect.provide(layer)),
      );
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const layer = FactRepositoryLive.pipe(
        Layer.provide(ctx.requestDbLayer),
      );
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.delete(input.id);
        }).pipe(Effect.provide(layer)),
      );
    }),
});
