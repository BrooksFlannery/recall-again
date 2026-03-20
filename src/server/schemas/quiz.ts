import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { quiz } from "@/server/db/schema-app";

export const QuizSelectSchema = createSelectSchema(quiz);
export type QuizSelect = z.infer<typeof QuizSelectSchema>;

export const CreateManualQuizInputSchema = z.object({
  factCount: z.number().int().min(1).max(50).default(10),
});
export type CreateManualQuizInput = z.infer<typeof CreateManualQuizInputSchema>;
