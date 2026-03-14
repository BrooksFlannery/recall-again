import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as schemaApp from "./schema-app";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({
  connectionString,
  max: 10,
});

/** Drizzle client with full schema (auth tables + app tables). */
export const db = drizzle({ client: pool, schema: { ...schema, ...schemaApp } });
export { schema, schemaApp };
