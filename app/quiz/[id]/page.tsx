"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();
  const id =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : undefined;

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const utils = trpc.useUtils();

  const {
    data: quiz,
    isLoading: quizLoading,
    isError: quizError,
    error: quizQueryError,
  } = trpc.quiz.getById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && !!session?.user },
  );

  const sortedItems = useMemo(() => {
    if (!quiz?.items?.length) return [];
    return [...quiz.items].sort((a, b) => a.position - b.position);
  }, [quiz]);

  const questionQueries = trpc.useQueries((t) =>
    sortedItems.map((item) =>
      t.fact.getOrCreateActiveQuestion(
        { factId: item.factId },
        {
          enabled: sortedItems.length > 0 && !!session?.user,
        },
      ),
    ),
  );

  const detailsLoading =
    sortedItems.length > 0 &&
    questionQueries.some((q) => q.isLoading || q.isFetching);

  const showFullLoader = quizLoading || detailsLoading;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answerTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>(
    {},
  );

  const submitQuiz = trpc.quiz.submitQuiz.useMutation({
    onSuccess: () => {
      utils.quiz.getById.invalidate({ id: id ?? "" });
      utils.quiz.list.invalidate();
      utils.quiz.incompleteScheduledCount.invalidate();
    },
  });

  const overrideItemResult = trpc.quiz.overrideItemResult.useMutation({
    onSuccess: () => {
      utils.quiz.getById.invalidate({ id: id ?? "" });
      utils.quiz.list.invalidate();
      utils.quiz.incompleteScheduledCount.invalidate();
    },
  });

  const answeredCount = sortedItems.filter((item) => item.result != null).length;
  const totalCount = sortedItems.length;
  const allAnswered = totalCount > 0 && answeredCount === totalCount;

  const scoreDisplay = useMemo(() => {
    if (!allAnswered) return null;
    const correct = sortedItems.filter((i) => i.result === "correct").length;
    const total = sortedItems.length;
    const percent =
      total === 0 ? 0 : Math.round((correct / total) * 100);
    return { correct, total, percent };
  }, [allAnswered, sortedItems]);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.replace("/");
    }
  }, [session, sessionPending, router]);

  useLayoutEffect(() => {
    if (allAnswered) return;
    const minHeightPx = 72;
    for (const item of sortedItems) {
      const el = answerTextareaRefs.current[item.id];
      if (!el) continue;
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, minHeightPx)}px`;
    }
  }, [answers, sortedItems, allAnswered, showFullLoader]);

  if (sessionPending || !session?.user) {
    return (
      <main style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Loading…</p>
      </main>
    );
  }

  const navLinkStyle = {
    color: "inherit",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  } as const;

  const primaryButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    padding: "8px 14px",
    background: "var(--color-interactive-bg)",
    color: "#000",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
  };

  const borderValue = "1px solid var(--color-border)";
  const quizReviewActionBtnBase: CSSProperties = {
    padding: "6px 10px",
    boxSizing: "border-box",
    background: "var(--color-interactive-bg)",
    color: "#000",
    border: "1px solid var(--color-border)",
    fontSize: "0.8125rem",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  if (!id) {
    return (
      <main style={{ padding: "2rem 1.5rem" }}>
        <p>Invalid quiz link.</p>
        <p>
          <Link href="/dashboard" style={navLinkStyle}>
            Back to dashboard
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem", marginTop: 0 }}>
        Quiz
      </h1>

      {quizError ? (
        <p style={{ color: "#b91c1c" }}>
          {quizQueryError?.message ?? "Could not load quiz."}
        </p>
      ) : showFullLoader ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "3rem 1rem",
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="add-btn-spinner add-btn-spinner-on-light"
            style={{
              width: "2rem",
              height: "2rem",
              borderWidth: "3px",
            }}
            aria-hidden
          />
          <p style={{ color: "#6b7280", margin: 0 }}>Loading questions…</p>
        </div>
      ) : quiz == null ? (
        <p>Quiz not found or you don&apos;t have access.</p>
      ) : sortedItems.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          No facts in this quiz yet. Add some facts on the dashboard, then try
          again.
        </p>
      ) : (
        <>
          {totalCount > 0 && allAnswered && scoreDisplay ? (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.85rem 1rem",
                borderRadius: "6px",
                background: "var(--color-interactive-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: "#000" }}>
                {scoreDisplay.percent}% ({scoreDisplay.correct}/{scoreDisplay.total})
              </p>
            </div>
          ) : null}

          {!allAnswered && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!id || submitQuiz.isPending) return;
                submitQuiz.mutate({
                  quizId: id,
                  answers: sortedItems.map((item) => ({
                    quizItemId: item.id,
                    userAnswer: answers[item.id] ?? "",
                  })),
                });
              }}
            >
              <ol
                style={{
                  margin: "0 0 1.5rem",
                  paddingLeft: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                {sortedItems.map((item, i) => {
                  const q = questionQueries[i];
                  const questionText = q?.data?.question;
                  const err = q?.isError;

                  return (
                    <li key={item.id} style={{ paddingLeft: "0.25rem" }}>
                      {err ? (
                        <p
                          style={{
                            color: "#b91c1c",
                            margin: 0,
                            fontSize: "0.875rem",
                          }}
                        >
                          Failed to load this question.
                        </p>
                      ) : questionText ? (
                        <p
                          style={{
                            margin: "0 0 0.5rem",
                            fontSize: "0.9375rem",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {questionText}
                        </p>
                      ) : null}
                      <textarea
                        id={`answer-${item.id}`}
                        aria-label="Your answer"
                        ref={(el) => {
                          answerTextareaRefs.current[item.id] = el;
                        }}
                        value={answers[item.id] ?? ""}
                        onChange={(ev) =>
                          setAnswers((prev) => ({ ...prev, [item.id]: ev.target.value }))
                        }
                        rows={1}
                        disabled={submitQuiz.isPending}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.5rem 0.75rem",
                          fontSize: "0.875rem",
                          borderRadius: "6px",
                          border: "1px solid var(--color-border)",
                          background: "#fff",
                          resize: "none",
                          overflow: "hidden",
                          fontFamily: "inherit",
                          outline: "none",
                          minHeight: "4.5rem",
                        }}
                      />
                    </li>
                  );
                })}
              </ol>

              {submitQuiz.error && (
                <p style={{ color: "#b91c1c", fontSize: "0.875rem", marginBottom: "1rem" }}>
                  {submitQuiz.error.message}
                </p>
              )}

              <button
                type="submit"
                disabled={submitQuiz.isPending || detailsLoading}
                aria-busy={submitQuiz.isPending}
                style={{
                  ...primaryButtonStyle,
                  opacity: submitQuiz.isPending || detailsLoading ? 0.85 : 1,
                  cursor:
                    submitQuiz.isPending || detailsLoading ? "wait" : "pointer",
                }}
              >
                {submitQuiz.isPending ? (
                  <>
                    <span
                      className="add-btn-spinner add-btn-spinner-on-light"
                      aria-hidden
                    />
                    Grading…
                  </>
                ) : (
                  "Submit quiz"
                )}
              </button>
            </form>
          )}

          {allAnswered && (
            <div style={{ marginTop: "1.5rem" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {sortedItems.map((item, i) => {
                  const q = questionQueries[i];
                  const questionText = q?.data?.question;
                  const isTop = i === 0;
                  const isBottom = i === sortedItems.length - 1;
                  const isOnly = sortedItems.length === 1;
                  const containerRadius = isOnly
                    ? "6px"
                    : isTop
                      ? "6px 6px 0 0"
                      : isBottom
                        ? "0 0 6px 6px"
                        : 0;
                  const contentTopRadius = isOnly || isTop ? "6px 6px 0 0" : 0;
                  const barRadius = isBottom || isOnly ? "0 0 6px 6px" : 0;
                  const overturnBtnRadius = isBottom || isOnly ? "0 0 6px 0" : 0;

                  const containerStyle: CSSProperties = {
                    display: "flex",
                    flexDirection: "column",
                    border: borderValue,
                    borderRadius: containerRadius,
                    overflow: "hidden",
                    position: "relative",
                    ...(isTop ? {} : { borderTop: "none" }),
                  };

                  return (
                    <li key={item.id} style={{ position: "relative" }}>
                      <div style={containerStyle}>
                        <div
                          style={{
                            padding: "0.5rem 0.75rem",
                            background: "#fff",
                            borderRadius: contentTopRadius,
                          }}
                        >
                          <p
                            style={{
                              margin: "0 0 0.5rem",
                              fontSize: "0.875rem",
                              color: "#000",
                            }}
                          >
                            <span style={{ color: "#6b7280" }}>Q: </span>
                            <span style={{ whiteSpace: "pre-wrap" }}>
                              {questionText ?? "—"}
                            </span>
                          </p>
                          <p
                            style={{
                              margin: "0 0 0.5rem",
                              fontSize: "0.875rem",
                              color: "#000",
                            }}
                          >
                            <span style={{ color: "#6b7280" }}>A: </span>
                            <span style={{ whiteSpace: "pre-wrap" }}>
                              {item.userAnswer ?? "—"}
                            </span>
                          </p>
                          {(() => {
                            const aiEval: "correct" | "incorrect" =
                              item.aiResult === "correct" ||
                              item.aiResult === "incorrect"
                                ? item.aiResult
                                : item.result === "correct" ||
                                    item.result === "incorrect"
                                  ? item.result
                                  : "incorrect";
                            const evalWord =
                              aiEval === "correct" ? "Correct" : "Incorrect";
                            const evalColor =
                              aiEval === "correct" ? "#15803d" : "#b91c1c";
                            const effective = item.result;
                            const overridden =
                              item.aiResult != null &&
                              effective != null &&
                              item.aiResult !== effective;

                            return (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "0.875rem",
                                  lineHeight: 1.45,
                                  color: "#000",
                                }}
                              >
                                <span style={{ color: "#6b7280" }}>
                                  Evaluation:{" "}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: evalColor,
                                  }}
                                >
                                  {evalWord}.
                                </span>
                                {item.aiReasoning ? (
                                  <>
                                    {" "}
                                    <span
                                      style={{ whiteSpace: "pre-wrap" }}
                                    >
                                      {item.aiReasoning}
                                    </span>
                                  </>
                                ) : null}
                                {overridden ? (
                                  <span
                                    style={{
                                      color: "#6b7280",
                                      fontWeight: 500,
                                      fontSize: "0.8125rem",
                                    }}
                                  >
                                    {" "}
                                    (Final:{" "}
                                    {effective === "correct"
                                      ? "Correct"
                                      : "Incorrect"}
                                    )
                                  </span>
                                ) : null}
                              </p>
                            );
                          })()}
                        </div>
                        {(() => {
                          const rawAi = item.aiResult;
                          const aiVerdict: "correct" | "incorrect" =
                            rawAi === "correct" || rawAi === "incorrect"
                              ? rawAi
                              : item.result === "correct" ||
                                  item.result === "incorrect"
                                ? item.result
                                : "incorrect";
                          const opposite: "correct" | "incorrect" =
                            aiVerdict === "correct" ? "incorrect" : "correct";
                          const acceptWord =
                            aiVerdict === "correct" ? "Correct" : "Incorrect";
                          const overturnWord =
                            opposite === "correct" ? "Correct" : "Incorrect";
                          const effective = item.result;
                          return (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                alignItems: "flex-end",
                                minHeight: "2.5rem",
                                borderRadius: barRadius,
                                background: "#fff",
                              }}
                            >
                              <button
                                type="button"
                                disabled={overrideItemResult.isPending}
                                onClick={() =>
                                  overrideItemResult.mutate({
                                    quizItemId: item.id,
                                    result: aiVerdict,
                                  })
                                }
                                style={{
                                  ...quizReviewActionBtnBase,
                                  borderRight: "none",
                                  borderBottom: "none",
                                  borderRadius: "6px 0 0 0",
                                  fontWeight:
                                    effective === aiVerdict ? 600 : 400,
                                  background:
                                    effective === aiVerdict
                                      ? "var(--color-interactive-bg)"
                                      : "#fff",
                                  cursor: overrideItemResult.isPending
                                    ? "not-allowed"
                                    : "pointer",
                                }}
                              >
                                {`Accept as ${acceptWord}`}
                              </button>
                              <button
                                type="button"
                                disabled={overrideItemResult.isPending}
                                onClick={() =>
                                  overrideItemResult.mutate({
                                    quizItemId: item.id,
                                    result: opposite,
                                  })
                                }
                                style={{
                                  ...quizReviewActionBtnBase,
                                  borderRight: "none",
                                  borderBottom: "none",
                                  borderRadius: overturnBtnRadius,
                                  fontWeight:
                                    effective === opposite ? 600 : 400,
                                  background:
                                    effective === opposite
                                      ? "var(--color-interactive-bg)"
                                      : "#fff",
                                  cursor: overrideItemResult.isPending
                                    ? "not-allowed"
                                    : "pointer",
                                }}
                              >
                                {`Overturn as ${overturnWord}`}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
