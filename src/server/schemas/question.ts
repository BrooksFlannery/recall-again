import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { flashcard } from "@/server/db/schema-app";

export const QuestionSelectSchema = createSelectSchema(flashcard);
export type QuestionSelect = typeof QuestionSelectSchema._type;

export const QuestionGeneratedSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type QuestionGenerated = z.infer<typeof QuestionGeneratedSchema>;
