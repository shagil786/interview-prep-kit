import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import { ThemeProvider } from "@/components/theme-provider";
import { Figtree } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "PrepKit — AI interview prep",
  description: "Turn a job description into a personalised interview preparation kit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", figtree.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <div className="flex min-h-screen flex-col">
            <TopBar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
            <footer className="border-t py-6 text-center text-xs text-muted-foreground">
              PrepKit — a full-stack engineering assessment project
            </footer>
          </div>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
