"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getCandidatePhotoCategoryLabel, type CandidatePhotoMetadataV1 } from "@/lib/candidate-photo";
import type { CandidateLifecycleStatus } from "@/lib/candidate-screening/types";
import {
  filterAndOrderBriefingCandidates,
  getAdjacentPhotoId,
  getBriefingCandidatePhotos,
  getCandidateAreaMapPoints,
} from "@/lib/pork33-candidate-shortlist/photo-workspace";
import type { Pork33CandidatePhotoStateV1 } from "@/lib/pork33-candidate-shortlist/photo-types";
import type { Pork33ShortlistCommand, Pork33ShortlistStateV1 } from "@/lib/pork33-candidate-shortlist/types";
import { Pork33CandidateMap } from "./Pork33CandidateMap";

type ClientCommand = Pork33ShortlistCommand extends infer Command
  ? Command extends { actor: string } ? Omit<Command, "actor"> : never
  : never;
type BriefingBatchResult = {
  batchId: string;
  allPdfCount: number;
  regionPdfCount: number;
  candidatePdfCount: number;
  failed: Array<{ category: string; scopeId: string; message: string }>;
  files: Array<{ category: string; fileName: string; pageCount: number; downloadUrl: string }>;
};
type DecisionBatchResult = {
  batchId: string;
  sbizSnapshotSourceBatchId: string;
  allPdfCount: number;
  regionPdfCount: number;
  failed: Array<{ category: string; scopeId: string; message: string }>;
  files: Array<{ category: string; fileName: string; pageCount: number; downloadUrl: string }>;
};

const lifecycleOptions: CandidateLifecycleStatus[] = ["SHORTLIST", "KEEP", "REVIEW", "HOLD", "DROP"];
const lifecycleLabels: Record<string, string> = {
  SHORTLIST: "우선 후보", KEEP: "검토 유지", REVIEW: "추가 확인", HOLD: "보류", DROP: "제외",
};

