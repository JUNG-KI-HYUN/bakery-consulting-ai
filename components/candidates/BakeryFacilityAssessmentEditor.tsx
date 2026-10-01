"use client";

import { useState, type FormEvent } from "react";
import {
  BAKERY_FACILITY_CHECK_KEYS,
  BAKERY_FACILITY_CHECK_LABELS,
  type BakeryFacilityAssessment,
  type BakeryFacilityCheck,
  type BakeryFacilityCheckKey,
  type BakeryFacilitySourceType,
  type BakeryFacilityState,
  type BakeryFacilityVerificationStatus,
} from "@/lib/candidates/bakery-facility-assessment-contract";
import { calculateBakeryFacilityRiskSummary } from "@/lib/candidates/bakery-facility-risk";

type FacilityDraft = Record<BakeryFacilityCheckKey, BakeryFacilityCheck>;

const STATE_OPTIONS: Array<{ value: BakeryFacilityState; label: string }> = [
  { value: "UNKNOWN", label: "미확인" },
  { value: "FEASIBLE", label: "가능" },
  { value: "CONDITIONAL", label: "조건부 가능" },
  { value: "NOT_FEASIBLE", label: "불가능" },
];
const VERIFICATION_OPTIONS: Array<{ value: BakeryFacilityVerificationStatus; label: string }> = [
  { value: "NOT_CHECKED", label: "확인 전" },
  { value: "VERIFIED", label: "확인 완료" },
  { value: "FIELD_CHECK_REQUIRED", label: "현장 확인 필요" },
  { value: "LANDLORD_CONFIRM_REQUIRED", label: "임대인 확인 필요" },
  { value: "EXPERT_CONFIRM_REQUIRED", label: "전문가 확인 필요" },
  { value: "AUTHORITY_CONFIRM_REQUIRED", label: "관할기관 확인 필요" },
  { value: "NO_DATA", label: "자료 없음" },
];
const SOURCE_OPTIONS: Array<{ value: BakeryFacilitySourceType; label: string }> = [
  { value: "USER_INPUT", label: "사용자 입력" },
  { value: "FIELD", label: "현장 확인" },
  { value: "LANDLORD", label: "임대인·관리주체" },
  { value: "DOCUMENT", label: "문서" },
  { value: "EXPERT", label: "전문가" },
  { value: "AUTHORITY", label: "관할기관" },
  { value: "DERIVED", label: "확인자료 기반 정리" },
];

