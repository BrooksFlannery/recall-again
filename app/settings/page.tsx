"use client";

import { useEffect, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const user = session?.user;

  useEffect(() => {
    if (!sessionPending && !user) {
      router.replace("/");
    }
  }, [sessionPending, user, router]);

  if (sessionPending || !user) {
    return (
      <main style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Loading…</p>
      </main>
    );
  }

  const cardStyle: CSSProperties = {
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    padding: "1rem",
    background: "#fff",
    boxSizing: "border-box",
    width: "100%",
  };

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
          marginBottom: 0,
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
          Settings
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxWidth: "var(--main-max-width)",
        }}
      >
        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {user.name ?? "Account"}
            </span>
            {user.email ? (
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#4b5563",
                  wordBreak: "break-word",
                }}
              >
                {user.email}
              </span>
            ) : null}
          </div>
        </section>
        <button
          type="button"
          className="app-sidebar-signout"
          onClick={() =>
            authClient.signOut({
              fetchOptions: { onSuccess: () => router.push("/") },
            })
          }
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
