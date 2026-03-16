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
  const authUserId = `test_auth_fact_${tag}_${Date.now()}`;
  const email = `test_fact_${tag}_${Date.now()}@example.com`;

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

  return { authUserId, appUser };
}

function makeCaller(appUserId: string) {
  return createCallerFactory(appRouter)({ appUser: { id: appUserId } });
}

describe("fact.create", () => {
  test("returns new fact with id and content", async () => {
    const { authUserId, appUser } = await createTestUser("create");
    try {
      const caller = makeCaller(appUser.id);
      const fact = await caller.fact.create({ content: "Test fact content" });

      expect(fact.id).toMatch(/^fact_/);
      expect(fact.userId).toBe(appUser.id);
      expect(fact.content).toBe("Test fact content");
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });
});

describe("fact.list", () => {
  test("returns only current user's facts", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("list_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("list_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      await callerA.fact.create({ content: "User A's fact" });
      await callerB.fact.create({ content: "User B's fact" });

      const listA = await callerA.fact.list();
      const listB = await callerB.fact.list();

      expect(listA.every((f) => f.userId === userA.id)).toBe(true);
      expect(listA.some((f) => f.userId === userB.id)).toBe(false);
      expect(listB.every((f) => f.userId === userB.id)).toBe(true);
      expect(listB.some((f) => f.userId === userA.id)).toBe(false);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });
});

describe("fact.getById", () => {
  test("returns fact when owned, null otherwise", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("getbyid_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("getbyid_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      const fact = await callerA.fact.create({ content: "User A's fact" });

      const resultA = await callerA.fact.getById({ id: fact.id });
      const resultB = await callerB.fact.getById({ id: fact.id });

      expect(resultA).not.toBeNull();
      expect(resultA!.id).toBe(fact.id);
      expect(resultB).toBeNull();
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });
});

describe("fact.update", () => {
  test("updates content when owned", async () => {
    const { authUserId, appUser } = await createTestUser("update");
    try {
      const caller = makeCaller(appUser.id);
      const created = await caller.fact.create({ content: "Original content" });
      const updated = await caller.fact.update({
        id: created.id,
        content: "Updated content",
      });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe("Updated content");
      expect(updated!.updatedAt >= created.createdAt).toBe(true);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });
});

describe("fact.delete", () => {
  test("deletes when owned", async () => {
    const { authUserId, appUser } = await createTestUser("delete");
    try {
      const caller = makeCaller(appUser.id);
      const created = await caller.fact.create({ content: "To be deleted" });

      await caller.fact.delete({ id: created.id });

      const result = await caller.fact.getById({ id: created.id });
      expect(result).toBeNull();
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });
});

describe("fact (RLS)", () => {
  test("user B cannot see user A's facts", async () => {
    const { authUserId: authA, appUser: userA } = await createTestUser("rls_a");
    const { authUserId: authB, appUser: userB } = await createTestUser("rls_b");
    try {
      const callerA = makeCaller(userA.id);
      const callerB = makeCaller(userB.id);

      const factA = await callerA.fact.create({ content: "User A secret fact" });

      const listB = await callerB.fact.list();
      expect(listB.some((f) => f.id === factA.id)).toBe(false);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authA));
      await db.delete(schema.user).where(eq(schema.user.id, authB));
    }
  });
});
