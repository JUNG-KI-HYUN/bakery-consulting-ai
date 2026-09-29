import Link from "next/link";
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
  NOT_RUN: "미실행",
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

function formatTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "확인 필요";
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
    <section className="panel-card p-4 md:p-5" aria-label="현재 분석대상">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
      <p className="text-xs font-bold text-blue-700">현재 분석대상</p>
      {target ? (
        <>
          <h2 className="mt-1 text-lg font-bold text-slate-950">{target.label ?? target.address ?? "지도에서 선택한 위치"}</h2>
          {target.address && target.address !== target.label ? <p className="mt-1 text-sm text-slate-600">{target.address}</p> : null}
          <p className="mt-1 text-xs font-semibold text-slate-600">분석 반경 {target.radiusM}m</p>
          {target.explorationSnapshot.marketName ? <p className="mt-2 text-xs text-slate-500">FRAMEONE 탐색분류 · {target.explorationSnapshot.marketName}{target.explorationSnapshot.submarketName ? ` > ${target.explorationSnapshot.submarketName}` : ""}</p> : null}
          <p className="mt-1 text-xs text-slate-500">서울시 공식통계 참고상권 · {target.officialReference ? `${target.officialReference.marketName} · ${target.officialReference.spatialRelation === "INSIDE" ? "분석지점 포함" : "분석반경 교차"}${officialReferencePeriod ? ` · ${officialReferencePeriod}` : ""}` : "선택되지 않음"}</p>
          <p className="mt-1 text-xs text-slate-500">기준시각 · {formatTimestamp(target.updatedAt || target.createdAt)}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-amber-800">현재 상세분석 대상이 없습니다. 상권분석에서 주소 또는 지도 위치를 선택해 주세요.</p>
      )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === "CURRENT" ? "bg-emerald-100 text-emerald-800" : status === "STALE" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
          {status === "CURRENT" ? "현재 분석결과" : status === "STALE" ? "다시 분석 필요" : "미실행"}
        </span>
        <Link href={activeAnalysisTargetHref("/markets?view=target", target)} className="btn-outline">분석대상 변경</Link>
      </div>
      </div>
    </section>
  );
}

export const ActiveAnalysisTargetCard = AnalysisTargetHeader;
