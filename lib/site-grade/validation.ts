import { isCandidateStoreId } from "../field/identifiers";
import type { SiteCriteriaProfileReference } from "../candidate-screening/types";
import {
  EVIDENCE_CONFIDENCE_LEVELS,
  SITE_GRADE_INPUT_SCHEMA_VERSION,
  SITE_GRADE_RESULT_SCHEMA_VERSION,
  SITE_GRADES,
  type EvidenceConfidence,
  type SiteGrade,
  type SiteGradeInputV1,
  type SiteGradeResultV1,
  type SiteGradeValidationFailure,
  type SiteGradeValidationResult,
} from "./types";

const INPUT_KEYS = new Set([
  "schemaVersion",
  "candidateStoreId",
  "analysisClusterId",
  "criteriaProfileRef",
  "criteriaEvaluationSetId",
  "ruleSetVersion",
  "evidenceConfidenceRef",
  "riskSnapshotRef",
]);

const RESULT_KEYS = new Set([
  "schemaVersion",
  "siteGradeResultId",
  "candidateStoreId",
  "analysisClusterId",
  "criteriaProfileRef",
  "evaluationSetId",
  "ruleSetVersion",
  "grade",
  "matchedCriteriaKeys",
  "conditionalCriteriaKeys",
  "gapCriteriaKeys",
  "hardGapCriteriaKeys",
  "unknownCriteriaKeys",
  "rationale",
  "generatedAt",
  "generatedBy",
  "evidenceConfidence",
  "reviewRequired",
]);

const PROFILE_REFERENCE_KEYS = new Set(["profileId", "profileVersion"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}는 Site Grade Contract V1 필드가 아닙니다.`);
  }
}

function optionalText(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return undefined;
  if (!isNonEmpty(value)) {
    errors.push(`${path}는 제공하는 경우 비어 있지 않은 문자열이어야 합니다.`);
    return undefined;
  }
  return value;
}

function parseProfileReference(
  value: unknown,
  path: string,
  errors: string[],
): SiteCriteriaProfileReference | null {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return null;
  }
  unknownKeys(value, PROFILE_REFERENCE_KEYS, path, errors);
  if (!isNonEmpty(value.profileId)) errors.push(`${path}.profileId가 필요합니다.`);
  if (!isNonEmpty(value.profileVersion)) errors.push(`${path}.profileVersion이 필요합니다.`);
  if (!isNonEmpty(value.profileId) || !isNonEmpty(value.profileVersion)) return null;
  return Object.freeze({ profileId: value.profileId, profileVersion: value.profileVersion });
}

function parseStringArray(
  value: unknown,
  path: string,
  errors: string[],
  allowEmpty = true,
): readonly string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 배열이어야 합니다.`);
    return null;
  }
  if (!allowEmpty && value.length === 0) errors.push(`${path}는 최소 1개 항목이 필요합니다.`);
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!isNonEmpty(item)) {
      errors.push(`${path}[${index}]는 비어 있지 않은 문자열이어야 합니다.`);
      return;
    }
    if (seen.has(item)) {
      errors.push(`${path}에 중복 값 ${item}가 있습니다.`);
      return;
    }
    seen.add(item);
    result.push(item);
  });
  return Object.freeze(result);
}

function failure(errors: string[]): SiteGradeValidationFailure {
  return Object.freeze({
    ok: false,
    code: "INVALID_SITE_GRADE_CONTRACT",
    message: "Site Grade Contract V1 검증에 실패했습니다.",
    errors: Object.freeze(errors),
  });
}

