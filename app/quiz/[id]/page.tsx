"use client";

import { useEffect, useMemo } from "react";
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

  if (!id) {
    return (
      <main style={{ padding: "2rem 1.5rem" }}>
        <p>Invalid quiz link.</p>
        <p>
          <Link href="/dashboard">Back to dashboard</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: "42rem" }}>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard" style={{ color: "#2563eb" }}>
          ← Dashboard
        </Link>
      </p>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Quiz</h1>

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
        <p>Quiz not found or you don’t have access.</p>
      ) : sortedItems.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          No facts in this quiz yet. Add some facts on the dashboard, then try
          again.
        </p>
      ) : (
        <ol
          style={{
            margin: 0,
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
                <p
                  style={{
                    fontWeight: 600,
                    margin: "0 0 0.35rem",
                    fontSize: "0.9375rem",
                  }}
                >
                  Question {i + 1}
                </p>
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
                      margin: 0,
                      fontSize: "0.9375rem",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {questionText}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
