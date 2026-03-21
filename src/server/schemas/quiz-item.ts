import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { quizItem } from "@/server/db/schema-app";

/** Valid persisted values for `quiz_item.result` (M3c). Column is `text` in SQL. */
export const QuizItemResultSchema = z.enum(["correct", "incorrect"]);
export type QuizItemResult = z.infer<typeof QuizItemResultSchema>;

export const QuizItemSelectSchema = createSelectSchema(quizItem);
export type QuizItemSelect = z.infer<typeof QuizItemSelectSchema>;

export const SubmitQuizItemInputSchema = z.object({
  quizItemId: z.string(),
  result: QuizItemResultSchema,
});
export type SubmitQuizItemInput = z.infer<typeof SubmitQuizItemInputSchema>;

export const SubmitQuizItemOutputSchema = z.object({
  quizItem: QuizItemSelectSchema,
  reviewStateUpdated: z.boolean(),
});
export type SubmitQuizItemOutput = z.infer<typeof SubmitQuizItemOutputSchema>;
