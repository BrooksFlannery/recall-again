import { describe, it, expect } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("cron route", () => {
  it("rejects bad secret", async () => {
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "correct-secret";
    try {
      const res = await POST(
        new NextRequest("http://localhost/api/cron/scheduled-quizzes", {
          method: "POST",
          headers: { Authorization: "Bearer wrong-secret" },
        }),
      );
      expect(res.status).toBe(401);

      const res2 = await POST(
        new NextRequest("http://localhost/api/cron/scheduled-quizzes", {
          method: "POST",
        }),
      );
      expect(res2.status).toBe(401);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = originalSecret;
      }
    }
  });
});
