import { isCandidateStoreId } from "../field/identifiers";
import type { SiteCriteriaProfileReference } from "../candidate-screening/types";
import type { SiteCriterionTarget } from "./types";
import {
  CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
  SITE_CRITERION_EVALUATION_RESULTS,
  SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
  type CandidateCriteriaEvaluationSetV1,
  type CandidateCriteriaEvaluationSetValidationResult,
  type SiteCriterionEvaluationResult,
  type SiteCriterionEvaluationSource,
  type SiteCriterionEvaluationV1,
  type SiteCriterionEvaluationValidationResult,
  type SiteCriterionObservedValue,
} from "./evaluation-types";

const EVALUATION_KEYS = new Set([
  "schemaVersion",
  "evaluationId",
  "candidateStoreId",
  "analysisClusterId",
  "criteriaProfileRef",
  "criterionKey",
  "result",
  "observed",
  "rationale",
  "evidenceRefs",
  "evaluatedAt",
  "evaluationSource",
  "evaluatedBy",
  "note",
]);

const SET_KEYS = new Set([
  "schemaVersion",
  "evaluationSetId",
  "candidateStoreId",
  "analysisClusterId",
  "criteriaProfileRef",
  "evaluations",
  "createdAt",
  "updatedAt",
]);

const PROFILE_REFERENCE_KEYS = new Set(["profileId", "profileVersion"]);
const OBSERVED_KEYS = new Set(["value", "unit", "sourceSummary"]);

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
    if (!allowed.has(key)) errors.push(`${path}.${key}는 Site Criteria Evaluation V1 필드가 아닙니다.`);
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

function isObservedValue(value: unknown): value is SiteCriterionTarget {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0 && value.every(isObservedValue);
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0
    && entries.every(([key, child]) => key.trim() !== "" && isObservedValue(child));
}

function freezeObservedValue(value: SiteCriterionTarget): SiteCriterionTarget {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObservedValue));
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        freezeObservedValue(child as SiteCriterionTarget),
      ]),
    ));
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
  reportUnknownKeys(value, PROFILE_REFERENCE_KEYS, path, errors);
  if (!isNonEmpty(value.profileId)) errors.push(`${path}.profileId가 필요합니다.`);
  if (!isNonEmpty(value.profileVersion)) errors.push(`${path}.profileVersion이 필요합니다.`);
  if (!isNonEmpty(value.profileId) || !isNonEmpty(value.profileVersion)) return null;
  return Object.freeze({ profileId: value.profileId, profileVersion: value.profileVersion });
}

function parseObserved(
  value: unknown,
  path: string,
  errors: string[],
): SiteCriterionObservedValue | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return undefined;
  }
  reportUnknownKeys(value, OBSERVED_KEYS, path, errors);
  if (!("value" in value) || !isObservedValue(value.value)) {
    errors.push(`${path}.value는 null이 아닌 유효한 관찰값이어야 합니다.`);
    return undefined;
  }
  const unit = optionalText(value.unit, `${path}.unit`, errors);
  const sourceSummary = optionalText(value.sourceSummary, `${path}.sourceSummary`, errors);
  return Object.freeze({
    value: freezeObservedValue(value.value),
    ...(unit ? { unit } : {}),
    ...(sourceSummary ? { sourceSummary } : {}),
  });
}

