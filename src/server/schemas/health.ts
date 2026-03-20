import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { ping } from "@/server/db/schema-app";

export const PingSelectSchema = createSelectSchema(ping);

export type PingSelect = z.infer<typeof PingSelectSchema>;
