/**
 * Risk Register — RiskEvaluationResult를 사람이 추적·검토할 수 있는 항목으로 정리한다 (derived-only).
 *
 * Finding을 재평가하지 않는다: riskClass / severity / resolutionStatus / humanAcceptance를 그대로 보존한다.
 * 새 RiskFinding을 만들지 않는다. persistence, resolution update 없음.
 */

import type { CandidateDecisionEvidenceBundle } from "../decision-evidence/candidate-bundle";
import {
  RISK_CLASSES,
  RISK_SEVERITIES,
  type RiskClass,
  type RiskEvaluationResult,
  type RiskFinding,
} from "./types";
import {
  validateRiskEvaluationResult,
  validateRiskFinding,
  validateRiskFindingEvidenceLinks,
} from "./validation";

export const RISK_REGISTER_SCHEMA_VERSION = "risk-v2-register-v1" as const;

/** RiskFinding 필드를 그대로 쓴다. 새로운 위험 의미를 추가하지 않는다. */
export type RiskRegisterEntry = RiskFinding;

/** 단순 count. 점수가 아니다. unresolved는 RESOLVED가 아닌 항목(ACCEPTED_BY_HUMAN 포함)이다. */
export interface RiskRegisterSummary {
  readonly totalFindings: number;
  readonly unresolvedFindings: number;
  readonly unresolvedHardBlockers: number;
  readonly unresolvedConditionalBlockers: number;
  readonly unresolvedEconomicStress: number;
  readonly unresolvedEvidenceGaps: number;
  readonly unresolvedHumanReviews: number;
}

