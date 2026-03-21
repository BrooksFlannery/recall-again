import { Context, Effect, Layer } from "effect";
import { eq, sql } from "drizzle-orm";
import { Db } from "@/server/effect/db";
import { schemaApp } from "@/server/db";
import type { QuizSelect } from "@/server/schemas/quiz";
import type { QuizItemSelect } from "@/server/schemas/quiz-item";

export interface QuizWithItems extends QuizSelect {
  items: QuizItemSelect[];
}

export interface IQuizRepository {
  createManual: (
    userId: string,
    factCount: number,
  ) => Effect.Effect<QuizWithItems>;
  getById: (id: string) => Effect.Effect<QuizWithItems | null>;
}

export class QuizRepository extends Context.Tag("QuizRepository")<
  QuizRepository,
  IQuizRepository
>() {}

export const QuizRepositoryLive = Layer.effect(
  QuizRepository,
  Effect.gen(function* () {
    const db = yield* Db;

    return {
      createManual: (
        userId: string,
        factCount: number,
      ): Effect.Effect<QuizWithItems> =>
        Effect.tryPromise(async () => {
          const randomFacts = await db
            .select({ id: schemaApp.fact.id })
            .from(schemaApp.fact)
            .orderBy(sql`random()`)
            .limit(factCount);

          const [quizRow] = await db
            .insert(schemaApp.quiz)
            .values({ userId, mode: "manual" })
            .returning();

          const items =
            randomFacts.length > 0
              ? await db
                  .insert(schemaApp.quizItem)
                  .values(
                    randomFacts.map((f, i) => ({
                      quizId: quizRow!.id,
                      userId,
                      factId: f.id,
                      position: i,
                    })),
                  )
                  .returning()
              : [];

          return { ...quizRow!, items };
        }).pipe(Effect.orDie),

      getById: (id: string): Effect.Effect<QuizWithItems | null> =>
        Effect.tryPromise(async () => {
          const [quizRow] = await db
            .select()
            .from(schemaApp.quiz)
            .where(eq(schemaApp.quiz.id, id));

          if (!quizRow) {
            return null;
          }

          const items = await db
            .select()
            .from(schemaApp.quizItem)
            .where(eq(schemaApp.quizItem.quizId, id));

          return { ...quizRow, items };
        }).pipe(Effect.orDie),
    };
  }),
);
