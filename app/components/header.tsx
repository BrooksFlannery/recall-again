"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function Header() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <Link
        href="/"
        style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}
      >
        Recall
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {isPending ? (
          <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>…</span>
        ) : session?.user ? null : (
          <>
            <Link
              href="/sign-in"
              style={{ fontSize: "0.875rem", textDecoration: "none" }}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              style={{ fontSize: "0.875rem", textDecoration: "none" }}
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
