import { createSelectSchema } from "drizzle-zod";
import { quizItem } from "@/server/db/schema-app";

export const QuizItemSelectSchema = createSelectSchema(quizItem);
export type QuizItemSelect = typeof QuizItemSelectSchema._type;
