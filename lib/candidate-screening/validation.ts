import { isCandidateStoreId } from "../field/identifiers";
import {
  CANDIDATE_LIFECYCLE_STATUSES,
  CANDIDATE_SCREENING_SCHEMA_VERSION,
  type CandidateLifecycleStatus,
  type CandidateScreeningRecordV1,
  type CandidateScreeningValidationResult,
  type SiteCriteriaProfileReference,
} from "./types";

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "candidateStoreId",
  "analysisClusterId",
  "lifecycleStatus",
  "criteriaProfileRef",
  "reviewedAt",
  "reviewedBy",
  "note",
  "createdAt",
  "updatedAt",
]);

const PROFILE_REFERENCE_KEYS = new Set(["profileId", "profileVersion"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function reportUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}는 Candidate Screening V1 필드가 아닙니다.`);
  }
}

function optionalText(
  value: unknown,
  key: "reviewedAt" | "reviewedBy" | "note" | "updatedAt",
  errors: string[],
) {
  if (value === undefined) return undefined;
  if (!isNonEmpty(value)) {
    errors.push(`${key}는 제공하는 경우 비어 있지 않은 문자열이어야 합니다.`);
    return undefined;
  }
  return value;
}

function parseProfileReference(
  value: unknown,
  errors: string[],
): SiteCriteriaProfileReference | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push("criteriaProfileRef는 객체여야 합니다.");
    return undefined;
  }
  reportUnknownKeys(value, PROFILE_REFERENCE_KEYS, "criteriaProfileRef", errors);
  if (!isNonEmpty(value.profileId)) errors.push("criteriaProfileRef.profileId가 필요합니다.");
  if (!isNonEmpty(value.profileVersion)) {
    errors.push("criteriaProfileRef.profileVersion이 필요합니다.");
  }
  if (!isNonEmpty(value.profileId) || !isNonEmpty(value.profileVersion)) return undefined;
  return Object.freeze({
    profileId: value.profileId,
    profileVersion: value.profileVersion,
  });
}

function isLifecycleStatus(value: unknown): value is CandidateLifecycleStatus {
  return typeof value === "string"
    && (CANDIDATE_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

/** Contract shape만 검증하며 상태를 자동 변경하거나 참조 대상의 실제 존재 여부를 조회하지 않는다. */
export function validateCandidateScreening(
  value: unknown,
): CandidateScreeningValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "INVALID_CANDIDATE_SCREENING",
      message: "Candidate Screening V1 검증에 실패했습니다.",
      errors: Object.freeze(["Candidate Screening은 객체여야 합니다."]),
    };
  }

  reportUnknownKeys(value, TOP_LEVEL_KEYS, "candidateScreening", errors);
  if (value.schemaVersion !== CANDIDATE_SCREENING_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${CANDIDATE_SCREENING_SCHEMA_VERSION}이어야 합니다.`);
  }
  if (!isCandidateStoreId(value.candidateStoreId)) {
    errors.push("candidateStoreId가 올바른 Candidate ID가 아닙니다.");
  }
  if (!isNonEmpty(value.analysisClusterId)) {
    errors.push("analysisClusterId는 비어 있지 않은 ID여야 합니다.");
  }
  if (!isLifecycleStatus(value.lifecycleStatus)) {
    errors.push("lifecycleStatus가 지원되는 Candidate 상태가 아닙니다.");
  }
  if (!isNonEmpty(value.createdAt)) {
    errors.push("createdAt은 비어 있지 않은 문자열이어야 합니다.");
  }

  const criteriaProfileRef = parseProfileReference(value.criteriaProfileRef, errors);
  const reviewedAt = optionalText(value.reviewedAt, "reviewedAt", errors);
  const reviewedBy = optionalText(value.reviewedBy, "reviewedBy", errors);
  const note = optionalText(value.note, "note", errors);
  const updatedAt = optionalText(value.updatedAt, "updatedAt", errors);

  if (errors.length > 0) {
    return {
      ok: false,
      code: "INVALID_CANDIDATE_SCREENING",
      message: "Candidate Screening V1 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }

  const record: CandidateScreeningRecordV1 = {
    schemaVersion: CANDIDATE_SCREENING_SCHEMA_VERSION,
    candidateStoreId: value.candidateStoreId as string,
    analysisClusterId: value.analysisClusterId as string,
    lifecycleStatus: value.lifecycleStatus as CandidateLifecycleStatus,
    ...(criteriaProfileRef ? { criteriaProfileRef } : {}),
    ...(reviewedAt ? { reviewedAt } : {}),
    ...(reviewedBy ? { reviewedBy } : {}),
    ...(note ? { note } : {}),
    createdAt: value.createdAt as string,
    ...(updatedAt ? { updatedAt } : {}),
  };
  return { ok: true, value: Object.freeze(record) };
}
