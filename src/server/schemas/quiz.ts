import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { quiz } from "@/server/db/schema-app";

export const QuizSelectSchema = createSelectSchema(quiz);
export type QuizSelect = z.infer<typeof QuizSelectSchema>;

export const CreateManualQuizInputSchema = z.object({
  factCount: z.number().int().min(1).max(50).default(10),
});
export type CreateManualQuizInput = z.infer<typeof CreateManualQuizInputSchema>;

/** List row for history / dashboard; aggregates from `quiz` + `quiz_item`. */
export const QuizSummarySchema = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  mode: z.string(),
  scheduledFor: z.coerce.date().nullable(),
  itemCount: z.number().int(),
  answeredCount: z.number().int(),
  correctCount: z.number().int(),
});
export type QuizSummary = z.infer<typeof QuizSummarySchema>;
