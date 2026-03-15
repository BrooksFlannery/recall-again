"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const {
    data: pingData,
    isLoading: pingLoading,
    error: pingError,
  } = trpc.ping.getLatest.useQuery();

  if (sessionPending) {
    return (
      <main style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (session?.user) {
    return (
      <main style={{ padding: "2rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
        <h1>Home</h1>
        <p>Welcome back, {session.user.name ?? session.user.email}.</p>
        {pingLoading && <p>Loading…</p>}
        {pingError && <p>Error: {pingError.message}</p>}
        {pingData && (
          <pre
            style={{ background: "#f5f5f5", padding: "1rem", overflow: "auto" }}
          >
            {JSON.stringify(pingData, null, 2)}
          </pre>
        )}
      </main>
    );
  }

  return (
    <main
      style={{
        padding: "3rem 1.5rem",
        textAlign: "center",
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Recall</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
        Sign in or create an account to get started.
      </p>
    </main>
  );
}
