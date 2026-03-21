import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { quizItem } from "@/server/db/schema-app";

/** Valid persisted values for `quiz_item.result` (M3c). Column is `text` in SQL. */
export const QuizItemResultSchema = z.enum(["correct", "incorrect"]);
export type QuizItemResult = z.infer<typeof QuizItemResultSchema>;

export const QuizItemSelectSchema = createSelectSchema(quizItem);
export type QuizItemSelect = z.infer<typeof QuizItemSelectSchema>;
