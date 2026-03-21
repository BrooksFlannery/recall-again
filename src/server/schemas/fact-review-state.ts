import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { factReviewState } from "@/server/db/schema-app";

export const FactReviewStateSelectSchema = createSelectSchema(factReviewState);
export type FactReviewStateSelect = z.infer<typeof FactReviewStateSelectSchema>;
