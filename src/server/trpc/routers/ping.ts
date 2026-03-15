import { router, publicProcedure } from "@/server/trpc/trpc";
import { PingSelectSchema } from "@/server/schemas/health";
import { z } from "zod";

export const pingRouter = router({
  getLatest: publicProcedure
    .output(z.array(PingSelectSchema))
    .query(() => {
      throw new Error("not implemented");
    }),
});
