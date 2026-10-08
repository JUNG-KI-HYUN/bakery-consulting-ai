"use client";

import { useState } from "react";
import {
  sameEconomicVersionIdentity,
  type CandidateEconomicSelectionView,
  type CandidateEconomicVersionOption,
} from "@/lib/candidates/candidate-economic-selection-contract";

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

function money(value: number | null) {
  return value === null ? "계산 불가" : `${value.toLocaleString("ko-KR")}원`;
}

function identityKey(version: CandidateEconomicVersionOption) {
  return [version.analysisRunId, version.generatedAt, version.assumptionRevision, version.engineVersion].join("|");
}

export function CandidateEconomicVersionSelector({
  candidateId,
  caseId,
  initialView,
  onSelectionChanged,
}: {
  candidateId: string;
  caseId: string;
  initialView: CandidateEconomicSelectionView;
  onSelectionChanged: () => void;
}) {
  const [view, setView] = useState(initialView);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (view.versions.length <= 1) return null;

  const selectVersion = async (version: CandidateEconomicVersionOption) => {
    const key = identityKey(version);
    setPendingKey(key);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/economic-selection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          analysisRunId: version.analysisRunId,
          generatedAt: version.generatedAt,
          assumptionRevision: version.assumptionRevision,
          engineVersion: version.engineVersion,
        }),
      });
      const body = await response.json() as CandidateEconomicSelectionView | { message?: string };
      if (!response.ok || !("versions" in body)) {
        setError("message" in body && body.message ? body.message : "Economic version을 선택하지 못했습니다.");
        return;
      }
      setView(body);
      setMessage("계약판정에 사용할 Economic version을 선택했습니다.");
      onSelectionChanged();
    } catch {
      setError("Economic version을 선택하는 중 오류가 발생했습니다.");
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <section className="panel-card min-w-0 p-5 sm:p-6" aria-labelledby="economic-version-selection-title">
      <div className="border-b border-stone-200 pb-4">
        <p className="text-xs font-bold tracking-[0.14em] text-[#8b6f38]">ECONOMIC BASIS</p>
        <h3 id="economic-version-selection-title" className="mt-1 text-lg font-bold text-stone-950">계약판정 Economic 기준 선택</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">복수 계산결과 중 계약 검토에 사용할 근거를 선택합니다. 선택 자체가 수익성 판단이나 추천을 의미하지 않습니다.</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {view.versions.map((version) => {
          const selected = Boolean(view.selection && sameEconomicVersionIdentity(view.selection, version));
          const key = identityKey(version);
          return (
            <article key={key} className={`rounded-xl border p-4 ${selected ? "border-[#b99b5e] bg-[#fbf7ed]" : "border-stone-200 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-stone-950">생성 {koreaDateTime(version.generatedAt)}</p>
                  <p className="mt-1 text-xs text-stone-500">가정 revision {version.assumptionRevision} · {version.engineVersion}</p>
                </div>
                {selected ? <span className="rounded-full bg-[#725823] px-2.5 py-1 text-xs font-bold text-white">판정 기준</span> : null}
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-stone-500">기준 월매출</dt><dd className="mt-1 font-semibold text-stone-900">{money(version.baseMonthlySales)}</dd></div>
                <div><dt className="text-stone-500">월 BEP</dt><dd className="mt-1 font-semibold text-stone-900">{money(version.monthlyBepSales)}</dd></div>
              </dl>
              {version.validationErrorCount > 0 ? <p className="mt-3 text-xs font-semibold text-amber-800">입력 검증 오류 {version.validationErrorCount}건 — READY 판단에 사용할 수 없습니다.</p> : null}
              <button type="button" className="btn-outline mt-4 w-full sm:w-auto" onClick={() => void selectVersion(version)} disabled={selected || pendingKey !== null}>
                {pendingKey === key ? "선택 중…" : selected ? "현재 판정 기준" : "판정 기준으로 사용"}
              </button>
            </article>
          );
        })}
      </div>
      {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
    </section>
  );
}
