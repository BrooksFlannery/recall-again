import { beforeAll, describe, test, expect } from "bun:test";

import { eq } from "drizzle-orm";
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
  // PENDING: Patch 2
  test.skip("manual does not change fact_review_state", async () => {
    // Setup: create a manual quiz with at least one item
    // Call submitItem with result "correct" on a manual quiz item
    // Assert: fact_review_state row for the item's fact is unchanged
    // (nextReviewAt, fibStep, etc. should be identical before and after)
  });

  // PENDING: Patch 2
  test.skip("scheduled updates nextReviewAt and fib step on correct", async () => {
    // Setup: create a scheduled quiz item with an existing fact_review_state row
    // Call submitItem with result "correct"
    // Assert: fact_review_state.nextReviewAt advances by the next Fibonacci interval
    // Assert: fact_review_state.fibStep increments correctly
  });

  // PENDING: Patch 2
  test.skip("scheduled resets on incorrect", async () => {
    // Setup: create a scheduled quiz item with an existing fact_review_state row
    // (fibStep > 0 to confirm reset is observable)
    // Call submitItem with result "incorrect"
    // Assert: fact_review_state.fibStep resets to initial step
    // Assert: fact_review_state.nextReviewAt is set to next day
  });

  // PENDING: Patch 2
  test.skip("cannot submit another user's item (RLS)", async () => {
    // Setup: create userA's quiz and a quiz item belonging to userA
    // Attempt to call submitItem as userB with userA's quiz item id
    // Assert: procedure throws with FORBIDDEN / UNAUTHORIZED, or returns not-found
    // Confirm userA's quiz_item.answeredAt remains null
  });

  // PENDING: Patch 2
  test.skip("rejects second submit when already answered", async () => {
    // Setup: create a quiz item and submit it once successfully
    // Attempt to call submitItem again on the same item
    // Assert: procedure throws with 409 Conflict or a validation error
    // (per design decision: answered_at already set → reject to avoid schedule drift)
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
