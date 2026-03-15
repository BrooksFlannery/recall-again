import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "./components/header";

export const metadata: Metadata = {
  title: "Recall",
  description:
    "Production-ready Next.js with Effect, tRPC, Drizzle, Better Auth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
