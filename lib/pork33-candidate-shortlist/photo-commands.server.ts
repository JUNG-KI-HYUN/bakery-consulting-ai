import "server-only";
import {
  CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION,
  createCandidatePhotoId,
  isCandidatePhotoCategory,
  validateCandidatePhotoAssetRefV1,
} from "../candidate-photo";
import type { CandidatePhotoMetadataV1, CandidatePhotoProfileV1 } from "../candidate-photo";
import { getActiveCandidatePhotos } from "./photo-workspace";
import {
  appendPork33CandidatePhotoState,
  createNextPork33CandidatePhotoSnapshot,
  loadCurrentPork33CandidatePhotoState,
  type Pork33PhotoRepositoryOptions,
} from "./photo-repository.server";
import type { Pork33CandidatePhotoCommand, Pork33CandidatePhotoStateV1 } from "./photo-types";

function actor(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new TypeError("작업자 이름이 필요합니다.");
  return normalized;
}
function mutableProfile(state: Pork33CandidatePhotoStateV1, candidateStoreId: string) {
  const profile = state.profiles.find((item) => item.candidateStoreId === candidateStoreId);
  if (!profile) throw new RangeError("PORK33 Candidate Photo Profile을 찾을 수 없습니다.");
  return profile as CandidatePhotoProfileV1 & { primaryPhotoId: string | null; photoIds: string[]; profileVersion: string; updatedAt: string };
}
function mutablePhoto(state: Pork33CandidatePhotoStateV1, candidateStoreId: string, photoId: string) {
  const photo = state.photos.find((item) => item.photoId === photoId);
  if (!photo) throw new RangeError("Candidate Photo를 찾을 수 없습니다.");
  if (photo.candidateStoreId !== candidateStoreId) throw new TypeError("다른 Candidate의 Photo를 변경할 수 없습니다.");
  return photo as CandidatePhotoMetadataV1 & {
    category: CandidatePhotoMetadataV1["category"];
    sortOrder: number;
    includeInBriefing: boolean | null;
    includeInReport: boolean | null;
    fieldMemoRaw: string | null;
    deletedAt: string | null;
    metadataVersion: string;
  };
}
function updateProfile(profile: ReturnType<typeof mutableProfile>, revision: number, at: string) {
  profile.profileVersion = String(revision);
  profile.updatedAt = at;
}
export async function executePork33CandidatePhotoCommand(
  command: Pork33CandidatePhotoCommand,
  options: Pork33PhotoRepositoryOptions = {},
) {
  const name = actor(command.actor);
  const current = await loadCurrentPork33CandidatePhotoState(options);
  const next = createNextPork33CandidatePhotoSnapshot(current, name, options);
  const at = (options.now?.() ?? new Date()).toISOString();
  const profile = mutableProfile(next, command.candidateStoreId);

  if (command.type === "REGISTER_PHOTO") {
    const asset = validateCandidatePhotoAssetRefV1(profile.caseId, command.candidateStoreId, command.assetRef);
    if (!asset.ok) throw new TypeError(`Candidate Photo ownership 오류: ${asset.code}`);
    const active = getActiveCandidatePhotos(next, command.candidateStoreId);
    const photo: CandidatePhotoMetadataV1 = {
      schemaVersion: CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION,
      metadataVersion: String(next.revision),
      photoId: createCandidatePhotoId(),
      caseId: profile.caseId,
      candidateStoreId: command.candidateStoreId,
      assetRef: command.assetRef,
      evidenceRef: null,
      category: "OTHER",
      sortOrder: active.length,
      includeInBriefing: null,
      includeInReport: null,
      fieldMemoRaw: null,
      uploadedAt: at,
      takenAt: null,
      deletedAt: null,
    };
    (next.photos as CandidatePhotoMetadataV1[]).push(photo);
    profile.photoIds.push(photo.photoId);
    updateProfile(profile, next.revision, at);
  }

  if (command.type === "UPDATE_PHOTO") {
    const photo = mutablePhoto(next, command.candidateStoreId, command.photoId);
    if (photo.deletedAt !== null) throw new TypeError("삭제 처리된 Candidate Photo는 수정할 수 없습니다.");
    if (command.patch.category !== undefined) {
      if (!isCandidatePhotoCategory(command.patch.category)) throw new TypeError("올바르지 않은 Photo Category입니다.");
      photo.category = command.patch.category;
    }
    if (command.patch.fieldMemoRaw !== undefined) {
      if (command.patch.fieldMemoRaw !== null && Array.from(command.patch.fieldMemoRaw).length > 2000) {
        throw new TypeError("사진 현장메모는 최대 2,000자입니다.");
      }
      photo.fieldMemoRaw = command.patch.fieldMemoRaw;
    }
    if (command.patch.includeInBriefing !== undefined) photo.includeInBriefing = command.patch.includeInBriefing;
    if (command.patch.includeInReport !== undefined) photo.includeInReport = command.patch.includeInReport;
    photo.metadataVersion = String(next.revision);
    updateProfile(profile, next.revision, at);
  }

  if (command.type === "SET_PRIMARY") {
    if (command.photoId !== null) {
      const photo = mutablePhoto(next, command.candidateStoreId, command.photoId);
      if (photo.deletedAt !== null) throw new TypeError("삭제 처리된 Candidate Photo는 대표사진으로 지정할 수 없습니다.");
    }
    profile.primaryPhotoId = command.photoId;
    updateProfile(profile, next.revision, at);
  }

  if (command.type === "MOVE_PHOTO") {
    const target = mutablePhoto(next, command.candidateStoreId, command.photoId);
    if (target.deletedAt !== null) throw new TypeError("삭제 처리된 Candidate Photo는 이동할 수 없습니다.");
    const active = [...getActiveCandidatePhotos(next, command.candidateStoreId)];
    const index = active.findIndex((photo) => photo.photoId === command.photoId);
    const swapIndex = command.direction === "UP" ? index - 1 : index + 1;
    if (index >= 0 && swapIndex >= 0 && swapIndex < active.length) {
      [active[index], active[swapIndex]] = [active[swapIndex], active[index]];
      active.forEach((photo, sortOrder) => {
        const mutable = mutablePhoto(next, command.candidateStoreId, photo.photoId);
        mutable.sortOrder = sortOrder;
        mutable.metadataVersion = String(next.revision);
      });
    }
    updateProfile(profile, next.revision, at);
  }

  if (command.type === "TOMBSTONE_PHOTO") {
    const photo = mutablePhoto(next, command.candidateStoreId, command.photoId);
    photo.deletedAt = photo.deletedAt ?? at;
    photo.metadataVersion = String(next.revision);
    if (profile.primaryPhotoId === photo.photoId) profile.primaryPhotoId = null;
    updateProfile(profile, next.revision, at);
  }

  return appendPork33CandidatePhotoState(next, options);
}
