import { beforeAll, describe, test } from "bun:test";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/server/db";
import { appRouter } from "@/server/trpc/root";
import { createCallerFactory } from "@/server/trpc/trpc";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

function makeCaller(appUserId: string) {
  return createCallerFactory(appRouter)({ appUser: { id: appUserId } });
}

describe("quiz.createManual", () => {
  test.skip("returns quiz with N items", async () => {
    // PENDING: Patch 6
    // Setup: create a user and N facts owned by that user
    // Action: call quiz.createManual({ count: N })
    // Expect: returned quiz has mode === "manual" and exactly N quiz items,
    //         each quiz item references one of the user's facts
  });

  test.skip("only selects current user's facts (RLS)", async () => {
    // PENDING: Patch 6
    // Setup: create two users (A and B), each with some facts
    // Action: user A calls quiz.createManual({ count: N })
    // Expect: all quiz items reference facts owned by user A only,
    //         none reference user B's facts
  });

  test.skip("validates/bounds count", async () => {
    // PENDING: Patch 6
    // Setup: create a user with fewer facts than the requested count
    // Action: call quiz.createManual with count below minimum or above maximum,
    //         or above the number of available facts
    // Expect: appropriate validation error (e.g. BAD_REQUEST) for out-of-range count;
    //         if count exceeds available facts, either error or cap to available
  });
});

describe("quiz.getById", () => {
  test.skip("user cannot read another user's quiz (RLS)", async () => {
    // PENDING: Patch 6
    // Setup: create two users (A and B); user A creates a manual quiz
    // Action: user B calls quiz.getById({ id: userA's quizId })
    // Expect: result is null or a NOT_FOUND error — user B cannot access user A's quiz
  });
});
