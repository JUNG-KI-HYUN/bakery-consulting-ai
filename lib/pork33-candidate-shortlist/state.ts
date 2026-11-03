import { CANDIDATE_LIFECYCLE_STATUSES } from "../candidate-screening/types";
import { validateDerivedContentRevisionV1 } from "../derived-content/validation";
import { PORK33_SANITIZED_SEED } from "./sanitized-fixture";
import type { Pork33SeedPackage } from "./seed-types";
import {
  PORK33_SHORTLIST_STATE_SCHEMA_VERSION,
  type Pork33CandidateFilter,
  type Pork33CandidateState,
  type Pork33ShortlistStateV1,
} from "./types";

export function createPork33InitialState(
  now = new Date("2026-11-01T00:00:00.000Z"),
  seed: Pork33SeedPackage = PORK33_SANITIZED_SEED,
): Pork33ShortlistStateV1 {
  return {
    schemaVersion: PORK33_SHORTLIST_STATE_SCHEMA_VERSION,
    snapshotId: "p33_state_seed_v1",
    parentSnapshotId: null,
    sourceDatasetId: seed.sourceDatasetId,
    revision: 1,
    createdAt: now.toISOString(),
    createdBy: "pork33-seed-v1",
    sourceAudit: structuredClone(seed.sourceAudit),
    regions: structuredClone(seed.regions),
    apartmentAreas: structuredClone(seed.apartmentAreas),
    candidates: seed.candidates.map((candidate) => ({
      ...structuredClone(candidate),
      contentRevisions: [structuredClone(candidate.draft)],
      reviewReason: null,
      updatedAt: null,
      updatedBy: null,
    })),
  };
}
export function getActivePork33Revision(candidate: Pork33CandidateState) {
  return candidate.contentRevisions[candidate.contentRevisions.length - 1] ?? null;
}
export function validatePork33State(
  input: unknown,
  seed: Pork33SeedPackage = PORK33_SANITIZED_SEED,
): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return ["state는 객체여야 합니다."];
  const state = input as Partial<Pork33ShortlistStateV1>;
  if (state.schemaVersion !== PORK33_SHORTLIST_STATE_SCHEMA_VERSION) errors.push("state schemaVersion이 올바르지 않습니다.");
  if (state.sourceDatasetId !== seed.sourceDatasetId) errors.push("sourceDatasetId가 현재 Seed와 일치하지 않습니다.");
  if (!Number.isInteger(state.revision) || (state.revision ?? 0) < 1) errors.push("revision은 1 이상의 정수여야 합니다.");
  if (!Array.isArray(state.candidates) || state.candidates.length !== 27) return [...errors, "Candidate는 정확히 27개여야 합니다."];
  const seedById = new Map(seed.candidates.map((candidate) => [candidate.identity.candidateStoreId, candidate]));
  const ids = new Set<string>();
  state.candidates.forEach((candidate, index) => {
    const id = candidate.identity?.candidateStoreId;
    if (!id || ids.has(id)) errors.push(`Candidate ${index + 1} ID가 없거나 중복입니다.`);
    if (id) ids.add(id);
    const original = id ? seedById.get(id) : undefined;
    if (!original) {
      errors.push(`Candidate ${index + 1}은 Seed에 없는 Candidate입니다.`);
      return;
    }
    if (JSON.stringify(candidate.source) !== JSON.stringify(original.source)
      || JSON.stringify(candidate.identity) !== JSON.stringify(original.identity)
      || JSON.stringify(candidate.raw) !== JSON.stringify(original.raw)) {
      errors.push(`${id}의 source/identity/raw는 변경할 수 없습니다.`);
    }
    if (!CANDIDATE_LIFECYCLE_STATUSES.includes(candidate.normalized.reviewStatus)) errors.push(`${id} reviewStatus가 올바르지 않습니다.`);
    if (!Array.isArray(candidate.contentRevisions) || candidate.contentRevisions.length < 1) {
      errors.push(`${id} contentRevisions가 비어 있습니다.`);
    } else {
      candidate.contentRevisions.forEach((revision, revisionIndex) => {
        const result = validateDerivedContentRevisionV1(revision);
        if (!result.ok) errors.push(`${id} revision ${revisionIndex + 1}: ${result.errors.join(" ")}`);
        if (revision.candidateStoreId !== id) errors.push(`${id}에 다른 Candidate의 Derived Content가 혼입되었습니다.`);
      });
    }
  });
  if (ids.size !== 27) errors.push("Candidate ID 집합이 27개가 아닙니다.");
  return errors;
}
export function filterPork33Candidates(
  candidates: readonly Pork33CandidateState[],
  filter: Pork33CandidateFilter,
) {
  const query = filter.query?.trim().toLocaleLowerCase("ko-KR") ?? "";
  return candidates.filter((candidate) => {
    if (filter.regionId && candidate.linkage.regionId !== filter.regionId) return false;
    if (filter.apartmentAreaId && candidate.linkage.apartmentAreaId !== filter.apartmentAreaId) return false;
    if (filter.lifecycleStatus && candidate.normalized.reviewStatus !== filter.lifecycleStatus) return false;
    if (!query) return true;
    return [candidate.identity.displayCode, candidate.normalized.addressFull, candidate.normalized.mainApartmentRaw,
      candidate.normalized.fieldNoteRaw, candidate.source.printedNumber]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(query));
  }).sort((left, right) => left.source.sourceRowOrder - right.source.sourceRowOrder);
}
export function getApprovedPork33Candidates(candidates: readonly Pork33CandidateState[]) {
  return candidates.filter((candidate) => getActivePork33Revision(candidate)?.status === "APPROVED");
}
export function getPork33SeedPackage(seed: Pork33SeedPackage = PORK33_SANITIZED_SEED) {
  return structuredClone(seed);
}
