import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { quizItem } from "@/server/db/schema-app";

export const QuizItemSelectSchema = createSelectSchema(quizItem);
export type QuizItemSelect = z.infer<typeof QuizItemSelectSchema>;
