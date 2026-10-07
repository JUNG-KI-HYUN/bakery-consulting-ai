/**
 * CandidateDecisionContext pure validation.
 * 저장소 I/O로 ID 존재 여부를 조회하지 않는다.
 */

import { isCandidateStoreId, isSiteSurveyId } from "../field/identifiers";
import { isLayoutId } from "../space-fit/identifiers";
import type {
  CandidateDecisionContext,
  CandidateDecisionContextV2,
  CandidateDecisionValidationResult,
  CandidateLeaseEvidenceBinding,
  EconomicAnalysisBinding,
  FieldSpaceBinding,
  LeaseAnalysisBinding,
  LocationAnalysisBinding,
} from "./types";
import {
  CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION,
  CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION,
} from "./types";

function fail(message: string): CandidateDecisionValidationResult<never> {
  return { ok: false, code: "INVALID_BINDING", message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateLocationAnalysisBinding(
  value: unknown,
): CandidateDecisionValidationResult<LocationAnalysisBinding | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("locationBinding must be object or null");
  }
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.analysisRunId)) {
    return fail("locationBinding.analysisRunId must be a non-empty string");
  }
  return {
    ok: true,
    value: Object.freeze({ analysisRunId: record.analysisRunId.trim() }),
  };
}

export function validateLeaseAnalysisBinding(
  value: unknown,
): CandidateDecisionValidationResult<LeaseAnalysisBinding | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("leaseBinding must be object or null");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.selectedResearchRecordIds)) {
    return fail("leaseBinding.selectedResearchRecordIds must be an array");
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of record.selectedResearchRecordIds) {
    if (!isNonEmptyString(item)) {
      return fail("leaseBinding.selectedResearchRecordIds must not contain empty ids");
    }
    const trimmed = item.trim();
    if (seen.has(trimmed)) {
      return fail("leaseBinding.selectedResearchRecordIds must not contain duplicates");
    }
    seen.add(trimmed);
    ids.push(trimmed);
  }
  if (record.referenceDate !== null && record.referenceDate !== undefined) {
    if (!isNonEmptyString(record.referenceDate)) {
      return fail("leaseBinding.referenceDate must be non-empty string or null");
    }
  }
  const referenceDate =
    record.referenceDate === undefined || record.referenceDate === null
      ? null
      : (record.referenceDate as string).trim();
  return {
    ok: true,
    value: Object.freeze({
      selectedResearchRecordIds: Object.freeze(ids),
      referenceDate,
    }),
  };
}

export function validateEconomicAnalysisBinding(
  value: unknown,
): CandidateDecisionValidationResult<EconomicAnalysisBinding | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("economicBinding must be object or null");
  }
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.generatedAt)) {
    return fail("economicBinding.generatedAt must be a non-empty string");
  }
  if (
    record.engineVersion !== undefined &&
    record.engineVersion !== "economic-feasibility-v1"
  ) {
    return fail("economicBinding.engineVersion must be economic-feasibility-v1 when present");
  }
  return {
    ok: true,
    value: Object.freeze({
      generatedAt: record.generatedAt.trim(),
      engineVersion: "economic-feasibility-v1" as const,
    }),
  };
}

export function validateFieldSpaceBinding(
  value: unknown,
): CandidateDecisionValidationResult<FieldSpaceBinding | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("fieldBinding must be object or null");
  }
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.surveyId)) {
    return fail("fieldBinding.surveyId must be a non-empty string");
  }
  if (!isSiteSurveyId(record.surveyId.trim())) {
    return fail("fieldBinding.surveyId must use survey_<uuid>");
  }
  if (record.layoutId === null) {
    return {
      ok: true,
      value: Object.freeze({
        surveyId: record.surveyId.trim(),
        layoutId: null,
      }),
    };
  }
  if (!isNonEmptyString(record.layoutId)) {
    return fail("fieldBinding.layoutId must be non-empty string or null");
  }
  if (!isLayoutId(record.layoutId.trim())) {
    return fail("fieldBinding.layoutId must use layout_<uuid>");
  }
  return {
    ok: true,
    value: Object.freeze({
      surveyId: record.surveyId.trim(),
      layoutId: record.layoutId.trim(),
    }),
  };
}

