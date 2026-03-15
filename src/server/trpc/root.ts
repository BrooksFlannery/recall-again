import { router } from "@/server/trpc/trpc";
import { pingRouter } from "@/server/trpc/routers/ping";

export const appRouter = router({
  ping: pingRouter,
});

export type AppRouter = typeof appRouter;
