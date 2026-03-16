import { router } from "@/server/trpc/trpc";
import { pingRouter } from "@/server/trpc/routers/ping";
import { meRouter } from "@/server/trpc/routers/me";

export const appRouter = router({
  ping: pingRouter,
  me: meRouter,
});

export type AppRouter = typeof appRouter;
