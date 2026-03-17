import { Context, Effect, Layer } from "effect";
import OpenAI from "openai";
import { z } from "zod";

export interface GeneratedQuestion {
  question: string;
  answer: string;
}

export interface IQuestionGenerator {
  generateQuestionFromFact: (content: string) => Effect.Effect<GeneratedQuestion>;
}

export class QuestionGenerator extends Context.Tag("QuestionGenerator")<
  QuestionGenerator,
  IQuestionGenerator
>() {}

const QuestionResponseSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const QuestionGeneratorLive = Layer.succeed(
  QuestionGenerator,
  {
    generateQuestionFromFact: (content: string): Effect.Effect<GeneratedQuestion> =>
      Effect.tryPromise(async () => {
        const apiKey = process.env.OPENAI_API_KEY;
        const model = process.env.OPENAI_QUESTION_MODEL ?? "gpt-4o-mini";

        const client = new OpenAI({ apiKey });

        const response = await client.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                'You are a quiz question generator. Given a fact, generate one quiz question that tests knowledge of that fact, along with a canonical answer. Respond with valid JSON in this exact format: { "question": "your question here", "answer": "canonical answer here" }',
            },
            {
              role: "user",
              content: content,
            },
          ],
          response_format: { type: "json_object" },
        });

        const raw = response.choices[0]?.message?.content ?? "{}";
        return QuestionResponseSchema.parse(JSON.parse(raw));
      }).pipe(Effect.orDie),
  },
);
