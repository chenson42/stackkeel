import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

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
  title: "PORTAL",
  description:
    "The member-facing portal — home, announcements, feedback, and account settings.",
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
         * pattern: server-action → client toast
         * Server actions return { ok, error? }. Client components read the result
         * and call toast.success() / toast.error() here in the Toaster singleton.
         * Never call toast() inside a 'use server' function — it is browser-only.
         * Do not add 'use client' to this file; <Toaster> is a client leaf in a
         * server tree, which Next.js App Router supports without any special handling.
         */}
        <Toaster theme="light" richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
