import { Context, Effect, Layer } from "effect";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { Db } from "@/server/effect/db";
import { schemaApp } from "@/server/db";
import { fibonacciIntervalDays } from "@/lib/spaced-repetition";
import type { QuizSelect, QuizSummary } from "@/server/schemas/quiz";
import type { QuizItemSelect } from "@/server/schemas/quiz-item";

/** Applies one quiz outcome from the SRS state *before* that quiz item was graded. */
function nextReviewStateFromPreQuizStep(
  fibonacciStepBefore: number,
  outcome: "correct" | "incorrect",
  at: Date,
): { fibonacciStepIndex: number; nextReviewAt: Date } {
  if (outcome === "correct") {
    const newStep = fibonacciStepBefore + 1;
    const intervalDays = fibonacciIntervalDays(newStep);
    return {
      fibonacciStepIndex: newStep,
      nextReviewAt: new Date(at.getTime() + intervalDays * 24 * 60 * 60 * 1000),
    };
  }
  return {
    fibonacciStepIndex: 0,
    nextReviewAt: new Date(at.getTime() + 1 * 24 * 60 * 60 * 1000),
  };
}

export interface QuizWithItems extends QuizSelect {
  items: QuizItemSelect[];
}

/** Result of attempting to create today's scheduled quiz (idempotent per user + UTC day). */
export type CreateScheduledQuizFromDueFactsResult =
  | { ok: true; quiz: QuizWithItems }
  | {
      ok: false;
      reason: "no_due_facts" | "quiz_already_exists_for_day";
    };

export type SubmitQuizBatchResult =
  | {
      ok: true;
      items: QuizItemSelect[];
      reviewStateUpdatedCount: number;
    }
  | { ok: false; reason: "not_found" | "already_answered" | "mismatch" };

export interface IQuizRepository {
  createManual: (
    userId: string,
    factCount: number,
  ) => Effect.Effect<QuizWithItems>;
  getById: (id: string) => Effect.Effect<QuizWithItems | null>;
  /** Newest first. RLS applies when using the request DB layer. */
  listByUserId: (userId: string) => Effect.Effect<QuizSummary[]>;
  listDueFactIds: (userId: string, asOf: Date) => Effect.Effect<string[]>;
  /**
   * Idempotent: returns `quiz_already_exists_for_day` if a scheduled quiz already exists for
   * (userId, scheduledFor). `no_due_facts` when no facts are due before start of next UTC day (asOf).
   */
  createScheduledQuizFromDueFacts: (
    userId: string,
    options: { scheduledFor: Date; asOf: Date },
  ) => Effect.Effect<CreateScheduledQuizFromDueFactsResult>;
  submitQuizBatch: (
    appUserId: string,
    input: {
      quizId: string;
      graded: Array<{
        quizItemId: string;
        userAnswer: string;
        aiResult: "correct" | "incorrect";
        aiReasoning: string;
      }>;
    },
  ) => Effect.Effect<SubmitQuizBatchResult>;
  /** Changes the effective `result` after grading; `aiResult` is unchanged. Recomputes SRS for scheduled quizzes when snapshots exist. */
  overrideQuizItemResult: (
    appUserId: string,
    input: { quizItemId: string; result: "correct" | "incorrect" },
  ) => Effect.Effect<
    | { ok: true; quizItem: QuizItemSelect }
    | { ok: false; reason: "not_found" | "not_graded" }
  >;
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

