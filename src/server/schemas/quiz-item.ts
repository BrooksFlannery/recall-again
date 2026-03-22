import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { quizItem } from "@/server/db/schema-app";

/** Valid persisted values for `quiz_item.result` (M3c). Column is `text` in SQL. */
export const QuizItemResultSchema = z.enum(["correct", "incorrect"]);
export type QuizItemResult = z.infer<typeof QuizItemResultSchema>;

export const QuizItemSelectSchema = createSelectSchema(quizItem);
export type QuizItemSelect = z.infer<typeof QuizItemSelectSchema>;

export const SubmitQuizInputSchema = z.object({
  quizId: z.string(),
  answers: z.array(
    z.object({
      quizItemId: z.string(),
      userAnswer: z.string(),
    }),
  ),
});
export type SubmitQuizInput = z.infer<typeof SubmitQuizInputSchema>;

export const SubmitQuizOutputSchema = z.object({
  items: z.array(QuizItemSelectSchema),
  correctCount: z.number(),
  totalCount: z.number(),
});
export type SubmitQuizOutput = z.infer<typeof SubmitQuizOutputSchema>;

export const OverrideQuizItemInputSchema = z.object({
  quizItemId: z.string(),
  result: QuizItemResultSchema,
});
export type OverrideQuizItemInput = z.infer<typeof OverrideQuizItemInputSchema>;

export const OverrideQuizItemOutputSchema = z.object({
  quizItem: QuizItemSelectSchema,
});
export type OverrideQuizItemOutput = z.infer<typeof OverrideQuizItemOutputSchema>;
