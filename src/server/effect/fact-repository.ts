import { Context, Effect, Layer } from "effect";
import { desc, eq } from "drizzle-orm";
import { Db } from "@/server/effect/db";
import { schemaApp } from "@/server/db";
import type { FactSelect } from "@/server/schemas/fact";

export interface IFactRepository {
  create: (appUserId: string, content: string) => Effect.Effect<FactSelect>;
  list: () => Effect.Effect<FactSelect[]>;
  getById: (id: string) => Effect.Effect<FactSelect | null>;
  update: (id: string, content: string) => Effect.Effect<FactSelect | null>;
  delete: (id: string) => Effect.Effect<void>;
}

export class FactRepository extends Context.Tag("FactRepository")<
  FactRepository,
  IFactRepository
>() {}

export const FactRepositoryLive = Layer.effect(
  FactRepository,
  Effect.gen(function* () {
    const db = yield* Db;

    return {
      create: (appUserId: string, content: string): Effect.Effect<FactSelect> =>
        Effect.tryPromise(() =>
          db
            .insert(schemaApp.fact)
            .values({ userId: appUserId, content })
            .returning()
            .then((rows) => rows[0]),
        ).pipe(Effect.orDie),

      list: (): Effect.Effect<FactSelect[]> =>
        Effect.tryPromise(() =>
          db
            .select()
            .from(schemaApp.fact)
            .orderBy(desc(schemaApp.fact.createdAt)),
        ).pipe(Effect.orDie),

      getById: (id: string): Effect.Effect<FactSelect | null> =>
        Effect.tryPromise(() =>
          db
            .select()
            .from(schemaApp.fact)
            .where(eq(schemaApp.fact.id, id))
            .then((rows) => rows[0] ?? null),
        ).pipe(Effect.orDie),

      update: (id: string, content: string): Effect.Effect<FactSelect | null> =>
        Effect.tryPromise(() =>
          db
            .update(schemaApp.fact)
            .set({ content })
            .where(eq(schemaApp.fact.id, id))
            .returning()
            .then((rows) => rows[0] ?? null),
        ).pipe(Effect.orDie),

      delete: (id: string): Effect.Effect<void> =>
        Effect.tryPromise(() =>
          db
            .delete(schemaApp.fact)
            .where(eq(schemaApp.fact.id, id))
            .then(() => undefined),
        ).pipe(Effect.orDie),
    };
  }),
);
