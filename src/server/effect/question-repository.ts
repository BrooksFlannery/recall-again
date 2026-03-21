import { Context, Effect, Layer } from "effect";
import { and, desc, eq } from "drizzle-orm";
import { Db } from "@/server/effect/db";
import { schemaApp } from "@/server/db";
import type { QuestionSelect } from "@/server/schemas/question";

export interface IQuestionRepository {
  listByFactId: (factId: string) => Effect.Effect<QuestionSelect[]>;
  findActiveByFactId: (factId: string) => Effect.Effect<QuestionSelect | null>;
  create: (factId: string, question: string, canonicalAnswer: string) => Effect.Effect<QuestionSelect>;
  markInactive: (id: string) => Effect.Effect<QuestionSelect | null>;
}

export class QuestionRepository extends Context.Tag("QuestionRepository")<
  QuestionRepository,
  IQuestionRepository
>() {}

export const QuestionRepositoryLive = Layer.effect(
  QuestionRepository,
  Effect.gen(function* () {
    const db = yield* Db;

    return {
      listByFactId: (factId: string): Effect.Effect<QuestionSelect[]> =>
        Effect.tryPromise(async () => {
          const rows = await db
            .select()
            .from(schemaApp.flashcard)
            .where(eq(schemaApp.flashcard.factId, factId));
          return rows;
        }).pipe(Effect.orDie),

      findActiveByFactId: (factId: string): Effect.Effect<QuestionSelect | null> =>
        Effect.tryPromise(async () => {
          const [row] = await db
            .select()
            .from(schemaApp.flashcard)
            .where(and(eq(schemaApp.flashcard.factId, factId), eq(schemaApp.flashcard.active, true)))
            .orderBy(desc(schemaApp.flashcard.createdAt))
            .limit(1);
          return row ?? null;
        }).pipe(
          Effect.orDie,
        ),

      create: (factId: string, question: string, canonicalAnswer: string): Effect.Effect<QuestionSelect> =>
        Effect.tryPromise(() =>
          db
            .insert(schemaApp.flashcard)
            .values({ factId, question, canonicalAnswer, active: true })
            .returning()
            .then((rows) => rows[0]),
        ).pipe(Effect.orDie),

      markInactive: (id: string): Effect.Effect<QuestionSelect | null> =>
        Effect.tryPromise(() =>
          db
            .update(schemaApp.flashcard)
            .set({ active: false })
            .where(eq(schemaApp.flashcard.id, id))
            .returning()
            .then((rows) => rows[0] ?? null),
        ).pipe(Effect.orDie),
    };
  }),
);
