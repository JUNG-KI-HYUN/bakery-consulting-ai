import { orderCandidatePhotoMetadataV1 } from "../candidate-photo/validation";
import type { CandidatePhotoMetadataV1 } from "../candidate-photo/types";
import type { CandidateLifecycleStatus } from "../candidate-screening/types";
import type { Pork33CandidatePhotoStateV1 } from "./photo-types";
import type { Pork33CandidateState, Pork33ShortlistStateV1 } from "./types";

export function getActiveCandidatePhotos(
  state: Pork33CandidatePhotoStateV1,
  candidateStoreId: string,
): readonly CandidatePhotoMetadataV1[] {
  return orderCandidatePhotoMetadataV1(
    state.photos.filter((photo) => photo.candidateStoreId === candidateStoreId && photo.deletedAt === null),
  );
}
/** 명시적으로 선택된 사진이 하나라도 있으면 true만, 아니면 false가 아닌 사진을 사용한다. */
export function getBriefingCandidatePhotos(
  state: Pork33CandidatePhotoStateV1,
  candidateStoreId: string,
): readonly CandidatePhotoMetadataV1[] {
  const active = getActiveCandidatePhotos(state, candidateStoreId);
  const hasExplicitSelection = active.some((photo) => photo.includeInBriefing === true);
  return active.filter((photo) => hasExplicitSelection
    ? photo.includeInBriefing === true
    : photo.includeInBriefing !== false);
}
export function getAdjacentPhotoId(
  photos: readonly CandidatePhotoMetadataV1[],
  photoId: string | null,
  direction: "PREVIOUS" | "NEXT",
): string | null {
  if (photos.length === 0) return null;
  const index = Math.max(0, photos.findIndex((photo) => photo.photoId === photoId));
  const next = direction === "PREVIOUS"
    ? (index - 1 + photos.length) % photos.length
    : (index + 1) % photos.length;
  return photos[next]?.photoId ?? null;
}
export type Pork33BriefingFilter = {
  readonly lifecycleStatus?: Extract<CandidateLifecycleStatus, "SHORTLIST" | "KEEP">;
  readonly regionId?: string;
  readonly apartmentAreaId?: string;
};

export function filterAndOrderBriefingCandidates(
  state: Pork33ShortlistStateV1,
  filter: Pork33BriefingFilter,
): readonly Pork33CandidateState[] {
  const regionOrder = new Map(state.regions.map((region, index) => [region.regionId, index]));
  const areaOrder = new Map(state.apartmentAreas.map((area, index) => [area.apartmentAreaId, index]));
  return state.candidates
    .filter((candidate) => !filter.lifecycleStatus || candidate.normalized.reviewStatus === filter.lifecycleStatus)
    .filter((candidate) => !filter.regionId || candidate.linkage.regionId === filter.regionId)
    .filter((candidate) => !filter.apartmentAreaId || candidate.linkage.apartmentAreaId === filter.apartmentAreaId)
    .sort((left, right) =>
      (regionOrder.get(left.linkage.regionId) ?? Number.MAX_SAFE_INTEGER)
      - (regionOrder.get(right.linkage.regionId) ?? Number.MAX_SAFE_INTEGER)
      || (areaOrder.get(left.linkage.apartmentAreaId) ?? Number.MAX_SAFE_INTEGER)
      - (areaOrder.get(right.linkage.apartmentAreaId) ?? Number.MAX_SAFE_INTEGER)
      || left.identity.displayNumber - right.identity.displayNumber);
}
export function getSameApartmentAreaCandidateIds(
  state: Pork33ShortlistStateV1,
  candidateStoreId: string,
): readonly string[] {
  const selected = state.candidates.find((candidate) => candidate.identity.candidateStoreId === candidateStoreId);
  if (!selected) return [];
  return state.candidates
    .filter((candidate) => candidate.linkage.apartmentAreaId === selected.linkage.apartmentAreaId)
    .sort((left, right) => left.identity.displayNumber - right.identity.displayNumber)
    .map((candidate) => candidate.identity.candidateStoreId);
}
export function getCandidateAreaMapPoints(
  state: Pork33ShortlistStateV1,
  candidateStoreId: string,
) {
  const selected = state.candidates.find((candidate) => candidate.identity.candidateStoreId === candidateStoreId);
  if (!selected) return [];
  return state.candidates.flatMap((candidate) =>
    candidate.linkage.apartmentAreaId === selected.linkage.apartmentAreaId
      && candidate.normalized.latitude !== null
      && candidate.normalized.longitude !== null
      ? [{
          candidateStoreId: candidate.identity.candidateStoreId,
          label: candidate.identity.displayCode,
          lat: candidate.normalized.latitude,
          lng: candidate.normalized.longitude,
          selected: candidate.identity.candidateStoreId === candidateStoreId,
        }]
      : []);
}
