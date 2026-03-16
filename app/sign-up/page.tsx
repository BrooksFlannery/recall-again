"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { GoogleLogo } from "../components/google-logo";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleGoogleSignUp() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const { data, error: err } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: "/dashboard",
    });
    setIsLoading(false);
    if (err) {
      setError(err.message ?? "Sign up failed");
      return;
    }
    if (data) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <main className="auth-page">
      <h1>Sign up</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
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
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={isLoading} className="auth-button">
          {isLoading ? "Signing up…" : "Sign up"}
        </button>
      </form>
      <p className="auth-divider">
        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="auth-button"
        >
          <GoogleLogo />
          Google
        </button>
      </p>
      <p className="auth-footer">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