function defaultCheck(): BakeryFacilityCheck {
  return { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" };
}

function draftFromAssessment(assessment: BakeryFacilityAssessment | null): FacilityDraft {
  return Object.fromEntries(BAKERY_FACILITY_CHECK_KEYS.map((key) => [
    key,
    assessment?.checks[key] ? { ...assessment.checks[key] } : defaultCheck(),
  ])) as FacilityDraft;
}

export function BakeryFacilityAssessmentEditor({
  candidateId,
  caseId,
  assessment,
  onSaved,
}: {
  candidateId: string;
  caseId: string;
  assessment: BakeryFacilityAssessment | null;
  onSaved: (assessment: BakeryFacilityAssessment) => void;
}) {
  const [draft, setDraft] = useState(() => draftFromAssessment(assessment));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = calculateBakeryFacilityRiskSummary({ checks: draft });

  const updateCheck = (key: BakeryFacilityCheckKey, patch: Partial<BakeryFacilityCheck>) => {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/facility-assessment`, {
        method: assessment ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, checks: draft }),
      });
      const body = await response.json() as BakeryFacilityAssessment | { message?: string };
      if (!response.ok || !("assessmentId" in body)) {
        setError("message" in body && body.message ? body.message : "시설 검토를 저장하지 못했습니다.");
        return;
      }
      setDraft(draftFromAssessment(body));
      onSaved(body);
      setMessage("시설 검토가 저장되었습니다.");
    } catch {
      setError("시설 검토를 저장하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form id="facility-review" onSubmit={save} className="panel-card scroll-mt-6 p-5 sm:p-6">
      <div className="border-b border-stone-200 pb-5">
        <p className="text-xs font-bold tracking-[0.14em] text-[#8b6f38]">BAKERY FACILITY REVIEW</p>
        <h3 className="mt-2 text-xl font-bold text-stone-950">시설 확인과 계약 전 조치</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">미확인은 실패가 아닙니다. 확인된 사실과 필요한 다음 조치를 분리해 기록합니다.</p>
      </div>

      <section className="mt-5 grid gap-3 lg:grid-cols-3" aria-label="시설 위험 요약">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h4 className="font-bold text-red-950">Hard Blocker · {summary.hardBlockers.length}건</h4>
          <p className="mt-1 text-xs leading-5 text-red-800">계약 전 해결되지 않으면 진행을 중단해야 할 수 있는 항목입니다.</p>
          {summary.hardBlockers.length ? <ul className="mt-3 space-y-2 text-sm text-red-950">{summary.hardBlockers.map((item) => <li key={item.key}><strong>{item.label}</strong> — {item.reason}</li>)}</ul> : <p className="mt-3 text-sm text-red-900">현재 확인된 Hard Blocker는 없습니다.</p>}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="font-bold text-amber-950">Conditional Blocker · {summary.conditionalBlockers.length}건</h4>
          <p className="mt-1 text-xs leading-5 text-amber-800">확인·협의·전문가 검토 후 해소 가능한 조건입니다.</p>
          {summary.conditionalBlockers.length ? <ul className="mt-3 space-y-2 text-sm text-amber-950">{summary.conditionalBlockers.map((item) => <li key={item.key}><strong>{item.label}</strong> — {item.reason}{item.nextAction ? <span className="mt-1 block text-xs">다음 확인: {item.nextAction}</span> : null}</li>)}</ul> : <p className="mt-3 text-sm text-amber-900">현재 조건 해소가 필요한 항목은 없습니다.</p>}
        </div>
        <div className="rounded-xl border border-stone-300 bg-stone-50 p-4">
          <h4 className="font-bold text-stone-950">확인 필요 · {summary.unresolvedChecks.length}건</h4>
          <p className="mt-1 text-xs leading-5 text-stone-600">문제나 실패가 아니라 아직 근거 확인이 필요한 항목입니다.</p>
          {summary.unresolvedChecks.length ? <ul className="mt-3 space-y-1 text-sm text-stone-800">{summary.unresolvedChecks.slice(0, 5).map((item) => <li key={item.key}>• {item.nextAction}</li>)}{summary.unresolvedChecks.length > 5 ? <li>• 그 외 {summary.unresolvedChecks.length - 5}건</li> : null}</ul> : <p className="mt-3 text-sm text-stone-700">추가 확인 조치가 없습니다.</p>}
        </div>
      </section>

      <div className="mt-6 space-y-4">
        {BAKERY_FACILITY_CHECK_KEYS.map((key) => {
          const check = draft[key];
          return (
            <fieldset key={key} className="rounded-xl border border-stone-200 p-4">
              <legend className="px-1 text-sm font-bold text-stone-950">{BAKERY_FACILITY_CHECK_LABELS[key]}</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block"><span className="field-label">현재 상태</span><select className="input" value={check.state} onChange={(event) => updateCheck(key, { state: event.target.value as BakeryFacilityState })}>{STATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="block"><span className="field-label">확인 상태</span><select className="input" value={check.verificationStatus} onChange={(event) => updateCheck(key, { verificationStatus: event.target.value as BakeryFacilityVerificationStatus })}>{VERIFICATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="block"><span className="field-label">근거 출처</span><select className="input" value={check.sourceType ?? ""} onChange={(event) => updateCheck(key, { sourceType: event.target.value ? event.target.value as BakeryFacilitySourceType : undefined })}><option value="">미기록</option>{SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="block"><span className="field-label">관찰일</span><input type="date" className="input" value={check.observedAt?.slice(0, 10) ?? ""} onChange={(event) => updateCheck(key, { observedAt: event.target.value || undefined })} /></label>
              </div>
              <label className="mt-3 block"><span className="field-label">근거·메모</span><textarea className="input min-h-20 resize-y" value={check.note ?? ""} onChange={(event) => updateCheck(key, { note: event.target.value || undefined })} placeholder="확인한 사실, 제한사항, 다음 확인 내용을 기록합니다." /></label>
            </fieldset>
          );
        })}
      </div>

      {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5">
        <p className="text-sm text-stone-600">확인 필요 {summary.unresolvedChecks.length} · 확인 완료 {summary.verifiedCount}</p>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "저장 중…" : "시설 검토 저장"}</button>
      </div>
    </form>
  );
}
