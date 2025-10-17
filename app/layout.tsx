import type { Metadata } from "next";
import "./globals.css";

import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";

export const metadata: Metadata = {
  title: "Taskwatch",
  description: "習慣タスクと学習を可視化し、友人と励まし合うためのダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        <SiteHeader />
        <main className="min-h-[calc(100vh-160px)]">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
