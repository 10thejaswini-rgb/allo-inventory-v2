// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo | Inventory & Fulfillment",
  description: "Multi-warehouse inventory reservation system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] bg-white sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[var(--accent)] rounded-md flex items-center justify-center">
                <span className="text-white text-xs font-bold font-mono">A</span>
              </div>
              <span className="font-semibold text-[var(--text-primary)] tracking-tight">
                Thejaswini
              </span>
            </a>
            <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
              built for allo
            </span>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
