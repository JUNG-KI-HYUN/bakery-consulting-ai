"use client";

import { useState } from "react";
import type {
  CandidateContractReadinessView,
  ContractReadinessIssue,
  ContractReadinessStatus,
} from "@/lib/candidates/contract-readiness-contract";

const STATUS_CONTENT: Record<ContractReadinessStatus, { label: string; description: string; className: string }> = {
  BLOCKED: {
    label: "BLOCKED",
    description: "계약 전 해결이 필요한 확인된 차단요인이 있습니다.",
    className: "border-red-300 bg-red-50 text-red-900",
  },
  REVIEW_REQUIRED: {
    label: "REVIEW REQUIRED",
    description: "계약 판단 전에 추가 확인 또는 검토가 필요합니다.",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  READY: {
    label: "READY",
    description: "현재 자료 기준으로 사람의 최종 계약검토를 진행할 준비가 됐습니다.",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
};

function koreaDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function IssueList({ title, items, empty }: { title: string; items: ContractReadinessIssue[]; empty: string }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-4">
      <h4 className="text-sm font-bold text-stone-900">{title}</h4>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
          {items.map((item, index) => <li key={`${item.code}-${index}`} className="break-words">• {item.message}</li>)}
        </ul>
      ) : <p className="mt-3 text-sm text-stone-500">{empty}</p>}
    </section>
  );
}

export function CandidateContractReadinessPanel({
  candidateId,
  caseId,
  view,
  onViewChange,
}: {
  candidateId: string;
  caseId: string;
  view: CandidateContractReadinessView;
  onViewChange: (view: CandidateContractReadinessView) => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = view.currentEvaluation;
  const status = STATUS_CONTENT[current.readinessStatus];
  const saved = view.latestSavedSnapshot;

  const saveSnapshot = async () => {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/contract-readiness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      const body = await response.json() as CandidateContractReadinessView | { message?: string };
      if (!response.ok || !("currentEvaluation" in body)) {
        setError("message" in body && body.message ? body.message : "현재 검토상태를 저장하지 못했습니다.");
        return;
      }
      onViewChange(body);
      setMessage("현재 근거 기준의 Contract Readiness Snapshot을 저장했습니다.");
    } catch {
      setError("현재 검토상태를 저장하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel-card min-w-0 p-5 sm:p-6" aria-labelledby="contract-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.14em] text-[#8b6f38]">CONTRACT READINESS</p>
          <h3 id="contract-readiness-title" className="mt-1 text-lg font-bold text-stone-950">계약 검토 준비상태</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">현재 저장된 시설·임대차·경제성 근거를 종합한 검토 준비상태입니다. 계약 승인이나 추천을 의미하지 않습니다.</p>
        </div>
        <div className={`max-w-full rounded-xl border px-4 py-3 ${status.className}`}>
          <p className="text-xs font-bold tracking-wide">현재 상태 · {status.label}</p>
          <p className="mt-1 max-w-md text-sm leading-5">{status.description}</p>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
        <IssueList title="확인된 차단요인" items={current.blockingIssues} empty="확인된 차단요인이 없습니다." />
        <IssueList title="검토 필요사항" items={current.reviewIssues} empty="추가 검토사항이 없습니다." />
        <IssueList title="근거 공백" items={current.evidenceGaps} empty="확인된 근거 공백이 없습니다." />
      </div>

      <section className="mt-3 min-w-0 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <h4 className="text-sm font-bold text-stone-900">다음 행동</h4>
        {current.nextActions.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
            {current.nextActions.map((action) => <li key={action} className="break-words">• {action}</li>)}
          </ul>
        ) : <p className="mt-3 text-sm text-stone-500">현재 계산에서 추가 행동이 생성되지 않았습니다.</p>}
        <p className="mt-3 text-xs text-stone-500">평가기준시각 {koreaDateTime(current.evaluatedAt)}</p>
      </section>

      <div className="mt-4 flex flex-col gap-4 border-t border-stone-200 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-sm text-stone-600">
          {saved ? (
            <>
              <p className="font-semibold text-stone-900">최근 저장 · {koreaDateTime(saved.savedAt)} · {STATUS_CONTENT[saved.result.readinessStatus].label}</p>
              <p className={`mt-1 font-semibold ${view.isLatestSnapshotStale ? "text-amber-800" : "text-emerald-800"}`}>
                {view.isLatestSnapshotStale ? "현재 자료와 다름" : "현재 자료와 동일"}
              </p>
            </>
          ) : <p>저장된 Snapshot이 없습니다.</p>}
          <p className="mt-1">과거 Snapshot {view.snapshotCount.toLocaleString("ko-KR")}개</p>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={saveSnapshot} disabled={pending}>
          {pending ? "저장 중…" : "현재 검토상태 저장"}
        </button>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
    </section>
  );
}