export interface RiskRegister {
  readonly schemaVersion: typeof RISK_REGISTER_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly ruleSetVersion: string;
  readonly entries: readonly RiskRegisterEntry[];
  readonly summary: RiskRegisterSummary;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

export type RiskRegisterFailure = {
  readonly ok: false;
  readonly code: "INVALID_RISK_REGISTER";
  readonly message: string;
  readonly errors: readonly string[];
};

export type RiskRegisterOutcome<T> = { readonly ok: true; readonly value: T } | RiskRegisterFailure;

export function riskRegisterFailure(errors: readonly string[]): RiskRegisterFailure {
  return Object.freeze({
    ok: false as const,
    code: "INVALID_RISK_REGISTER" as const,
    message: errors.join(" "),
    errors: Object.freeze([...errors]),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** 표시 순서 고정용. 우선순위 점수가 아니다. */
function compareEntries(left: RiskRegisterEntry, right: RiskRegisterEntry): number {
  return (
    RISK_CLASSES.indexOf(left.riskClass) - RISK_CLASSES.indexOf(right.riskClass) ||
    RISK_SEVERITIES.indexOf(left.severity) - RISK_SEVERITIES.indexOf(right.severity) ||
    compareText(left.ruleId, right.ruleId) ||
    compareText(left.findingId, right.findingId)
  );
}

export function summarizeRiskRegisterEntries(
  entries: readonly RiskRegisterEntry[],
): RiskRegisterSummary {
  const unresolved = entries.filter((entry) => entry.resolutionStatus !== "RESOLVED");
  const of = (riskClass: RiskClass) => unresolved.filter((entry) => entry.riskClass === riskClass).length;
  return {
    totalFindings: entries.length,
    unresolvedFindings: unresolved.length,
    unresolvedHardBlockers: of("HARD_BLOCKER"),
    unresolvedConditionalBlockers: of("CONDITIONAL_BLOCKER"),
    unresolvedEconomicStress: of("ECONOMIC_STRESS"),
    unresolvedEvidenceGaps: of("EVIDENCE_GAP"),
    unresolvedHumanReviews: of("HUMAN_REVIEW_REQUIRED"),
  };
}

function duplicateEvidenceIds(bundle: CandidateDecisionEvidenceBundle): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const list of [
    bundle.observedFacts,
    bundle.observedConstraints,
    bundle.missingInformation,
    bundle.expertReviewItems,
    bundle.geometryIssues,
  ]) {
    for (const item of list) {
      if (seen.has(item.id)) duplicates.push(item.id);
      seen.add(item.id);
    }
  }
  return duplicates;
}

/**
 * evaluation을 검증하고, 모든 finding.evidenceIds가 bundle에 실재할 때만 Register를 만든다.
 * 입력 bundle / evaluation을 mutation·freeze하지 않는다.
 */
export function buildRiskRegister(input: {
  evidenceBundle: CandidateDecisionEvidenceBundle;
  evaluation: RiskEvaluationResult;
}): RiskRegisterOutcome<RiskRegister> {
  const errors: string[] = [];
  const evaluationCheck = validateRiskEvaluationResult(input.evaluation);
  if (!evaluationCheck.ok) {
    return riskRegisterFailure(evaluationCheck.errors.map((entry) => `evaluation: ${entry}`));
  }
  const evaluation = evaluationCheck.value;
  const bundle = input.evidenceBundle;
  if (!bundle || bundle.schemaVersion !== "candidate-decision-evidence-v1") {
    return riskRegisterFailure(["evidenceBundle.schemaVersion은 candidate-decision-evidence-v1이어야 합니다."]);
  }
  if (bundle.candidateStoreId !== evaluation.candidateStoreId) {
    errors.push("evidenceBundle.candidateStoreId와 evaluation.candidateStoreId가 다릅니다.");
  }
  for (const id of duplicateEvidenceIds(bundle)) errors.push(`evidence id 중복: ${id}`);
  if (errors.length > 0) return riskRegisterFailure(errors);

  for (const finding of evaluation.findings) {
    const links = validateRiskFindingEvidenceLinks(finding, bundle);
    if (!links.ok) errors.push(...links.errors.map((entry) => `${finding.findingId}: ${entry}`));
  }
  if (errors.length > 0) return riskRegisterFailure(errors);

  const entries = [...evaluation.findings].sort(compareEntries);
  return Object.freeze({
    ok: true as const,
    value: deepFreeze(structuredClone({
      schemaVersion: RISK_REGISTER_SCHEMA_VERSION,
      candidateStoreId: evaluation.candidateStoreId,
      ruleSetVersion: evaluation.ruleSetVersion,
      entries,
      summary: summarizeRiskRegisterEntries(entries),
      createsVerdict: false as const,
      createsScore: false as const,
    })),
  });
}

const REGISTER_KEYS = new Set([
  "schemaVersion",
  "candidateStoreId",
  "ruleSetVersion",
  "entries",
  "summary",
  "createsVerdict",
  "createsScore",
]);

/** Register 구조 검증 (bundle 없이). entry는 RiskFinding contract로 검증한다. */
export function validateRiskRegister(register: unknown): RiskRegisterOutcome<RiskRegister> {
  const errors: string[] = [];
  if (typeof register !== "object" || register === null || Array.isArray(register)) {
    return riskRegisterFailure(["register는 객체여야 합니다."]);
  }
  const value = register as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!REGISTER_KEYS.has(key)) errors.push(`register.${key}: 정의되지 않은 필드입니다.`);
  }
  if (value.schemaVersion !== RISK_REGISTER_SCHEMA_VERSION) {
    errors.push(`register.schemaVersion은 ${RISK_REGISTER_SCHEMA_VERSION}이어야 합니다.`);
  }
  for (const key of ["candidateStoreId", "ruleSetVersion"] as const) {
    const field = value[key];
    if (typeof field !== "string" || !field.trim()) errors.push(`register.${key}가 비어 있습니다.`);
  }
  if (value.createsVerdict !== false) errors.push("register.createsVerdict는 false여야 합니다.");
  if (value.createsScore !== false) errors.push("register.createsScore는 false여야 합니다.");
  if (!Array.isArray(value.entries)) {
    errors.push("register.entries는 배열이어야 합니다.");
    return riskRegisterFailure(errors);
  }
  const findingIds = new Set<string>();
  const entries: RiskRegisterEntry[] = [];
  value.entries.forEach((entry, index) => {
    const checked = validateRiskFinding(entry);
    if (!checked.ok) {
      errors.push(...checked.errors.map((message) => `register.entries[${index}]: ${message}`));
      return;
    }
    if (findingIds.has(checked.value.findingId)) {
      errors.push(`register.entries[${index}].findingId 중복: ${checked.value.findingId}`);
    }
    findingIds.add(checked.value.findingId);
    entries.push(checked.value);
  });
  if (errors.length > 0) return riskRegisterFailure(errors);
  const expected = summarizeRiskRegisterEntries(entries);
  const summary = value.summary as Record<string, unknown> | undefined;
  const summaryKeys = Object.keys(expected) as (keyof RiskRegisterSummary)[];
  if (
    typeof summary !== "object" ||
    summary === null ||
    Object.keys(summary).length !== summaryKeys.length ||
    summaryKeys.some((key) => summary[key] !== expected[key])
  ) {
    errors.push("register.summary가 entries와 일치하지 않습니다.");
  }
  if (errors.length > 0) return riskRegisterFailure(errors);
  return Object.freeze({ ok: true as const, value: deepFreeze(structuredClone(register as RiskRegister)) });
}
