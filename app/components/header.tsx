"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function Header() {
  const router = useRouter();
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
        ) : session?.user ? (
          <>
            <Link
              href="/dashboard"
              style={{
                fontSize: "0.875rem",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Dashboard
            </Link>
            <span style={{ fontSize: "0.875rem" }}>
              {session.user.name ?? session.user.email}
            </span>
            <button
              type="button"
              onClick={() =>
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/") },
                })
              }
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
            >
              Sign out
            </button>
          </>
        ) : (
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