function isGrade(value: unknown): value is SiteGrade {
  return typeof value === "string" && (SITE_GRADES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is EvidenceConfidence {
  return typeof value === "string"
    && (EVIDENCE_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function validateSiteGradeInput(value: unknown): SiteGradeValidationResult<SiteGradeInputV1> {
  const errors: string[] = [];
  if (!isRecord(value)) return failure(["Site Grade Input은 객체여야 합니다."]);
  unknownKeys(value, INPUT_KEYS, "siteGradeInput", errors);
  if (value.schemaVersion !== SITE_GRADE_INPUT_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${SITE_GRADE_INPUT_SCHEMA_VERSION}이어야 합니다.`);
  }
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("candidateStoreId가 올바르지 않습니다.");
  for (const key of ["analysisClusterId", "criteriaEvaluationSetId", "ruleSetVersion"] as const) {
    if (!isNonEmpty(value[key])) errors.push(`${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  const criteriaProfileRef = parseProfileReference(value.criteriaProfileRef, "criteriaProfileRef", errors);
  const evidenceConfidenceRef = optionalText(
    value.evidenceConfidenceRef,
    "evidenceConfidenceRef",
    errors,
  );
  const riskSnapshotRef = optionalText(value.riskSnapshotRef, "riskSnapshotRef", errors);
  if (errors.length > 0 || !criteriaProfileRef) return failure(errors);
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: SITE_GRADE_INPUT_SCHEMA_VERSION,
      candidateStoreId: value.candidateStoreId as string,
      analysisClusterId: value.analysisClusterId as string,
      criteriaProfileRef,
      criteriaEvaluationSetId: value.criteriaEvaluationSetId as string,
      ruleSetVersion: value.ruleSetVersion as string,
      ...(evidenceConfidenceRef ? { evidenceConfidenceRef } : {}),
      ...(riskSnapshotRef ? { riskSnapshotRef } : {}),
    }),
  };
}

export function validateSiteGradeResult(value: unknown): SiteGradeValidationResult<SiteGradeResultV1> {
  const errors: string[] = [];
  if (!isRecord(value)) return failure(["Site Grade Result는 객체여야 합니다."]);
  unknownKeys(value, RESULT_KEYS, "siteGradeResult", errors);
  if (value.schemaVersion !== SITE_GRADE_RESULT_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${SITE_GRADE_RESULT_SCHEMA_VERSION}이어야 합니다.`);
  }
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("candidateStoreId가 올바르지 않습니다.");
  for (const key of [
    "siteGradeResultId",
    "analysisClusterId",
    "evaluationSetId",
    "ruleSetVersion",
    "generatedAt",
  ] as const) {
    if (!isNonEmpty(value[key])) errors.push(`${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (!isGrade(value.grade)) errors.push("grade는 A, B, C, D, U 중 하나여야 합니다.");
  const criteriaProfileRef = parseProfileReference(value.criteriaProfileRef, "criteriaProfileRef", errors);
  const matchedCriteriaKeys = parseStringArray(value.matchedCriteriaKeys, "matchedCriteriaKeys", errors);
  const conditionalCriteriaKeys = parseStringArray(
    value.conditionalCriteriaKeys,
    "conditionalCriteriaKeys",
    errors,
  );
  const gapCriteriaKeys = parseStringArray(value.gapCriteriaKeys, "gapCriteriaKeys", errors);
  const hardGapCriteriaKeys = parseStringArray(value.hardGapCriteriaKeys, "hardGapCriteriaKeys", errors);
  const unknownCriteriaKeys = parseStringArray(value.unknownCriteriaKeys, "unknownCriteriaKeys", errors);
  const rationale = parseStringArray(value.rationale, "rationale", errors, false);
  const criteriaGroups = [
    matchedCriteriaKeys,
    conditionalCriteriaKeys,
    gapCriteriaKeys,
    hardGapCriteriaKeys,
    unknownCriteriaKeys,
  ];
  const seenCriteria = new Set<string>();
  for (const group of criteriaGroups) {
    if (!group) continue;
    for (const key of group) {
      if (seenCriteria.has(key)) errors.push(`criterionKey ${key}가 여러 결과 그룹에 중복되었습니다.`);
      seenCriteria.add(key);
    }
  }
  const generatedBy = optionalText(value.generatedBy, "generatedBy", errors);
  let evidenceConfidence: EvidenceConfidence | undefined;
  if (value.evidenceConfidence !== undefined) {
    if (!isConfidence(value.evidenceConfidence)) {
      errors.push("evidenceConfidence가 올바르지 않습니다.");
    } else {
      evidenceConfidence = value.evidenceConfidence;
    }
  }
  if (value.reviewRequired !== undefined && typeof value.reviewRequired !== "boolean") {
    errors.push("reviewRequired는 제공하는 경우 boolean이어야 합니다.");
  }
  if (
    errors.length > 0
    || !criteriaProfileRef
    || !matchedCriteriaKeys
    || !conditionalCriteriaKeys
    || !gapCriteriaKeys
    || !hardGapCriteriaKeys
    || !unknownCriteriaKeys
    || !rationale
  ) return failure(errors);
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: SITE_GRADE_RESULT_SCHEMA_VERSION,
      siteGradeResultId: value.siteGradeResultId as string,
      candidateStoreId: value.candidateStoreId as string,
      analysisClusterId: value.analysisClusterId as string,
      criteriaProfileRef,
      evaluationSetId: value.evaluationSetId as string,
      ruleSetVersion: value.ruleSetVersion as string,
      grade: value.grade as SiteGrade,
      matchedCriteriaKeys,
      conditionalCriteriaKeys,
      gapCriteriaKeys,
      hardGapCriteriaKeys,
      unknownCriteriaKeys,
      rationale,
      generatedAt: value.generatedAt as string,
      ...(generatedBy ? { generatedBy } : {}),
      ...(evidenceConfidence ? { evidenceConfidence } : {}),
      ...(typeof value.reviewRequired === "boolean"
        ? { reviewRequired: value.reviewRequired }
        : {}),
    }),
  };
}
