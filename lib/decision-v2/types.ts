/**
 * Decision V2 — Final Decision Policy Readiness contract.
 *
 * Final Verdict 값·enum·evaluator는 이 파일에 없다.
 * Readiness는 "Final Verdict evaluator를 실행할 전제조건 충족 여부"만 나타내며
 * 후보점포의 적합성·계약 가능성·안전성을 뜻하지 않는다.
 */

import type { RiskClass, RiskDomain } from "../risk-v2/types";

export const FINAL_DECISION_POLICY_READINESS_SCHEMA_VERSION =
  "final-decision-policy-readiness-v1" as const;

/**
 * 판정 mapping은 두지 않는다. Rule capability 요구사항만 정의한다.
 * requiresEvidenceReady / requiresExpertReviewReady는 DecisionReviewCompleteness가
 * 두 조건을 모두 요구하므로 V1에서는 true만 허용한다.
 */
export interface FinalDecisionPolicy {
  readonly policyVersion: string;
  readonly requiredRuleSetVersion: string;
  readonly requiredRiskClasses: readonly RiskClass[];
  readonly requiredDomains: readonly RiskDomain[];
  readonly requiresEvidenceReady: true;
  readonly requiresExpertReviewReady: true;
}

/**
 * covered* = required 중 Rule Set에 해당 rule이 1개 이상 있는 항목. finding 존재 여부와 무관하다.
 * 모든 목록은 RISK_CLASSES / RISK_DOMAINS 순서로 정렬한다.
 */
export interface FinalDecisionPolicyReadiness {
  readonly schemaVersion: typeof FINAL_DECISION_POLICY_READINESS_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly policyVersion: string;
  readonly ruleSetVersion: string;
  readonly ruleCoverageReady: boolean;
  readonly reviewCompletenessReady: boolean;
  readonly readyForFinalVerdictEvaluation: boolean;
  readonly requiredRiskClasses: readonly RiskClass[];
  readonly coveredRiskClasses: readonly RiskClass[];
  readonly missingRiskClasses: readonly RiskClass[];
  readonly requiredDomains: readonly RiskDomain[];
  readonly coveredDomains: readonly RiskDomain[];
  readonly missingDomains: readonly RiskDomain[];
  readonly evidenceReady: boolean;
  readonly expertReviewReady: boolean;
  readonly requiresHumanDecision: true;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

export type FinalDecisionFailureCode =
  | "INVALID_FINAL_DECISION_POLICY"
  | "INVALID_FINAL_DECISION_READINESS";

export type FinalDecisionFailure = {
  readonly ok: false;
  readonly code: FinalDecisionFailureCode;
  readonly message: string;
  readonly errors: readonly string[];
};

export type FinalDecisionOutcome<T> = { readonly ok: true; readonly value: T } | FinalDecisionFailure;
