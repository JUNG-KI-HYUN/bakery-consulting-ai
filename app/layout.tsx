import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./bakery-report-print.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "프레임원 베이커리 창업진단 AI",
  description: "AI 기반 베이커리 창업 점포진단 및 오픈 마케팅 지원 솔루션",
};

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/consultations", label: "상담 목록" },
  { href: "/consultations/new", label: "상담 등록" },
  { href: "/markets", label: "상권분석" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-slate-800 bg-[#0B1220] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <h1 className="text-sm font-bold tracking-tight">
                프레임원 베이커리 창업진단 AI
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                AI Copilot · Premium Consulting · Contract Before Check
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