export function validateCandidateDecisionContext(
  value: unknown,
): CandidateDecisionValidationResult<CandidateDecisionContext> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("CandidateDecisionContext must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION) {
    return fail("unsupported CandidateDecisionContext schemaVersion");
  }
  if (!isNonEmptyString(record.candidateStoreId)) {
    return fail("candidateStoreId must be a non-empty string");
  }
  if (!isCandidateStoreId(record.candidateStoreId.trim())) {
    return fail("candidateStoreId must use store_<uuid>");
  }
  if (!isNonEmptyString(record.createdAt)) {
    return fail("createdAt must be a non-empty string");
  }
  if (record.createsVerdict !== false) {
    return fail("createsVerdict must be false");
  }
  if (record.createsScore !== false) {
    return fail("createsScore must be false");
  }
  if (record.createsRisk !== false) {
    return fail("createsRisk must be false");
  }

  // Reject Risk/Verdict/Score payload fields if present
  for (const forbidden of [
    "verdict",
    "riskScore",
    "score",
    "recommendation",
    "hardFail",
    "block",
    "reject",
  ]) {
    if (forbidden in record) {
      return fail(`CandidateDecisionContext must not include ${forbidden}`);
    }
  }

  const location = validateLocationAnalysisBinding(
    "locationBinding" in record ? record.locationBinding : null,
  );
  if (!location.ok) return location;
  const lease = validateLeaseAnalysisBinding(
    "leaseBinding" in record ? record.leaseBinding : null,
  );
  if (!lease.ok) return lease;
  const economic = validateEconomicAnalysisBinding(
    "economicBinding" in record ? record.economicBinding : null,
  );
  if (!economic.ok) return economic;
  const field = validateFieldSpaceBinding(
    "fieldBinding" in record ? record.fieldBinding : null,
  );
  if (!field.ok) return field;

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION,
      candidateStoreId: record.candidateStoreId.trim(),
      locationBinding: location.value,
      leaseBinding: lease.value,
      economicBinding: economic.value,
      fieldBinding: field.value,
      createdAt: record.createdAt.trim(),
      createsVerdict: false as const,
      createsScore: false as const,
      createsRisk: false as const,
    }),
  };
}

export function validateCandidateLeaseEvidenceBinding(
  value: unknown,
): CandidateDecisionValidationResult<CandidateLeaseEvidenceBinding | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("candidateLeaseBinding must be object or null");
  }
  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => key !== "snapshotId");
  if (unknownKey !== undefined) {
    return fail(`candidateLeaseBinding must not include ${unknownKey}`);
  }
  if (!isNonEmptyString(record.snapshotId)) {
    return fail("candidateLeaseBinding.snapshotId must be a non-empty string");
  }
  return {
    ok: true,
    value: Object.freeze({ snapshotId: record.snapshotId.trim() }),
  };
}

const CANDIDATE_DECISION_CONTEXT_V2_KEYS: ReadonlySet<string> = new Set([
  "schemaVersion",
  "candidateStoreId",
  "locationBinding",
  "leaseBinding",
  "candidateLeaseBinding",
  "economicBinding",
  "fieldBinding",
  "createdAt",
  "createsVerdict",
  "createsScore",
  "createsRisk",
]);

/** V1과 달리 정의되지 않은 top-level key를 버리지 않고 reject한다. */
export function validateCandidateDecisionContextV2(
  value: unknown,
): CandidateDecisionValidationResult<CandidateDecisionContextV2> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("CandidateDecisionContextV2 must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION) {
    return fail("unsupported CandidateDecisionContextV2 schemaVersion");
  }
  const unknownKey = Object.keys(record).find((key) => !CANDIDATE_DECISION_CONTEXT_V2_KEYS.has(key));
  if (unknownKey !== undefined) {
    return fail(`CandidateDecisionContextV2 must not include ${unknownKey}`);
  }
  if (!isNonEmptyString(record.candidateStoreId)) {
    return fail("candidateStoreId must be a non-empty string");
  }
  if (!isCandidateStoreId(record.candidateStoreId.trim())) {
    return fail("candidateStoreId must use store_<uuid>");
  }
  if (!isNonEmptyString(record.createdAt)) {
    return fail("createdAt must be a non-empty string");
  }
  if (record.createsVerdict !== false) {
    return fail("createsVerdict must be false");
  }
  if (record.createsScore !== false) {
    return fail("createsScore must be false");
  }
  if (record.createsRisk !== false) {
    return fail("createsRisk must be false");
  }

  const location = validateLocationAnalysisBinding(
    "locationBinding" in record ? record.locationBinding : null,
  );
  if (!location.ok) return location;
  const lease = validateLeaseAnalysisBinding(
    "leaseBinding" in record ? record.leaseBinding : null,
  );
  if (!lease.ok) return lease;
  const candidateLease = validateCandidateLeaseEvidenceBinding(
    "candidateLeaseBinding" in record ? record.candidateLeaseBinding : null,
  );
  if (!candidateLease.ok) return candidateLease;
  const economic = validateEconomicAnalysisBinding(
    "economicBinding" in record ? record.economicBinding : null,
  );
  if (!economic.ok) return economic;
  const field = validateFieldSpaceBinding(
    "fieldBinding" in record ? record.fieldBinding : null,
  );
  if (!field.ok) return field;

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION,
      candidateStoreId: record.candidateStoreId.trim(),
      locationBinding: location.value,
      leaseBinding: lease.value,
      candidateLeaseBinding: candidateLease.value,
      economicBinding: economic.value,
      fieldBinding: field.value,
      createdAt: record.createdAt.trim(),
      createsVerdict: false as const,
      createsScore: false as const,
      createsRisk: false as const,
    }),
  };
}
