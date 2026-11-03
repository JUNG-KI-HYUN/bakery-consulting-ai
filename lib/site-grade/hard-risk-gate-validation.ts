import { isCandidateStoreId } from "../field/identifiers";
import {
  HARD_RISK_GATE_RESULT_SCHEMA_VERSION,
  HARD_RISK_GATE_STATUSES,
  type HardRiskGateResultV1,
  type HardRiskGateStatus,
  type HardRiskGateValidationResult,
} from "./hard-risk-gate-types";

const GATE_KEYS = new Set([
  "schemaVersion",
  "gateResultId",
  "candidateStoreId",
  "analysisClusterId",
  "status",
  "blockingRiskRefs",
  "reviewRiskRefs",
  "rationale",
  "evaluatedAt",
  "riskRuleVersion",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function parseList(value: unknown, path: string, errors: string[], required = false) {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 배열이어야 합니다.`);
    return null;
  }
  if (required && value.length === 0) errors.push(`${path}는 최소 1개 항목이 필요합니다.`);
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (!isNonEmpty(item)) {
      errors.push(`${path}[${index}]는 비어 있지 않은 문자열이어야 합니다.`);
      return;
    }
    if (seen.has(item)) {
      errors.push(`${path}에 중복 Risk reference ${item}가 있습니다.`);
      return;
    }
    seen.add(item);
    result.push(item);
  });
  return Object.freeze(result);
}

function isStatus(value: unknown): value is HardRiskGateStatus {
  return typeof value === "string"
    && (HARD_RISK_GATE_STATUSES as readonly string[]).includes(value);
}

export function validateHardRiskGateResult(value: unknown): HardRiskGateValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "INVALID_HARD_RISK_GATE_RESULT",
      message: "Hard Risk Gate Result는 객체여야 합니다.",
      errors: Object.freeze(["Hard Risk Gate Result는 객체여야 합니다."]),
    };
  }
  for (const key of Object.keys(value)) {
    if (!GATE_KEYS.has(key)) errors.push(`hardRiskGateResult.${key}는 V1 필드가 아닙니다.`);
  }
  if (value.schemaVersion !== HARD_RISK_GATE_RESULT_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${HARD_RISK_GATE_RESULT_SCHEMA_VERSION}이어야 합니다.`);
  }
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("candidateStoreId가 올바르지 않습니다.");
  for (const key of [
    "gateResultId",
    "analysisClusterId",
    "evaluatedAt",
    "riskRuleVersion",
  ] as const) {
    if (!isNonEmpty(value[key])) errors.push(`${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (!isStatus(value.status)) errors.push("status가 올바르지 않습니다.");
  const blockingRiskRefs = parseList(
    value.blockingRiskRefs,
    "blockingRiskRefs",
    errors,
    value.status === "BLOCKED",
  );
  const reviewRiskRefs = parseList(
    value.reviewRiskRefs,
    "reviewRiskRefs",
    errors,
    value.status === "REVIEW_REQUIRED",
  );
  const rationale = parseList(value.rationale, "rationale", errors, true);
  if (blockingRiskRefs && reviewRiskRefs) {
    const blocking = new Set(blockingRiskRefs);
    for (const reference of reviewRiskRefs) {
      if (blocking.has(reference)) errors.push(`Risk reference ${reference}가 두 Gate 그룹에 중복되었습니다.`);
    }
  }
  if (value.status === "CLEAR" && ((blockingRiskRefs?.length ?? 0) > 0 || (reviewRiskRefs?.length ?? 0) > 0)) {
    errors.push("CLEAR Gate에는 blockingRiskRefs 또는 reviewRiskRefs를 넣을 수 없습니다.");
  }
  if (errors.length > 0 || !blockingRiskRefs || !reviewRiskRefs || !rationale) {
    return {
      ok: false,
      code: "INVALID_HARD_RISK_GATE_RESULT",
      message: "Hard Risk Gate Result V1 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }
  const result: HardRiskGateResultV1 = {
    schemaVersion: HARD_RISK_GATE_RESULT_SCHEMA_VERSION,
    gateResultId: value.gateResultId as string,
    candidateStoreId: value.candidateStoreId as string,
    analysisClusterId: value.analysisClusterId as string,
    status: value.status as HardRiskGateStatus,
    blockingRiskRefs,
    reviewRiskRefs,
    rationale,
    evaluatedAt: value.evaluatedAt as string,
    riskRuleVersion: value.riskRuleVersion as string,
  };
  return { ok: true, value: Object.freeze(result) };
}
