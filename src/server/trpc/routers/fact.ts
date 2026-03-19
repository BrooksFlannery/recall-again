import { z } from "zod";
import { Effect, Layer } from "effect";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/trpc";
import {
  FactRepository,
  FactRepositoryLive,
} from "@/server/effect/fact-repository";
import {
  QuestionRepository,
  QuestionRepositoryLive,
} from "@/server/effect/question-repository";
import {
  QuestionGenerator,
  QuestionGeneratorLive,
} from "@/server/effect/question-generator";
import {
  FactSelectSchema,
  FactCreateInputSchema,
  FactUpdateInputSchema,
} from "@/server/schemas/fact";
import { QuestionSelectSchema } from "@/server/schemas/question";

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

  generateQuestion: protectedProcedure
    .input(z.object({ factId: z.string() }))
    .output(QuestionSelectSchema)
    .mutation(({ ctx, input }) => {
      const layer = Layer.mergeAll(
        FactRepositoryLive,
        QuestionRepositoryLive,
        QuestionGeneratorLive,
      ).pipe(Layer.provide(ctx.requestDbLayer));
      return Effect.runPromise(
        Effect.gen(function* () {
          const factRepo = yield* FactRepository;
          const fact = yield* factRepo.getById(input.factId);
          if (!fact) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          const generator = yield* QuestionGenerator;
          const generated = yield* generator.generateQuestionFromFact(fact.content);
          const questionRepo = yield* QuestionRepository;
          return yield* questionRepo.create(input.factId, generated.question, generated.answer);
        }).pipe(Effect.provide(layer)),
      );
    }),

  listQuestions: protectedProcedure
    .input(z.object({ factId: z.string() }))
    .output(z.array(QuestionSelectSchema))
    .query(({ ctx, input }) => {
      const layer = Layer.mergeAll(
        FactRepositoryLive,
        QuestionRepositoryLive,
      ).pipe(Layer.provide(ctx.requestDbLayer));
      return Effect.runPromise(
        Effect.gen(function* () {
          const factRepo = yield* FactRepository;
          const fact = yield* factRepo.getById(input.factId);
          if (!fact) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          const questionRepo = yield* QuestionRepository;
          return yield* questionRepo.listByFactId(input.factId);
        }).pipe(Effect.provide(layer)),
      );
    }),
});
