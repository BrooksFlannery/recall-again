"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { GoogleLogo } from "../components/google-logo";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleGoogleSignIn() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const { data, error: err } = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });
    setIsLoading(false);
    if (err) {
      setError(err.message ?? "Sign in failed");
      return;
    }
    if (data) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <main className="auth-page">
      <h1>Sign in</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={isLoading} className="auth-button">
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-divider">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="auth-button"
        >
          <GoogleLogo />
          Sign in with Google
        </button>
      </p>
      <p className="auth-footer">
        Don&apos;t have an account? <Link href="/sign-up">Sign up</Link>
      </p>
    </main>
  );
}