      listByUserId: (userId: string): Effect.Effect<QuizSummary[]> =>
        Effect.tryPromise(async () => {
          const quizzes = await db
            .select()
            .from(schemaApp.quiz)
            .where(eq(schemaApp.quiz.userId, userId))
            .orderBy(desc(schemaApp.quiz.createdAt));

          if (quizzes.length === 0) {
            return [];
          }

          const quizIds = quizzes.map((q) => q.id);
          const items = await db
            .select()
            .from(schemaApp.quizItem)
            .where(inArray(schemaApp.quizItem.quizId, quizIds));

          const byQuiz = new Map<string, typeof items>();
          for (const it of items) {
            const list = byQuiz.get(it.quizId) ?? [];
            list.push(it);
            byQuiz.set(it.quizId, list);
          }

          return quizzes.map((q) => {
            const qi = byQuiz.get(q.id) ?? [];
            const itemCount = qi.length;
            const answeredCount = qi.filter((i) => i.answeredAt != null).length;
            const correctCount = qi.filter((i) => i.result === "correct").length;
            return {
              id: q.id,
              createdAt: q.createdAt,
              mode: q.mode,
              scheduledFor: q.scheduledFor,
              itemCount,
              answeredCount,
              correctCount,
            };
          });
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
      ): Effect.Effect<CreateScheduledQuizFromDueFactsResult> =>
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

          if (dueFactIds.length === 0) {
            return { ok: false, reason: "no_due_facts" } as const;
          }

          const [quizRow] = await db
            .insert(schemaApp.quiz)
            .values({ userId, mode: "scheduled", scheduledFor: options.scheduledFor })
            .onConflictDoNothing()
            .returning();

          if (!quizRow) {
            return { ok: false, reason: "quiz_already_exists_for_day" } as const;
          }

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

          return { ok: true as const, quiz: { ...quizRow, items } };
        }).pipe(Effect.orDie),

      submitQuizBatch: (
        appUserId: string,
        input: {
          quizId: string;
          graded: Array<{
            quizItemId: string;
            userAnswer: string;
            aiResult: "correct" | "incorrect";
            aiReasoning: string;
          }>;
        },
      ): Effect.Effect<SubmitQuizBatchResult> =>
        Effect.tryPromise(async () => {
          return db.transaction(async (tx) => {
            const [quizRow] = await tx
              .select()
              .from(schemaApp.quiz)
              .where(
                and(
                  eq(schemaApp.quiz.id, input.quizId),
                  eq(schemaApp.quiz.userId, appUserId),
                ),
              );

            if (!quizRow) {
              return { ok: false, reason: "not_found" } as const;
            }

            const quizItems = await tx
              .select()
              .from(schemaApp.quizItem)
              .where(eq(schemaApp.quizItem.quizId, input.quizId))
              .orderBy(asc(schemaApp.quizItem.position));

            const quizItemIds = new Set(quizItems.map((r) => r.id));
            const gradedById = new Map(input.graded.map((g) => [g.quizItemId, g]));
            if (input.graded.length !== quizItems.length) {
              return { ok: false, reason: "mismatch" } as const;
            }
            if (new Set(input.graded.map((g) => g.quizItemId)).size !== input.graded.length) {
              return { ok: false, reason: "mismatch" } as const;
            }
            for (const g of input.graded) {
              if (!quizItemIds.has(g.quizItemId)) {
                return { ok: false, reason: "mismatch" } as const;
              }
            }

            for (const row of quizItems) {
              if (row.answeredAt !== null) {
                return { ok: false, reason: "already_answered" } as const;
              }
            }

            const now = new Date();
            let reviewStateUpdatedCount = 0;
            const updatedItems: QuizItemSelect[] = [];

            for (const row of quizItems) {
              const g = gradedById.get(row.id)!;

              let snapshotStep: number | null = null;
              let snapshotNext: Date | null = null;

              if (quizRow.mode === "scheduled") {
                const [reviewState] = await tx
                  .select()
                  .from(schemaApp.factReviewState)
                  .where(
                    and(
                      eq(schemaApp.factReviewState.userId, appUserId),
                      eq(schemaApp.factReviewState.factId, row.factId),
                    ),
                  );

                if (reviewState) {
                  snapshotStep = reviewState.fibonacciStepIndex;
                  snapshotNext = reviewState.nextReviewAt;
                }
              }

              const [updatedItem] = await tx
                .update(schemaApp.quizItem)
                .set({
                  userAnswer: g.userAnswer,
                  aiReasoning: g.aiReasoning,
                  aiResult: g.aiResult,
                  result: g.aiResult,
                  answeredAt: now,
                  reviewFibonacciStepBefore: snapshotStep,
                  reviewNextReviewAtBefore: snapshotNext,
                })
                .where(eq(schemaApp.quizItem.id, row.id))
                .returning();

              updatedItems.push(updatedItem!);

              if (quizRow.mode === "scheduled" && snapshotStep !== null) {
                const [reviewState] = await tx
                  .select()
                  .from(schemaApp.factReviewState)
                  .where(
                    and(
                      eq(schemaApp.factReviewState.userId, appUserId),
                      eq(schemaApp.factReviewState.factId, row.factId),
                    ),
                  );

                if (reviewState) {
                  const { fibonacciStepIndex, nextReviewAt } = nextReviewStateFromPreQuizStep(
                    snapshotStep,
                    g.aiResult,
                    now,
                  );

                  await tx
                    .update(schemaApp.factReviewState)
                    .set({ fibonacciStepIndex, nextReviewAt })
                    .where(
                      and(
                        eq(schemaApp.factReviewState.userId, appUserId),
                        eq(schemaApp.factReviewState.factId, row.factId),
                      ),
                    );

                  reviewStateUpdatedCount += 1;
                }
              }
            }

            return {
              ok: true,
              items: updatedItems,
              reviewStateUpdatedCount,
            } as const;
          });
        }).pipe(Effect.orDie),

      overrideQuizItemResult: (
        appUserId: string,
        input: { quizItemId: string; result: "correct" | "incorrect" },
      ): Effect.Effect<
        | { ok: true; quizItem: QuizItemSelect }
        | { ok: false; reason: "not_found" | "not_graded" }
      > =>
        Effect.tryPromise(async () => {
          return db.transaction(async (tx) => {
            const [itemRow] = await tx
              .select()
              .from(schemaApp.quizItem)
              .where(
                and(
                  eq(schemaApp.quizItem.id, input.quizItemId),
                  eq(schemaApp.quizItem.userId, appUserId),
                ),
              );

            if (!itemRow) {
              return { ok: false, reason: "not_found" } as const;
            }
            if (itemRow.answeredAt === null || itemRow.aiResult === null) {
              return { ok: false, reason: "not_graded" } as const;
            }

            const [quizRow] = await tx
              .select()
              .from(schemaApp.quiz)
              .where(eq(schemaApp.quiz.id, itemRow.quizId));

            const now = new Date();

            const [updated] = await tx
              .update(schemaApp.quizItem)
              .set({ result: input.result })
              .where(eq(schemaApp.quizItem.id, input.quizItemId))
              .returning();

            if (
              quizRow?.mode === "scheduled" &&
              itemRow.reviewFibonacciStepBefore !== null
            ) {
              const { fibonacciStepIndex, nextReviewAt } = nextReviewStateFromPreQuizStep(
                itemRow.reviewFibonacciStepBefore,
                input.result,
                now,
              );

              await tx
                .update(schemaApp.factReviewState)
                .set({ fibonacciStepIndex, nextReviewAt })
                .where(
                  and(
                    eq(schemaApp.factReviewState.userId, appUserId),
                    eq(schemaApp.factReviewState.factId, itemRow.factId),
                  ),
                );
            }

            return { ok: true, quizItem: updated! } as const;
          });
        }).pipe(Effect.orDie),
    };
  }),
);
