"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  CANDIDATE_STORE_STATUS_LABELS,
  type CandidateStore,
} from "@/lib/candidates/candidate-contract";
import type { BakeryFacilityAssessment } from "@/lib/candidates/bakery-facility-assessment-contract";
import { calculateBakeryFacilityRiskSummary } from "@/lib/candidates/bakery-facility-risk";
import type { CandidateLeaseAssessment } from "@/lib/candidates/candidate-lease-assessment-contract";
import { calculateCandidateLeaseRiskSummary } from "@/lib/candidates/candidate-lease-risk";
import type { CandidateContractReadinessView } from "@/lib/candidates/contract-readiness-contract";
import { BakeryFacilityAssessmentEditor } from "./BakeryFacilityAssessmentEditor";
import { CandidateContractReadinessPanel } from "./CandidateContractReadinessPanel";
import { CandidateLeaseAssessmentEditor } from "./CandidateLeaseAssessmentEditor";
import { CandidateStoreFormFields, type CandidateStoreFormValues } from "./CandidateStoreFormFields";

function valuesFromRecord(record: CandidateStore): CandidateStoreFormValues {
  return {
    label: record.label,
    address: record.address ?? "",
    unit: record.unit ?? "",
    floor: record.propertyFacts.floor ?? "",
    exclusiveAreaSqm: record.propertyFacts.exclusiveAreaSqm?.toString() ?? "",
    frontageM: record.propertyFacts.frontageM?.toString() ?? "",
    parkingStatus: record.propertyFacts.parkingStatus ?? "",
    parkingNote: record.propertyFacts.parkingNote ?? "",
    depositWon: record.currentAskingTerms.depositWon?.toString() ?? "",
    monthlyRentWon: record.currentAskingTerms.monthlyRentWon?.toString() ?? "",
    maintenanceFeeWon: record.currentAskingTerms.maintenanceFeeWon?.toString() ?? "",
    premiumWon: record.currentAskingTerms.premiumWon?.toString() ?? "",
    status: record.status,
  };
}

function optionalNumber(value: string) {
  return value === "" ? null : Number(value);
}

function updateBody(values: CandidateStoreFormValues) {
  return {
    label: values.label,
    address: values.address || null,
    unit: values.unit || null,
    floor: values.floor || null,
    exclusiveAreaSqm: optionalNumber(values.exclusiveAreaSqm),
    frontageM: optionalNumber(values.frontageM),
    parkingStatus: values.parkingStatus || null,
    parkingNote: values.parkingNote || null,
    depositWon: optionalNumber(values.depositWon),
    monthlyRentWon: optionalNumber(values.monthlyRentWon),
    maintenanceFeeWon: optionalNumber(values.maintenanceFeeWon),
    premiumWon: optionalNumber(values.premiumWon),
    status: values.status,
  };
}

function money(value?: number) {
  return value === undefined ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}

