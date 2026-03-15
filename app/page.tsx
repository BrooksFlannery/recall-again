"use client";

import { trpc } from "@/trpc/client";

export default function Home() {
  const { data, isLoading, error } = trpc.ping.getLatest.useQuery();

  return (
    <main>
      <h1>Next.js Effect tRPC Drizzle Boilerplate</h1>
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      )}
    </main>
  );
}
