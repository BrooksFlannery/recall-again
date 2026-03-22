"use client";

import { useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MIN_FACTS_FOR_QUIZ } from "@/constants/quiz";
import { isIncompleteScheduledQuiz } from "@/lib/quiz-completion";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";

function formatWhen(d: Date | string) {
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function QuizzesPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const utils = trpc.useUtils();

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

  return (
    <main style={{ padding: "2rem 1.5rem" }}>
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
              borderRadius: "6px",
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
            const radius = only
              ? "6px"
              : isFirst
                ? "6px 6px 0 0"
                : isLast
                  ? "0 0 6px 6px"
                  : 0;

            return (
              <li key={q.id} style={{ position: "relative" }}>
                <Link
                  href={`/quiz/${q.id}`}
                  style={{
                    ...cardLinkStyle,
                    borderRadius: radius,
                    ...(isFirst ? {} : { borderTop: "none" }),
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
