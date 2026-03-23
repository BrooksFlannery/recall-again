"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MIN_FACTS_FOR_QUIZ } from "@/constants/quiz";
import { isIncompleteScheduledQuiz } from "@/lib/quiz-completion";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { useCommandMode } from "../components/command-mode-context";
import { CommandJumpHint } from "../components/command-jump-hint";

function formatWhen(d: Date | string) {
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function QuizzesPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const commandMode = useCommandMode();
  const utils = trpc.useUtils();
  const [focusedQuizId, setFocusedQuizId] = useState<string | null>(null);
  const quizLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const { data: facts } = trpc.fact.list.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const createManualQuizMutation = trpc.quiz.createManual.useMutation({
    onSuccess: (quiz) => {
      utils.quiz.list.invalidate();
      utils.quiz.incompleteScheduledCount.invalidate();
      router.push(`/quiz/${quiz.id}`);
    },
  });

  const canStartQuiz = (facts?.length ?? 0) >= MIN_FACTS_FOR_QUIZ;

  const {
    data: quizzes,
    isLoading,
    isError,
    error,
  } = trpc.quiz.list.useQuery(undefined, { enabled: !!session?.user });

  const quizzesJumpHints = useMemo(() => {
    if (!commandMode || !quizzes?.length) {
      return {} as Record<string, ("J" | "K")[]>;
    }
    const ids = quizzes.map((q) => q.id);
    const hints: Record<string, ("J" | "K")[]> = {};
    const push = (id: string, k: "J" | "K") => {
      const arr = hints[id] ?? (hints[id] = []);
      if (!arr.includes(k)) arr.push(k);
    };

    const idx = focusedQuizId ? ids.indexOf(focusedQuizId) : -1;

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
  }, [commandMode, quizzes, focusedQuizId]);

  function isFocusInAnyQuizLink(): boolean {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return false;
    for (const a of Object.values(quizLinkRefs.current)) {
      if (a && (a === el || a.contains(el))) return true;
    }
    return false;
  }

  useEffect(() => {
    if (!quizzes?.length || isLoading || isError) return;

    function onKeyDown(e: KeyboardEvent) {
      const list = quizzes;
      if (!list?.length) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const down = e.key === "j" || e.key === "J";
      const up = e.key === "k" || e.key === "K";
      if (!down && !up) return;
      e.preventDefault();

      const ids = list.map((q) => q.id);
      let idx = focusedQuizId ? ids.indexOf(focusedQuizId) : -1;
      if (down) {
        if (idx < 0) idx = 0;
        else idx = Math.min(idx + 1, ids.length - 1);
      } else {
        if (idx < 0) idx = ids.length - 1;
        else idx = Math.max(idx - 1, 0);
      }

      const nextId = ids[idx];
      if (nextId == null) return;

      quizLinkRefs.current[nextId]?.focus();
      setFocusedQuizId(nextId);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [quizzes, focusedQuizId, isLoading, isError]);

  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.replace("/");
    }
  }, [session, sessionPending, router]);

  if (sessionPending || !session?.user) {
    return (
      <main style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Loading…</p>
      </main>
    );
  }

  const cardLinkStyle: CSSProperties = {
    display: "block",
    padding: "0.75rem 0.85rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "#fff",
    textDecoration: "none",
    color: "inherit",
    boxSizing: "border-box",
  };

  const hasQuizList =
    !isError && !isLoading && !!quizzes?.length;

  return (
    <main style={{ padding: "2rem 1.5rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          gap: "1rem",
          width: "100%",
          minHeight: "var(--page-header-row-min-height)",
          marginBottom: hasQuizList && canStartQuiz ? 0 : "0.25rem",
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
          Past quizzes
        </h1>
        {canStartQuiz ? (
          <button
            type="button"
            onClick={() => createManualQuizMutation.mutate({ factCount: 10 })}
            disabled={createManualQuizMutation.isPending}
            aria-busy={createManualQuizMutation.isPending}
            aria-label="Start a manual quiz with random facts"
            title="Start a manual quiz with up to 10 random facts"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "8px 14px",
              marginLeft: "auto",
              background: "var(--color-interactive-bg)",
              color: "#000",
              border: "1px solid var(--color-border)",
              borderBottom: hasQuizList ? "none" : "1px solid var(--color-border)",
              borderRadius: hasQuizList ? "6px 6px 0 0" : "6px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: createManualQuizMutation.isPending ? "wait" : "pointer",
              opacity: createManualQuizMutation.isPending ? 0.85 : 1,
            }}
          >
            {createManualQuizMutation.isPending ? (
              <span
                className="add-btn-spinner add-btn-spinner-on-light"
                aria-hidden
              />
            ) : null}
            Quiz me
          </button>
        ) : null}
      </div>

      <section style={{ marginBottom: "2rem" }}>
        {isError ? (
          <p style={{ color: "#b91c1c" }}>{error.message}</p>
        ) : isLoading ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
        ) : !quizzes?.length ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            No quizzes yet.
            {canStartQuiz
              ? " Use Quiz me above when you’re ready."
              : ` Add at least ${MIN_FACTS_FOR_QUIZ} facts on the dashboard first.`}
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {quizzes.map((q, index) => {
            const done = q.itemCount > 0 && q.answeredCount === q.itemCount;
            const scoreLabel =
              done && q.itemCount > 0
                ? `${q.correctCount} / ${q.itemCount} correct`
                : q.answeredCount > 0
                  ? `${q.answeredCount} / ${q.itemCount} answered`
                  : "Not submitted";
            const whenScheduled = q.scheduledFor
              ? new Date(q.scheduledFor)
              : null;
            const modeLabel =
              q.mode === "scheduled" && whenScheduled
                ? `Scheduled · ${whenScheduled.toLocaleDateString()}`
                : q.mode === "scheduled"
                  ? "Scheduled"
                  : "Manual";

            const isFirst = index === 0;
            const isLast = index === quizzes.length - 1;
            const only = quizzes.length === 1;
            const tabbedHeader = hasQuizList && canStartQuiz;
            const radius = only
              ? tabbedHeader
                ? "6px 0 6px 6px"
                : "6px"
              : isFirst
                ? tabbedHeader
                  ? "6px 0 0 0"
                  : "6px 6px 0 0"
                : isLast
                  ? "0 0 6px 6px"
                  : 0;

            const isFocused = focusedQuizId === q.id;

            return (
              <li key={q.id} className="command-jump-hint-anchor">
                {quizzesJumpHints[q.id]?.length ? (
                  <CommandJumpHint keys={quizzesJumpHints[q.id]} />
                ) : null}
                <Link
                  ref={(el) => {
                    quizLinkRefs.current[q.id] = el;
                  }}
                  href={`/quiz/${q.id}`}
                  onFocus={() => setFocusedQuizId(q.id)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!isFocusInAnyQuizLink()) {
                        setFocusedQuizId(null);
                      }
                    }, 0);
                  }}
                  style={{
                    ...cardLinkStyle,
                    borderRadius: radius,
                    ...(isFirst ? {} : { borderTop: "none" }),
                    position: "relative",
                    zIndex: isFocused ? 1 : undefined,
                    boxShadow: isFocused
                      ? "0 0 0 1px var(--color-border)"
                      : "none",
                  }}
                  className="quiz-list-link"
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                      {formatWhen(q.createdAt)}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      {isIncompleteScheduledQuiz(q) ? (
                        <span className="quiz-list-incomplete-badge">
                          Incomplete
                        </span>
                      ) : null}
                      <span
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "#000",
                        }}
                      >
                        {scoreLabel}
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "#6b7280",
                      marginTop: "0.35rem",
                    }}
                  >
                    {modeLabel}
                  </div>
                </Link>
              </li>
            );
          })}
          </ul>
        )}
      </section>
    </main>
  );
}