function parseEvidenceRefs(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 배열이어야 합니다.`);
    return null;
  }
  const refs: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const reference = value[index];
    if (!isNonEmpty(reference)) {
      errors.push(`${path}[${index}]는 비어 있지 않은 Evidence reference여야 합니다.`);
      continue;
    }
    if (seen.has(reference)) {
      errors.push(`${path}에 중복 Evidence reference ${reference}가 있습니다.`);
      continue;
    }
    seen.add(reference);
    refs.push(reference);
  }
  return Object.freeze(refs);
}

function isEvaluationResult(value: unknown): value is SiteCriterionEvaluationResult {
  return typeof value === "string"
    && (SITE_CRITERION_EVALUATION_RESULTS as readonly string[]).includes(value);
}

function isEvaluationSource(value: unknown): value is SiteCriterionEvaluationSource {
  return value === "RULE" || value === "HUMAN";
}

function parseEvaluation(
  value: unknown,
  path: string,
  errors: string[],
): SiteCriterionEvaluationV1 | null {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return null;
  }
  reportUnknownKeys(value, EVALUATION_KEYS, path, errors);
  if (value.schemaVersion !== SITE_CRITERION_EVALUATION_SCHEMA_VERSION) {
    errors.push(`${path}.schemaVersion은 ${SITE_CRITERION_EVALUATION_SCHEMA_VERSION}이어야 합니다.`);
  }
  for (const key of ["evaluationId", "analysisClusterId", "criterionKey", "rationale", "evaluatedAt"] as const) {
    if (!isNonEmpty(value[key])) errors.push(`${path}.${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (!isCandidateStoreId(value.candidateStoreId)) {
    errors.push(`${path}.candidateStoreId가 올바른 Candidate ID가 아닙니다.`);
  }
  if (!isEvaluationResult(value.result)) {
    errors.push(`${path}.result가 지원되는 Evaluation Result가 아닙니다.`);
  }
  const criteriaProfileRef = parseProfileReference(
    value.criteriaProfileRef,
    `${path}.criteriaProfileRef`,
    errors,
  );
  const observed = parseObserved(value.observed, `${path}.observed`, errors);
  const evidenceRefs = parseEvidenceRefs(value.evidenceRefs, `${path}.evidenceRefs`, errors);
  if (isEvaluationResult(value.result) && value.result !== "UNKNOWN") {
    if (!observed) errors.push(`${path}.observed는 ${value.result} 결과에 필요합니다.`);
    if (evidenceRefs?.length === 0) {
      errors.push(`${path}.evidenceRefs는 ${value.result} 결과에 최소 1개 필요합니다.`);
    }
  }
  let evaluationSource: SiteCriterionEvaluationSource | undefined;
  if (value.evaluationSource !== undefined) {
    if (!isEvaluationSource(value.evaluationSource)) {
      errors.push(`${path}.evaluationSource는 RULE 또는 HUMAN이어야 합니다.`);
    } else {
      evaluationSource = value.evaluationSource;
    }
  }
  const evaluatedBy = optionalText(value.evaluatedBy, `${path}.evaluatedBy`, errors);
  const note = optionalText(value.note, `${path}.note`, errors);

  if (
    value.schemaVersion !== SITE_CRITERION_EVALUATION_SCHEMA_VERSION
    || !isNonEmpty(value.evaluationId)
    || !isCandidateStoreId(value.candidateStoreId)
    || !isNonEmpty(value.analysisClusterId)
    || !criteriaProfileRef
    || !isNonEmpty(value.criterionKey)
    || !isEvaluationResult(value.result)
    || !isNonEmpty(value.rationale)
    || !evidenceRefs
    || !isNonEmpty(value.evaluatedAt)
  ) return null;

  return Object.freeze({
    schemaVersion: SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
    evaluationId: value.evaluationId,
    candidateStoreId: value.candidateStoreId,
    analysisClusterId: value.analysisClusterId,
    criteriaProfileRef,
    criterionKey: value.criterionKey,
    result: value.result,
    ...(observed ? { observed } : {}),
    rationale: value.rationale,
    evidenceRefs,
    evaluatedAt: value.evaluatedAt,
    ...(evaluationSource ? { evaluationSource } : {}),
    ...(evaluatedBy ? { evaluatedBy } : {}),
    ...(note ? { note } : {}),
  });
}

export function validateSiteCriterionEvaluation(
  value: unknown,
): SiteCriterionEvaluationValidationResult {
  const errors: string[] = [];
  const evaluation = parseEvaluation(value, "evaluation", errors);
  if (!evaluation || errors.length > 0) {
    return {
      ok: false,
      code: "INVALID_SITE_CRITERION_EVALUATION",
      message: "Site Criterion Evaluation V1 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }
  return { ok: true, value: evaluation };
}

export function validateCandidateCriteriaEvaluationSet(
  value: unknown,
): CandidateCriteriaEvaluationSetValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "INVALID_CANDIDATE_CRITERIA_EVALUATION_SET",
      message: "Candidate Criteria Evaluation Set V1 검증에 실패했습니다.",
      errors: Object.freeze(["Evaluation Set은 객체여야 합니다."]),
    };
  }
  reportUnknownKeys(value, SET_KEYS, "evaluationSet", errors);
  if (value.schemaVersion !== CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION}이어야 합니다.`);
  }
  for (const key of ["evaluationSetId", "analysisClusterId", "createdAt"] as const) {
    if (!isNonEmpty(value[key])) errors.push(`${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (!isCandidateStoreId(value.candidateStoreId)) {
    errors.push("candidateStoreId가 올바른 Candidate ID가 아닙니다.");
  }
  const criteriaProfileRef = parseProfileReference(
    value.criteriaProfileRef,
    "criteriaProfileRef",
    errors,
  );
  const updatedAt = optionalText(value.updatedAt, "updatedAt", errors);

  const evaluations: SiteCriterionEvaluationV1[] = [];
  const criterionKeys = new Set<string>();
  const evaluationIds = new Set<string>();
  if (!Array.isArray(value.evaluations)) {
    errors.push("evaluations는 배열이어야 합니다.");
  } else {
    for (let index = 0; index < value.evaluations.length; index += 1) {
      const evaluation = parseEvaluation(value.evaluations[index], `evaluations[${index}]`, errors);
      if (!evaluation) continue;
      if (criterionKeys.has(evaluation.criterionKey)) {
        errors.push(`evaluations에 중복 criterionKey ${evaluation.criterionKey}가 있습니다.`);
      } else {
        criterionKeys.add(evaluation.criterionKey);
      }
      if (evaluationIds.has(evaluation.evaluationId)) {
        errors.push(`evaluations에 중복 evaluationId ${evaluation.evaluationId}가 있습니다.`);
      } else {
        evaluationIds.add(evaluation.evaluationId);
      }
      if (evaluation.candidateStoreId !== value.candidateStoreId) {
        errors.push(`evaluations[${index}].candidateStoreId가 Evaluation Set과 다릅니다.`);
      }
      if (evaluation.analysisClusterId !== value.analysisClusterId) {
        errors.push(`evaluations[${index}].analysisClusterId가 Evaluation Set과 다릅니다.`);
      }
      if (
        !criteriaProfileRef
        || evaluation.criteriaProfileRef.profileId !== criteriaProfileRef.profileId
        || evaluation.criteriaProfileRef.profileVersion !== criteriaProfileRef.profileVersion
      ) {
        errors.push(`evaluations[${index}].criteriaProfileRef가 Evaluation Set과 다릅니다.`);
      }
      evaluations.push(evaluation);
    }
  }

  if (errors.length > 0 || !criteriaProfileRef) {
    return {
      ok: false,
      code: "INVALID_CANDIDATE_CRITERIA_EVALUATION_SET",
      message: "Candidate Criteria Evaluation Set V1 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }
  const set: CandidateCriteriaEvaluationSetV1 = {
    schemaVersion: CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
    evaluationSetId: value.evaluationSetId as string,
    candidateStoreId: value.candidateStoreId as string,
    analysisClusterId: value.analysisClusterId as string,
    criteriaProfileRef,
    evaluations: Object.freeze(evaluations),
    createdAt: value.createdAt as string,
    ...(updatedAt ? { updatedAt } : {}),
  };
  return { ok: true, value: Object.freeze(set) };
}
