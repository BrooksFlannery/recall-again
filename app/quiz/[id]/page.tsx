"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { Eye, EyeOff, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCommandMode } from "../../components/command-mode-context";
import { CommandJumpHint } from "../../components/command-jump-hint";
import {
  StruckVerdictIcon,
  VerdictMarkIcon,
} from "../../components/struck-verdict-icon";

const TAKE_QUIZ_FORM_ID = "take-quiz-form";

function quizItemAiVerdict(item: {
  aiResult: string | null;
  result: string | null;
}): "correct" | "incorrect" {
  const rawAi = item.aiResult;
  if (rawAi === "correct" || rawAi === "incorrect") return rawAi;
  if (item.result === "correct" || item.result === "incorrect")
    return item.result;
  return "incorrect";
}

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
  const commandMode = useCommandMode();
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
  const [reviewDetailsOpen, setReviewDetailsOpen] = useState<
    Record<string, boolean>
  >({});
  const [focusedQuizItemId, setFocusedQuizItemId] = useState<string | null>(
    null,
  );
  const reviewCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const answerTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>(
    {},
  );
  const takeQuizFormRef = useRef<HTMLFormElement>(null);

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

  const draftAnsweredCount = useMemo(
    () =>
      sortedItems.filter((item) => (answers[item.id] ?? "").trim().length > 0)
        .length,
    [sortedItems, answers],
  );

  const handleTakingAnswerKeyDown = useCallback(
    (
      e: ReactKeyboardEvent<HTMLTextAreaElement>,
      itemIndex: number,
    ) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const isEnter =
        e.key === "Enter" ||
        e.key === "NumpadEnter" ||
        e.code === "Enter" ||
        e.code === "NumpadEnter";
      if (!isEnter) return;
      e.preventDefault();

      if (!id || submitQuiz.isPending || detailsLoading) return;

      let lastAnswerIndex = -1;
      for (let j = 0; j < sortedItems.length; j++) {
        if (!questionQueries[j]?.isError) lastAnswerIndex = j;
      }
      if (lastAnswerIndex < 0) return;

      if (itemIndex === lastAnswerIndex) {
        takeQuizFormRef.current?.requestSubmit();
        return;
      }

      for (let j = itemIndex + 1; j < sortedItems.length; j++) {
        if (questionQueries[j]?.isError) continue;
        const nextId = sortedItems[j].id;
        const el = answerTextareaRefs.current[nextId];
        if (el) {
          el.focus();
          setFocusedQuizItemId(nextId);
          return;
        }
      }
    },
    [
      id,
      submitQuiz.isPending,
      detailsLoading,
      sortedItems,
      questionQueries,
    ],
  );

  const quizJumpHints = useMemo(() => {
    if (
      !commandMode ||
      sortedItems.length === 0 ||
      showFullLoader ||
      quiz == null
    ) {
      return {} as Record<string, ("J" | "K")[]>;
    }
    const ids = sortedItems.map((item) => item.id);
    const hints: Record<string, ("J" | "K")[]> = {};
    const push = (id: string, k: "J" | "K") => {
      const arr = hints[id] ?? (hints[id] = []);
      if (!arr.includes(k)) arr.push(k);
    };

    const idx = focusedQuizItemId ? ids.indexOf(focusedQuizItemId) : -1;

    if (idx < 0) {
      push(ids[0], "J");
      push(ids[ids.length - 1], "K");
      return hints;
    }
    if (idx > 0) {
      push(ids[idx - 1], "K");
    }
    if (idx < ids.length - 1) {
      push(ids[idx + 1], "J");
    }
    return hints;
  }, [
    commandMode,
    sortedItems,
    focusedQuizItemId,
    showFullLoader,
    quiz,
  ]);

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

  function isFocusInAnyReviewCard(): boolean {
    const el = document.activeElement;
    if (!el || !(el instanceof Node)) return false;
    for (const node of Object.values(reviewCardRefs.current)) {
      if (node?.contains(el)) return true;
    }
    return false;
  }

  function isFocusInAnyAnswerTextarea(): boolean {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return false;
    for (const ta of Object.values(answerTextareaRefs.current)) {
      if (ta && (ta === el || ta.contains(el))) return true;
    }
    return false;
  }

  useEffect(() => {
    if (sortedItems.length === 0 || showFullLoader || quiz == null) return;

    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const down = e.key === "j" || e.key === "J";
      const up = e.key === "k" || e.key === "K";
      if (!down && !up) return;
      e.preventDefault();

      const ids = sortedItems.map((item) => item.id);
      let idx = focusedQuizItemId ? ids.indexOf(focusedQuizItemId) : -1;
      if (down) {
        if (idx < 0) idx = 0;
        else idx = Math.min(idx + 1, ids.length - 1);
      } else {
        if (idx < 0) idx = ids.length - 1;
        else idx = Math.max(idx - 1, 0);
      }

      const nextId = ids[idx];
      if (nextId == null) return;

      if (allAnswered) {
        reviewCardRefs.current[nextId]?.focus();
      } else {
        answerTextareaRefs.current[nextId]?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    sortedItems,
    focusedQuizItemId,
    allAnswered,
    showFullLoader,
    quiz,
  ]);

  useEffect(() => {
    if (!allAnswered) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) {
          return;
        }
      }
      const fid = focusedQuizItemId;
      if (!fid) return;
      const item = sortedItems.find((i) => i.id === fid);
      if (!item) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        if (overrideItemResult.isPending) return;
        const aiVerdict = quizItemAiVerdict(item);
        const opposite = aiVerdict === "correct" ? "incorrect" : "correct";
        const effective = item.result;
        const effectiveMatchesAi = effective === aiVerdict;
        overrideItemResult.mutate({
          quizItemId: item.id,
          result: effectiveMatchesAi ? opposite : aiVerdict,
        });
        return;
      }

      if (
        e.key === "Enter" ||
        e.key === "NumpadEnter" ||
        e.code === "Enter" ||
        e.code === "NumpadEnter"
      ) {
        e.preventDefault();
        setReviewDetailsOpen((prev) => ({
          ...prev,
          [fid]: !(prev[fid] ?? false),
        }));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    allAnswered,
    focusedQuizItemId,
    sortedItems,
    overrideItemResult,
  ]);

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

  const takeQuizSubmitButtonStyle: CSSProperties = {
    ...primaryButtonStyle,
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    borderTop: "none",
    opacity: submitQuiz.isPending || detailsLoading ? 0.85 : 1,
    cursor:
      submitQuiz.isPending || detailsLoading ? "wait" : "pointer",
  };

  const borderValue = "1px solid var(--color-border)";
  /** Match dashboard fact textarea: borderless inside the card shell. */
  const quizTakingAnswerTextareaStyle: CSSProperties = {
    display: "block",
    width: "100%",
    margin: 0,
    boxSizing: "border-box",
    padding: "0.5rem 0.75rem",
    border: "none",
    outline: "none",
    fontSize: "0.875rem",
    resize: "none",
    minHeight: "4.5rem",
    background: "#fff",
    fontFamily: "inherit",
    overflow: "hidden",
  };
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
  /** Icon action buttons: stable tap targets (match dashboard fact actions). */
  const quizReviewBarIconBtnMinWidth = "2.75rem";
  const quizReviewBarIconBtnMinHeight = "2.25rem";

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
      {(quizError ||
        showFullLoader ||
        quiz == null ||
        sortedItems.length === 0) && (
        <h1
          style={{
            fontSize: "1.5rem",
            marginBottom: "0.5rem",
            marginTop: 0,
          }}
        >
          Quiz
        </h1>
      )}

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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "flex-start",
              gap: "1rem",
              width: "100%",
              marginBottom: "0.25rem",
              boxSizing: "border-box",
            }}
          >
            <h1
              style={{
                fontSize: "1.5rem",
                margin: 0,
                padding: 0,
                lineHeight: 1.2,
              }}
            >
              Quiz
            </h1>
          </div>

          {totalCount > 0 && allAnswered && scoreDisplay ? (
            <div
              style={{
                marginTop: "0.75rem",
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
            <>
              {submitQuiz.error ? (
                <p
                  style={{
                    color: "#b91c1c",
                    fontSize: "0.875rem",
                    marginBottom: "1rem",
                  }}
                >
                  {submitQuiz.error.message}
                </p>
              ) : null}
              <form
                ref={takeQuizFormRef}
                id={TAKE_QUIZ_FORM_ID}
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
                style={{ marginTop: "0.5rem" }}
              >
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {sortedItems.map((item, i) => {
                    const q = questionQueries[i];
                    const questionText = q?.data?.question;
                    const err = q?.isError;
                    const isTop = i === 0;
                    const isBottom = i === sortedItems.length - 1;
                    const isOnly = sortedItems.length === 1;
                    /** Last row: square bottom-right so it meets the Submit button cleanly. */
                    const containerRadius = isOnly
                      ? "6px 6px 0 6px"
                      : isTop
                        ? "6px 6px 0 0"
                        : isBottom
                          ? "0 0 0 6px"
                          : 0;
                    const isFocusedCard = focusedQuizItemId === item.id;
                    const takingContentInnerStyle: CSSProperties = {
                      padding: "0.5rem 0.75rem",
                      background: "#fff",
                      borderTopLeftRadius: isOnly || isTop ? "6px" : 0,
                      borderTopRightRadius: isOnly || isTop ? "6px" : 0,
                      borderBottomLeftRadius: isOnly || isBottom ? "6px" : 0,
                      borderBottomRightRadius: 0,
                    };
                    const containerStyle: CSSProperties = {
                      display: "flex",
                      flexDirection: "column",
                      border: borderValue,
                      borderRadius: containerRadius,
                      overflow: "hidden",
                      position: "relative",
                      ...(isTop ? {} : { borderTop: "none" }),
                      outline: "none",
                      ...(isFocusedCard ? { zIndex: 1 } : {}),
                      boxShadow: isFocusedCard
                        ? "0 0 0 1px var(--color-border)"
                        : "none",
                    };

                    return (
                      <li
                        key={item.id}
                        className="command-jump-hint-anchor"
                        style={{ position: "relative" }}
                      >
                        {quizJumpHints[item.id]?.length ? (
                          <CommandJumpHint keys={quizJumpHints[item.id]} />
                        ) : null}
                        <div style={containerStyle}>
                          <div style={takingContentInnerStyle}>
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
                                  fontSize: "0.875rem",
                                  color: "#000",
                                }}
                              >
                                <span style={{ color: "#6b7280" }}>Q: </span>
                                <span style={{ whiteSpace: "pre-wrap" }}>
                                  {questionText}
                                </span>
                              </p>
                            ) : (
                              <p
                                style={{
                                  margin: "0 0 0.5rem",
                                  fontSize: "0.875rem",
                                  color: "#6b7280",
                                }}
                              >
                                Loading question…
                              </p>
                            )}
                            {!err ? (
                              <textarea
                                id={`answer-${item.id}`}
                                aria-label="Your answer"
                                ref={(el) => {
                                  answerTextareaRefs.current[item.id] = el;
                                }}
                                value={answers[item.id] ?? ""}
                                onChange={(ev) =>
                                  setAnswers((prev) => ({
                                    ...prev,
                                    [item.id]: ev.target.value,
                                  }))
                                }
                                onFocus={() => setFocusedQuizItemId(item.id)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    if (!isFocusInAnyAnswerTextarea()) {
                                      setFocusedQuizItemId(null);
                                    }
                                  }, 0);
                                }}
                                onKeyDown={(e) =>
                                  handleTakingAnswerKeyDown(e, i)
                                }
                                rows={1}
                                disabled={submitQuiz.isPending}
                                placeholder="Your answer…"
                                style={{
                                  ...quizTakingAnswerTextareaStyle,
                                  borderRadius: 0,
                                }}
                              />
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div
                  style={{
                    marginTop: 0,
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      color: "#6b7280",
                    }}
                  >
                    Answered {draftAnsweredCount}/{totalCount}
                  </span>
                  <button
                    type="submit"
                    disabled={submitQuiz.isPending || detailsLoading}
                    aria-busy={submitQuiz.isPending}
                    style={takeQuizSubmitButtonStyle}
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
                      "Submit"
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {allAnswered && (
            <div style={{ marginTop: 0 }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {sortedItems.map((item, i) => {
                  const q = questionQueries[i];
                  const questionText = q?.data?.question;
                  const intendedAnswer = q?.data?.canonicalAnswer;
                  const detailsOpen = reviewDetailsOpen[item.id] ?? false;
                  const aiVerdict = quizItemAiVerdict(item);
                  const opposite: "correct" | "incorrect" =
                    aiVerdict === "correct" ? "incorrect" : "correct";
                  const acceptWord =
                    aiVerdict === "correct" ? "Correct" : "Incorrect";
                  const evalVerdictColor =
                    aiVerdict === "correct" ? "#15803d" : "#b91c1c";
                  const effective = item.result;
                  const effectiveMatchesAi = effective === aiVerdict;
                  const storedAiResult: "correct" | "incorrect" | null =
                    item.aiResult === "correct" || item.aiResult === "incorrect"
                      ? item.aiResult
                      : null;
                  const scoreOverridden =
                    storedAiResult != null &&
                    (effective === "correct" || effective === "incorrect") &&
                    storedAiResult !== effective;
                  const verdictMuted = "#9ca3af";
                  /** Drawn size vs flex slot so marks read larger without growing the action bar. */
                  const verdictMarkLayoutPx = 14;
                  const verdictMarkDrawPx = 20;
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

                  const isFocusedCard = focusedQuizItemId === item.id;
                  const containerStyle: CSSProperties = {
                    display: "flex",
                    flexDirection: "column",
                    border: borderValue,
                    borderRadius: containerRadius,
                    overflow: "hidden",
                    position: "relative",
                    ...(isTop ? {} : { borderTop: "none" }),
                    outline: "none",
                    ...(isFocusedCard ? { zIndex: 1 } : {}),
                    boxShadow: isFocusedCard
                      ? "0 0 0 1px var(--color-border)"
                      : "none",
                  };

                  return (
                    <li
                      key={item.id}
                      className="command-jump-hint-anchor"
                      style={{ position: "relative" }}
                    >
                      {quizJumpHints[item.id]?.length ? (
                        <CommandJumpHint keys={quizJumpHints[item.id]} />
                      ) : null}
                      <div
                        ref={(el) => {
                          reviewCardRefs.current[item.id] = el;
                        }}
                        tabIndex={0}
                        style={containerStyle}
                        onFocus={() => setFocusedQuizItemId(item.id)}
                        onBlur={() => {
                          setTimeout(() => {
                            if (!isFocusInAnyReviewCard()) {
                              setFocusedQuizItemId(null);
                            }
                          }, 0);
                        }}
                      >
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
                              margin: 0,
                              fontSize: "0.875rem",
                              color: "#000",
                            }}
                          >
                            <span style={{ color: "#6b7280" }}>A: </span>
                            <span style={{ whiteSpace: "pre-wrap" }}>
                              {item.userAnswer ?? "—"}
                            </span>
                          </p>
                          <div
                            id={`review-details-${item.id}`}
                            hidden={!detailsOpen}
                            style={{
                              marginTop: "0.5rem",
                            }}
                          >
                            <p
                              style={{
                                margin: "0 0 0.5rem",
                                fontSize: "0.875rem",
                                lineHeight: 1.45,
                                color: "#000",
                              }}
                            >
                              <span style={{ color: "#6b7280" }}>
                                Intended Answer:{" "}
                              </span>
                              <span style={{ whiteSpace: "pre-wrap" }}>
                                {intendedAnswer ?? "—"}
                              </span>
                            </p>
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
                                  color: evalVerdictColor,
                                }}
                              >
                                {acceptWord}.
                              </span>
                              {item.aiReasoning?.trim() ? (
                                <>
                                  {" "}
                                  <span style={{ whiteSpace: "pre-wrap" }}>
                                    {item.aiReasoning}
                                  </span>
                                </>
                              ) : (
                                <span style={{ color: "#6b7280" }}> —</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {(() => {
                          const verdictIcon =
                            effective === "correct" ? (
                              <VerdictMarkIcon
                                variant="check"
                                color="#15803d"
                                size={verdictMarkDrawPx}
                                layoutSize={verdictMarkLayoutPx}
                              />
                            ) : effective === "incorrect" ? (
                              <VerdictMarkIcon
                                variant="x"
                                color="#b91c1c"
                                size={verdictMarkDrawPx}
                                layoutSize={verdictMarkLayoutPx}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#6b7280",
                                  lineHeight: 1,
                                }}
                                aria-hidden
                              >
                                —
                              </span>
                            );
                          const verdictIcons = scoreOverridden ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                lineHeight: 0,
                              }}
                            >
                              {storedAiResult === "correct" ? (
                                <StruckVerdictIcon
                                  variant="check"
                                  color={verdictMuted}
                                  strikeColor="#71717a"
                                  size={verdictMarkDrawPx}
                                  layoutSize={verdictMarkLayoutPx}
                                />
                              ) : (
                                <StruckVerdictIcon
                                  variant="x"
                                  color={verdictMuted}
                                  strikeColor="#71717a"
                                  size={verdictMarkDrawPx}
                                  layoutSize={verdictMarkLayoutPx}
                                />
                              )}
                              {effective === "correct" ? (
                                <VerdictMarkIcon
                                  variant="check"
                                  color="#15803d"
                                  size={verdictMarkDrawPx}
                                  layoutSize={verdictMarkLayoutPx}
                                />
                              ) : (
                                <VerdictMarkIcon
                                  variant="x"
                                  color="#b91c1c"
                                  size={verdictMarkDrawPx}
                                  layoutSize={verdictMarkLayoutPx}
                                />
                              )}
                            </span>
                          ) : (
                            verdictIcon
                          );
                          const verdictAriaLabel = scoreOverridden
                            ? storedAiResult === "correct" && effective === "incorrect"
                              ? "AI verdict correct, crossed out; final mark incorrect"
                              : storedAiResult === "incorrect" && effective === "correct"
                                ? "AI verdict incorrect, crossed out; final mark correct"
                                : "AI verdict crossed out; score overridden"
                            : effective === "correct"
                              ? "Marked correct"
                              : effective === "incorrect"
                                ? "Marked incorrect"
                                : "No verdict";
                          return (
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "0.5rem",
                                borderRadius: barRadius,
                                background: "#fff",
                              }}
                            >
                              <div
                                role="img"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  flexShrink: 0,
                                  paddingLeft: "0.65rem",
                                  lineHeight: 0,
                                }}
                                aria-label={verdictAriaLabel}
                              >
                                {verdictIcons}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  marginLeft: "auto",
                                }}
                              >
                                <button
                                  type="button"
                                  disabled={overrideItemResult.isPending}
                                  aria-label={
                                    effectiveMatchesAi
                                      ? "Reject score (⌘⌫)"
                                      : "Accept score (⌘⌫)"
                                  }
                                  title={
                                    effectiveMatchesAi
                                      ? "Reject score (⌘⌫)"
                                      : "Accept score (⌘⌫)"
                                  }
                                  onClick={() =>
                                    overrideItemResult.mutate({
                                      quizItemId: item.id,
                                      result: effectiveMatchesAi
                                        ? opposite
                                        : aiVerdict,
                                    })
                                  }
                                  style={{
                                    ...quizReviewActionBtnBase,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: quizReviewBarIconBtnMinWidth,
                                    minHeight: quizReviewBarIconBtnMinHeight,
                                    borderRight: "none",
                                    borderBottom: "none",
                                    borderRadius: "6px 0 0 0",
                                    fontWeight: 600,
                                    background: "#fff",
                                    color: "#000",
                                    cursor: overrideItemResult.isPending
                                      ? "not-allowed"
                                      : "pointer",
                                  }}
                                >
                                  {commandMode && isFocusedCard ? (
                                    "⌫"
                                  ) : effectiveMatchesAi ? (
                                    <ThumbsDown size={18} aria-hidden />
                                  ) : (
                                    <ThumbsUp size={18} aria-hidden />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  aria-expanded={detailsOpen}
                                  aria-controls={`review-details-${item.id}`}
                                  aria-label={
                                    detailsOpen
                                      ? "Hide evaluation (⌘↵)"
                                      : "Show evaluation (⌘↵)"
                                  }
                                  title={
                                    detailsOpen
                                      ? "Hide evaluation (⌘↵)"
                                      : "Show evaluation (⌘↵)"
                                  }
                                  onClick={() =>
                                    setReviewDetailsOpen((prev) => ({
                                      ...prev,
                                      [item.id]: !detailsOpen,
                                    }))
                                  }
                                  style={{
                                    ...quizReviewActionBtnBase,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: quizReviewBarIconBtnMinWidth,
                                    minHeight: quizReviewBarIconBtnMinHeight,
                                    borderRight: "none",
                                    borderBottom: "none",
                                    borderRadius: overturnBtnRadius,
                                    fontWeight: 600,
                                    background: "#fff",
                                    color: "#000",
                                    cursor: "pointer",
                                  }}
                                >
                                  {commandMode && isFocusedCard ? (
                                    "↵"
                                  ) : detailsOpen ? (
                                    <EyeOff size={18} aria-hidden />
                                  ) : (
                                    <Eye size={18} aria-hidden />
                                  )}
                                </button>
                              </div>
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
