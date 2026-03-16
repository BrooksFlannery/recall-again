"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  useEffect(() => {
    if (!sessionPending && session?.user) {
      router.replace("/dashboard");
    }
  }, [session, sessionPending, router]);

  if (sessionPending) {
    return (
      <div role="main" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (session?.user) {
    return (
      <div role="main" style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p>Redirecting…</p>
      </div>
    );
  }

  return (
    <div
      role="main"
      style={{
        padding: "3rem 1.5rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Recall</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
        Sign in or create an account to get started.
      </p>
    </div>
  );
}
