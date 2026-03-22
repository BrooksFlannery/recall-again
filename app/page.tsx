"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
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

  const ctaLinkStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "7rem",
    padding: "8px 14px",
    background: "var(--color-interactive-bg)",
    color: "#000",
    border: "1px solid var(--color-border)",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: 600,
    textDecoration: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      role="main"
      style={{
        padding: "3rem 1.5rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>Recall</h1>
      <p style={{ color: "#6b7280", margin: "0 0 1.25rem" }}>
        Sign in or create an account to get started.
      </p>
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/sign-in" style={ctaLinkStyle}>
          Sign in
        </Link>
        <Link href="/sign-up" style={ctaLinkStyle}>
          Sign up
        </Link>
      </div>
    </div>
  );
}
