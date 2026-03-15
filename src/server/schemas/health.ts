import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { ping } from "@/server/db/schema-app";

export const PingSelectSchema = createSelectSchema(ping);
export const PingInsertSchema = createInsertSchema(ping);

export type PingSelect = typeof PingSelectSchema._type;
export type PingInsert = typeof PingInsertSchema._type;
