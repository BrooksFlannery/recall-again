import { beforeAll, describe, test, expect } from "bun:test";

import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { MIN_FACTS_FOR_QUIZ } from "@/constants/quiz";
import { db, schema, schemaApp } from "@/server/db";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function createTestUser(tag: string) {
  const authUserId = `test_auth_quiz_${tag}_${Date.now()}`;
  const email = `test_quiz_${tag}_${Date.now()}@example.com`;

  await db.insert(schema.user).values({
    id: authUserId,
    name: "Test User",
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const [appUser] = await db
    .insert(schemaApp.appUser)
    .values({ authUserId })
    .returning();

  return { authUserId, appUser: appUser! };
}

function makeCaller(appUserId: string) {
  return createCallerFactory(appRouter)({ appUser: { id: appUserId } });
}

async function createFacts(
  caller: ReturnType<typeof makeCaller>,
  count: number,
  label: string,
) {
  for (let i = 0; i < count; i += 1) {
    await caller.fact.create({ content: `${label} fact ${i + 1}` });
  }
}

describe("quiz.createManual", () => {
  test("returns quiz with N items", async () => {
    const { authUserId, appUser } = await createTestUser("create_n");
    try {
      const caller = makeCaller(appUser.id);
      await createFacts(caller, MIN_FACTS_FOR_QUIZ, "N");

      const result = await caller.quiz.createManual({ factCount: 3 });

      expect(result.mode).toBe("manual");
      expect(result.userId).toBe(appUser.id);
      expect(result.items).toHaveLength(3);
      expect(result.items.every((item) => item.userId === appUser.id)).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });

  test("only selects current user's facts (RLS)", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("rls_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("rls_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      const userAFacts: { id: string }[] = [];
      for (let i = 0; i < MIN_FACTS_FOR_QUIZ; i += 1) {
        userAFacts.push(
          await callerA.fact.create({ content: `User A fact ${i + 1}` }),
        );
      }
      await callerB.fact.create({ content: "User B fact 1" });
      await callerB.fact.create({ content: "User B fact 2" });

      const userAFactIds = new Set(userAFacts.map((f) => f.id));
      const result = await callerA.quiz.createManual({ factCount: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.items.every((item) => userAFactIds.has(item.factId))).toBe(true);
      expect(result.items.every((item) => item.userId === userA.id)).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });

  test("rejects when user has fewer than minimum facts", async () => {
    const { authUserId, appUser } = await createTestUser("min_facts");
    try {
      const caller = makeCaller(appUser.id);
      await createFacts(caller, MIN_FACTS_FOR_QUIZ - 1, "min");

      let threw = false;
      try {
        await caller.quiz.createManual({ factCount: 3 });
      } catch (e: unknown) {
        threw = true;
        expect((e as { code: string }).code).toBe("BAD_REQUEST");
        expect(String((e as Error).message)).toContain(
          String(MIN_FACTS_FOR_QUIZ),
        );
      }
      expect(threw).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });

  test("validates/bounds count", async () => {
    const { authUserId, appUser } = await createTestUser("bounds");
    try {
      const caller = makeCaller(appUser.id);

      let threw = false;
      try {
        await caller.quiz.createManual({ factCount: 0 });
      } catch (e: unknown) {
        threw = true;
        expect((e as { code: string }).code).toBe("BAD_REQUEST");
      }
      expect(threw).toBe(true);

      threw = false;
      try {
        await caller.quiz.createManual({ factCount: 51 });
      } catch (e: unknown) {
        threw = true;
        expect((e as { code: string }).code).toBe("BAD_REQUEST");
      }
      expect(threw).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });
});

describe("submitItem", () => {
  test("manual does not change fact_review_state", async () => {
    const { authUserId, appUser } = await createTestUser("submit_manual");
    try {
      const caller = makeCaller(appUser.id);
      await createFacts(caller, MIN_FACTS_FOR_QUIZ, "submit_manual");
      const quiz = await caller.quiz.createManual({ factCount: 1 });
      const quizItem = quiz.items[0]!;

      const initialNextReview = new Date("2026-04-01T00:00:00.000Z");
      await db.insert(schemaApp.factReviewState).values({
        userId: appUser.id,
        factId: quizItem.factId,
        nextReviewAt: initialNextReview,
        fibonacciStepIndex: 3,
      });

      await caller.quiz.submitItem({ quizItemId: quizItem.id, result: "correct" });

      const [reviewState] = await db
        .select()
        .from(schemaApp.factReviewState)
        .where(
          and(
            eq(schemaApp.factReviewState.userId, appUser.id),
            eq(schemaApp.factReviewState.factId, quizItem.factId),
          ),
        );

      expect(reviewState?.fibonacciStepIndex).toBe(3);
      expect(reviewState?.nextReviewAt.getTime()).toBe(initialNextReview.getTime());
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });

  test("scheduled updates nextReviewAt and fib step on correct", async () => {
    const { authUserId, appUser } = await createTestUser("submit_sched_correct");
    try {
      const caller = makeCaller(appUser.id);
      const fact = await caller.fact.create({ content: "scheduled fact correct" });

      const initialStep = 2;
      await db.insert(schemaApp.factReviewState).values({
        userId: appUser.id,
        factId: fact.id,
        nextReviewAt: new Date("2026-03-20T00:00:00.000Z"),
        fibonacciStepIndex: initialStep,
      });

      const [quizRow] = await db
        .insert(schemaApp.quiz)
        .values({
          userId: appUser.id,
          mode: "scheduled",
          scheduledFor: new Date("2026-04-10T00:00:00.000Z"),
        })
        .returning();

      const [quizItemRow] = await db
        .insert(schemaApp.quizItem)
        .values({ quizId: quizRow!.id, userId: appUser.id, factId: fact.id, position: 0 })
        .returning();

      const before = new Date();
      const result = await caller.quiz.submitItem({
        quizItemId: quizItemRow!.id,
        result: "correct",
      });
      const after = new Date();

      expect(result.reviewStateUpdated).toBe(true);

      const [reviewState] = await db
        .select()
        .from(schemaApp.factReviewState)
        .where(
          and(
            eq(schemaApp.factReviewState.userId, appUser.id),
            eq(schemaApp.factReviewState.factId, fact.id),
          ),
        );

      // initialStep=2, correct → newStep=3, fibonacciIntervalDays(3)=FIBONACCI[3]=3 days
      expect(reviewState?.fibonacciStepIndex).toBe(3);
      const expectedMinNextReview = new Date(before.getTime() + 3 * 24 * 60 * 60 * 1000);
      const expectedMaxNextReview = new Date(after.getTime() + 3 * 24 * 60 * 60 * 1000);
      expect(reviewState!.nextReviewAt.getTime()).toBeGreaterThanOrEqual(
        expectedMinNextReview.getTime(),
      );
      expect(reviewState!.nextReviewAt.getTime()).toBeLessThanOrEqual(
        expectedMaxNextReview.getTime(),
      );
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });

  test("scheduled resets on incorrect", async () => {
    const { authUserId, appUser } = await createTestUser("submit_sched_incorrect");
    try {
      const caller = makeCaller(appUser.id);
      const fact = await caller.fact.create({ content: "scheduled fact incorrect" });

      await db.insert(schemaApp.factReviewState).values({
        userId: appUser.id,
        factId: fact.id,
        nextReviewAt: new Date("2026-03-20T00:00:00.000Z"),
        fibonacciStepIndex: 3,
      });

      const [quizRow] = await db
        .insert(schemaApp.quiz)
        .values({
          userId: appUser.id,
          mode: "scheduled",
          scheduledFor: new Date("2026-04-11T00:00:00.000Z"),
        })
        .returning();

      const [quizItemRow] = await db
        .insert(schemaApp.quizItem)
        .values({ quizId: quizRow!.id, userId: appUser.id, factId: fact.id, position: 0 })
        .returning();

      const before = new Date();
      const result = await caller.quiz.submitItem({
        quizItemId: quizItemRow!.id,
        result: "incorrect",
      });
      const after = new Date();

      expect(result.reviewStateUpdated).toBe(true);

      const [reviewState] = await db
        .select()
        .from(schemaApp.factReviewState)
        .where(
          and(
            eq(schemaApp.factReviewState.userId, appUser.id),
            eq(schemaApp.factReviewState.factId, fact.id),
          ),
        );

      // incorrect → fibStep resets to 0, nextReviewAt = now + 1 day
      expect(reviewState?.fibonacciStepIndex).toBe(0);
      const expectedMinNextReview = new Date(before.getTime() + 1 * 24 * 60 * 60 * 1000);
      const expectedMaxNextReview = new Date(after.getTime() + 1 * 24 * 60 * 60 * 1000);
      expect(reviewState!.nextReviewAt.getTime()).toBeGreaterThanOrEqual(
        expectedMinNextReview.getTime(),
      );
      expect(reviewState!.nextReviewAt.getTime()).toBeLessThanOrEqual(
        expectedMaxNextReview.getTime(),
      );
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });

  test("cannot submit another user's item (RLS)", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("submit_rls_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("submit_rls_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      await createFacts(callerA, MIN_FACTS_FOR_QUIZ, "submit_rls");
      const quiz = await callerA.quiz.createManual({ factCount: 1 });
      const quizItemId = quiz.items[0]!.id;

      let threw = false;
      try {
        await callerB.quiz.submitItem({ quizItemId, result: "correct" });
      } catch (e) {
        threw = true;
        expect((e as { code: string }).code).toBe("NOT_FOUND");
      }
      expect(threw).toBe(true);

      const [item] = await db
        .select()
        .from(schemaApp.quizItem)
        .where(eq(schemaApp.quizItem.id, quizItemId));
      expect(item?.answeredAt).toBeNull();
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });

  test("rejects second submit when already answered", async () => {
    const { authUserId, appUser } = await createTestUser("submit_twice");
    try {
      const caller = makeCaller(appUser.id);
      await createFacts(caller, MIN_FACTS_FOR_QUIZ, "twice");
      const quiz = await caller.quiz.createManual({ factCount: 1 });
      const quizItemId = quiz.items[0]!.id;

      await caller.quiz.submitItem({ quizItemId, result: "correct" });

      let threw = false;
      try {
        await caller.quiz.submitItem({ quizItemId, result: "incorrect" });
      } catch (e) {
        threw = true;
        expect((e as { code: string }).code).toBe("CONFLICT");
      }
      expect(threw).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });
});

describe("quiz.getById", () => {
  test("user cannot read another user's quiz (RLS)", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("getbyid_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("getbyid_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      await createFacts(callerA, MIN_FACTS_FOR_QUIZ, "getbyid");
      const quizResult = await callerA.quiz.createManual({ factCount: 1 });

      const resultB = await callerB.quiz.getById({ id: quizResult.id });
      expect(resultB).toBeNull();
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });
});
