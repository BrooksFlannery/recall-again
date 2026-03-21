import { beforeAll, describe, it, expect } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { db, schema, schemaApp } from "@/server/db";
import { Db } from "@/server/effect/db";
import { QuizRepository, QuizRepositoryLive } from "@/server/effect/quiz-repository";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function createTestUser(tag: string) {
  const authUserId = `test_auth_repo_${tag}_${Date.now()}`;
  const email = `test_repo_${tag}_${Date.now()}@example.com`;

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

async function withUserRls<T>(
  userId: string,
  fn: (layer: Layer.Layer<Db>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE recall_app`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    const layer = Layer.succeed(Db, tx as unknown as typeof db);
    return fn(layer);
  });
}

describe("createScheduledQuizFromDueFacts", () => {
  it("creates scheduled quiz + items", async () => {
    const { authUserId, appUser } = await createTestUser("creates");
    try {
      const [fact] = await db
        .insert(schemaApp.fact)
        .values({ userId: appUser.id, content: "Test fact for scheduled quiz" })
        .returning();

      await db.insert(schemaApp.factReviewState).values({
        userId: appUser.id,
        factId: fact!.id,
        nextReviewAt: new Date("2020-01-01T00:00:00Z"),
        fibonacciStepIndex: 0,
      });

      const asOf = new Date("2024-01-15T12:00:00Z");
      const scheduledFor = new Date("2024-01-15T00:00:00Z");

      const result = await withUserRls(appUser.id, (requestDbLayer) => {
        const layer = QuizRepositoryLive.pipe(Layer.provide(requestDbLayer));
        return Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* QuizRepository;
            return yield* repo.createScheduledQuizFromDueFacts(appUser.id, {
              scheduledFor,
              asOf,
            });
          }).pipe(Effect.provide(layer)),
        );
      });

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("scheduled");
      expect(result!.userId).toBe(appUser.id);
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0]!.factId).toBe(fact!.id);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });

  it("idempotent same day", async () => {
    const { authUserId, appUser } = await createTestUser("idempotent");
    try {
      const [fact] = await db
        .insert(schemaApp.fact)
        .values({ userId: appUser.id, content: "Idempotent test fact" })
        .returning();

      await db.insert(schemaApp.factReviewState).values({
        userId: appUser.id,
        factId: fact!.id,
        nextReviewAt: new Date("2020-01-01T00:00:00Z"),
        fibonacciStepIndex: 0,
      });

      const asOf = new Date("2024-01-15T12:00:00Z");
      const scheduledFor = new Date("2024-01-15T00:00:00Z");

      const first = await withUserRls(appUser.id, (requestDbLayer) => {
        const layer = QuizRepositoryLive.pipe(Layer.provide(requestDbLayer));
        return Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* QuizRepository;
            return yield* repo.createScheduledQuizFromDueFacts(appUser.id, {
              scheduledFor,
              asOf,
            });
          }).pipe(Effect.provide(layer)),
        );
      });

      const second = await withUserRls(appUser.id, (requestDbLayer) => {
        const layer = QuizRepositoryLive.pipe(Layer.provide(requestDbLayer));
        return Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* QuizRepository;
            return yield* repo.createScheduledQuizFromDueFacts(appUser.id, {
              scheduledFor,
              asOf,
            });
          }).pipe(Effect.provide(layer)),
        );
      });

      expect(first).not.toBeNull();
      expect(second).toBeNull();

      const quizzes = await db
        .select()
        .from(schemaApp.quiz)
        .where(eq(schemaApp.quiz.userId, appUser.id));
      expect(quizzes).toHaveLength(1);
    } finally {
      await db.delete(schema.user).where(eq(schema.user.id, authUserId));
    }
  });
});
