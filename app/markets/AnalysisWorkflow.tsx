"use client";

import Link from "next/link";
import { AnalysisHeaderBridge } from "@/components/app-shell/AppShell";
import {
  activeAnalysisTargetHref,
  type ActiveAnalysisTarget,
} from "@/lib/market-data/competition-location";
import type { AnalysisResultStatus } from "@/lib/market-data/basic-location/run";
import {
  caseAwareMarketWorkflowPath,
  MARKET_WORKFLOW_STEPS,
  type MarketWorkflowStep,
} from "@/lib/navigation/case-aware-market-navigation";

export type WorkflowStep = MarketWorkflowStep;

type WorkflowStatus = AnalysisResultStatus | "NEEDS_CONFIRMATION";

const statusLabels: Record<WorkflowStatus, string> = {
  CURRENT: "완료",
  STALE: "다시 분석 필요",
  NOT_RUN: "아직 분석하지 않음",
  NEEDS_CONFIRMATION: "확인 필요",
};

export function AnalysisWorkflow({
  active,
  target,
  caseId = null,
  statuses = {},
  orientation = "horizontal",
}: {
  active: WorkflowStep;
  target: ActiveAnalysisTarget | null;
  caseId?: string | null;
  statuses?: Partial<Record<WorkflowStep, WorkflowStatus>>;
  orientation?: "horizontal" | "sidebar";
}) {
  return (
    <nav
      aria-label="상권분석 업무 흐름"
      className={orientation === "sidebar"
        ? "overflow-hidden rounded-xl border border-stone-200 bg-[#fbfaf7] p-2"
        : "flex gap-2 overflow-x-auto rounded-xl border border-stone-200 bg-[#fbfaf7] p-2"}
    >
      {orientation === "sidebar" ? (
        <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
          Analysis workflow
        </p>
      ) : null}
      {MARKET_WORKFLOW_STEPS.map((step) => (
        <Link
          key={step.id}
          href={activeAnalysisTargetHref(caseAwareMarketWorkflowPath(step, caseId), target)}
          aria-current={active === step.id ? "step" : undefined}
          className={`${orientation === "sidebar" ? "mb-1 flex w-full flex-col items-start gap-1" : "shrink-0"} min-h-11 rounded-lg px-3 py-3 text-xs font-bold ${active === step.id ? "bg-stone-950 text-white" : "text-stone-600 hover:bg-stone-100"}`}
        >
          <span className="whitespace-nowrap">{step.label}</span>
          {statuses[step.id] ? (
            <span className={`${orientation === "sidebar" ? "max-w-full truncate" : "ml-2"} rounded-full px-2 py-0.5 text-[10px] ${statuses[step.id] === "STALE" || statuses[step.id] === "NEEDS_CONFIRMATION" ? "bg-amber-100 text-amber-800" : statuses[step.id] === "CURRENT" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
              {statusLabels[statuses[step.id]!]}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function AnalysisTargetHeader({
  target,
  status = "NOT_RUN",
  officialReferencePeriod = null,
}: {
  target: ActiveAnalysisTarget | null;
  status?: AnalysisResultStatus;
  officialReferencePeriod?: string | null;
}) {
  return (
    <>
      <AnalysisHeaderBridge target={target} status={status} officialReferencePeriod={officialReferencePeriod} />
      <span className="sr-only">
        현재 분석대상
        {target?.explorationSnapshot.marketName ? ` · FRAMEONE 탐색분류 ${target.explorationSnapshot.marketName}` : ""}
        {target?.officialReference ? ` · 서울시 공식통계 참고상권 ${target.officialReference.marketName}` : ""}
      </span>
    </>
  );
}

export const ActiveAnalysisTargetCard = AnalysisTargetHeader;
