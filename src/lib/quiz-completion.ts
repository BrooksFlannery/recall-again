/** Matches Past quizzes list: complete when every item has been answered. */
export function isQuizComplete(q: {
  itemCount: number;
  answeredCount: number;
}): boolean {
  return q.itemCount > 0 && q.answeredCount === q.itemCount;
}

export function isIncompleteScheduledQuiz(q: {
  mode: string;
  itemCount: number;
  answeredCount: number;
}): boolean {
  return q.mode === "scheduled" && !isQuizComplete(q);
}
