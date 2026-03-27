import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { db, schemaApp } from "@/server/db";
import { Db } from "@/server/effect/db";
import {
  QuizRepository,
  QuizRepositoryLive,
  type CreateScheduledQuizFromDueFactsResult,
} from "@/server/effect/quiz-repository";

type ScheduledQuizSkipReason = Extract<
  CreateScheduledQuizFromDueFactsResult,
  { ok: false }
>["reason"];

/** Vercel Cron invokes this path with GET (see vercel.json). POST kept for manual triggers. */
async function handleScheduledQuizzesCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.SCHEDULED_QUIZ_CRON_ENABLED === "false") {
    return NextResponse.json({ processedUsers: 0, quizzesCreated: 0, skipped: 0 });
  }

  const asOf = new Date();
  const scheduledFor = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );

  const users = await db.select({ id: schemaApp.appUser.id }).from(schemaApp.appUser);

  let quizzesCreated = 0;
  let skipped = 0;
  const skipReasonCounts: Record<ScheduledQuizSkipReason, number> = {
    no_due_facts: 0,
    quiz_already_exists_for_day: 0,
  };
  const skipDetails: Array<{ userId: string; reason: ScheduledQuizSkipReason }> = [];

  for (const user of users) {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE recall_app`);
      await tx.execute(sql`SELECT set_config('app.user_id', ${user.id}, true)`);
      const requestDbLayer = Layer.succeed(Db, tx as unknown as typeof db);
      const layer = QuizRepositoryLive.pipe(Layer.provide(requestDbLayer));
      return Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* QuizRepository;
          return yield* repo.createScheduledQuizFromDueFacts(user.id, { scheduledFor, asOf });
        }).pipe(Effect.provide(layer)),
      );
    });

    if (result.ok) {
      quizzesCreated++;
    } else {
      skipped++;
      skipReasonCounts[result.reason]++;
      skipDetails.push({ userId: user.id, reason: result.reason });
      console.info("[cron/scheduled-quizzes] skipped user", {
        userId: user.id,
        reason: result.reason,
        scheduledFor: scheduledFor.toISOString(),
        asOf: asOf.toISOString(),
      });
    }
  }

  return NextResponse.json({
    processedUsers: users.length,
    quizzesCreated,
    skipped,
    scheduledFor: scheduledFor.toISOString(),
    asOf: asOf.toISOString(),
    skipReasonCounts,
    skipDetails,
  });
}

export async function GET(req: NextRequest) {
  return handleScheduledQuizzesCron(req);
}

export async function POST(req: NextRequest) {
  return handleScheduledQuizzesCron(req);
}
