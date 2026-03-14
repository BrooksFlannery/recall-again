import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/server/db/schema.ts", "./src/server/db/schema-app.ts"],
  out: "./drizzle",
  dialect: "postgresql",
});
