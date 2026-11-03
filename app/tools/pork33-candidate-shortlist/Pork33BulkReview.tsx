"use client";

import { useEffect, useMemo, useState } from "react";
import type { CandidateLifecycleStatus } from "@/lib/candidate-screening/types";
import type { FieldNoteStructuredContentV1 } from "@/lib/derived-content/types";
import {
  filterPork33BulkReviewCandidates,
  getAdjacentPork33CandidateId,
  getPork33BulkReviewProgress,
  PORK33_BULK_REVIEW_FILTERS,
  type Pork33BulkReviewFilter,
} from "@/lib/pork33-candidate-shortlist/bulk-review";
import { getActivePork33Revision } from "@/lib/pork33-candidate-shortlist/state";
import type { Pork33CandidateState, Pork33ShortlistCommand, Pork33ShortlistStateV1 } from "@/lib/pork33-candidate-shortlist/types";

type ClientCommand = Pork33ShortlistCommand extends infer Command
  ? Command extends { actor: string } ? Omit<Command, "actor"> : never
  : never;

const reviewFilterLabels: Record<Pork33BulkReviewFilter, string> = {
  ALL: "전체", UNREVIEWED: "미검토", DRAFT: "DRAFT", REVIEWED: "REVIEWED", APPROVED: "APPROVED",
  SHORTLIST: "SHORTLIST", KEEP: "KEEP", HOLD: "HOLD", DROP: "DROP",
};

const lifecycleLabels: Record<"KEEP" | "REVIEW" | "SHORTLIST" | "HOLD" | "DROP", string> = {
  KEEP: "검토 유지", REVIEW: "추가 확인", SHORTLIST: "우선 후보", HOLD: "보류", DROP: "제외",
};

