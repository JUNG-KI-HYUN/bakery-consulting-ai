"use client";

import { useMemo, useState } from "react";
import { CANDIDATE_LIFECYCLE_STATUSES, type CandidateLifecycleStatus } from "@/lib/candidate-screening/types";
import { getActiveCandidatePhotos, getSameApartmentAreaCandidateIds } from "@/lib/pork33-candidate-shortlist/photo-workspace";
import type { Pork33CandidatePhotoCommand, Pork33CandidatePhotoStateV1 } from "@/lib/pork33-candidate-shortlist/photo-types";
import { filterPork33Candidates, getActivePork33Revision } from "@/lib/pork33-candidate-shortlist/state";
import type { FieldNoteStructuredContentV1 } from "@/lib/derived-content/types";
import type { Pork33CandidateState, Pork33ShortlistCommand, Pork33ShortlistStateV1 } from "@/lib/pork33-candidate-shortlist/types";
import { buildPork33RegionMapPoints } from "@/lib/pork33-candidate-shortlist/report";
import { buildPork33LocalityMapPoints, groupPork33CandidatesByLocality } from "@/lib/pork33-candidate-shortlist/locality";
import { Pork33BriefingWorkspace } from "./Pork33BriefingWorkspace";
import { Pork33BulkReview } from "./Pork33BulkReview";
import { Pork33CandidateMap } from "./Pork33CandidateMap";
import { Pork33PhotoManager } from "./Pork33PhotoManager";

type ClientCommand = Pork33ShortlistCommand extends infer Command
  ? Command extends { actor: string } ? Omit<Command, "actor"> : never
  : never;
type PhotoClientCommand = Pork33CandidatePhotoCommand extends infer Command
  ? Command extends { actor: string } ? Omit<Command, "actor"> : never
  : never;
type BatchResult = { batchId: string; candidatePdfCount: number; localityPdfCount: number; regionPdfCount: number; allPdfCount: number; skippedCandidateIds: Array<{ candidateId: string; reason: string }>; failed: Array<{ scopeType: string; scopeId: string; message: string }>; files: Array<{ category: string; fileName: string; downloadUrl: string }> };

const lifecycleLabels: Record<CandidateLifecycleStatus, string> = {
  DISCOVERED: "후보 등록", FIELD_REVIEWED: "현장 확인", KEEP: "검토 유지", REVIEW: "추가 확인",
  SHORTLIST: "우선 검토", HOLD: "보류", DROP: "제외",
};

