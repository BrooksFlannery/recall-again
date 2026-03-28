/**
 * Minimum number of facts a user must have before starting a manual quiz.
 * Enforced in `quiz.createManual` and mirrored in the dashboard UI.
 */
export const MIN_FACTS_FOR_QUIZ = 5;

/** Shown as `aiReasoning` when the learner submits without answering (trim-empty). Not sent to the grader. */
export const SKIPPED_QUIZ_ITEM_AI_REASONING = "This question was not answered.";
