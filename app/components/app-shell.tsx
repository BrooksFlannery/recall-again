"use client";

import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <>{children}</>;
  }

  if (session?.user) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="app-main-content" role="main">
          {children}
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
