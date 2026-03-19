import { router } from "@/server/trpc/trpc";
import { pingRouter } from "@/server/trpc/routers/ping";
import { meRouter } from "@/server/trpc/routers/me";
import { factRouter } from "@/server/trpc/routers/fact";
import { quizRouter } from "@/server/trpc/routers/quiz";

export const appRouter = router({
  ping: pingRouter,
  me: meRouter,
  fact: factRouter,
  quiz: quizRouter,
});

export type AppRouter = typeof appRouter;
