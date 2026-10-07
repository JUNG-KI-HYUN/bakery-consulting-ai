"use client";

import { useState, type FormEvent } from "react";
import {
  CANDIDATE_LEASE_CHECK_KEYS,
  CANDIDATE_LEASE_CHECK_LABELS,
  type CandidateLeaseAssessment,
  type CandidateLeaseCheck,
  type CandidateLeaseCheckKey,
  type CandidateLeaseCheckState,
  type CandidateLeaseReviewedTerms,
  type CandidateLeaseSourceType,
  type CandidateLeaseVatTreatment,
  type CandidateLeaseVerificationStatus,
} from "@/lib/candidates/candidate-lease-assessment-contract";
import { calculateCandidateLeaseRiskSummary } from "@/lib/candidates/candidate-lease-risk";
import type { CandidateStoreAskingTerms } from "@/lib/candidates/candidate-contract";

type CheckDraft = Record<CandidateLeaseCheckKey, CandidateLeaseCheck>;
type TermsDraft = Record<keyof CandidateLeaseReviewedTerms, string>;

const STATE_OPTIONS: Array<{ value: CandidateLeaseCheckState; label: string }> = [
  { value: "UNKNOWN", label: "미확인" },
  { value: "ACCEPTABLE", label: "수용 가능" },
  { value: "CONDITIONAL", label: "조건부" },
  { value: "UNACCEPTABLE", label: "수용 불가" },
];
const VERIFICATION_OPTIONS: Array<{ value: CandidateLeaseVerificationStatus; label: string }> = [
  { value: "NOT_CHECKED", label: "확인 전" },
  { value: "VERIFIED", label: "확인 완료" },
  { value: "LANDLORD_CONFIRM_REQUIRED", label: "임대인 확인 필요" },
  { value: "DOCUMENT_CONFIRM_REQUIRED", label: "계약문서 확인 필요" },
  { value: "EXPERT_CONFIRM_REQUIRED", label: "전문가 확인 필요" },
  { value: "AUTHORITY_CONFIRM_REQUIRED", label: "관할기관 확인 필요" },
  { value: "NO_DATA", label: "자료 없음" },
];
const SOURCE_OPTIONS: Array<{ value: CandidateLeaseSourceType; label: string }> = [
  { value: "USER_INPUT", label: "사용자 입력" },
  { value: "BROKER", label: "공인중개사" },
  { value: "LANDLORD", label: "임대인" },
  { value: "DOCUMENT", label: "계약·확인 문서" },
  { value: "EXPERT", label: "전문가" },
  { value: "AUTHORITY", label: "관할기관" },
  { value: "DERIVED", label: "확인자료 기반 정리" },
];
const VAT_OPTIONS: Array<{ value: CandidateLeaseVatTreatment; label: string }> = [
  { value: "UNKNOWN", label: "미확인" },
  { value: "INCLUDED", label: "부가세 포함" },
  { value: "SEPARATE", label: "부가세 별도" },
  { value: "EXEMPT", label: "면세로 확인" },
];

