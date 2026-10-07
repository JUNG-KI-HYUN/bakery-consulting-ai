"use client";

import { useState, type FormEvent } from "react";
import {
  ALLOWED_VERDICTS_BY_READINESS,
  HUMAN_DECISION_VERDICT_LABELS,
  type CandidateHumanDecision,
  type CandidateHumanDecisionView,
  type HumanDecisionVerdict,
} from "@/lib/candidates/human-decision-contract";

const VERDICT_DESCRIPTIONS: Record<HumanDecisionVerdict, string> = {
  RECOMMEND: "핵심조건이 확인되고 중대한 미해결 위험이 낮음",
  CONDITIONAL_RECOMMEND: "남은 조건의 완료를 전제로 진행 검토 가능",
  HOLD: "핵심자료 또는 중대한 위험의 해결 여부가 미확정",
  RISK: "해결이 어렵거나 손실 가능성이 큰 핵심 위험이 확인됨",
};

type FormState = {
  verdict: "" | HumanDecisionVerdict;
  rationale: string;
  positiveFactors: string;
  keyRisks: string;
  unresolvedConditions: string;
  conditionsBeforeProceeding: string;
  landlordConfirmations: string;
  expertConfirmations: string;
  nextActions: string;
  reviewerName: string;
};

const EMPTY_FORM: FormState = {
  verdict: "",
  rationale: "",
  positiveFactors: "",
  keyRisks: "",
  unresolvedConditions: "",
  conditionsBeforeProceeding: "",
  landlordConfirmations: "",
  expertConfirmations: "",
  nextActions: "",
  reviewerName: "",
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

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function DecisionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-stone-500">{title}</dt>
      <dd className="mt-1">
        <ul className="space-y-1 text-sm leading-6 text-stone-700">
          {items.map((item, index) => <li key={`${item}-${index}`} className="break-words">• {item}</li>)}
        </ul>
      </dd>
    </div>
  );
}

function LatestDecision({ decision, stale }: { decision: CandidateHumanDecision; stale: boolean }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 p-4" aria-label="최근 FRAMEONE 최종 판단">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-stone-500">최종 판단</p>
          <p className="mt-1 text-xl font-bold text-stone-950">{HUMAN_DECISION_VERDICT_LABELS[decision.verdict]}</p>
        </div>
        <p className="text-sm text-stone-600">{koreaDateTime(decision.decidedAt)} · {decision.reviewerName}</p>
      </div>
      {stale ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">최종 판단 이후 근거자료가 변경되었습니다. 재검토가 필요합니다.</p> : null}
      <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2"><dt className="text-xs font-bold text-stone-500">판단 이유</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">{decision.rationale}</dd></div>
        <DecisionList title="핵심위험" items={decision.support.keyRisks} />
        <DecisionList title="계약 전 완료조건" items={decision.support.conditionsBeforeProceeding} />
        <DecisionList title="다음 행동" items={decision.support.nextActions} />
        <div className="min-w-0"><dt className="text-xs font-bold text-stone-500">기준 Contract Readiness Snapshot</dt><dd className="mt-1 break-all text-sm text-stone-700">{decision.basis.readinessSnapshotId} · {decision.basis.readinessStatus}</dd></div>
      </dl>
    </section>
  );
}

