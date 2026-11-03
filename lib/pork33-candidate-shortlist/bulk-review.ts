import { getActivePork33Revision } from "./state";
import type { Pork33CandidateState, Pork33ShortlistStateV1 } from "./types";

export const PORK33_BULK_REVIEW_FILTERS = Object.freeze([
  "ALL", "UNREVIEWED", "DRAFT", "REVIEWED", "APPROVED",
  "SHORTLIST", "KEEP", "HOLD", "DROP",
] as const);
export type Pork33BulkReviewFilter = (typeof PORK33_BULK_REVIEW_FILTERS)[number];

export function getPork33BulkReviewProgress(state: Pork33ShortlistStateV1) {
  const revisionCount = (status: "DRAFT" | "REVIEWED" | "APPROVED") => state.candidates
    .filter((candidate) => getActivePork33Revision(candidate)?.status === status).length;
  const lifecycleCount = (status: "SHORTLIST" | "KEEP" | "HOLD" | "DROP") => state.candidates
    .filter((candidate) => candidate.normalized.reviewStatus === status).length;
  return Object.freeze({
    total: state.candidates.length,
    approved: revisionCount("APPROVED"),
    reviewed: revisionCount("REVIEWED"),
    draft: revisionCount("DRAFT"),
    shortlist: lifecycleCount("SHORTLIST"),
    keep: lifecycleCount("KEEP"),
    hold: lifecycleCount("HOLD"),
    drop: lifecycleCount("DROP"),
  });
}
export function filterPork33BulkReviewCandidates(
  state: Pork33ShortlistStateV1,
  filter: Pork33BulkReviewFilter,
  regionId = "",
  apartmentAreaId = "",
) {
  return state.candidates.filter((candidate) => {
    if (regionId && candidate.linkage.regionId !== regionId) return false;
    if (apartmentAreaId && candidate.linkage.apartmentAreaId !== apartmentAreaId) return false;
    const revisionStatus = getActivePork33Revision(candidate)?.status;
    if (filter === "UNREVIEWED") return revisionStatus !== "APPROVED";
    if (filter === "DRAFT" || filter === "REVIEWED" || filter === "APPROVED") return revisionStatus === filter;
    if (filter === "SHORTLIST" || filter === "KEEP" || filter === "HOLD" || filter === "DROP") {
      return candidate.normalized.reviewStatus === filter;
    }
    return true;
  }).sort((left, right) => left.source.sourceRowOrder - right.source.sourceRowOrder);
}
export function getAdjacentPork33CandidateId(
  candidates: readonly Pork33CandidateState[],
  currentId: string,
  direction: -1 | 1,
) {
  if (candidates.length === 0) return null;
  const currentIndex = candidates.findIndex((candidate) => candidate.identity.candidateStoreId === currentId);
  const start = currentIndex < 0 ? 0 : currentIndex;
  const target = Math.min(candidates.length - 1, Math.max(0, start + direction));
  return candidates[target]?.identity.candidateStoreId ?? null;
}
