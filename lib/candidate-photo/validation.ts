import type { EvidenceOwnershipBindingV1 } from "../evidence/ownership-snapshot-types";
import { validateEvidenceOwnershipBindingsV1 } from "../evidence/ownership-snapshot-validation";
import { isCandidateStoreId } from "../field/identifiers";
import {
  isCandidatePhotoCaseId,
  validateCandidatePhotoAssetRefV1,
} from "./asset-reference";
import { isCandidatePhotoCategory } from "./category";
import { isCandidatePhotoId } from "./identifiers";
import {
  CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION,
  CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION,
  type CandidatePhotoCollectionValidationResult,
  type CandidatePhotoContractFailureCode,
  type CandidatePhotoContractFailureV1,
  type CandidatePhotoMetadataV1,
  type CandidatePhotoMetadataValidationResult,
  type CandidatePhotoProfileV1,
  type CandidatePhotoProfileValidationResult,
} from "./types";

const METADATA_KEYS = new Set([
  "schemaVersion", "metadataVersion", "photoId", "caseId", "candidateStoreId",
  "assetRef", "evidenceRef", "category", "sortOrder", "includeInBriefing",
  "includeInReport", "fieldMemoRaw", "uploadedAt", "takenAt", "deletedAt",
]);
const PROFILE_KEYS = new Set([
  "schemaVersion", "profileVersion", "caseId", "candidateStoreId",
  "primaryPhotoId", "photoIds", "updatedAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T/u.test(value)
    && Number.isFinite(Date.parse(value));
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${path}.${key}는 허용되지 않습니다.`);
}

function failure(
  code: CandidatePhotoContractFailureCode,
  message: string,
  errors: readonly string[],
): CandidatePhotoContractFailureV1 {
  return Object.freeze({ ok: false, code, message, errors: Object.freeze([...errors]) });
}

function assetFailureCode(code: string): CandidatePhotoContractFailureCode {
  if (code === "FOREIGN_CASE_PHOTO") return "FOREIGN_CASE_PHOTO";
  if (code === "FOREIGN_CANDIDATE_PHOTO") return "FOREIGN_CANDIDATE_PHOTO";
  return "ASSET_REFERENCE_MISMATCH";
}

/** Strict unknown-key rejection과 ownership 검증을 함께 수행한다. */
export function validateCandidatePhotoMetadataV1(value: unknown): CandidatePhotoMetadataValidationResult {
  if (!isRecord(value)) {
    return failure("INVALID_PHOTO_METADATA", "Candidate Photo metadata가 올바르지 않습니다.", ["metadata는 객체여야 합니다."]);
  }
  const errors = unknownKeys(value, METADATA_KEYS, "metadata");
  if (value.schemaVersion !== CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION) errors.push("metadata.schemaVersion이 올바르지 않습니다.");
  if (!isNonEmpty(value.metadataVersion)) errors.push("metadata.metadataVersion이 필요합니다.");
  if (!isCandidatePhotoId(value.photoId)) errors.push("metadata.photoId가 올바르지 않습니다.");
  if (!isCandidatePhotoCaseId(value.caseId)) errors.push("metadata.caseId가 올바르지 않습니다.");
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("metadata.candidateStoreId가 올바르지 않습니다.");
  if (!isNonEmpty(value.assetRef)) errors.push("metadata.assetRef가 필요합니다.");
  if (value.evidenceRef !== null && !isNonEmpty(value.evidenceRef)) errors.push("metadata.evidenceRef가 올바르지 않습니다.");
  if (!isCandidatePhotoCategory(value.category)) errors.push("metadata.category가 올바르지 않습니다.");
  if (!Number.isInteger(value.sortOrder) || (value.sortOrder as number) < 0) errors.push("metadata.sortOrder는 0 이상의 정수여야 합니다.");
  if (!isNullableBoolean(value.includeInBriefing)) errors.push("metadata.includeInBriefing은 boolean 또는 null이어야 합니다.");
  if (!isNullableBoolean(value.includeInReport)) errors.push("metadata.includeInReport는 boolean 또는 null이어야 합니다.");
  if (value.fieldMemoRaw !== null && typeof value.fieldMemoRaw !== "string") errors.push("metadata.fieldMemoRaw는 string 또는 null이어야 합니다.");
  if (!isIsoTimestamp(value.uploadedAt)) errors.push("metadata.uploadedAt이 올바른 ISO timestamp가 아닙니다.");
  if (value.takenAt !== null && !isIsoTimestamp(value.takenAt)) errors.push("metadata.takenAt이 올바른 ISO timestamp가 아닙니다.");
  if (value.deletedAt !== null && !isIsoTimestamp(value.deletedAt)) errors.push("metadata.deletedAt이 올바른 ISO timestamp가 아닙니다.");

  if (isCandidatePhotoCaseId(value.caseId) && isCandidateStoreId(value.candidateStoreId) && isNonEmpty(value.assetRef)) {
    const asset = validateCandidatePhotoAssetRefV1(value.caseId, value.candidateStoreId, value.assetRef);
    if (!asset.ok) {
      return failure(assetFailureCode(asset.code), "Candidate Photo asset ownership이 일치하지 않습니다.", [asset.code]);
    }
  }

  if (
    errors.length > 0
    || !isNonEmpty(value.metadataVersion)
    || !isCandidatePhotoId(value.photoId)
    || !isCandidatePhotoCaseId(value.caseId)
    || !isCandidateStoreId(value.candidateStoreId)
    || !isNonEmpty(value.assetRef)
    || (value.evidenceRef !== null && !isNonEmpty(value.evidenceRef))
    || !isCandidatePhotoCategory(value.category)
    || !Number.isInteger(value.sortOrder)
    || (value.sortOrder as number) < 0
    || !isNullableBoolean(value.includeInBriefing)
    || !isNullableBoolean(value.includeInReport)
    || (value.fieldMemoRaw !== null && typeof value.fieldMemoRaw !== "string")
    || !isIsoTimestamp(value.uploadedAt)
    || (value.takenAt !== null && !isIsoTimestamp(value.takenAt))
    || (value.deletedAt !== null && !isIsoTimestamp(value.deletedAt))
  ) return failure("INVALID_PHOTO_METADATA", "Candidate Photo metadata가 올바르지 않습니다.", errors);

  const fieldMemoRaw = value.fieldMemoRaw !== null && value.fieldMemoRaw.trim() === ""
    ? null
    : value.fieldMemoRaw;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION,
      metadataVersion: value.metadataVersion,
      photoId: value.photoId,
      caseId: value.caseId,
      candidateStoreId: value.candidateStoreId,
      assetRef: value.assetRef,
      evidenceRef: value.evidenceRef,
      category: value.category,
      sortOrder: value.sortOrder as number,
      includeInBriefing: value.includeInBriefing,
      includeInReport: value.includeInReport,
      fieldMemoRaw,
      uploadedAt: value.uploadedAt,
      takenAt: value.takenAt,
      deletedAt: value.deletedAt,
    }),
  });
}

export function validateCandidatePhotoProfileV1(value: unknown): CandidatePhotoProfileValidationResult {
  if (!isRecord(value)) {
    return failure("INVALID_PHOTO_PROFILE", "Candidate Photo profile이 올바르지 않습니다.", ["profile은 객체여야 합니다."]);
  }
  const errors = unknownKeys(value, PROFILE_KEYS, "profile");
  if (value.schemaVersion !== CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION) errors.push("profile.schemaVersion이 올바르지 않습니다.");
  if (!isNonEmpty(value.profileVersion)) errors.push("profile.profileVersion이 필요합니다.");
  if (!isCandidatePhotoCaseId(value.caseId)) errors.push("profile.caseId가 올바르지 않습니다.");
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("profile.candidateStoreId가 올바르지 않습니다.");
  if (value.primaryPhotoId !== null && !isCandidatePhotoId(value.primaryPhotoId)) errors.push("profile.primaryPhotoId가 올바르지 않습니다.");
  if (!isIsoTimestamp(value.updatedAt)) errors.push("profile.updatedAt이 올바른 ISO timestamp가 아닙니다.");

  let photoIds: readonly string[] | null = null;
  if (!Array.isArray(value.photoIds)) {
    errors.push("profile.photoIds는 배열이어야 합니다.");
  } else {
    value.photoIds.forEach((id, index) => {
      if (!isCandidatePhotoId(id)) errors.push(`profile.photoIds[${index}]가 올바르지 않습니다.`);
    });
    const validIds = value.photoIds.filter(isCandidatePhotoId);
    if (new Set(validIds).size !== validIds.length) errors.push("profile.photoIds에 중복 photoId가 있습니다.");
    photoIds = value.photoIds;
  }
  if (photoIds && isCandidatePhotoId(value.primaryPhotoId) && !photoIds.includes(value.primaryPhotoId)) {
    errors.push("profile.primaryPhotoId는 profile.photoIds에 포함되어야 합니다.");
  }
  if (
    errors.length > 0 || !isNonEmpty(value.profileVersion) || !isCandidatePhotoCaseId(value.caseId)
    || !isCandidateStoreId(value.candidateStoreId) || !photoIds || !isIsoTimestamp(value.updatedAt)
    || (value.primaryPhotoId !== null && !isCandidatePhotoId(value.primaryPhotoId))
  ) return failure("INVALID_PHOTO_PROFILE", "Candidate Photo profile이 올바르지 않습니다.", errors);

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION,
      profileVersion: value.profileVersion,
      caseId: value.caseId,
      candidateStoreId: value.candidateStoreId,
      primaryPhotoId: value.primaryPhotoId,
      photoIds: Object.freeze([...photoIds]),
      updatedAt: value.updatedAt,
    }),
  });
}

function metadataFailure(results: readonly CandidatePhotoMetadataValidationResult[]): CandidatePhotoContractFailureV1 | null {
  const failed = results.find((result): result is CandidatePhotoContractFailureV1 => !result.ok);
  return failed ?? null;
}

/** sortOrder 중복은 허용하고 stable photoId를 최종 tie-break로 사용한다. */
export function compareCandidatePhotoMetadataV1(
  left: CandidatePhotoMetadataV1,
  right: CandidatePhotoMetadataV1,
): number {
  return left.sortOrder - right.sortOrder || left.photoId.localeCompare(right.photoId);
}

export function orderCandidatePhotoMetadataV1(
  photos: readonly CandidatePhotoMetadataV1[],
): readonly CandidatePhotoMetadataV1[] {
  return Object.freeze([...photos].sort(compareCandidatePhotoMetadataV1));
}

/** Profile, metadata set, optional Evidence ownership sidecar를 하나의 Candidate context로 검증한다. */
export function validateCandidatePhotoCollectionV1(
  profileInput: unknown,
  metadataInput: unknown,
  evidenceOwnershipBindings: unknown = [],
): CandidatePhotoCollectionValidationResult {
  const profileResult = validateCandidatePhotoProfileV1(profileInput);
  if (!profileResult.ok) return profileResult;
  if (!Array.isArray(metadataInput)) {
    return failure("INVALID_PHOTO_METADATA", "Candidate Photo metadata collection이 올바르지 않습니다.", ["photos는 배열이어야 합니다."]);
  }
  const metadataResults = metadataInput.map(validateCandidatePhotoMetadataV1);
  const failedMetadata = metadataFailure(metadataResults);
  if (failedMetadata) return failedMetadata;
  const photos = metadataResults.map((result) => (result as { readonly ok: true; readonly value: CandidatePhotoMetadataV1 }).value);
  const ids = photos.map((photo) => photo.photoId);
  if (new Set(ids).size !== ids.length) {
    return failure("DUPLICATE_PHOTO_ID", "중복 Candidate Photo ID를 허용하지 않습니다.", ["metadata photoId duplicate"]);
  }
  const foreignCase = photos.find((photo) => photo.caseId !== profileResult.value.caseId);
  if (foreignCase) return failure("FOREIGN_CASE_PHOTO", "다른 Case의 Photo metadata입니다.", [foreignCase.photoId]);
  const foreignCandidate = photos.find((photo) => photo.candidateStoreId !== profileResult.value.candidateStoreId);
  if (foreignCandidate) return failure("FOREIGN_CANDIDATE_PHOTO", "다른 Candidate의 Photo metadata입니다.", [foreignCandidate.photoId]);

  if (ids.length !== profileResult.value.photoIds.length || ids.some((id) => !profileResult.value.photoIds.includes(id))) {
    return failure("PHOTO_SET_MISMATCH", "Profile과 metadata의 Photo set이 일치하지 않습니다.", ["photoIds mismatch"]);
  }

  const primary = profileResult.value.primaryPhotoId === null
    ? null
    : photos.find((photo) => photo.photoId === profileResult.value.primaryPhotoId) ?? null;
  if (profileResult.value.primaryPhotoId !== null && !primary) {
    return failure("PRIMARY_PHOTO_NOT_FOUND", "Primary Photo metadata를 찾을 수 없습니다.", [profileResult.value.primaryPhotoId]);
  }
  if (primary?.deletedAt !== null && primary !== null) {
    return failure("PRIMARY_PHOTO_DELETED", "삭제된 Photo를 Primary로 지정할 수 없습니다.", [primary.photoId]);
  }

  const ownershipResult = validateEvidenceOwnershipBindingsV1(evidenceOwnershipBindings);
  if (!ownershipResult.ok) {
    return failure("INVALID_EVIDENCE_OWNERSHIP", "Evidence ownership bindings가 올바르지 않습니다.", ownershipResult.errors);
  }
  const ownershipByReference = new Map<string, EvidenceOwnershipBindingV1>(
    ownershipResult.value.map((binding) => [binding.evidenceRef, binding]),
  );
  for (const photo of photos) {
    if (photo.evidenceRef === null) continue;
    const binding = ownershipByReference.get(photo.evidenceRef);
    if (!binding) {
      return failure("EVIDENCE_OWNERSHIP_NOT_FOUND", "Photo Evidence ownership을 찾을 수 없습니다.", [photo.evidenceRef]);
    }
    if (
      binding.ownership.scopeType !== "CANDIDATE"
      || binding.ownership.caseId !== photo.caseId
      || binding.ownership.candidateStoreId !== photo.candidateStoreId
    ) {
      return failure("FOREIGN_EVIDENCE", "Photo와 다른 Candidate/Case의 Evidence입니다.", [photo.evidenceRef]);
    }
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({ profile: profileResult.value, photos: orderCandidatePhotoMetadataV1(photos) }),
  });
}

export function createCandidatePhotoMetadataV1(
  input: Omit<CandidatePhotoMetadataV1, "schemaVersion">,
): CandidatePhotoMetadataV1 {
  const result = validateCandidatePhotoMetadataV1({ ...input, schemaVersion: CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION });
  if (!result.ok) throw new TypeError(`${result.message} ${result.errors.join(" ")}`);
  return result.value;
}

export function createCandidatePhotoProfileV1(
  input: Omit<CandidatePhotoProfileV1, "schemaVersion">,
): CandidatePhotoProfileV1 {
  const result = validateCandidatePhotoProfileV1({ ...input, schemaVersion: CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION });
  if (!result.ok) throw new TypeError(`${result.message} ${result.errors.join(" ")}`);
  return result.value;
}
