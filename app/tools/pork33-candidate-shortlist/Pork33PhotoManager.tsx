"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  CANDIDATE_PHOTO_CATEGORIES,
  getCandidatePhotoCategoryLabel,
  type CandidatePhotoCategory,
  type CandidatePhotoMetadataV1,
} from "@/lib/candidate-photo";
import { getActiveCandidatePhotos } from "@/lib/pork33-candidate-shortlist/photo-workspace";
import type { Pork33CandidatePhotoCommand, Pork33CandidatePhotoStateV1 } from "@/lib/pork33-candidate-shortlist/photo-types";
import type { Pork33ShortlistStateV1 } from "@/lib/pork33-candidate-shortlist/types";

type PhotoClientCommand = Pork33CandidatePhotoCommand extends infer Command
  ? Command extends { actor: string } ? Omit<Command, "actor"> : never
  : never;

type Props = {
  state: Pork33ShortlistStateV1;
  photoState: Pork33CandidatePhotoStateV1;
  busy: boolean;
  actor: string;
  message: string;
  onActorChange(value: string): void;
  onPhotoCommand(value: PhotoClientCommand): Promise<boolean>;
};

function photoUrl(photo: CandidatePhotoMetadataV1) {
  const params = new URLSearchParams({
    caseId: photo.caseId,
    candidateStoreId: photo.candidateStoreId,
    assetRef: photo.assetRef,
  });
  return `/api/tools/pork33-candidate-shortlist/photos?${params.toString()}`;
}
function triValue(value: boolean | null) {
  return value === null ? "UNSET" : value ? "TRUE" : "FALSE";
}
function parseTriValue(value: string): boolean | null {
  return value === "TRUE" ? true : value === "FALSE" ? false : null;
}
export function Pork33PhotoManager({
  state,
  photoState,
  busy,
  actor,
  message,
  onActorChange,
  onPhotoCommand,
}: Props) {
  const [candidateId, setCandidateId] = useState(state.candidates[0]?.identity.candidateStoreId ?? "");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const candidate = state.candidates.find((item) => item.identity.candidateStoreId === candidateId) ?? state.candidates[0];
  const profile = photoState.profiles.find((item) => item.candidateStoreId === candidate?.identity.candidateStoreId);
  const photos = useMemo(
    () => candidate ? getActiveCandidatePhotos(photoState, candidate.identity.candidateStoreId) : [],
    [candidate, photoState],
  );
  const selected = photos.find((photo) => photo.photoId === photoId) ?? photos[0] ?? null;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !candidate || !profile) return;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    setUploadMessage(`사진 ${files.length}장 업로드 중…`);
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("caseId", profile.caseId);
        form.append("candidateStoreId", candidate.identity.candidateStoreId);
        const uploadResponse = await fetch("/api/tools/pork33-candidate-shortlist/photos", { method: "POST", body: form });
        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadPayload.message ?? `${file.name} 업로드 실패`);
        const registered = await onPhotoCommand({
          type: "REGISTER_PHOTO",
          candidateStoreId: candidate.identity.candidateStoreId,
          assetRef: uploadPayload.reference?.assetRef ?? "",
        });
        if (!registered) {
          throw new Error(`${file.name}: Binary는 저장되었으나 Metadata 연결 실패 · orphan 확인 필요`);
        }
        success += 1;
      } catch (error) {
        failed += 1;
        errors.push(error instanceof Error ? error.message : `${file.name} 업로드 실패`);
      }
    }
    setUploadMessage(`성공 ${success}장 · 실패 ${failed}장${errors.length ? ` · ${errors.join(" / ")}` : ""}`);
  }

  if (!candidate || !profile) return <div className="panel-card p-10 text-center">Candidate Photo Profile을 찾을 수 없습니다.</div>;

  return (
    <div className="space-y-4">
      <section className="panel-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-bold">사진관리</h2>
            <p className="text-xs text-slate-500">Candidate-scoped 저장 · JPG/PNG/WEBP · 파일당 최대 10MB</p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs">작업자 <input className="rounded border px-2 py-1" value={actor} onChange={(event) => onActorChange(event.target.value)} /></label>
          <label className="btn-primary cursor-pointer">
            여러 사진 업로드
            <input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }} />
          </label>
        </div>
        {(uploadMessage || message) && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{uploadMessage || message}</p>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel-card max-h-[76vh] overflow-y-auto p-2">
          {state.candidates.map((item) => {
            const count = getActiveCandidatePhotos(photoState, item.identity.candidateStoreId).length;
            return <button key={item.identity.candidateStoreId} className={`mb-1 w-full rounded-xl p-3 text-left ${item.identity.candidateStoreId === candidate.identity.candidateStoreId ? "bg-[#123C35] text-white" : "hover:bg-slate-50"}`} onClick={() => { setCandidateId(item.identity.candidateStoreId); setPhotoId(null); }}>
              <strong>{item.identity.displayCode}</strong>
              <span className="ml-2 text-xs">현장사진 {count}장</span>
              <p className="mt-1 truncate text-xs opacity-75">{item.normalized.mainApartmentRaw}</p>
            </button>;
          })}
        </aside>

        <section className="panel-card overflow-hidden">
          <div className="border-b p-5">
            <p className="text-xs font-bold tracking-widest text-emerald-800">{candidate.identity.displayCode}</p>
            <h3 className="mt-1 text-xl font-bold">{candidate.normalized.mainApartmentRaw}</h3>
            <p className="mt-1 text-sm text-slate-500">{candidate.normalized.addressFull} · 현장사진 {photos.length}장</p>
          </div>
          {selected ? (
            <PhotoEditor
              key={`${selected.photoId}:${selected.metadataVersion}`}
              photo={selected}
              photos={photos}
              isPrimary={profile.primaryPhotoId === selected.photoId}
              busy={busy}
              onSelect={setPhotoId}
              onCommand={onPhotoCommand}
            />
          ) : (
            <div className="grid min-h-[520px] place-items-center bg-slate-50 p-10 text-center">
              <div><div className="text-5xl">▧</div><h3 className="mt-4 font-bold">등록된 현장사진이 없습니다</h3><p className="mt-2 text-sm text-slate-500">상단의 여러 사진 업로드에서 Candidate 사진을 등록하세요.</p></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function PhotoEditor({
  photo,
  photos,
  isPrimary,
  busy,
  onSelect,
  onCommand,
}: {
  photo: CandidatePhotoMetadataV1;
  photos: readonly CandidatePhotoMetadataV1[];
  isPrimary: boolean;
  busy: boolean;
  onSelect(photoId: string): void;
  onCommand(value: PhotoClientCommand): Promise<boolean>;
}) {
  const [category, setCategory] = useState<CandidatePhotoCategory>(photo.category);
  const [memo, setMemo] = useState(photo.fieldMemoRaw ?? "");
  const [briefing, setBriefing] = useState(triValue(photo.includeInBriefing));
  const [report, setReport] = useState(triValue(photo.includeInReport));
  const index = photos.findIndex((item) => item.photoId === photo.photoId);

  return <div className="grid xl:grid-cols-[minmax(0,1.4fr)_360px]">
    <div className="border-r border-slate-200 bg-[#F4F1E8] p-5">
      <div className="relative min-h-[520px] overflow-hidden rounded-2xl bg-slate-900">
        <Image src={photoUrl(photo)} alt={`${getCandidatePhotoCategoryLabel(photo.category)} 현장사진`} fill sizes="(min-width: 1280px) 60vw, 100vw" className="object-contain" unoptimized />
        {isPrimary && <span className="absolute left-4 top-4 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950">대표사진</span>}
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {photos.map((item, itemIndex) => <button key={item.photoId} className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 ${item.photoId === photo.photoId ? "border-amber-500" : "border-transparent"}`} onClick={() => onSelect(item.photoId)}>
          <Image src={photoUrl(item)} alt={`사진 ${itemIndex + 1}`} fill sizes="112px" className="object-cover" unoptimized />
        </button>)}
      </div>
    </div>
    <div className="space-y-4 p-5">
      <div><p className="text-xs text-slate-500">사진 순서</p><p className="text-lg font-bold">{index + 1} / {photos.length}</p></div>
      <label><span className="field-label">Category</span><select className="input" value={category} onChange={(event) => setCategory(event.target.value as CandidatePhotoCategory)}>{CANDIDATE_PHOTO_CATEGORIES.map((item) => <option key={item} value={item}>{getCandidatePhotoCategoryLabel(item)} · {item}</option>)}</select></label>
      <label><span className="field-label">사진별 현장 원문</span><textarea className="input min-h-32" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="AI가 수정하지 않는 현장 원문" /></label>
      <label><span className="field-label">브리핑 포함</span><select className="input" value={briefing} onChange={(event) => setBriefing(event.target.value)}><option value="UNSET">미결정 · null</option><option value="TRUE">포함 · true</option><option value="FALSE">제외 · false</option></select></label>
      <label><span className="field-label">Report 포함</span><select className="input" value={report} onChange={(event) => setReport(event.target.value)}><option value="UNSET">미결정 · null</option><option value="TRUE">포함 · true</option><option value="FALSE">제외 · false</option></select></label>
      <button disabled={busy} className="btn-primary w-full" onClick={() => onCommand({ type: "UPDATE_PHOTO", candidateStoreId: photo.candidateStoreId, photoId: photo.photoId, patch: { category, fieldMemoRaw: memo, includeInBriefing: parseTriValue(briefing), includeInReport: parseTriValue(report) } })}>Metadata 저장</button>
      <div className="grid grid-cols-2 gap-2"><button disabled={busy || index === 0} className="btn-secondary" onClick={() => onCommand({ type: "MOVE_PHOTO", candidateStoreId: photo.candidateStoreId, photoId: photo.photoId, direction: "UP" })}>위로</button><button disabled={busy || index === photos.length - 1} className="btn-secondary" onClick={() => onCommand({ type: "MOVE_PHOTO", candidateStoreId: photo.candidateStoreId, photoId: photo.photoId, direction: "DOWN" })}>아래로</button></div>
      <button disabled={busy} className="btn-secondary w-full" onClick={() => onCommand({ type: "SET_PRIMARY", candidateStoreId: photo.candidateStoreId, photoId: isPrimary ? null : photo.photoId })}>{isPrimary ? "대표사진 해제" : "대표사진 지정"}</button>
      <button disabled={busy} className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700" onClick={() => { if (window.confirm("사진을 목록에서 삭제 처리할까요? Binary와 과거 Snapshot은 유지됩니다.")) void onCommand({ type: "TOMBSTONE_PHOTO", candidateStoreId: photo.candidateStoreId, photoId: photo.photoId }); }}>삭제 처리</button>
      <p className="text-xs leading-5 text-slate-500">삭제는 tombstone 방식입니다. Binary hard delete와 자동 대표사진 지정은 수행하지 않습니다.</p>
    </div>
  </div>;
}
