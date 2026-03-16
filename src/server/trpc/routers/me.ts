import { router, protectedProcedure } from "@/server/trpc/trpc";

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) => ctx.appUser),
});