export function CandidateStoreDetailClient({
  initialRecord,
  initialFacilityAssessment,
  initialLeaseAssessment,
  initialReadinessView,
  caseName,
}: {
  initialRecord: CandidateStore;
  initialFacilityAssessment: BakeryFacilityAssessment | null;
  initialLeaseAssessment: CandidateLeaseAssessment | null;
  initialReadinessView: CandidateContractReadinessView;
  caseName: string;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [facilityAssessment, setFacilityAssessment] = useState(initialFacilityAssessment);
  const [leaseAssessment, setLeaseAssessment] = useState(initialLeaseAssessment);
  const [readinessView, setReadinessView] = useState(initialReadinessView);
  const [values, setValues] = useState(() => valuesFromRecord(initialRecord));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestLink = record.analysisLinks.at(-1) ?? null;
  const facilitySummary = calculateBakeryFacilityRiskSummary(facilityAssessment);
  const leaseSummary = calculateCandidateLeaseRiskSummary(leaseAssessment);

  const refreshReadiness = async () => {
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(record.candidateId)}/contract-readiness?caseId=${encodeURIComponent(record.caseId)}`);
      const body = await response.json() as CandidateContractReadinessView | { message?: string };
      if (response.ok && "currentEvaluation" in body) setReadinessView(body);
    } catch {
      // Assessment editors retain their own save result when the aggregate refresh fails.
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(record.candidateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody(values)),
      });
      const body = await response.json() as CandidateStore | { message?: string };
      if (!response.ok || !("candidateId" in body)) {
        setError("message" in body && body.message ? body.message : "후보점포를 수정하지 못했습니다.");
        return;
      }
      setRecord(body);
      setValues(valuesFromRecord(body));
      setMessage("후보점포 정보가 저장되었습니다.");
    } catch {
      setError("후보점포를 수정하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-6">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.16em] text-[#8b6f38]">CANDIDATE STORE · {caseName}</p>
          <h2 className="mt-2 break-words text-2xl font-bold text-stone-950 sm:text-3xl">{record.label}</h2>
          <p className="mt-2 break-words text-sm text-stone-600">{record.address ?? "주소 미입력"}{record.unit ? ` · ${record.unit}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#d8c59b] bg-[#f8f2e6] px-3 py-1.5 text-xs font-bold text-[#725823]">{CANDIDATE_STORE_STATUS_LABELS[record.status]}</span>
          <Link href={`/cases/${encodeURIComponent(record.caseId)}`} className="btn-outline">Case로 돌아가기</Link>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 md:grid-cols-2 xl:grid-cols-4" aria-label="후보점포 상담 요약">
        <article className="bg-white p-5"><p className="text-xs font-bold text-[#8b6f38]">현재 임대조건</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-stone-500">보증금</dt><dd className="font-semibold">{money(record.currentAskingTerms.depositWon)}</dd></div><div className="flex justify-between gap-3"><dt className="text-stone-500">월세</dt><dd className="font-semibold">{money(record.currentAskingTerms.monthlyRentWon)}</dd></div><div className="flex justify-between gap-3"><dt className="text-stone-500">관리비</dt><dd className="font-semibold">{money(record.currentAskingTerms.maintenanceFeeWon)}</dd></div><div className="flex justify-between gap-3"><dt className="text-stone-500">권리금</dt><dd className="font-semibold">{money(record.currentAskingTerms.premiumWon)}</dd></div></dl></article>
        <article className="bg-white p-5"><p className="text-xs font-bold text-[#8b6f38]">Market Analysis</p><h3 className="mt-2 text-base font-bold text-stone-950">{latestLink ? "분석 Run 연결됨" : "연결된 분석 없음"}</h3><p className="mt-2 text-sm leading-6 text-stone-500">{latestLink ? `${latestLink.targetSnapshot.label ?? latestLink.targetSnapshot.address ?? "분석 위치"} · ${latestLink.targetSnapshot.radiusM}m` : record.source === "MARKET_WORKSPACE" ? "Market Workspace에서 등록했지만 저장된 Run snapshot은 연결되지 않았습니다." : "Case에서 직접 등록한 후보점포입니다."}</p></article>
        <article className="bg-white p-5"><p className="text-xs font-bold text-[#8b6f38]">BAKERY FACILITY</p><h3 className="mt-2 text-base font-bold text-stone-950">Hard {facilitySummary.hardBlockers.length} · Conditional {facilitySummary.conditionalBlockers.length}</h3><p className="mt-2 text-sm leading-6 text-stone-500">확인 필요 {facilitySummary.unresolvedChecks.length} · 확인 완료 {facilitySummary.verifiedCount}</p><a href="#facility-review" className="mt-3 inline-flex text-sm font-bold text-[#725823] underline underline-offset-4">시설 검토 열기</a></article>
        <article className="bg-white p-5"><p className="text-xs font-bold text-[#8b6f38]">LEASE REVIEW</p><h3 className="mt-2 text-base font-bold text-stone-950">Hard {leaseSummary.hardIssues.length} · Conditional {leaseSummary.conditionalIssues.length}</h3><p className="mt-2 text-sm leading-6 text-stone-500">확인 필요 {leaseSummary.unresolvedChecks.length} · 확인 완료 {leaseSummary.verifiedCount}</p><a href="#lease-review" className="mt-3 inline-flex text-sm font-bold text-[#725823] underline underline-offset-4">임대차 검토 열기</a></article>
      </section>

      <BakeryFacilityAssessmentEditor candidateId={record.candidateId} caseId={record.caseId} assessment={facilityAssessment} onSaved={(assessment) => { setFacilityAssessment(assessment); void refreshReadiness(); }} />
      <CandidateLeaseAssessmentEditor candidateId={record.candidateId} caseId={record.caseId} currentAskingTerms={record.currentAskingTerms} assessment={leaseAssessment} onSaved={(assessment) => { setLeaseAssessment(assessment); void refreshReadiness(); }} />
      <CandidateContractReadinessPanel candidateId={record.candidateId} caseId={record.caseId} view={readinessView} onViewChange={setReadinessView} />

      <form onSubmit={save} className="panel-card p-5 sm:p-6">
        <div className="mb-5 border-b border-stone-200 pb-4"><h3 className="text-lg font-bold text-stone-950">후보점포 정보</h3><p className="mt-1 text-sm text-stone-500">확인된 물건 정보와 현재 제시조건만 업데이트합니다.</p></div>
        <CandidateStoreFormFields values={values} onChange={setValues} includeStatus />
        {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
        {message ? <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
        <div className="mt-6 border-t border-stone-200 pt-5"><button type="submit" className="btn-primary" disabled={pending}>{pending ? "저장 중…" : "변경사항 저장"}</button></div>
      </form>
    </div>
  );
}
