import { Context, Effect, Layer } from "effect";
import { Db } from "@/server/effect/db";
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

// PENDING: Patch 7 — replace stub implementations with real DB queries via Drizzle
export const FactRepositoryLive = Layer.effect(
  FactRepository,
  Effect.gen(function* () {
    const _db = yield* Db; // wired in Patch 7

    return {
      create: (appUserId: string, content: string): Effect.Effect<FactSelect> =>
        Effect.succeed({
          id: "fact_stub",
          userId: appUserId,
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),

      list: (): Effect.Effect<FactSelect[]> => Effect.succeed([]),

      getById: (_id: string): Effect.Effect<FactSelect | null> =>
        Effect.succeed(null),

      update: (
        _id: string,
        _content: string,
      ): Effect.Effect<FactSelect | null> => Effect.succeed(null),

      delete: (_id: string): Effect.Effect<void> =>
        Effect.succeed(undefined),
    };
  }),
);
