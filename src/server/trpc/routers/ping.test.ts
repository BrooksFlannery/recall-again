import { beforeAll, describe, test, expect } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/server/db";
import { ping } from "@/server/db/schema-app";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";
import { PingSelectSchema } from "@/server/schemas/health";
import { z } from "zod";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("ping router", () => {
  test("ping.getLatest returns an array of PingSelect rows", async () => {
    await db.insert(ping).values({});

    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({});

    const result = await caller.ping.getLatest();

    expect(Array.isArray(result)).toBe(true);
    const parsed = z.array(PingSelectSchema).safeParse(result);
    expect(parsed.success).toBe(true);
  });
});
