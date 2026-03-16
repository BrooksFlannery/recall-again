import { initTRPC, TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { Layer } from "effect";
import { db } from "@/server/db";
import { Db } from "@/server/effect/db";

export type Context = {
  appUser: { id: string } | null;
};

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

const protectedMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.appUser) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const appUser = ctx.appUser;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${appUser.id}, true)`,
    );
    const requestDbLayer = Layer.succeed(Db, tx as unknown as typeof db);
    return next({ ctx: { ...ctx, appUser, requestDbLayer } });
  });
});

export const protectedProcedure = t.procedure.use(protectedMiddleware);