function numberText(value: number | null, suffix: string) {
  return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}${suffix}`;
}
export function Pork33BulkReview({
  state, busy, message, actor, onActorChange, onCommand,
}: {
  state: Pork33ShortlistStateV1;
  busy: boolean;
  message: string;
  actor: string;
  onActorChange(value: string): void;
  onCommand(value: ClientCommand): Promise<boolean>;
}) {
  const [filter, setFilter] = useState<Pork33BulkReviewFilter>("ALL");
  const [regionId, setRegionId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [activeId, setActiveId] = useState(state.candidates[0]?.identity.candidateStoreId ?? "");
  const [editorDirty, setEditorDirty] = useState(false);
  const progress = getPork33BulkReviewProgress(state);
  const areas = useMemo(() => state.apartmentAreas.filter((area) => !regionId || area.regionId === regionId), [regionId, state.apartmentAreas]);
  const candidates = useMemo(() => filterPork33BulkReviewCandidates(state, filter, regionId, areaId), [areaId, filter, regionId, state]);
  const active = candidates.find((candidate) => candidate.identity.candidateStoreId === activeId) ?? candidates[0] ?? null;

  function navigate(candidateStoreId: string | null) {
    if (!candidateStoreId || candidateStoreId === active?.identity.candidateStoreId) return;
    if (editorDirty && !window.confirm("저장되지 않은 Draft 변경이 있습니다. 저장하지 않고 이동하시겠습니까?")) return;
    setEditorDirty(false);
    setActiveId(candidateStoreId);
  }

  return <div className="space-y-4">
    <section className="panel-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div><h2 className="font-bold">현장메모 일괄검토</h2><p className="text-xs text-slate-500">Raw와 Draft를 나란히 확인하고 Candidate별로만 승인합니다.</p></div>
        <label className="ml-auto flex items-center gap-2 text-xs">작업자 <input className="rounded border px-2 py-1" value={actor} onChange={(event) => onActorChange(event.target.value)} /></label>
        <a className="btn-secondary" href={`/tools/pork33-candidate-shortlist/preview?revision=${state.revision}`} target="_blank">PDF 미리보기 새로고침</a>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Progress label="전체" value={progress.total} /><Progress label="APPROVED" value={progress.approved} /><Progress label="REVIEWED" value={progress.reviewed} /><Progress label="DRAFT" value={progress.draft} />
        <Progress label="SHORTLIST" value={progress.shortlist} /><Progress label="KEEP" value={progress.keep} /><Progress label="HOLD" value={progress.hold} /><Progress label="DROP" value={progress.drop} />
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <select className="input" value={filter} onChange={(event) => setFilter(event.target.value as Pork33BulkReviewFilter)}>{PORK33_BULK_REVIEW_FILTERS.map((item) => <option key={item} value={item}>{reviewFilterLabels[item]}</option>)}</select>
        <select className="input" value={regionId} onChange={(event) => { setRegionId(event.target.value); setAreaId(""); }}><option value="">전체 Region</option>{state.regions.map((region) => <option key={region.regionId} value={region.regionId}>{region.label}</option>)}</select>
        <select className="input" value={areaId} onChange={(event) => setAreaId(event.target.value)}><option value="">전체 Apartment Area</option>{areas.map((area) => <option key={area.apartmentAreaId} value={area.apartmentAreaId}>{area.label}</option>)}</select>
      </div>
      {message && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">{message}</p>}
    </section>

    <div className="grid min-h-[720px] gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="panel-card max-h-[78vh] overflow-y-auto p-2">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white p-2 text-xs"><strong>Candidate {candidates.length}개</strong><span>{active ? candidates.findIndex((item) => item.identity.candidateStoreId === active.identity.candidateStoreId) + 1 : 0}/{candidates.length}</span></div>
        <div className="space-y-2">{candidates.map((candidate) => {
          const revision = getActivePork33Revision(candidate);
          const area = state.apartmentAreas.find((item) => item.apartmentAreaId === candidate.linkage.apartmentAreaId);
          return <button key={candidate.identity.candidateStoreId} className={`w-full rounded-xl border p-3 text-left ${active?.identity.candidateStoreId === candidate.identity.candidateStoreId ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`} onClick={() => navigate(candidate.identity.candidateStoreId)}>
            <div className="flex items-center justify-between gap-2"><strong>{candidate.identity.displayCode}</strong><span className="rounded bg-slate-100 px-2 py-1 text-[11px]">{revision?.status}</span></div>
            <p className="mt-1 truncate text-xs font-semibold">{area?.label}</p>
            <div className="mt-2 flex justify-between text-xs text-slate-600"><span>월세 {numberText(candidate.normalized.rent, "만원")}</span><span>{numberText(candidate.normalized.exclusiveArea, "평")}</span></div>
            <p className="mt-1 text-[11px] text-slate-500">Lifecycle · {candidate.normalized.reviewStatus}</p>
          </button>;
        })}</div>
        {candidates.length === 0 && <p className="p-8 text-center text-sm text-slate-500">필터에 맞는 Candidate가 없습니다.</p>}
      </aside>
      {active ? <BulkReviewEditor
        key={`${active.identity.candidateStoreId}:${getActivePork33Revision(active)?.revisionId ?? "none"}`}
        candidate={active}
        areaLabel={state.apartmentAreas.find((area) => area.apartmentAreaId === active.linkage.apartmentAreaId)?.label ?? "Apartment Area 확인 필요"}
        busy={busy}
        onDirtyChange={setEditorDirty}
        onCommand={onCommand}
        onPrevious={() => navigate(getAdjacentPork33CandidateId(candidates, active.identity.candidateStoreId, -1))}
        onNext={() => navigate(getAdjacentPork33CandidateId(candidates, active.identity.candidateStoreId, 1))}
        onApproveNext={() => {
          setEditorDirty(false);
          setActiveId(getAdjacentPork33CandidateId(candidates, active.identity.candidateStoreId, 1) ?? active.identity.candidateStoreId);
        }}
      /> : <section className="panel-card grid place-items-center p-10 text-sm text-slate-500">검토할 Candidate를 선택하세요.</section>}
    </div>
  </div>;
}
function BulkReviewEditor({ candidate, areaLabel, busy, onDirtyChange, onCommand, onPrevious, onNext, onApproveNext }: {
  candidate: Pork33CandidateState;
  areaLabel: string;
  busy: boolean;
  onDirtyChange(value: boolean): void;
  onCommand(value: ClientCommand): Promise<boolean>;
  onPrevious(): void;
  onNext(): void;
  onApproveNext(): void;
}) {
  const revision = getActivePork33Revision(candidate)!;
  const [payload, setPayload] = useState<FieldNoteStructuredContentV1>(() => structuredClone(revision.payload));
  const [lifecycle, setLifecycle] = useState<CandidateLifecycleStatus>(candidate.normalized.reviewStatus);
  const [reviewReason, setReviewReason] = useState(candidate.reviewReason ?? "");
  const dirty = JSON.stringify(payload) !== JSON.stringify(revision.payload);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function updatePayload(next: FieldNoteStructuredContentV1) {
    setPayload(next);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(revision.payload));
  }
  const list = (items: readonly string[]) => items.join("\n");
  const parse = (value: string) => value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).slice(0, 2);

  async function saveDraft() {
    if (!dirty) return true;
    const saved = await onCommand({ type: "SAVE_DRAFT", candidateStoreId: candidate.identity.candidateStoreId, payload });
    if (saved) onDirtyChange(false);
    return saved;
  }

  async function transition(targetStatus: "REVIEWED" | "APPROVED") {
    if (dirty && !await saveDraft()) return false;
    return onCommand({ type: "TRANSITION_DRAFT", candidateStoreId: candidate.identity.candidateStoreId, targetStatus });
  }

  async function approveAndNext() {
    if (!await transition("APPROVED")) return;
    onApproveNext();
  }

  return <section className="panel-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{candidate.identity.displayCode}</h2><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{revision.status}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{candidate.normalized.reviewStatus}</span></div><p className="mt-1 text-sm font-semibold">{areaLabel}</p><p className="mt-1 text-xs text-slate-500">{candidate.normalized.addressFull}</p></div>
      <div className="flex gap-2"><button className="btn-secondary" onClick={onPrevious}>이전 후보</button><button className="btn-secondary" onClick={onNext}>다음 후보</button></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><Progress label="면적" valueText={numberText(candidate.normalized.exclusiveArea, "평")} /><Progress label="보증금" valueText={numberText(candidate.normalized.deposit, "만원")} /><Progress label="월세" valueText={numberText(candidate.normalized.rent, "만원")} /><Progress label="유동" valueText={candidate.normalized.fieldFlowRating} /><Progress label="노출" valueText={candidate.normalized.fieldVisibilityRating} /></div>
    {candidate.normalized.geocodeStatus === "GEOCODE_REVIEW_REQUIRED" && <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">지도 위치 확인 필요 · P33-005는 기본 상세 화면의 수동 좌표 보정 UI에서 입력할 수 있습니다.</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div><h3 className="font-bold">A. 현장 원문</h3><p className="mt-1 text-xs text-slate-500">Source of Truth · 편집 불가</p><textarea readOnly className="input mt-2 min-h-72 bg-slate-50 leading-6" value={candidate.normalized.fieldNoteRaw} /></div>
      <div><div className="flex items-center justify-between"><div><h3 className="font-bold">B. 구조화 Draft 편집</h3><p className="mt-1 text-xs text-slate-500">새 숫자·매출 추정·근거 없는 최상급을 추가하지 마세요.</p></div>{dirty && <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">저장되지 않은 변경</span>}</div>
        <div className="mt-2 space-y-2"><BulkField label="입지요약" value={payload.locationSummary} onChange={(value) => updatePayload({ ...payload, locationSummary: value })} /><div className="grid gap-2 sm:grid-cols-2"><BulkField label="장점 · 최대 2개" value={list(payload.strengths)} onChange={(value) => updatePayload({ ...payload, strengths: parse(value) })} /><BulkField label="확인사항 · 최대 2개" value={list(payload.checks)} onChange={(value) => updatePayload({ ...payload, checks: parse(value) })} /><BulkField label="현장특이사항 · 최대 2개" value={list(payload.fieldObservations)} onChange={(value) => updatePayload({ ...payload, fieldObservations: parse(value) })} /></div><BulkField label="리포트 요약" value={payload.reportSummary} onChange={(value) => updatePayload({ ...payload, reportSummary: value })} /></div>
      </div>
    </div>
    <div className="mt-5 grid gap-4 border-t pt-4 lg:grid-cols-[1fr_1.2fr]">
      <div><h3 className="font-bold">C. Lifecycle Decision</h3><div className="mt-2 grid gap-2 sm:grid-cols-2"><select className="input" value={lifecycle} onChange={(event) => setLifecycle(event.target.value as CandidateLifecycleStatus)}>{(Object.keys(lifecycleLabels) as Array<keyof typeof lifecycleLabels>).map((status) => <option key={status} value={status}>{status} · {lifecycleLabels[status]}</option>)}</select><input className="input" value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="상태 사유 (선택)" /></div><button disabled={busy} className="btn-secondary mt-2" onClick={() => onCommand({ type: "UPDATE_CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId, patch: { reviewStatus: lifecycle, reviewReason } })}>상태/사유 저장</button><p className="mt-2 text-xs text-slate-500">Lifecycle은 Grade나 승인 상태로 자동 변경되지 않습니다.</p></div>
      <div><h3 className="font-bold">Revision Action</h3><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy || !dirty} className="btn-secondary" onClick={saveDraft}>수정 Draft 저장</button><button disabled={busy || revision.status !== "DRAFT"} className="btn-secondary" onClick={() => transition("REVIEWED")}>검토 완료</button><button disabled={busy || revision.status === "APPROVED"} className="btn-primary" onClick={() => transition("APPROVED")}>승인</button><button disabled={busy || revision.status === "APPROVED"} className="btn-primary bg-amber-500 text-slate-950" onClick={approveAndNext}>승인 후 다음</button></div><p className="mt-2 text-xs text-slate-500">일괄 자동승인은 제공하지 않습니다. Candidate 내용을 확인한 뒤 개별 승인하세요.</p></div>
    </div>
  </section>;
}
function Progress({ label, valueText }: { label: string; valueText: string }): React.ReactNode;
function Progress({ label, value }: { label: string; value: number }): React.ReactNode;
function Progress({ label, value, valueText }: { label: string; value?: number; valueText?: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-base font-bold">{valueText ?? value}</div></div>;
}
function BulkField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <label><span className="field-label">{label}</span><textarea className="input min-h-20" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
