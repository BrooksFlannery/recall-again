import { createSelectSchema } from "drizzle-zod";
import { ping } from "@/server/db/schema-app";

export const PingSelectSchema = createSelectSchema(ping);

export type PingSelect = typeof PingSelectSchema._type;
