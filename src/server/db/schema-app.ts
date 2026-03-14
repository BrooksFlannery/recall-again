import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Example app table for the health/ping tRPC procedure. */
export const ping = pgTable("ping", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
