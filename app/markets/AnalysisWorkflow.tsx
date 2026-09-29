"use client";

import Link from "next/link";
import { AnalysisHeaderBridge } from "@/components/app-shell/AppShell";
import {
  activeAnalysisTargetHref,
  type ActiveAnalysisTarget,
} from "@/lib/market-data/competition-location";
import type { AnalysisResultStatus } from "@/lib/market-data/basic-location/run";

export type WorkflowStep = "target" | "location" | "competition" | "rental" | "economic" | "candidate" | "evidence";

const steps: Array<{ id: WorkflowStep; label: string; pathname: string }> = [
  { id: "target", label: "1. 분석대상", pathname: "/markets?view=target" },
  { id: "location", label: "2. 입지·상권", pathname: "/markets?view=location" },
  { id: "competition", label: "3. 경쟁환경", pathname: "/markets/competition-structure" },
  { id: "rental", label: "4. 임대시장", pathname: "/markets/rental-research" },
  { id: "economic", label: "5. 사업성·손익", pathname: "/markets/economic-feasibility" },
  { id: "candidate", label: "6. 후보점포 진단", pathname: "/consultations/new" },
  { id: "evidence", label: "7. 데이터·근거", pathname: "/markets?view=evidence" },
];

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
  statuses = {},
}: {
  active: WorkflowStep;
  target: ActiveAnalysisTarget | null;
  statuses?: Partial<Record<WorkflowStep, WorkflowStatus>>;
}) {
  return (
    <nav aria-label="상권분석 업무 흐름" className="panel-card flex gap-2 overflow-x-auto p-2">
      {steps.map((step) => (
        <Link
          key={step.id}
          href={activeAnalysisTargetHref(step.pathname, target)}
          aria-current={active === step.id ? "step" : undefined}
          className={`min-h-11 shrink-0 rounded-lg px-3 py-3 text-xs font-bold ${active === step.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <span>{step.label}</span>
          {statuses[step.id] ? (
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${statuses[step.id] === "STALE" || statuses[step.id] === "NEEDS_CONFIRMATION" ? "bg-amber-100 text-amber-800" : statuses[step.id] === "CURRENT" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
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
