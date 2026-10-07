/**
 * Risk V2 Domain Contract — taxonomy / rule definition / finding / evaluation 계약만 정의한다.
 *
 * Risk evaluator, rule registry, score, verdict는 이 파일에 없다.
 * RiskClass는 후보점포의 최종 등급이 아니며, RuleDefinition은 Risk가 발생했다는 뜻이 아니다.
 * legacy lib/diagnosis/calculateRisk.ts와 독립이다.
 */

import type { SupportedCandidateDecisionEvidenceBundle } from "./candidate-evidence-versions";
import type {
  DecisionEvidenceBucket,
  DecisionEvidenceCategory,
  DecisionEvidenceImportance,
  DecisionEvidenceNature,
  DecisionEvidenceSourceDomain,
} from "../decision-evidence/types";
import type { VerificationStatus } from "../evidence/types";

export const RISK_RULE_SET_SCHEMA_VERSION = "risk-v2-rule-set-v1" as const;
export const RISK_EVALUATION_RESULT_SCHEMA_VERSION = "risk-v2-evaluation-v1" as const;

/** RiskClass != Verdict. 개별 finding의 성격 분류다. */
export type RiskClass =
  | "HARD_BLOCKER"
  | "CONDITIONAL_BLOCKER"
  | "ECONOMIC_STRESS"
  | "EVIDENCE_GAP"
  | "HUMAN_REVIEW_REQUIRED";

export const RISK_CLASSES: readonly RiskClass[] = Object.freeze([
  "HARD_BLOCKER",
  "CONDITIONAL_BLOCKER",
  "ECONOMIC_STRESS",
  "EVIDENCE_GAP",
  "HUMAN_REVIEW_REQUIRED",
]);

/**
 * 현재 DecisionEvidenceCategory / TechnicalCheckAspectKind가 지원하는 영역만 둔다.
 * FIRE_SAFETY / PERMIT은 현재 Evidence가 없어 넣지 않았다.
 */
export type RiskDomain =
  | "LOCATION"
  | "COMPETITION"
  | "LEASE"
  | "ECONOMIC"
  | "SPACE"
  | "ELECTRICAL"
  | "WATER"
  | "DRAINAGE"
  | "EXHAUST"
  | "RESTROOM"
  | "DELIVERY"
  | "EVIDENCE";

export const RISK_DOMAINS: readonly RiskDomain[] = Object.freeze([
  "LOCATION",
  "COMPETITION",
  "LEASE",
  "ECONOMIC",
  "SPACE",
  "ELECTRICAL",
  "WATER",
  "DRAINAGE",
  "EXHAUST",
  "RESTROOM",
  "DELIVERY",
  "EVIDENCE",
]);

