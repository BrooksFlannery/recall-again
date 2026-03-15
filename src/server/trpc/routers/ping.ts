import { router, publicProcedure } from "@/server/trpc/trpc";
import { PingSelectSchema } from "@/server/schemas/health";
import { Db, DbLive } from "@/server/effect/db";
import { ping } from "@/server/db/schema-app";
import { Effect } from "effect";
import { z } from "zod";

export const pingRouter = router({
  getLatest: publicProcedure
    .output(z.array(PingSelectSchema))
    .query(() =>
      Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* Db;
          return yield* Effect.promise(() => db.select().from(ping));
        }).pipe(Effect.provide(DbLive)),
      )
    ),
});
