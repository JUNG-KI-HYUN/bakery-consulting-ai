import type { CandidateStoreId } from "../analysis-cluster/types";

export const HARD_RISK_GATE_RESULT_SCHEMA_VERSION =
  "frameone.hard-risk-gate-result.v1" as const;

export const HARD_RISK_GATE_STATUSES = Object.freeze([
  "CLEAR",
  "BLOCKED",
  "REVIEW_REQUIRED",
] as const);

export type HardRiskGateStatus = (typeof HARD_RISK_GATE_STATUSES)[number];

/** RiskFinding을 재판정하지 않고 기존 findingId를 분류해 참조하는 Gate 결과다. */
export interface HardRiskGateResultV1 {
  readonly schemaVersion: typeof HARD_RISK_GATE_RESULT_SCHEMA_VERSION;
  readonly gateResultId: string;
  readonly candidateStoreId: CandidateStoreId;
  readonly analysisClusterId: string;
  readonly status: HardRiskGateStatus;
  /** 기존 RiskFinding.findingId. */
  readonly blockingRiskRefs: readonly string[];
  /** 기존 RiskFinding.findingId. */
  readonly reviewRiskRefs: readonly string[];
  readonly rationale: readonly string[];
  readonly evaluatedAt: string;
  /** 기존 RiskEvaluationResult/RiskRegister.ruleSetVersion. */
  readonly riskRuleVersion: string;
}

export interface HardRiskGateValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_HARD_RISK_GATE_RESULT";
  readonly message: string;
  readonly errors: readonly string[];
}

export type HardRiskGateValidationResult =
  | { readonly ok: true; readonly value: HardRiskGateResultV1 }
  | HardRiskGateValidationFailure;
