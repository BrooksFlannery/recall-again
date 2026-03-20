import { beforeAll, describe, test, expect } from "bun:test";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
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

describe("quiz.createManual", () => {
  test("returns quiz with N items", async () => {
    const { authUserId, appUser } = await createTestUser("create_n");
    try {
      const caller = makeCaller(appUser.id);
      await caller.fact.create({ content: "Fact 1" });
      await caller.fact.create({ content: "Fact 2" });
      await caller.fact.create({ content: "Fact 3" });

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

      const factA1 = await callerA.fact.create({ content: "User A fact 1" });
      const factA2 = await callerA.fact.create({ content: "User A fact 2" });
      const factA3 = await callerA.fact.create({ content: "User A fact 3" });
      await callerB.fact.create({ content: "User B fact 1" });
      await callerB.fact.create({ content: "User B fact 2" });

      const userAFactIds = new Set([factA1.id, factA2.id, factA3.id]);
      const result = await callerA.quiz.createManual({ factCount: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.items.every((item) => userAFactIds.has(item.factId))).toBe(true);
      expect(result.items.every((item) => item.userId === userA.id)).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
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

describe("quiz.getById", () => {
  test("user cannot read another user's quiz (RLS)", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("getbyid_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("getbyid_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      await callerA.fact.create({ content: "User A fact" });
      const quizResult = await callerA.quiz.createManual({ factCount: 1 });

      const resultB = await callerB.quiz.getById({ id: quizResult.id });
      expect(resultB).toBeNull();
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });
});
