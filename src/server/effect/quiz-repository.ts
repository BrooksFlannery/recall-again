import { Context, Effect, Layer } from "effect";
import { and, eq, lt, sql } from "drizzle-orm";
import { Db } from "@/server/effect/db";
import { schemaApp } from "@/server/db";
import { fibonacciIntervalDays } from "@/lib/spaced-repetition";
import type { QuizSelect } from "@/server/schemas/quiz";
import type { QuizItemSelect } from "@/server/schemas/quiz-item";

export interface QuizWithItems extends QuizSelect {
  items: QuizItemSelect[];
}

export type SubmitQuizItemResult =
  | { ok: true; quizItem: QuizItemSelect; reviewStateUpdated: boolean }
  | { ok: false; reason: "not_found" | "already_answered" };

export interface IQuizRepository {
  createManual: (
    userId: string,
    factCount: number,
  ) => Effect.Effect<QuizWithItems>;
  getById: (id: string) => Effect.Effect<QuizWithItems | null>;
  listDueFactIds: (userId: string, asOf: Date) => Effect.Effect<string[]>;
  /** Idempotent: no-op (returns null) if scheduled quiz already exists for (userId, scheduledFor). */
  createScheduledQuizFromDueFacts: (
    userId: string,
    options: { scheduledFor: Date; asOf: Date },
  ) => Effect.Effect<QuizWithItems | null>;
  submitQuizItemResult: (
    appUserId: string,
    input: { quizItemId: string; result: "correct" | "incorrect" },
  ) => Effect.Effect<SubmitQuizItemResult>;
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

      listDueFactIds: (_userId: string, asOf: Date): Effect.Effect<string[]> =>
        Effect.tryPromise(async () => {
          const startOfNextDay = new Date(
            Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() + 1),
          );
          const rows = await db
            .select({ factId: schemaApp.factReviewState.factId })
            .from(schemaApp.factReviewState)
            .where(lt(schemaApp.factReviewState.nextReviewAt, startOfNextDay));
          return rows.map((r) => r.factId);
        }).pipe(Effect.orDie),

      createScheduledQuizFromDueFacts: (
        userId: string,
        options: { scheduledFor: Date; asOf: Date },
      ): Effect.Effect<QuizWithItems | null> =>
        Effect.tryPromise(async () => {
          const startOfNextDay = new Date(
            Date.UTC(
              options.asOf.getUTCFullYear(),
              options.asOf.getUTCMonth(),
              options.asOf.getUTCDate() + 1,
            ),
          );
          const dueRows = await db
            .select({ factId: schemaApp.factReviewState.factId })
            .from(schemaApp.factReviewState)
            .where(lt(schemaApp.factReviewState.nextReviewAt, startOfNextDay));
          const dueFactIds = dueRows.map((r) => r.factId);

          if (dueFactIds.length === 0) return null;

          const [quizRow] = await db
            .insert(schemaApp.quiz)
            .values({ userId, mode: "scheduled", scheduledFor: options.scheduledFor })
            .onConflictDoNothing()
            .returning();

          if (!quizRow) return null;

          const items = await db
            .insert(schemaApp.quizItem)
            .values(
              dueFactIds.map((factId, i) => ({
                quizId: quizRow.id,
                userId,
                factId,
                position: i,
              })),
            )
            .returning();

          return { ...quizRow, items };
        }).pipe(Effect.orDie),

      submitQuizItemResult: (
        appUserId: string,
        input: { quizItemId: string; result: "correct" | "incorrect" },
      ): Effect.Effect<SubmitQuizItemResult> =>
        Effect.tryPromise(async () => {
          return db.transaction(async (tx) => {
            const [quizItemRow] = await tx
              .select()
              .from(schemaApp.quizItem)
              .where(
                and(
                  eq(schemaApp.quizItem.id, input.quizItemId),
                  eq(schemaApp.quizItem.userId, appUserId),
                ),
              );

            if (!quizItemRow) {
              return { ok: false, reason: "not_found" } as const;
            }

            if (quizItemRow.answeredAt !== null) {
              return { ok: false, reason: "already_answered" } as const;
            }

            const [quizRow] = await tx
              .select()
              .from(schemaApp.quiz)
              .where(eq(schemaApp.quiz.id, quizItemRow.quizId));

            const now = new Date();

            const [updatedItem] = await tx
              .update(schemaApp.quizItem)
              .set({ result: input.result, answeredAt: now })
              .where(eq(schemaApp.quizItem.id, input.quizItemId))
              .returning();

            let reviewStateUpdated = false;

            if (quizRow?.mode === "scheduled") {
              const [reviewState] = await tx
                .select()
                .from(schemaApp.factReviewState)
                .where(
                  and(
                    eq(schemaApp.factReviewState.userId, appUserId),
                    eq(schemaApp.factReviewState.factId, quizItemRow.factId),
                  ),
                );

              if (reviewState) {
                let newStep: number;
                let nextReviewAt: Date;

                if (input.result === "correct") {
                  newStep = reviewState.fibonacciStepIndex + 1;
                  const intervalDays = fibonacciIntervalDays(newStep);
                  nextReviewAt = new Date(
                    now.getTime() + intervalDays * 24 * 60 * 60 * 1000,
                  );
                } else {
                  newStep = 0;
                  nextReviewAt = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
                }

                await tx
                  .update(schemaApp.factReviewState)
                  .set({ fibonacciStepIndex: newStep, nextReviewAt })
                  .where(
                    and(
                      eq(schemaApp.factReviewState.userId, appUserId),
                      eq(schemaApp.factReviewState.factId, quizItemRow.factId),
                    ),
                  );

                reviewStateUpdated = true;
              }
            }

            return { ok: true, quizItem: updatedItem!, reviewStateUpdated } as const;
          });
        }).pipe(Effect.orDie),
    };
  }),
);
