import { beforeAll, describe, test } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/server/db";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("fact.create", () => {
  // PENDING: Patch 7
  test.skip("returns new fact with id and content", async () => {
    // Setup: authenticated context (appUser with a valid id in app_user table),
    //        call fact.create with a content string.
    // Expectation: returns a fact object with id matching /^fact_/, userId matching
    //              the authenticated user, and content equal to the input.
  });
});

describe("fact.list", () => {
  // PENDING: Patch 7
  test.skip("returns only current user's facts", async () => {
    // Setup: authenticated context for user A; optionally pre-seed facts for
    //        user A and a different user B via direct DB insert.
    // Expectation: fact.list returns only facts with userId === appUser.id;
    //              user B's facts are not included.
  });
});

describe("fact.getById", () => {
  // PENDING: Patch 7
  test.skip("returns fact when owned, null otherwise", async () => {
    // Setup: two app users (A and B); create a fact as user A.
    // Expectation: user A calling getById with the fact id returns the row;
    //              user B calling getById with the same id returns null (RLS
    //              filters it out).
  });
});

describe("fact.update", () => {
  // PENDING: Patch 7
  test.skip("updates content when owned", async () => {
    // Setup: authenticated context; create a fact via fact.create with initial
    //        content; call fact.update with the fact id and new content.
    // Expectation: returns the updated fact with content equal to the new value;
    //              updatedAt is later than createdAt.
  });
});

describe("fact.delete", () => {
  // PENDING: Patch 7
  test.skip("deletes when owned", async () => {
    // Setup: authenticated context; create a fact via fact.create; call
    //        fact.delete with the returned fact id.
    // Expectation: fact.delete resolves without error; subsequent fact.getById
    //              with the same id returns null.
  });
});

describe("fact (RLS)", () => {
  // PENDING: Patch 7
  test.skip("user B cannot see user A's facts", async () => {
    // Setup: two distinct app users (A and B) with separate auth users; insert
    //        a fact belonging to user A via direct DB insert (or SET LOCAL for A).
    // Expectation: fact.list called in user B's context returns an empty array;
    //              user A's fact id is not present in B's results.
  });
});
