import { beforeAll, describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, schema, schemaApp } from "@/server/db";
import { getAppUserByAuthId } from "@/server/trpc/app-user";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("protectedProcedure", () => {
  test("returns 401 when no session", async () => {
    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({ appUser: null });

    await expect(caller.me.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("createContext", () => {
  test("returns app user when authenticated", async () => {
    const authUserId = `test_auth_ctx_${Date.now()}`;
    const email = `test_ctx_${Date.now()}@example.com`;

    await db.insert(schema.user).values({
      id: authUserId,
      name: "Test User",
      email,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(schemaApp.appUser).values({ authUserId });

    const appUser = await getAppUserByAuthId(db, authUserId);

    expect(appUser).not.toBeNull();
    expect(appUser!.id).toMatch(/^user_/);

    // auth user delete cascades to app_user
    await db.delete(schema.user).where(eq(schema.user.id, authUserId));
  });
});

describe("me", () => {
  test("returns app user when authenticated", async () => {
    const createCaller = createCallerFactory(appRouter);
    const appUser = { id: "user_test_me_get" };
    const caller = createCaller({ appUser });

    const result = await caller.me.get();

    expect(result).toEqual(appUser);
  });
});
