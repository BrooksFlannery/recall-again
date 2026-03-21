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
    .mutation(async ({ ctx, input }) => {
      const factLayer = FactRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const fact = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.getById(input.factId);
        }).pipe(Effect.provide(factLayer)),
      );
      if (!fact) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const layer = Layer.mergeAll(
        QuestionRepositoryLive,
        QuestionGeneratorLive,
      ).pipe(Layer.provide(ctx.requestDbLayer));
      return Effect.runPromise(
        Effect.gen(function* () {
          const generator = yield* QuestionGenerator;
          const generated = yield* generator.generateQuestionFromFact(fact.content);
          const questionRepo = yield* QuestionRepository;
          return yield* questionRepo.create(input.factId, generated.question, generated.answer);
        }).pipe(Effect.provide(layer)),
      );
    }),

  getOrCreateActiveQuestion: protectedProcedure
    .input(z.object({ factId: z.string() }))
    .output(QuestionSelectSchema)
    .query(async ({ ctx, input }) => {
      const factLayer = FactRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const fact = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.getById(input.factId);
        }).pipe(Effect.provide(factLayer)),
      );
      if (!fact) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const layer = Layer.mergeAll(
        QuestionRepositoryLive,
        QuestionGeneratorLive,
      ).pipe(Layer.provide(ctx.requestDbLayer));

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const questionRepo = yield* QuestionRepository;

          const existing = yield* questionRepo.findActiveByFactId(input.factId);
          if (existing) {
            return existing;
          }

          const generator = yield* QuestionGenerator;
          const generated = yield* generator.generateQuestionFromFact(fact.content);

          return yield* questionRepo.create(
            input.factId,
            generated.question,
            generated.answer,
          );
        }).pipe(Effect.provide(layer)),
      );
      return result;
    }),

  listQuestions: protectedProcedure
    .input(z.object({ factId: z.string() }))
    .output(z.array(QuestionSelectSchema))
    .query(async ({ ctx, input }) => {
      const factLayer = FactRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const fact = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FactRepository;
          return yield* repo.getById(input.factId);
        }).pipe(Effect.provide(factLayer)),
      );
      if (!fact) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const questionLayer = QuestionRepositoryLive.pipe(Layer.provide(ctx.requestDbLayer));
      const questions = await Effect.runPromise(
        Effect.gen(function* () {
          const questionRepo = yield* QuestionRepository;
          return yield* questionRepo.listByFactId(input.factId);
        }).pipe(Effect.provide(questionLayer)),
      );
      return questions;
    }),
});
