import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "PrepKit — AI interview prep",
  description: "Turn a job description into a personalised interview preparation kit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <TopBar />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
