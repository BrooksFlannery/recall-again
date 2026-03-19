import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not automatically load Next.js env files.
// Load `.env.local` first (dev), then `.env` as a fallback.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export default defineConfig({
  schema: ["./src/server/db/schema.ts", "./src/server/db/schema-app.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
