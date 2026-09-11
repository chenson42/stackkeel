import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Directive item 31 / Phase 3 Component Plan "Font loading": next/font/google
// wiring for Inter + Poppins, mirroring apps/portal/src/app/layout.tsx
// verbatim (variable names, weights, subsets, display strategy) — required
// from this app's first commit, not an incremental follow-up. Without this,
// packages/ui/src/theme.css's --font-sans/--font-heading tokens resolve to
// nothing and every page silently falls back to system fonts.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ADMIN",
  description:
    "User and role administration for every app on the platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        {/*
         * pattern: server-action -> client toast, matching Portal's own
         * convention (src/app/layout.tsx). Server actions return
         * ActionResult<T>; client components read the result and call
         * toast.success()/toast.error() here. Never call toast() inside a
         * 'use server' function.
         */}
        <Toaster theme="light" richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