function numberText(value: number | null, suffix = "") { return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}${suffix}`; }
function money(value: number | null) { return numberText(value, "만원"); }
function activeRevision(candidate: Pork33CandidateState) { return getActivePork33Revision(candidate); }

export function Pork33CandidateShortlistClient({ initialState, initialPhotoState }: { initialState: Pork33ShortlistStateV1; initialPhotoState: Pork33CandidatePhotoStateV1 }) {
  const [state, setState] = useState(initialState);
  const [photoState, setPhotoState] = useState(initialPhotoState);
  const [selectedId, setSelectedId] = useState(initialState.candidates[0]?.identity.candidateStoreId ?? "");
  const [regionId, setRegionId] = useState("");
  const [localityKey, setLocalityKey] = useState("");
  const [areaId, setAreaId] = useState("");
  const [status, setStatus] = useState<"" | CandidateLifecycleStatus>("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"SOURCE" | "RENT" | "AREA" | "STATUS">("SOURCE");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [actor, setActor] = useState("FRAMEONE reviewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [mode, setMode] = useState<"SHORTLIST" | "COMPARE" | "BULK_REVIEW" | "PHOTO_MANAGER" | "BRIEFING">("SHORTLIST");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  const localityGroups = useMemo(() => groupPork33CandidatesByLocality(state), [state]);
  const localities = useMemo(() => localityGroups.filter((group) => !regionId || group.candidates.some((candidate) => candidate.linkage.regionId === regionId)), [localityGroups, regionId]);
  const localityCandidateIds = useMemo(() => new Set(localityGroups.find((group) => group.localityKey === localityKey)?.candidates.map((candidate) => candidate.identity.candidateStoreId) ?? []), [localityGroups, localityKey]);
  const areas = useMemo(() => state.apartmentAreas.filter((area) => (!regionId || area.regionId === regionId) && (!localityKey || localityGroups.find((group) => group.localityKey === localityKey)?.apartmentAreaIds.includes(area.apartmentAreaId))), [localityGroups, localityKey, regionId, state.apartmentAreas]);
  const filtered = useMemo(() => {
    const items = filterPork33Candidates(state.candidates, { query, regionId, apartmentAreaId: areaId, lifecycleStatus: status || undefined }).filter((candidate) => !localityKey || localityCandidateIds.has(candidate.identity.candidateStoreId));
    return [...items].sort((a, b) => sort === "RENT" ? (a.normalized.rent ?? Infinity) - (b.normalized.rent ?? Infinity)
      : sort === "AREA" ? (a.normalized.exclusiveArea ?? Infinity) - (b.normalized.exclusiveArea ?? Infinity)
      : sort === "STATUS" ? a.normalized.reviewStatus.localeCompare(b.normalized.reviewStatus)
      : a.source.sourceRowOrder - b.source.sourceRowOrder);
  }, [areaId, localityCandidateIds, localityKey, query, regionId, sort, state.candidates, status]);
  const selected = filtered.find((candidate) => candidate.identity.candidateStoreId === selectedId) ?? filtered[0] ?? null;
  const compare = compareIds.map((id) => state.candidates.find((candidate) => candidate.identity.candidateStoreId === id)).filter(Boolean) as Pork33CandidateState[];
  const mapCandidates = regionId ? state.candidates.filter((candidate) => candidate.linkage.regionId === regionId && (!areaId || candidate.linkage.apartmentAreaId === areaId)) : filtered;
  const mapPoints = localityKey ? buildPork33LocalityMapPoints(state, localityKey, selected?.identity.candidateStoreId) : regionId ? buildPork33RegionMapPoints(state, regionId, areaId, selected?.identity.candidateStoreId) : mapCandidates.flatMap((candidate) => candidate.normalized.latitude !== null && candidate.normalized.longitude !== null ? [{
    candidateStoreId: candidate.identity.candidateStoreId,
    label: candidate.identity.displayCode,
    lat: candidate.normalized.latitude,
    lng: candidate.normalized.longitude,
    selected: candidate.identity.candidateStoreId === selected?.identity.candidateStoreId,
    address: candidate.normalized.addressFull,
    apartmentArea: state.apartmentAreas.find((area) => area.apartmentAreaId === candidate.linkage.apartmentAreaId)?.label ?? "Apartment Area 확인 필요",
    area: numberText(candidate.normalized.exclusiveArea, "평"),
    rent: money(candidate.normalized.rent),
    mainApartment: candidate.normalized.mainApartmentRaw,
  }] : []);
  const distributions = Object.fromEntries(CANDIDATE_LIFECYCLE_STATUSES.map((item) => [item, state.candidates.filter((candidate) => candidate.normalized.reviewStatus === item).length]));
  const approvedCount = state.candidates.filter((candidate) => activeRevision(candidate)?.status === "APPROVED").length;

  async function command(value: ClientCommand) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/tools/pork33-candidate-shortlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...value, actor }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "저장하지 못했습니다.");
      setState(payload); setMessage("새 Snapshot으로 저장했습니다."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  }

  async function reload() {
    const [stateResponse, photoResponse] = await Promise.all([
      fetch("/api/tools/pork33-candidate-shortlist", { cache: "no-store" }),
      fetch("/api/tools/pork33-candidate-shortlist/photos", { cache: "no-store" }),
    ]);
    if (stateResponse.ok) setState(await stateResponse.json());
    if (photoResponse.ok) setPhotoState(await photoResponse.json());
  }

  async function photoCommand(value: PhotoClientCommand) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/tools/pork33-candidate-shortlist/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...value, actor }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Photo Metadata를 저장하지 못했습니다.");
      setPhotoState(payload); setMessage("새 Photo Snapshot으로 저장했습니다."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Photo Metadata를 저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  }

  function openSameAreaCompare(candidateStoreId: string) {
    const candidate = state.candidates.find((item) => item.identity.candidateStoreId === candidateStoreId);
    if (!candidate) return;
    setRegionId(candidate.linkage.regionId);
    setLocalityKey("");
    setAreaId(candidate.linkage.apartmentAreaId);
    setCompareIds([...getSameApartmentAreaCandidateIds(state, candidateStoreId)].slice(0, 4));
    setMode("COMPARE");
  }

  function selectFromMap(candidateStoreId: string) {
    setSelectedId(candidateStoreId);
    window.setTimeout(() => document.getElementById(`candidate-card-${candidateStoreId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  async function generateBatch() {
    setBatchBusy(true); setBatchResult(null); setMessage("PORK33 전체 산출물을 생성 중입니다. 창을 닫지 마세요.");
    try {
      const response = await fetch("/api/tools/pork33-candidate-shortlist/batch-export", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Batch PDF를 생성하지 못했습니다.");
      setBatchResult(payload); setMessage("PORK33 전체 산출물 생성을 완료했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Batch PDF를 생성하지 못했습니다."); }
    finally { setBatchBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-[#0B1220] p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold tracking-[0.2em] text-amber-300">FRAMEONE · INTERNAL REVIEW TOOL</p><h1 className="mt-2 text-2xl font-bold">PORK33 후보점포 Shortlist</h1><p className="mt-2 text-sm text-slate-300">현장조사 및 사용자 제공 매물자료 기준 · 평균값/가짜 좌표 미사용</p></div>
          <div className="flex flex-wrap gap-2"><a className="btn-secondary bg-white" href="/tools/store-development-report">FRAMEONE 보고서 센터에서 열기</a><button disabled={batchBusy} className="btn-primary bg-amber-500 text-slate-950" onClick={generateBatch}>{batchBusy ? "전체 산출물 생성 중…" : "PORK33 전체 산출물 생성"}</button><a className="btn-secondary bg-white" href="/tools/pork33-candidate-shortlist/preview" target="_blank">ALL PDF Preview</a><a className="btn-secondary bg-white" href="/api/tools/pork33-candidate-shortlist/export?scopeType=ALL">ALL 27 PDF</a></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4"><Metric label="전체 Candidate" value={state.candidates.length} /><Metric label="Region" value={state.regions.length} /><Metric label="Apartment Area" value={state.apartmentAreas.length} /><Metric label="승인 현장요약" value={`${approvedCount}/${state.candidates.length}`} /></div>
      </header>

      <nav className="panel-card flex flex-wrap gap-2 p-2" aria-label="PORK33 Tool mode">
        <button className={mode === "SHORTLIST" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("SHORTLIST")}>후보목록</button>
        <button className={mode === "COMPARE" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("COMPARE")}>후보비교</button>
        <button className={mode === "BULK_REVIEW" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("BULK_REVIEW")}>현장메모 일괄검토</button>
        <button className={mode === "PHOTO_MANAGER" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("PHOTO_MANAGER")}>사진관리</button>
        <button className={mode === "BRIEFING" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("BRIEFING")}>브리핑</button>
      </nav>

      {mode === "BULK_REVIEW" ? (
        <Pork33BulkReview state={state} busy={busy} message={message} actor={actor} onActorChange={setActor} onCommand={command} />
      ) : mode === "PHOTO_MANAGER" ? (
        <Pork33PhotoManager state={state} photoState={photoState} busy={busy} message={message} actor={actor} onActorChange={setActor} onPhotoCommand={photoCommand} />
      ) : mode === "BRIEFING" ? (
        <Pork33BriefingWorkspace state={state} photoState={photoState} busy={busy} onCommand={command} onCompare={openSameAreaCompare} />
      ) : <>

      <section className="panel-card p-4">
        <div className="grid gap-3 lg:grid-cols-6">
          <input className="input lg:col-span-2" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="주소·아파트·메모 검색" />
          <select className="input" value={regionId} onChange={(event) => { setRegionId(event.target.value); setLocalityKey(""); setAreaId(""); }}><option value="">전체 Region</option>{state.regions.map((region) => <option key={region.regionId} value={region.regionId}>{region.label}</option>)}</select>
          <select className="input" value={localityKey} onChange={(event) => { setLocalityKey(event.target.value); setAreaId(""); }}><option value="">전체 동/읍</option>{localities.map((locality) => <option key={locality.localityKey} value={locality.localityKey}>{locality.label} ({locality.candidates.length})</option>)}</select>
          <select className="input" value={areaId} onChange={(event) => setAreaId(event.target.value)}><option value="">전체 Apartment Area</option>{areas.map((area) => <option key={area.apartmentAreaId} value={area.apartmentAreaId}>{area.label}</option>)}</select>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">전체 검토 상태</option>{CANDIDATE_LIFECYCLE_STATUSES.map((item) => <option key={item} value={item}>{lifecycleLabels[item]} ({distributions[item]})</option>)}</select>
          <select className="input" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="SOURCE">원본 행 순서</option><option value="RENT">월세</option><option value="AREA">면적</option><option value="STATUS">검토 상태</option></select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-bold">결과 {filtered.length}개</span>{regionId && <><a className="btn-secondary" target="_blank" href={`/tools/pork33-candidate-shortlist/preview?scopeType=REGION&regionId=${encodeURIComponent(regionId)}`}>현재 Region Preview</a><a className="btn-secondary" href={`/api/tools/pork33-candidate-shortlist/export?scopeType=REGION&regionId=${encodeURIComponent(regionId)}`}>현재 Region PDF</a></>}{localityKey && <><a className="btn-secondary" target="_blank" href={`/tools/pork33-candidate-shortlist/preview?scopeType=LOCALITY&localityKey=${encodeURIComponent(localityKey)}`}>현재 동/읍 Preview</a><a className="btn-secondary" href={`/api/tools/pork33-candidate-shortlist/export?scopeType=LOCALITY&localityKey=${encodeURIComponent(localityKey)}`}>현재 동/읍 PDF</a></>}{selected && <><a className="btn-secondary" target="_blank" href={`/tools/pork33-candidate-shortlist/preview?scopeType=CANDIDATE&candidateStoreId=${encodeURIComponent(selected.identity.candidateStoreId)}`}>{selected.identity.displayCode} Preview</a><a className="btn-secondary" href={`/api/tools/pork33-candidate-shortlist/export?scopeType=CANDIDATE&candidateStoreId=${encodeURIComponent(selected.identity.candidateStoreId)}`}>Candidate PDF</a></>}<label className="ml-auto flex items-center gap-2">작업자 <input className="rounded border px-2 py-1" value={actor} onChange={(event) => setActor(event.target.value)} /></label><button className="btn-secondary" onClick={reload}>Reload</button><button className="btn-secondary" onClick={() => setShowAudit((value) => !value)}>Source Audit</button><button disabled={busy} className="btn-primary" onClick={() => command({ type: "GEOCODE_ALL_PENDING" })}>미확인 주소 일괄 Geocode</button></div>
        {message && <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">{message}</p>}
      </section>

      {batchResult && <BatchResultPanel result={batchResult} />}

      {mode === "SHORTLIST" && showAudit && <SourceAudit state={state} />}

      {mode === "SHORTLIST" ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
        <section className="space-y-3">
          {filtered.map((candidate) => <CandidateCard key={candidate.identity.candidateStoreId} candidate={candidate} photoCount={getActiveCandidatePhotos(photoState, candidate.identity.candidateStoreId).length} selected={selected?.identity.candidateStoreId === candidate.identity.candidateStoreId} compared={compareIds.includes(candidate.identity.candidateStoreId)} onSelect={() => setSelectedId(candidate.identity.candidateStoreId)} onCompare={() => setCompareIds((ids) => ids.includes(candidate.identity.candidateStoreId) ? ids.filter((id) => id !== candidate.identity.candidateStoreId) : ids.length < 4 ? [...ids, candidate.identity.candidateStoreId] : ids)} />)}
          {filtered.length === 0 && <div className="panel-card p-10 text-center text-sm text-slate-500">조건에 맞는 Candidate가 없습니다.</div>}
        </section>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div><h2 className="mb-2 text-sm font-bold">{localityKey ? `${localityGroups.find((group) => group.localityKey === localityKey)?.label} 동/읍 Map` : regionId ? `${state.regions.find((region) => region.regionId === regionId)?.label} Region Map` : "Filtered Candidate Map"}</h2><Pork33CandidateMap points={mapPoints} onSelectCandidate={selectFromMap} /></div>
          {selected && <CandidateEditor key={`${selected.identity.candidateStoreId}:${activeRevision(selected)?.revisionId ?? "none"}`} candidate={selected} busy={busy} onCommand={command} />}
        </aside>
      </div> : <div className="space-y-4">
        <ComparePicker candidates={filtered} selectedIds={compareIds} state={state} onToggle={(id) => setCompareIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : ids.length < 4 ? [...ids, id] : ids)} />
        <ComparePanel candidates={compare} state={state} onRemove={(id) => setCompareIds((ids) => ids.filter((item) => item !== id))} />
      </div>}
      </>}
    </div>
  );
}
function BatchResultPanel({ result }: { result: BatchResult }) {
  const groups = ["candidate", "locality", "region", "all"] as const;
  const labels = { candidate: "Candidate PDF", locality: "동/읍 PDF", region: "Region PDF", all: "전체 PDF" };
  return <section className="panel-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">PORK33 전체 산출물 생성 완료</h2><p className="text-xs text-slate-500">Batch {result.batchId} · 내부 경로는 브라우저에 노출하지 않습니다.</p></div><div className="flex flex-wrap gap-2 text-sm font-bold"><span>후보 {result.candidatePdfCount}</span><span>동/읍 {result.localityPdfCount}</span><span>Region {result.regionPdfCount}</span><span>전체 {result.allPdfCount}</span></div></div>{result.skippedCandidateIds.length > 0 && <div className="mt-3 rounded bg-amber-50 p-3 text-xs text-amber-900">제외: {result.skippedCandidateIds.map((item) => `${item.candidateId} (${item.reason})`).join(" · ")}</div>}{result.failed.length > 0 && <div className="mt-3 rounded bg-red-50 p-3 text-xs text-red-800">실패: {result.failed.map((item) => `${item.scopeType}/${item.scopeId}: ${item.message}`).join(" · ")}</div>}<div className="mt-4 grid gap-4 xl:grid-cols-4">{groups.map((category) => <div key={category}><h3 className="mb-2 text-sm font-bold">{labels[category]}</h3><div className="max-h-64 space-y-1 overflow-auto">{result.files.filter((file) => file.category === category).map((file) => <a key={`${category}-${file.fileName}`} className="block truncate rounded border border-slate-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50" href={file.downloadUrl}>{file.fileName}</a>)}</div></div>)}</div></section>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-white/10 p-3"><div className="text-xs text-slate-300">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>; }

function CandidateCard({ candidate, photoCount, selected, compared, onSelect, onCompare }: { candidate: Pork33CandidateState; photoCount: number; selected: boolean; compared: boolean; onSelect(): void; onCompare(): void }) {
  const revision = activeRevision(candidate);
  return <article id={`candidate-card-${candidate.identity.candidateStoreId}`} className={`panel-card p-4 ${selected ? "ring-2 ring-amber-400" : ""}`}>
    <div className="flex items-start gap-3"><button className="min-w-0 flex-1 text-left" onClick={onSelect}><div className="flex flex-wrap items-center gap-2"><strong>{candidate.identity.displayCode}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{lifecycleLabels[candidate.normalized.reviewStatus]}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{revision?.status ?? "현장메모 검토 필요"}</span></div><p className="mt-2 font-semibold">{candidate.normalized.displayLocation}</p><p className="mt-1 text-xs text-slate-500">{candidate.normalized.addressFull}</p></button><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={compared} onChange={onCompare} /> 비교</label></div>
    <div className="mt-3 grid grid-cols-4 gap-2 text-xs"><Value label="면적" value={numberText(candidate.normalized.exclusiveArea, "평")} /><Value label="보증금" value={money(candidate.normalized.deposit)} /><Value label="월세" value={money(candidate.normalized.rent)} /><Value label="권리금" value={money(candidate.normalized.premium)} /></div>
    <p className="mt-3 text-sm"><strong>{candidate.normalized.mainApartmentRaw}</strong> · 기존 조사 기재값 {numberText(candidate.normalized.existingHouseholdReference, "세대")} · 현장사진 {photoCount}장</p>
    <p className="mt-2 text-xs text-slate-600">{revision?.status === "APPROVED" ? revision.payload.reportSummary : "Approved 현장요약 없음 · 현장메모 검토 필요"}</p>
  </article>;
}
function Value({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">{label}</div><div className="mt-1 font-bold">{value}</div></div>; }

function CandidateEditor({ candidate, busy, onCommand }: { candidate: Pork33CandidateState; busy: boolean; onCommand(value: ClientCommand): Promise<boolean> }) {
  const n = candidate.normalized;
  const revision = activeRevision(candidate)!;
  const [form, setForm] = useState(() => ({ addressFull: n.addressFull, addressForGeocode: n.addressForGeocode ?? "", displayLocation: n.displayLocation, floor: n.floor ?? "", exclusiveArea: n.exclusiveArea?.toString() ?? "", deposit: n.deposit?.toString() ?? "", rent: n.rent?.toString() ?? "", maintenance: n.maintenance?.toString() ?? "", premium: n.premium?.toString() ?? "", currentOccupancyStatus: n.currentOccupancyStatus ?? "", mainApartmentRaw: n.mainApartmentRaw, existingHouseholdReference: n.existingHouseholdReference?.toString() ?? "", latitude: n.latitude?.toString() ?? "", longitude: n.longitude?.toString() ?? "" }));
  const [payload, setPayload] = useState<FieldNoteStructuredContentV1>(revision.payload);
  const numeric = (value: string) => value.trim() === "" ? null : Number(value);
  return <section className="panel-card max-h-[70vh] overflow-y-auto p-4">
    <div className="flex items-center justify-between"><h2 className="font-bold">{candidate.identity.displayCode} Detail / Edit</h2><span className="text-xs text-slate-500">Snapshot r{candidate.contentRevisions.length}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{([['addressFull','원본 표시 주소'],['addressForGeocode','Geocode 주소'],['displayLocation','표시 위치'],['floor','층'],['exclusiveArea','면적(평)'],['deposit','보증금(만원)'],['rent','월세(만원)'],['maintenance','관리비(만원)'],['premium','권리금(만원)'],['currentOccupancyStatus','입점 상태'],['mainApartmentRaw','주요 아파트'],['existingHouseholdReference','기존 기재 세대수'],['latitude','위도(수동)'],['longitude','경도(수동)']] as const).map(([key,label]) => <label key={key} className={key.includes('address') || key === 'mainApartmentRaw' ? 'sm:col-span-2' : ''}><span className="field-label">{label}</span><input className="input" value={form[key]} onChange={(e) => setForm({...form,[key]:e.target.value})} /></label>)}</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><label><span className="field-label">검토 상태</span><select className="input" value={n.reviewStatus} onChange={(e) => onCommand({ type:"UPDATE_CANDIDATE", candidateStoreId:candidate.identity.candidateStoreId, patch:{reviewStatus:e.target.value as CandidateLifecycleStatus} })}>{CANDIDATE_LIFECYCLE_STATUSES.map(item=><option key={item} value={item}>{lifecycleLabels[item]}</option>)}</select></label><label><span className="field-label">유동성</span><select className="input" value={n.fieldFlowRating} onChange={(e)=>onCommand({type:"UPDATE_CANDIDATE",candidateStoreId:candidate.identity.candidateStoreId,patch:{fieldFlowRating:e.target.value as typeof n.fieldFlowRating}})}>{['HIGH','MEDIUM','LOW','UNKNOWN'].map(x=><option key={x}>{x}</option>)}</select></label><label><span className="field-label">노출도</span><select className="input" value={n.fieldVisibilityRating} onChange={(e)=>onCommand({type:"UPDATE_CANDIDATE",candidateStoreId:candidate.identity.candidateStoreId,patch:{fieldVisibilityRating:e.target.value as typeof n.fieldVisibilityRating}})}>{['HIGH','MEDIUM','LOW','UNKNOWN'].map(x=><option key={x}>{x}</option>)}</select></label></div>
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="btn-primary" onClick={() => onCommand({ type:"UPDATE_CANDIDATE", candidateStoreId:candidate.identity.candidateStoreId, patch:{ addressFull:form.addressFull,addressForGeocode:form.addressForGeocode||null,displayLocation:form.displayLocation,floor:form.floor||null,exclusiveArea:numeric(form.exclusiveArea),deposit:numeric(form.deposit),rent:numeric(form.rent),maintenance:numeric(form.maintenance),maintenanceStatus:form.maintenance.trim()===''?'UNKNOWN':'CONFIRMED',premium:numeric(form.premium),currentOccupancyStatus:form.currentOccupancyStatus||null,mainApartmentRaw:form.mainApartmentRaw,existingHouseholdReference:numeric(form.existingHouseholdReference),latitude:numeric(form.latitude),longitude:numeric(form.longitude) } })}>값 저장</button><button disabled={busy} className="btn-secondary" onClick={() => onCommand({type:"GEOCODE_ONE",candidateStoreId:candidate.identity.candidateStoreId})}>Kakao Geocode</button><span className="self-center text-xs">{n.geocodeStatus} · {n.coordinateSource ?? "좌표 출처 없음"}</span></div>
    <div className="mt-5 border-t pt-4"><h3 className="font-bold">현장메모 Raw</h3><textarea readOnly className="input mt-2 min-h-24 bg-slate-50" value={n.fieldNoteRaw} /></div>
    <div className="mt-4"><div className="flex items-center justify-between"><h3 className="font-bold">구조화 초안</h3><span className="rounded-full bg-blue-50 px-2 py-1 text-xs">{revision.status}</span></div><DraftFields payload={payload} onChange={setPayload} /><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="btn-secondary" onClick={() => onCommand({type:"SAVE_DRAFT",candidateStoreId:candidate.identity.candidateStoreId,payload})}>수정 Draft 저장</button>{revision.status === 'DRAFT' && <button disabled={busy} className="btn-secondary" onClick={() => onCommand({type:"TRANSITION_DRAFT",candidateStoreId:candidate.identity.candidateStoreId,targetStatus:'REVIEWED'})}>검토 완료</button>}{(revision.status === 'DRAFT'||revision.status === 'REVIEWED') && <button disabled={busy} className="btn-primary" onClick={() => onCommand({type:"TRANSITION_DRAFT",candidateStoreId:candidate.identity.candidateStoreId,targetStatus:'APPROVED'})}>승인</button>}</div><p className="mt-2 text-xs text-slate-500">APPROVED만 고객 Preview/PDF에 사용됩니다.</p></div>
  </section>;
}
function DraftFields({ payload, onChange }: { payload: FieldNoteStructuredContentV1; onChange(value: FieldNoteStructuredContentV1): void }) {
  const list = (value: readonly string[]) => value.join("\n"); const parse = (value: string) => value.split(/\r?\n/u).map(x=>x.trim()).filter(Boolean).slice(0,2);
  return <div className="mt-3 grid gap-3"><label><span className="field-label">입지요약 (최대 2문장)</span><textarea className="input" value={payload.locationSummary} onChange={e=>onChange({...payload,locationSummary:e.target.value})}/></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="field-label">장점 (줄당 1개, 최대 2개)</span><textarea className="input" value={list(payload.strengths)} onChange={e=>onChange({...payload,strengths:parse(e.target.value)})}/></label><label><span className="field-label">확인사항 (최대 2개)</span><textarea className="input" value={list(payload.checks)} onChange={e=>onChange({...payload,checks:parse(e.target.value)})}/></label><label><span className="field-label">현장특이사항 (최대 2개)</span><textarea className="input" value={list(payload.fieldObservations)} onChange={e=>onChange({...payload,fieldObservations:parse(e.target.value)})}/></label><label><span className="field-label">차량 접근 (최대 2개)</span><textarea className="input" value={list(payload.vehicleAccessNotes)} onChange={e=>onChange({...payload,vehicleAccessNotes:parse(e.target.value)})}/></label></div><label><span className="field-label">리포트 요약 (최대 3문장)</span><textarea className="input" value={payload.reportSummary} onChange={e=>onChange({...payload,reportSummary:e.target.value})}/></label></div>;
}
function ComparePicker({ candidates, selectedIds, state, onToggle }: { candidates: Pork33CandidateState[]; selectedIds: string[]; state: Pork33ShortlistStateV1; onToggle(id: string): void }) {
  return <section className="panel-card p-4"><div className="flex items-center justify-between"><div><h2 className="font-bold">비교 Candidate 선택</h2><p className="text-xs text-slate-500">현재 Filter 결과에서 최대 4개 · Apartment Area 기준 비교 권장</p></div><span className="font-bold">{selectedIds.length}/4</span></div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{candidates.map((candidate) => { const selected = selectedIds.includes(candidate.identity.candidateStoreId); return <label key={candidate.identity.candidateStoreId} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${selected ? "border-emerald-700 bg-emerald-50" : "border-slate-200"}`}><input type="checkbox" checked={selected} onChange={() => onToggle(candidate.identity.candidateStoreId)} /><span><strong>{candidate.identity.displayCode}</strong><span className="ml-2 text-xs text-slate-500">{state.apartmentAreas.find((area) => area.apartmentAreaId === candidate.linkage.apartmentAreaId)?.label}</span><span className="mt-1 block text-xs text-slate-600">{candidate.normalized.addressFull}</span></span></label>; })}</div></section>;
}
function ComparePanel({ candidates, state, onRemove }: { candidates: Pork33CandidateState[]; state: Pork33ShortlistStateV1; onRemove(id:string):void }) {
  return <section className="panel-card overflow-hidden"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Candidate Compare</h2><p className="text-xs text-slate-500">1~4개 선택 · 동일 Apartment Area 비교 권장</p></div><span className="text-sm font-bold">{candidates.length}/4</span></div>{candidates.length===0?<p className="p-8 text-center text-sm text-slate-500">Candidate Card에서 비교 대상을 선택하세요.</p>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs"><tr>{['Candidate','Apartment Area','면적','보증금','월세','관리비','권리금','기존 배후값','유동/노출','상태',''].map(x=><th key={x} className="whitespace-nowrap p-3 text-left">{x}</th>)}</tr></thead><tbody>{candidates.map(c=><tr key={c.identity.candidateStoreId} className="border-t"><td className="p-3 font-bold">{c.identity.displayCode}</td><td className="p-3">{state.apartmentAreas.find(a=>a.apartmentAreaId===c.linkage.apartmentAreaId)?.label}</td><td className="p-3">{numberText(c.normalized.exclusiveArea,'평')}</td><td className="p-3">{money(c.normalized.deposit)}</td><td className="p-3">{money(c.normalized.rent)}</td><td className="p-3">{money(c.normalized.maintenance)}</td><td className="p-3">{money(c.normalized.premium)}</td><td className="p-3">{numberText(c.normalized.existingHouseholdReference,'세대')}</td><td className="p-3">{c.normalized.fieldFlowRating}/{c.normalized.fieldVisibilityRating}</td><td className="p-3">{lifecycleLabels[c.normalized.reviewStatus]}</td><td className="p-3"><button onClick={()=>onRemove(c.identity.candidateStoreId)}>제거</button></td></tr>)}</tbody></table></div>}</section>;
}
function SourceAudit({ state }: { state: Pork33ShortlistStateV1 }) {
  return <section className="panel-card overflow-hidden"><div className="border-b p-4"><h2 className="font-bold">Source Validation Table</h2><p className="text-xs text-slate-500">물리 행 27 · 인쇄번호 중복 {state.sourceAudit.duplicatePrintedNumbers.join(', ')} · 누락 {state.sourceAudit.missingPrintedNumbers.join(', ')} · INVALID {state.sourceAudit.validationInvalidCount}</p></div><div className="max-h-96 overflow-auto"><table className="min-w-full text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['Row','Printed','Address Raw','Area','Deposit','Rent','Maintenance Raw → Normalized','Apartment','Household','Flow','Visibility','Note','Region','Area Group','Confidence','Validation'].map(x=><th key={x} className="whitespace-nowrap p-2 text-left">{x}</th>)}</tr></thead><tbody>{state.candidates.map(c=><tr key={c.identity.candidateStoreId} className="border-t"><td className="p-2">{c.source.sourceRowOrder}</td><td className="p-2">{c.source.printedNumber}</td><td className="p-2">{c.raw.address}</td><td className="p-2">{c.raw.exclusiveArea}</td><td className="p-2">{c.raw.deposit}</td><td className="p-2">{c.raw.rent}</td><td className="p-2">{c.raw.maintenance} → {c.normalized.maintenance ?? 'UNKNOWN'}</td><td className="p-2">{c.normalized.mainApartmentRaw}</td><td className="p-2">{c.normalized.existingHouseholdReference ?? 'UNKNOWN'}</td><td className="p-2">{c.normalized.fieldFlowRating}</td><td className="p-2">{c.normalized.fieldVisibilityRating}</td><td className="p-2">{c.normalized.fieldNoteRaw?'YES':'NO'}</td><td className="p-2">{state.regions.find(r=>r.regionId===c.linkage.regionId)?.label}</td><td className="p-2">{state.apartmentAreas.find(a=>a.apartmentAreaId===c.linkage.apartmentAreaId)?.label}</td><td className="p-2">{c.linkage.groupingConfidence}</td><td className="p-2">{c.validation.status}</td></tr>)}</tbody></table></div></section>;
}
