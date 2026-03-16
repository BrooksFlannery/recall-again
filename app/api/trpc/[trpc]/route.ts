import { fetchRequestHandler, type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { findOrCreateAppUserByAuthId } from "@/server/trpc/app-user";
import type { NextRequest } from "next/server";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async (opts: FetchCreateContextFnOptions) => {
      const session = await auth.api.getSession({ headers: opts.req.headers });
      if (!session) {
        return { appUser: null };
      }
      const appUser = await findOrCreateAppUserByAuthId(db, session.user.id);
      return { appUser };
    },
  });

export { handler as GET, handler as POST };