/** Severity != RiskClass. 이번 Phase에는 severity 계산 규칙이 없다. */
export type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const RISK_SEVERITIES: readonly RiskSeverity[] = Object.freeze([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);

/**
 * RESOLVED: 근거 변경으로 해소됨.
 * ACCEPTED_BY_HUMAN: Risk는 남아 있고 사람이 인지·수용함. RESOLVED가 아니다.
 */
export type RiskResolutionStatus =
  | "OPEN"
  | "NEEDS_CONFIRMATION"
  | "CONDITION_REQUIRED"
  | "EXPERT_REVIEW_REQUIRED"
  | "RESOLVED"
  | "ACCEPTED_BY_HUMAN";

export const RISK_RESOLUTION_STATUSES: readonly RiskResolutionStatus[] = Object.freeze([
  "OPEN",
  "NEEDS_CONFIRMATION",
  "CONDITION_REQUIRED",
  "EXPERT_REVIEW_REQUIRED",
  "RESOLVED",
  "ACCEPTED_BY_HUMAN",
]);

export type RiskRemediationType =
  | "CONFIRM"
  | "NEGOTIATE"
  | "MEASURE"
  | "EXPERT_REVIEW"
  | "CHANGE_PLAN"
  | "NONE";

export const RISK_REMEDIATION_TYPES: readonly RiskRemediationType[] = Object.freeze([
  "CONFIRM",
  "NEGOTIATE",
  "MEASURE",
  "EXPERT_REVIEW",
  "CHANGE_PLAN",
  "NONE",
]);

/**
 * Rule이 요구하는 Evidence의 typed selector. description 문자열을 해석하지 않는다.
 * callback을 저장하지 않는다. predicateKey는 향후 registry가 해석할 opaque key다.
 * verificationStatus는 FIELD 계열 의미이며 모든 Domain의 확정 여부를 나타내지 않는다.
 * 특정 OBSERVED_CONSTRAINT가 HARD_BLOCKER에 충분히 확정됐는지는 rule별 predicate가 판단한다.
 */
export interface RiskEvidenceRequirement {
  /** rule 안에서 고유. EVIDENCE_GAP finding이 누락 requirement를 참조할 때 쓴다. */
  readonly requirementKey: string;
  readonly sourceDomain?: DecisionEvidenceSourceDomain;
  readonly category?: DecisionEvidenceCategory;
  readonly bucket?: DecisionEvidenceBucket;
  readonly nature?: DecisionEvidenceNature;
  readonly importance?: DecisionEvidenceImportance;
  readonly verificationStatus?: VerificationStatus;
  /** DecisionEvidenceItem.id 정확 일치 */
  readonly evidenceId?: string;
  readonly predicateKey?: string;
}

export interface RiskRuleDefinition {
  readonly ruleId: string;
  readonly version: string;
  readonly domain: RiskDomain;
  readonly riskClass: RiskClass;
  readonly title: string;
  readonly description: string;
  readonly evidenceRequirements: readonly RiskEvidenceRequirement[];
  readonly defaultSeverity: RiskSeverity;
  readonly requiresHumanApproval: boolean;
  readonly remediationType: RiskRemediationType;
}

export interface RiskRuleSet {
  readonly schemaVersion: typeof RISK_RULE_SET_SCHEMA_VERSION;
  readonly ruleSetVersion: string;
  readonly rules: readonly RiskRuleDefinition[];
}

/** ACCEPTED_BY_HUMAN일 때만 존재. acceptedByRef는 opaque staff key이며 PII가 아니다. */
export interface RiskHumanAcceptance {
  readonly acceptedByRef: string;
  readonly acceptedAt: string;
  readonly reason: string;
}

export interface RiskFinding {
  readonly findingId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly domain: RiskDomain;
  readonly riskClass: RiskClass;
  readonly severity: RiskSeverity;
  readonly title: string;
  readonly description: string;
  /** DecisionEvidenceItem.id. EVIDENCE_GAP 외 class는 1개 이상 필수. */
  readonly evidenceIds: readonly string[];
  /** EVIDENCE_GAP 전용 — 충족되지 않은 rule requirementKey */
  readonly missingRequirementKeys: readonly string[];
  readonly resolutionStatus: RiskResolutionStatus;
  readonly remediation: readonly string[];
  readonly requiresHumanApproval: boolean;
  readonly humanAcceptance?: RiskHumanAcceptance;
}

/** 향후 deterministic engine 입력. generatedAt 등 시간은 이번 Phase에서 만들지 않는다. */
export interface RiskEvaluationInput {
  readonly evidenceBundle: SupportedCandidateDecisionEvidenceBundle;
  readonly ruleSetVersion: string;
}

/**
 * 향후 engine 출력 뼈대. 모든 count는 RESOLVED가 아닌 finding만 센다.
 * ACCEPTED_BY_HUMAN은 Risk가 남아 있으므로 unresolved에 포함한다.
 */
export interface RiskEvaluationResult {
  readonly schemaVersion: typeof RISK_EVALUATION_RESULT_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly ruleSetVersion: string;
  readonly findings: readonly RiskFinding[];
  readonly unresolvedFindingCount: number;
  readonly unresolvedHardBlockerCount: number;
  readonly unresolvedConditionalBlockerCount: number;
  readonly unresolvedEconomicStressCount: number;
  readonly unresolvedEvidenceGapCount: number;
  readonly unresolvedHumanReviewRequiredCount: number;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

export type RiskContractValidationSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type RiskContractValidationFailure = {
  readonly ok: false;
  readonly code: "INVALID_RISK_CONTRACT";
  readonly message: string;
  readonly errors: readonly string[];
};

export type RiskContractValidationResult<T> =
  | RiskContractValidationSuccess<T>
  | RiskContractValidationFailure;