function TextAreaField({ label, value, onChange, required, prominent, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  prominent?: boolean;
  disabled: boolean;
}) {
  return (
    <label className={`block min-w-0 ${prominent ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-semibold text-stone-800">{label}{required ? " *" : ""}</span>
      <textarea className="mt-2 min-h-24 w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-100" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={prominent ? "판단 근거를 구체적으로 기록하세요." : "한 줄에 하나씩 입력"} />
    </label>
  );
}

export function CandidateHumanDecisionPanel({
  candidateId,
  caseId,
  view,
  onViewChange,
}: {
  candidateId: string;
  caseId: string;
  view: CandidateHumanDecisionView;
  onViewChange: (view: CandidateHumanDecisionView) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = new Set(ALLOWED_VERDICTS_BY_READINESS[view.currentReadiness.readinessStatus]);

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          verdict: form.verdict,
          rationale: form.rationale,
          reviewerName: form.reviewerName,
          positiveFactors: lines(form.positiveFactors),
          keyRisks: lines(form.keyRisks),
          unresolvedConditions: lines(form.unresolvedConditions),
          conditionsBeforeProceeding: lines(form.conditionsBeforeProceeding),
          landlordConfirmations: lines(form.landlordConfirmations),
          expertConfirmations: lines(form.expertConfirmations),
          nextActions: lines(form.nextActions),
        }),
      });
      const body = await response.json() as CandidateHumanDecisionView | { message?: string };
      if (!response.ok || !("latestDecision" in body)) {
        setError("message" in body && body.message ? body.message : "최종 판단을 저장하지 못했습니다.");
        return;
      }
      onViewChange(body);
      setForm((current) => ({ ...EMPTY_FORM, reviewerName: current.reviewerName }));
      setMessage("사람이 검토한 FRAMEONE 최종 판단을 저장했습니다.");
    } catch {
      setError("최종 판단을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  const disabled = !view.canCreateDecision || pending;

  return (
    <section className="panel-card min-w-0 p-5 sm:p-6" aria-labelledby="human-decision-title">
      <div className="border-b border-stone-200 pb-4">
        <p className="text-xs font-bold tracking-[0.14em] text-[#8b6f38]">HUMAN DECISION</p>
        <h3 id="human-decision-title" className="mt-1 text-lg font-bold text-stone-950">FRAMEONE 최종 판단</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">Contract Readiness가 최종 판단을 자동 생성하지 않습니다. 담당자가 저장된 최신 Snapshot을 확인하고 직접 판단합니다.</p>
      </div>

      <div className="mt-4">
        {view.latestDecision ? <LatestDecision decision={view.latestDecision} stale={view.isLatestDecisionStale === true} /> : <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">최종 판단이 아직 기록되지 않았습니다.</p>}
      </div>

      {!view.canCreateDecision ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">{view.blockReason ?? "현재 자료 기준의 계약 검토상태를 먼저 저장하세요."}</p> : null}

      <form onSubmit={save} className="mt-5 min-w-0">
        <fieldset disabled={disabled} className="min-w-0 disabled:opacity-70">
          <legend className="text-base font-bold text-stone-950">새 최종 판단 기록</legend>
          <p className="mt-1 text-sm text-stone-500">현재 Readiness · {view.currentReadiness.readinessStatus}</p>
          <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="block min-w-0 sm:col-span-2">
              <span className="text-sm font-semibold text-stone-800">최종 판단 *</span>
              <select className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-100" value={form.verdict} onChange={(event) => update("verdict", event.target.value)} required>
                <option value="">선택하세요</option>
                {(Object.keys(HUMAN_DECISION_VERDICT_LABELS) as HumanDecisionVerdict[]).map((verdict) => <option key={verdict} value={verdict} disabled={!allowed.has(verdict)}>{HUMAN_DECISION_VERDICT_LABELS[verdict]} · {VERDICT_DESCRIPTIONS[verdict]}</option>)}
              </select>
            </label>
            <TextAreaField label="판단 이유" value={form.rationale} onChange={(value) => update("rationale", value)} required prominent disabled={disabled} />
            <TextAreaField label="긍정요인" value={form.positiveFactors} onChange={(value) => update("positiveFactors", value)} disabled={disabled} />
            <TextAreaField label="핵심위험" value={form.keyRisks} onChange={(value) => update("keyRisks", value)} disabled={disabled} />
            <TextAreaField label="미확인 사항" value={form.unresolvedConditions} onChange={(value) => update("unresolvedConditions", value)} disabled={disabled} />
            <TextAreaField label="계약 전 완료조건" value={form.conditionsBeforeProceeding} onChange={(value) => update("conditionsBeforeProceeding", value)} prominent disabled={disabled} />
            <TextAreaField label="임대인 확인" value={form.landlordConfirmations} onChange={(value) => update("landlordConfirmations", value)} disabled={disabled} />
            <TextAreaField label="전문가 확인" value={form.expertConfirmations} onChange={(value) => update("expertConfirmations", value)} disabled={disabled} />
            <TextAreaField label="다음 행동" value={form.nextActions} onChange={(value) => update("nextActions", value)} disabled={disabled} />
            <label className="block min-w-0">
              <span className="text-sm font-semibold text-stone-800">담당자 *</span>
              <input className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-100" value={form.reviewerName} onChange={(event) => update("reviewerName", event.target.value)} required />
            </label>
          </div>
        </fieldset>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
        {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
        <div className="mt-5 border-t border-stone-200 pt-4"><button type="submit" className="btn-primary w-full sm:w-auto" disabled={disabled}>{pending ? "저장 중…" : "최종 판단 저장"}</button></div>
      </form>

      <p className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-5 text-stone-600">본 판단은 입력자료와 확인된 근거를 바탕으로 한 FRAMEONE의 실무상 검토이며, 법률·세무·인허가·전기·소방·위생 등의 최종 판단은 관련 전문가 및 관할기관 확인이 필요합니다.</p>
    </section>
  );
}
