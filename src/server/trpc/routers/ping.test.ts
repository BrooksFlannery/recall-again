import { describe, test, expect } from "bun:test";

describe("ping router", () => {
  // Will be implemented in Patch 5 once the procedure is wired to Effect + Drizzle.
  test.skip("ping.getLatest returns an array of PingSelect rows", async () => {
    // Setup: run migrations against a real test DB, create a caller via
    //   createCallerFactory(appRouter)({}), insert a row, call ping.getLatest.
    // Expectation: result is an array where each element satisfies PingSelectSchema.
    expect(true).toBe(false); // placeholder — remove when implementing
  });
});
