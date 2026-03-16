import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { fact } from "@/server/db/schema-app";

export const FactSelectSchema = createSelectSchema(fact);
export type FactSelect = typeof FactSelectSchema._type;

export const FactCreateInputSchema = z.object({
  content: z.string().min(1).max(10000),
});
export type FactCreateInput = z.infer<typeof FactCreateInputSchema>;

export const FactUpdateInputSchema = z.object({
  id: z.string(),
  content: z.string().min(1).max(10000),
});
export type FactUpdateInput = z.infer<typeof FactUpdateInputSchema>;
