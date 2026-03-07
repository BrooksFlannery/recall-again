import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js Effect tRPC Drizzle Boilerplate",
  description: "Production-ready Next.js with Effect, tRPC, Drizzle, Better Auth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