function defaultCheck(): CandidateLeaseCheck { return { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" }; }
function checkDraft(assessment: CandidateLeaseAssessment | null): CheckDraft {
  return Object.fromEntries(CANDIDATE_LEASE_CHECK_KEYS.map((key) => [key, assessment?.checks[key] ? { ...assessment.checks[key] } : defaultCheck()])) as CheckDraft;
}
function termsDraft(assessment: CandidateLeaseAssessment | null, askingTerms: CandidateStoreAskingTerms): TermsDraft {
  const terms: CandidateLeaseReviewedTerms = assessment ? assessment.reviewedTerms : askingTerms;
  return {
    depositWon: terms.depositWon?.toString() ?? "",
    monthlyRentWon: terms.monthlyRentWon?.toString() ?? "",
    maintenanceFeeWon: terms.maintenanceFeeWon?.toString() ?? "",
    premiumWon: terms.premiumWon?.toString() ?? "",
    leaseTermMonths: terms.leaseTermMonths?.toString() ?? "",
    rentFreeMonths: terms.rentFreeMonths?.toString() ?? "",
    vatTreatment: terms.vatTreatment ?? "",
    handoverDate: terms.handoverDate ?? "",
  };
}
function optionalNumber(value: string) { return value === "" ? null : Number(value); }
function termsBody(terms: TermsDraft) {
  return {
    depositWon: optionalNumber(terms.depositWon),
    monthlyRentWon: optionalNumber(terms.monthlyRentWon),
    maintenanceFeeWon: optionalNumber(terms.maintenanceFeeWon),
    premiumWon: optionalNumber(terms.premiumWon),
    leaseTermMonths: optionalNumber(terms.leaseTermMonths),
    rentFreeMonths: optionalNumber(terms.rentFreeMonths),
    vatTreatment: terms.vatTreatment || null,
    handoverDate: terms.handoverDate || null,
  };
}

export function CandidateLeaseAssessmentEditor({ candidateId, caseId, currentAskingTerms, assessment, onSaved }: {
  candidateId: string;
  caseId: string;
  currentAskingTerms: CandidateStoreAskingTerms;
  assessment: CandidateLeaseAssessment | null;
  onSaved: (assessment: CandidateLeaseAssessment) => void;
}) {
  const [checks, setChecks] = useState(() => checkDraft(assessment));
  const [terms, setTerms] = useState(() => termsDraft(assessment, currentAskingTerms));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = calculateCandidateLeaseRiskSummary({ checks });
  const updateCheck = (key: CandidateLeaseCheckKey, patch: Partial<CandidateLeaseCheck>) => setChecks((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const updateTerm = (key: keyof TermsDraft, value: string) => setTerms((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/lease-assessment`, {
        method: assessment ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, reviewedTerms: termsBody(terms), checks }),
      });
      const body = await response.json() as CandidateLeaseAssessment | { message?: string };
      if (!response.ok || !("assessmentId" in body)) {
        setError("message" in body && body.message ? body.message : "임대차 검토를 저장하지 못했습니다.");
        return;
      }
      setChecks(checkDraft(body));
      setTerms(termsDraft(body, currentAskingTerms));
      onSaved(body);
      setMessage("임대차 검토가 저장되었습니다.");
    } catch {
      setError("임대차 검토를 저장하는 중 오류가 발생했습니다.");
    } finally { setPending(false); }
  };

  return (
    <form id="lease-review" onSubmit={save} className="panel-card scroll-mt-6 p-5 sm:p-6">
      <div className="border-b border-stone-200 pb-5">
        <p className="text-xs font-bold tracking-[0.14em] text-[#8b6f38]">CANDIDATE LEASE REVIEW</p>
        <h3 className="mt-2 text-xl font-bold text-stone-950">임대차 조건 확인</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">최초 저장 시 현재 제시조건을 복사하며, 이후 Candidate 조건이 바뀌어도 검토 snapshot은 자동 변경되지 않습니다.</p>
        <p className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-700">계약문구와 법적 효력은 담당 공인중개사 또는 변호사 확인이 필요합니다. 권리금 회수 가능성과 임대료 적정성을 보장하지 않습니다.</p>
      </div>

      <section className="mt-5 grid gap-3 lg:grid-cols-3" aria-label="임대차 이슈 요약">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><h4 className="font-bold text-red-950">Hard Issue · {summary.hardIssues.length}건</h4><p className="mt-1 text-xs leading-5 text-red-800">확인된 명시적 계약·사용 충돌입니다.</p>{summary.hardIssues.length ? <ul className="mt-3 space-y-2 text-sm text-red-950">{summary.hardIssues.map((item) => <li key={item.key}><strong>{item.label}</strong> — {item.reason}</li>)}</ul> : <p className="mt-3 text-sm text-red-900">현재 확인된 Hard Issue는 없습니다.</p>}</div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold text-amber-950">Conditional · {summary.conditionalIssues.length}건</h4><p className="mt-1 text-xs leading-5 text-amber-800">조건 변경·특약·서면확인 또는 협의가 필요한 항목입니다.</p>{summary.conditionalIssues.length ? <ul className="mt-3 space-y-2 text-sm text-amber-950">{summary.conditionalIssues.map((item) => <li key={item.key}><strong>{item.label}</strong> — {item.reason}{item.nextAction ? <span className="mt-1 block text-xs">다음 확인: {item.nextAction}</span> : null}</li>)}</ul> : <p className="mt-3 text-sm text-amber-900">현재 조건 협의가 필요한 항목은 없습니다.</p>}</div>
        <div className="rounded-xl border border-stone-300 bg-stone-50 p-4"><h4 className="font-bold text-stone-950">확인 필요 · {summary.unresolvedChecks.length}건</h4><p className="mt-1 text-xs leading-5 text-stone-600">문제 확정이 아니라 아직 계약 근거 확인이 필요한 항목입니다.</p>{summary.unresolvedChecks.length ? <ul className="mt-3 space-y-1 text-sm text-stone-800">{summary.unresolvedChecks.slice(0, 5).map((item) => <li key={item.key}>• {item.nextAction}</li>)}{summary.unresolvedChecks.length > 5 ? <li>• 그 외 {summary.unresolvedChecks.length - 5}건</li> : null}</ul> : <p className="mt-3 text-sm text-stone-700">추가 확인 조치가 없습니다.</p>}</div>
      </section>

      <section className="mt-6 rounded-xl border border-stone-200 p-4">
        <h4 className="text-base font-bold text-stone-950">현재 검토 임대조건</h4>
        <p className="mt-1 text-xs text-stone-500">시장 적정성 판정이 아니라 이번 계약검토에 사용한 snapshot입니다.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["depositWon", "monthlyRentWon", "maintenanceFeeWon", "premiumWon"] as const).map((key, index) => <label key={key} className="block"><span className="field-label">{["보증금 (원)", "월세 (원)", "관리비 (원)", "권리금 (원)"][index]}</span><input type="number" min="0" className="input" value={terms[key]} onChange={(event) => updateTerm(key, event.target.value)} /></label>)}
          <label className="block"><span className="field-label">계약기간 (개월)</span><input type="number" min="0" className="input" value={terms.leaseTermMonths} onChange={(event) => updateTerm("leaseTermMonths", event.target.value)} /></label>
          <label className="block"><span className="field-label">렌트프리 (개월)</span><input type="number" min="0" className="input" value={terms.rentFreeMonths} onChange={(event) => updateTerm("rentFreeMonths", event.target.value)} /></label>
          <label className="block"><span className="field-label">부가세 처리</span><select className="input" value={terms.vatTreatment} onChange={(event) => updateTerm("vatTreatment", event.target.value)}><option value="">미기록</option>{VAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="block"><span className="field-label">인도일</span><input type="date" className="input" value={terms.handoverDate} onChange={(event) => updateTerm("handoverDate", event.target.value)} /></label>
        </div>
      </section>

      <div className="mt-6 space-y-4">
        {CANDIDATE_LEASE_CHECK_KEYS.map((key) => {
          const check = checks[key];
          return <fieldset key={key} className="rounded-xl border border-stone-200 p-4"><legend className="px-1 text-sm font-bold text-stone-950">{CANDIDATE_LEASE_CHECK_LABELS[key]}</legend><div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="block"><span className="field-label">현재 상태</span><select className="input" value={check.state} onChange={(event) => updateCheck(key, { state: event.target.value as CandidateLeaseCheckState })}>{STATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block"><span className="field-label">확인 상태</span><select className="input" value={check.verificationStatus} onChange={(event) => updateCheck(key, { verificationStatus: event.target.value as CandidateLeaseVerificationStatus })}>{VERIFICATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block"><span className="field-label">근거 출처</span><select className="input" value={check.sourceType ?? ""} onChange={(event) => updateCheck(key, { sourceType: event.target.value ? event.target.value as CandidateLeaseSourceType : undefined })}><option value="">미기록</option>{SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block"><span className="field-label">확인일</span><input type="date" className="input" value={check.observedAt?.slice(0, 10) ?? ""} onChange={(event) => updateCheck(key, { observedAt: event.target.value || undefined })} /></label></div><label className="mt-3 block"><span className="field-label">근거·메모</span><textarea className="input min-h-20 resize-y" value={check.note ?? ""} onChange={(event) => updateCheck(key, { note: event.target.value || undefined })} placeholder="계약문구, 확인 근거, 협의사항과 다음 행동을 기록합니다." /></label></fieldset>;
        })}
      </div>

      {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5"><p className="text-sm text-stone-600">확인 필요 {summary.unresolvedChecks.length} · 확인 완료 {summary.verifiedCount}</p><button type="submit" className="btn-primary" disabled={pending}>{pending ? "저장 중…" : "임대차 검토 저장"}</button></div>
    </form>
  );
}
