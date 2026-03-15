import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

/**
 * Better Auth config. Used by the app (when routes are mounted in Patch 2a)
 * and by the CLI to generate the Drizzle schema (auth:generate script).
 * No routes mounted in this patch.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: "/api/auth",
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
