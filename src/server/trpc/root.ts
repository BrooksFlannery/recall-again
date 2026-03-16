import { router } from "@/server/trpc/trpc";
import { pingRouter } from "@/server/trpc/routers/ping";
import { meRouter } from "@/server/trpc/routers/me";
import { factRouter } from "@/server/trpc/routers/fact";

export const appRouter = router({
  ping: pingRouter,
  me: meRouter,
  fact: factRouter,
});

export type AppRouter = typeof appRouter;