function photoUrl(photo: CandidatePhotoMetadataV1) {
  return `/api/tools/pork33-candidate-shortlist/photos?${new URLSearchParams({ caseId: photo.caseId, candidateStoreId: photo.candidateStoreId, assetRef: photo.assetRef }).toString()}`;
}
function textNumber(value: number | null, suffix = "") { return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}${suffix}`; }
function money(value: number | null) { return textNumber(value, "만원"); }

export function Pork33BriefingWorkspace({
  state,
  photoState,
  busy,
  onCommand,
  onCompare,
}: {
  state: Pork33ShortlistStateV1;
  photoState: Pork33CandidatePhotoStateV1;
  busy: boolean;
  onCommand(value: ClientCommand): Promise<boolean>;
  onCompare(candidateStoreId: string): void;
}) {
  const [lifecycle, setLifecycle] = useState<"" | "SHORTLIST" | "KEEP">("");
  const [regionId, setRegionId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [candidateId, setCandidateId] = useState(state.candidates[0]?.identity.candidateStoreId ?? "");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [exportOptions, setExportOptions] = useState({ all: true, regions: true, candidates: true });
  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState<BriefingBatchResult | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionResult, setDecisionResult] = useState<DecisionBatchResult | null>(null);
  const [decisionMessage, setDecisionMessage] = useState("");
  const areas = state.apartmentAreas.filter((area) => !regionId || area.regionId === regionId);
  const candidates = useMemo(() => filterAndOrderBriefingCandidates(state, {
    lifecycleStatus: lifecycle || undefined,
    regionId: regionId || undefined,
    apartmentAreaId: areaId || undefined,
  }), [areaId, lifecycle, regionId, state]);
  const candidate = candidates.find((item) => item.identity.candidateStoreId === candidateId) ?? candidates[0] ?? null;
  const photos = useMemo(() => candidate ? getBriefingCandidatePhotos(photoState, candidate.identity.candidateStoreId) : [], [candidate, photoState]);
  const selectedPhoto = photos.find((photo) => photo.photoId === photoId) ?? photos[0] ?? null;
  const candidateIndex = candidate ? candidates.findIndex((item) => item.identity.candidateStoreId === candidate.identity.candidateStoreId) : -1;

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (event.key === "ArrowLeft") setPhotoId((current) => getAdjacentPhotoId(photos, current, "PREVIOUS"));
      if (event.key === "ArrowRight") setPhotoId((current) => getAdjacentPhotoId(photos, current, "NEXT"));
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [photos]);

  function moveCandidate(offset: number) {
    const next = candidates[candidateIndex + offset];
    if (!next) return;
    setCandidateId(next.identity.candidateStoreId);
    setPhotoId(null);
    setShowMap(false);
  }

  async function generateBriefingReports() {
    setExportBusy(true); setExportResult(null); setExportMessage("본사 브리핑 PDF를 생성 중입니다. 창을 닫지 마세요.");
    try {
      const response = await fetch("/api/tools/pork33-candidate-shortlist/briefing-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exportOptions) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "본사 브리핑 PDF를 생성하지 못했습니다.");
      setExportResult(payload); setExportMessage("본사 브리핑 PDF 생성을 완료했습니다.");
    } catch (error) { setExportMessage(error instanceof Error ? error.message : "본사 브리핑 PDF를 생성하지 못했습니다."); }
    finally { setExportBusy(false); }
  }

  async function generateDecisionReports() {
    setDecisionBusy(true); setDecisionResult(null); setDecisionMessage("의사결정 리포트 V2를 생성 중입니다. 창을 닫지 마세요.");
    try {
      const response = await fetch("/api/tools/pork33-candidate-shortlist/decision-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true, regions: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "의사결정 리포트 V2를 생성하지 못했습니다.");
      setDecisionResult(payload); setDecisionMessage("의사결정 리포트 V2 생성을 완료했습니다.");
    } catch (error) { setDecisionMessage(error instanceof Error ? error.message : "의사결정 리포트 V2를 생성하지 못했습니다."); }
    finally { setDecisionBusy(false); }
  }

  return <div className="space-y-4">
    <section className="rounded-2xl bg-[#123C35] p-4 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <div><p className="text-xs font-bold tracking-[0.2em] text-amber-300">PORK33 · BRIEFING WORKSPACE</p><h2 className="mt-1 text-xl font-bold">본사 후보점포 브리핑</h2></div>
        <select className="ml-auto rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm" value={lifecycle} onChange={(event) => setLifecycle(event.target.value as typeof lifecycle)}><option className="text-slate-900" value="">전체 Lifecycle</option><option className="text-slate-900" value="SHORTLIST">SHORTLIST</option><option className="text-slate-900" value="KEEP">KEEP</option></select>
        <select className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm" value={regionId} onChange={(event) => { setRegionId(event.target.value); setAreaId(""); }}><option className="text-slate-900" value="">전체 Region</option>{state.regions.map((region) => <option className="text-slate-900" key={region.regionId} value={region.regionId}>{region.label}</option>)}</select>
        <select className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm" value={areaId} onChange={(event) => setAreaId(event.target.value)}><option className="text-slate-900" value="">전체 Apartment Area</option>{areas.map((area) => <option className="text-slate-900" key={area.apartmentAreaId} value={area.apartmentAreaId}>{area.label}</option>)}</select>
        <span className="text-sm font-bold">{candidates.length}개</span>
      </div>
    </section>

    <section className="panel-card p-4">
      <div className="flex flex-wrap items-center gap-4"><div><h3 className="font-bold">PORK33 본사 브리핑 PDF</h3><p className="mt-1 text-xs text-slate-500">Region Overview · Candidate Summary · 실제 사진이 있는 Candidate만 Field Photo</p></div><a className="btn-secondary ml-auto" href="/tools/pork33-candidate-shortlist/briefing-preview" target="_blank">본사 브리핑 Preview</a><button className="btn-primary" disabled={exportBusy || !Object.values(exportOptions).some(Boolean)} onClick={generateBriefingReports}>{exportBusy ? "본사 브리핑 생성 중…" : "PORK33 본사 브리핑 PDF 생성"}</button></div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={exportOptions.all} onChange={(event) => setExportOptions((current) => ({ ...current, all: event.target.checked }))} />전체 통합본</label><label className="flex items-center gap-2"><input type="checkbox" checked={exportOptions.regions} onChange={(event) => setExportOptions((current) => ({ ...current, regions: event.target.checked }))} />지역별</label><label className="flex items-center gap-2"><input type="checkbox" checked={exportOptions.candidates} onChange={(event) => setExportOptions((current) => ({ ...current, candidates: event.target.checked }))} />후보별</label></div>
      {exportMessage && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{exportMessage}</p>}
      {exportResult && <div className="mt-3 rounded-xl border border-slate-200 p-3 text-xs"><p className="font-bold">Batch {exportResult.batchId} · 전체 {exportResult.allPdfCount} · Region {exportResult.regionPdfCount} · Candidate {exportResult.candidatePdfCount} · 실패 {exportResult.failed.length}</p><div className="mt-2 flex flex-wrap gap-2">{exportResult.files.map((file) => <a className="btn-secondary" key={`${file.category}-${file.fileName}`} href={file.downloadUrl}>{file.category} · {file.fileName} ({file.pageCount}p)</a>)}</div>{exportResult.failed.length > 0 && <ul className="mt-2 text-red-700">{exportResult.failed.map((failure) => <li key={`${failure.category}-${failure.scopeId}`}>{failure.category} · {failure.scopeId}: {failure.message}</li>)}</ul>}</div>}
    </section>

    <section className="panel-card border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center gap-4"><div><h3 className="font-bold">PORK33 의사결정 리포트 V2</h3><p className="mt-1 text-xs text-slate-500">Region Demand · Apartment Area Analysis · Candidate Compare · 기존 V1 상세페이지 재사용</p></div><a className="btn-secondary ml-auto" href="/tools/pork33-candidate-shortlist/decision-preview" target="_blank">V2 Web Preview</a><button className="btn-primary" disabled={decisionBusy} onClick={generateDecisionReports}>{decisionBusy ? "V2 생성 중…" : "PORK33 의사결정 리포트 V2 생성"}</button></div>
      <p className="mt-3 text-xs text-slate-600">전체 통합본 1개와 Region별 5개를 생성합니다. SBIZ365는 완료된 V1 Snapshot을 재사용합니다.</p>
      {decisionMessage && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{decisionMessage}</p>}
      {decisionResult && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs"><p className="font-bold">Batch {decisionResult.batchId} · 전체 {decisionResult.allPdfCount} · Region {decisionResult.regionPdfCount} · 실패 {decisionResult.failed.length}</p><p className="mt-1 text-slate-500">SBIZ365 Snapshot source: {decisionResult.sbizSnapshotSourceBatchId}</p><div className="mt-2 flex flex-wrap gap-2">{decisionResult.files.map((file) => <a className="btn-secondary" key={`${file.category}-${file.fileName}`} href={file.downloadUrl}>{file.category} · {file.fileName} ({file.pageCount}p)</a>)}</div>{decisionResult.failed.length > 0 && <ul className="mt-2 text-red-700">{decisionResult.failed.map((failure) => <li key={`${failure.category}-${failure.scopeId}`}>{failure.category} · {failure.scopeId}: {failure.message}</li>)}</ul>}</div>}
    </section>

    {!candidate ? <div className="panel-card p-12 text-center text-slate-500">선택한 조건에 맞는 Candidate가 없습니다.</div> : <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid min-h-[680px] xl:grid-cols-[minmax(0,1.65fr)_420px]">
          <div className="flex min-w-0 flex-col bg-[#F4F1E8] p-6">
            <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold tracking-widest text-emerald-800">{candidate.identity.displayCode}</p><h3 className="mt-1 text-2xl font-bold text-slate-900">{candidate.normalized.mainApartmentRaw}</h3></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-900">{lifecycleLabels[candidate.normalized.reviewStatus] ?? candidate.normalized.reviewStatus}</span></div>
            {selectedPhoto ? <>
              <div className="relative min-h-[500px] flex-1 overflow-hidden rounded-2xl bg-slate-950"><Image src={photoUrl(selectedPhoto)} alt={`${candidate.identity.displayCode} 현장사진`} fill sizes="(min-width: 1280px) 65vw, 100vw" className="object-contain" unoptimized /></div>
              <div className="mt-3 rounded-xl bg-white p-4"><div className="flex items-center justify-between"><strong>{getCandidatePhotoCategoryLabel(selectedPhoto.category)}</strong><span className="text-sm font-bold">{photos.findIndex((photo) => photo.photoId === selectedPhoto.photoId) + 1} / {photos.length}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedPhoto.fieldMemoRaw || "사진 현장메모 없음"}</p></div>
              <div className="mt-3 flex items-center gap-2"><button className="btn-secondary" onClick={() => setPhotoId(getAdjacentPhotoId(photos, selectedPhoto.photoId, "PREVIOUS"))}>이전 사진</button><div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">{photos.map((photo, index) => <button key={photo.photoId} className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 ${photo.photoId === selectedPhoto.photoId ? "border-amber-500" : "border-white"}`} onClick={() => setPhotoId(photo.photoId)}><Image src={photoUrl(photo)} alt={`썸네일 ${index + 1}`} fill sizes="112px" className="object-cover" unoptimized /></button>)}</div><button className="btn-secondary" onClick={() => setPhotoId(getAdjacentPhotoId(photos, selectedPhoto.photoId, "NEXT"))}>다음 사진</button></div>
            </> : <div className="grid min-h-[560px] flex-1 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white/70 p-10 text-center"><div><div className="text-6xl text-slate-300">▧</div><h3 className="mt-4 text-xl font-bold">등록된 현장사진이 없습니다</h3><p className="mt-2 text-sm text-slate-500">사진관리 모드에서 Candidate 사진을 등록할 수 있습니다.</p></div></div>}
          </div>
          <CandidatePanel state={state} candidateId={candidate.identity.candidateStoreId} busy={busy} showMap={showMap} onToggleMap={() => setShowMap((value) => !value)} onCommand={onCommand} onCompare={onCompare} />
        </div>
        <footer className="flex items-center justify-between border-t bg-white px-6 py-4"><button disabled={candidateIndex <= 0} className="btn-secondary" onClick={() => moveCandidate(-1)}>← 이전 후보</button><span className="text-sm font-bold">{candidateIndex + 1} / {candidates.length}</span><button disabled={candidateIndex < 0 || candidateIndex >= candidates.length - 1} className="btn-primary" onClick={() => moveCandidate(1)}>다음 후보 →</button></footer>
      </section>
    </>}
  </div>;
}
function CandidatePanel({ state, candidateId, busy, showMap, onToggleMap, onCommand, onCompare }: {
  state: Pork33ShortlistStateV1;
  candidateId: string;
  busy: boolean;
  showMap: boolean;
  onToggleMap(): void;
  onCommand(value: ClientCommand): Promise<boolean>;
  onCompare(candidateStoreId: string): void;
}) {
  const candidate = state.candidates.find((item) => item.identity.candidateStoreId === candidateId)!;
  const area = state.apartmentAreas.find((item) => item.apartmentAreaId === candidate.linkage.apartmentAreaId);
  const region = state.regions.find((item) => item.regionId === candidate.linkage.regionId);
  const approved = [...candidate.contentRevisions].reverse().find((revision) => revision.status === "APPROVED");
  const n = candidate.normalized;
  const mapPoints = getCandidateAreaMapPoints(state, candidateId);
  return <aside className="space-y-5 overflow-y-auto bg-white p-6">
    <div><p className="text-xs font-bold text-emerald-800">{region?.label ?? "Region 확인 필요"}</p><h3 className="mt-1 text-2xl font-bold">{candidate.identity.displayCode}</h3><p className="mt-1 text-sm text-slate-500">{area?.label ?? "Apartment Area 확인 필요"}</p></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{[["주소", n.addressFull], ["면적", textNumber(n.exclusiveArea, "평")], ["보증금", money(n.deposit)], ["월세", money(n.rent)], ["관리비", money(n.maintenance)], ["권리금", money(n.premium)], ["기존 조사 배후값", textNumber(n.existingHouseholdReference, "세대")], ["유동 / 노출", `${n.fieldFlowRating} / ${n.fieldVisibilityRating}`], ["Site Grade", n.siteGrade ?? "확인 필요"]].map(([label, value], index) => <div key={`${label}-${index}`} className={label === "주소" ? "col-span-2" : ""}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-900">{value}</dd></div>)}</dl>
    <label><span className="field-label">Lifecycle</span><select disabled={busy} className="input" value={n.reviewStatus} onChange={(event) => void onCommand({ type: "UPDATE_CANDIDATE", candidateStoreId: candidateId, patch: { reviewStatus: event.target.value as CandidateLifecycleStatus } })}>{lifecycleOptions.map((item) => <option key={item} value={item}>{item} · {lifecycleLabels[item]}</option>)}</select></label>
    <div className="rounded-xl bg-[#F2F7F5] p-4"><h4 className="font-bold">Approved 현장요약</h4>{approved ? <><p className="mt-2 text-sm leading-6">{approved.payload.reportSummary}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><BriefList label="장점" items={approved.payload.strengths.slice(0, 2)} /><BriefList label="확인사항" items={approved.payload.checks.slice(0, 2)} /></div></> : <p className="mt-2 text-sm text-amber-800">현장메모 검토 필요</p>}</div>
    <div className="grid grid-cols-2 gap-2"><button className="btn-secondary" onClick={onToggleMap}>{showMap ? "지도 닫기" : "지도 보기"}</button><button className="btn-secondary" onClick={() => onCompare(candidateId)}>같은 상권 비교</button></div>
    {n.geocodeStatus !== "RESOLVED" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">지도 위치 확인 필요 · 가짜 좌표를 사용하지 않습니다.</p>}
    {showMap && <div><Pork33CandidateMap points={mapPoints} /></div>}
    <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-bold text-slate-600">내부용 Raw 현장메모 보기</summary><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{n.fieldNoteRaw}</p></details>
  </aside>;
}
function BriefList({ label, items }: { label: string; items: readonly string[] }) {
  return <div><p className="text-xs font-bold text-slate-500">{label}</p>{items.length ? <ul className="mt-1 space-y-1 text-sm">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-1 text-sm text-slate-400">없음</p>}</div>;
}
