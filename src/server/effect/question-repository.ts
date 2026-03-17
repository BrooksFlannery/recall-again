import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";
import { Db } from "@/server/effect/db";
import { schemaApp } from "@/server/db";
import type { QuestionSelect } from "@/server/schemas/question";

export interface IQuestionRepository {
  listByFactId: (factId: string) => Effect.Effect<QuestionSelect[]>;
  create: (factId: string, question: string, canonicalAnswer: string) => Effect.Effect<QuestionSelect>;
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
        Effect.tryPromise(() =>
          db
            .select()
            .from(schemaApp.flashcard)
            .where(eq(schemaApp.flashcard.factId, factId)),
        ).pipe(Effect.orDie),

      create: (factId: string, question: string, canonicalAnswer: string): Effect.Effect<QuestionSelect> =>
        Effect.tryPromise(() =>
          db
            .insert(schemaApp.flashcard)
            .values({ factId, question, canonicalAnswer })
            .returning()
            .then((rows) => rows[0]),
        ).pipe(Effect.orDie),
    };
  }),
);
