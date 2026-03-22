import OpenAI from "openai";
import { z } from "zod";

export interface GradeInputItem {
  quizItemId: string;
  question: string;
  canonicalAnswer: string;
  userAnswer: string;
}

export interface GradedItem {
  quizItemId: string;
  result: "correct" | "incorrect";
  reasoning: string;
}

const GradeResponseSchema = z.object({
  grades: z.array(
    z.object({
      quizItemId: z.string(),
      result: z.enum(["correct", "incorrect"]),
      reasoning: z.string(),
    }),
  ),
});

/**
 * Grades all items in one request. The model must return exactly one grade per quizItemId.
 */
export async function gradeQuizItems(items: GradeInputItem[]): Promise<GradedItem[]> {
  if (items.length === 0) {
    return [];
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing env var OPENAI_API_KEY");
  }

  const model =
    process.env.OPENAI_QUIZ_GRADE_MODEL ?? process.env.OPENAI_QUESTION_MODEL;
  if (!model) {
    throw new Error(
      "Set OPENAI_QUIZ_GRADE_MODEL or OPENAI_QUESTION_MODEL for quiz grading.",
    );
  }

  const client = new OpenAI({ apiKey });

  const payload = items.map((i) => ({
    quizItemId: i.quizItemId,
    question: i.question,
    canonical_answer: i.canonicalAnswer,
    user_answer: i.userAnswer,
  }));

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You grade short free-text quiz answers. For each item you receive:
- question: what was asked
- canonical_answer: the reference answer
- user_answer: what the learner wrote

Decide whether the user's answer is correct: it should demonstrate the same knowledge as the canonical answer, allowing for different wording, minor typos, and extra detail unless it contradicts the fact.

Respond with JSON only, in this exact shape:
{ "grades": [ { "quizItemId": "<id>", "result": "correct" | "incorrect", "reasoning": "<brief explanation for the learner>" } ] }

Include every quizItemId exactly once. Use the same quizItemId values as in the input.`,
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = GradeResponseSchema.parse(JSON.parse(raw));

  const expectedIds = new Set(items.map((i) => i.quizItemId));
  const seen = new Set<string>();
  const out: GradedItem[] = [];

  for (const g of parsed.grades) {
    if (!expectedIds.has(g.quizItemId) || seen.has(g.quizItemId)) {
      throw new Error("Quiz grader returned invalid or duplicate quizItemId.");
    }
    seen.add(g.quizItemId);
    out.push({
      quizItemId: g.quizItemId,
      result: g.result,
      reasoning: g.reasoning,
    });
  }

  if (seen.size !== expectedIds.size) {
    throw new Error("Quiz grader did not return a grade for every item.");
  }

  return out;
}
