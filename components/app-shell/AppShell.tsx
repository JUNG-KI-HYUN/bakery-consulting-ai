"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AnalysisResultStatus } from "@/lib/market-data/basic-location/run";
import {
  activeAnalysisTargetHref,
  parseActiveAnalysisTarget,
  type ActiveAnalysisTarget,
} from "@/lib/market-data/competition-location";

type AppNavId = "home" | "analysis" | "candidates" | "reports";

const primaryNavigation: Array<{ id: AppNavId; href: string; label: string }> = [
  { id: "home", href: "/", label: "홈" },
  { id: "analysis", href: "/markets", label: "분석" },
  { id: "candidates", href: "/consultations", label: "후보점포" },
  { id: "reports", href: "/reports/sample-001", label: "리포트" },
];

type AnalysisHeaderContextValue = {
  target: ActiveAnalysisTarget | null;
  status: AnalysisResultStatus;
  officialReferencePeriod?: string | null;
};

const AnalysisHeaderContext = createContext<
  ((value: AnalysisHeaderContextValue | null) => void) | null
>(null);

const statusPresentation: Record<
  AnalysisResultStatus,
  { label: string; className: string }
> = {
  CURRENT: {
    label: "최신 분석",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  STALE: {
    label: "다시 분석 필요",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  NOT_RUN: {
    label: "아직 분석하지 않음",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

function currentWorkspace(pathname: string) {
  if (pathname.startsWith("/markets/competition-structure")) return "경쟁환경";
  if (pathname.startsWith("/markets/rental-research")) return "임대시장";
  if (pathname.startsWith("/markets/economic-feasibility")) return "사업성·손익";
  if (pathname.startsWith("/markets")) return "상권·입지 분석";
  if (pathname.startsWith("/consultations/new")) return "후보점포 진단";
  if (pathname.startsWith("/consultations")) return "후보점포";
  if (pathname.startsWith("/reports")) return "리포트";
  return "홈";
}

function activeNavigation(pathname: string): AppNavId {
  if (pathname.startsWith("/markets")) return "analysis";
  if (pathname.startsWith("/consultations")) return "candidates";
  if (pathname.startsWith("/reports")) return "reports";
  return "home";
}

function NavIcon({ id }: { id: AppNavId }) {
  const paths: Record<AppNavId, ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5Z" />,
    analysis: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M11 7v8M7 11h8" /></>,
    candidates: <><path d="M4 21V8l8-5 8 5v13" /><path d="M8 21v-6h8v6M8 10h.01M12 10h.01M16 10h.01" /></>,
    reports: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M9 10h6M9 14h6M9 18h4" /></>,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[id]}
    </svg>
  );
}

function NavigationLinks({ active, mobile = false }: { active: AppNavId; mobile?: boolean }) {
  return (
    <nav aria-label="FRAMEONE 주요 메뉴" className={mobile ? "grid gap-1" : "grid gap-1.5"}>
      {primaryNavigation.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={(event) => {
            if (mobile) event.currentTarget.closest("details")?.removeAttribute("open");
          }}
          aria-current={active === item.id ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
            active === item.id
              ? "bg-[#1d1d1b] text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
          } ${mobile ? "w-full" : "md:justify-center xl:justify-start"}`}
        >
          <NavIcon id={item.id} />
          <span className={mobile ? "" : "md:hidden xl:inline"}>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AnalysisHeaderBridge({
  target,
  status,
  officialReferencePeriod = null,
}: AnalysisHeaderContextValue) {
  const setHeader = useContext(AnalysisHeaderContext);

  useEffect(() => {
    if (!setHeader) return;
    setHeader({ target, status, officialReferencePeriod });
    return () => setHeader(null);
  }, [officialReferencePeriod, setHeader, status, target]);

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [registeredHeader, setRegisteredHeader] = useState<AnalysisHeaderContextValue | null>(null);
  const [urlTarget, setUrlTarget] = useState<ActiveAnalysisTarget | null>(null);
  const setAnalysisHeader = useCallback((value: AnalysisHeaderContextValue | null) => {
    setRegisteredHeader(value);
  }, []);

  useEffect(() => {
    const readTarget = () => {
      const query = Object.fromEntries(new URLSearchParams(window.location.search));
      setUrlTarget(parseActiveAnalysisTarget(query));
    };
    readTarget();
    window.addEventListener("popstate", readTarget);
    return () => window.removeEventListener("popstate", readTarget);
  }, [pathname]);

  const active = activeNavigation(pathname);
  const workspace = currentWorkspace(pathname);
  const header = registeredHeader ?? (urlTarget
    ? { target: urlTarget, status: "NOT_RUN" as const, officialReferencePeriod: null }
    : null);
  const targetLabel = header?.target?.label ?? header?.target?.address ?? "지도에서 선택한 위치";
  const targetAddress = header?.target?.address;
  const status = header ? statusPresentation[header.status] : null;
  const contextDescription = (() => {
    if (!header?.target) return null;
    const parts = [`반경 ${header.target.radiusM}m`];
    if (header.target.officialReference) {
      parts.push(
        `${header.target.officialReference.marketName}${header.officialReferencePeriod ? ` · ${header.officialReferencePeriod}` : ""}`,
      );
    }
    return parts.join(" · ");
  })();

  return (
    <AnalysisHeaderContext.Provider value={setAnalysisHeader}>
      <div className="min-h-dvh bg-[#f5f4f0] md:grid md:grid-cols-[4.75rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="app-shell-sidebar no-print hidden border-r border-stone-200 bg-[#fbfaf7] md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:px-2 md:py-4 xl:px-4" aria-label="FRAMEONE App Navigation">
          <Link href="/" className="flex min-h-12 items-center gap-3 px-2 text-stone-950 md:justify-center xl:justify-start" aria-label="FRAMEONE 홈">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#a58547] bg-[#1d1d1b] text-xs font-bold tracking-[0.08em] text-[#d6bd83]">FO</span>
            <span className="hidden text-sm font-bold tracking-[0.12em] xl:inline">FRAMEONE</span>
          </Link>
          <div className="mt-8">
            <NavigationLinks active={active} />
          </div>
          <div className="mt-auto hidden border-t border-stone-200 pt-4 xl:block">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">더보기</p>
            <Link href="/consultations/new" className="mt-2 block rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-950">새 후보점포 진단</Link>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="no-print sticky top-0 z-40 border-b border-stone-200 bg-[#fbfaf7]/95 backdrop-blur" aria-label="현재 Workspace">
            <div className="flex min-h-16 items-center gap-3 px-4 sm:px-5 lg:px-7">
              <details className="group relative md:hidden">
                <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 [&::-webkit-details-marker]:hidden" aria-label="메뉴 열기">
                  <span className="grid gap-1"><span className="block h-px w-4 bg-current" /><span className="block h-px w-4 bg-current" /><span className="block h-px w-4 bg-current" /></span>
                </summary>
                <div className="absolute left-0 top-12 w-64 rounded-xl border border-stone-200 bg-white p-3 shadow-xl">
                  <p className="mb-3 px-3 text-xs font-bold tracking-[0.12em] text-stone-950">FRAMEONE</p>
                  <NavigationLinks active={active} mobile />
                  <Link href="/consultations/new" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="mt-3 block border-t border-stone-200 px-3 pt-3 text-xs font-semibold text-stone-600">새 후보점포 진단</Link>
                </div>
              </details>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="shrink-0 text-sm font-bold text-stone-950 sm:text-base">{workspace}</h1>
                  {header?.target ? (
                    <span className="hidden h-4 w-px bg-stone-300 sm:block" aria-hidden="true" />
                  ) : null}
                  {header?.target ? (
                    <p className="min-w-0 truncate text-xs font-semibold text-stone-700 sm:text-sm" title={targetAddress ?? targetLabel}>{targetLabel}</p>
                  ) : null}
                </div>
                {contextDescription ? <p className="mt-0.5 truncate text-[11px] text-stone-500 sm:text-xs">{contextDescription}</p> : <p className="mt-0.5 text-[11px] text-stone-500 sm:text-xs">베이커리 점포개발 업무공간</p>}
              </div>

              {status ? (
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:text-xs ${status.className}`}>{status.label}</span>
              ) : null}
              {header?.target ? (
                <Link href={activeAnalysisTargetHref("/markets?view=target", header.target)} className="hidden shrink-0 text-xs font-semibold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-stone-950 lg:block">분석대상 변경</Link>
              ) : null}
            </div>
          </header>

          <main className="app-workspace min-w-0 px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-6">{children}</main>
        </div>
      </div>
    </AnalysisHeaderContext.Provider>
  );
}
