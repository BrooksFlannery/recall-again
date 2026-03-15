import { beforeAll, describe, expect, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";
import { ping } from "./schema-app";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("Drizzle DB client", () => {
  test("reads from ping table", async () => {
    const rows = await db.select().from(ping);
    expect(Array.isArray(rows)).toBe(true);
  });
});
