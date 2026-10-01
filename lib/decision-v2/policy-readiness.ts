/**
 * Final Decision Policy Readiness — 현재 Risk Rule Set이 Final Decision Policy가 요구하는
 * RiskClass / RiskDomain을 평가할 rule capability를 갖췄는지, 사람의 검토 준비가 됐는지만 확인한다.
 *
 * Rule capability != Finding existence. finding 0개는 "문제없음"이 아니다.
 * Evidence existence != Rule coverage. Coverage는 rule.domain / rule.riskClass typed field만 사용한다.
 * Final Verdict를 만들지 않는다. 입력을 mutation·freeze하지 않는다.
 */

import {
  CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION,
  type CandidateDecisionEvidenceBundle,
} from "../decision-evidence/candidate-bundle";
import { buildDecisionReviewCompleteness } from "../risk-v2/decision-review";
import type { RiskRegister } from "../risk-v2/risk-register";
import { RISK_CLASSES, RISK_DOMAINS, type RiskClass, type RiskDomain, type RiskRuleSet } from "../risk-v2/types";
import { validateRiskRuleSet } from "../risk-v2/validation";
import {
  FINAL_DECISION_POLICY_READINESS_SCHEMA_VERSION,
  type FinalDecisionFailure,
  type FinalDecisionFailureCode,
  type FinalDecisionOutcome,
  type FinalDecisionPolicy,
  type FinalDecisionPolicyReadiness,
} from "./types";

export const FINAL_DECISION_POLICY_V1_VERSION = "frameone-final-decision-policy-v1" as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Candidate Decision V1 필수 coverage.
 * COMPETITION은 Location 분석의 참고 근거로 두고, RESTROOM은 향후 policy version에서 확장한다.
 */
export const FINAL_DECISION_POLICY_V1: FinalDecisionPolicy = deepFreeze({
  policyVersion: FINAL_DECISION_POLICY_V1_VERSION,
  requiredRuleSetVersion: "risk-rules-v1",
  requiredRiskClasses: [
    "HARD_BLOCKER",
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ],
  requiredDomains: [
    "EVIDENCE",
    "LOCATION",
    "LEASE",
    "ECONOMIC",
    "SPACE",
    "ELECTRICAL",
    "WATER",
    "DRAINAGE",
    "EXHAUST",
    "DELIVERY",
  ],
  requiresEvidenceReady: true,
  requiresExpertReviewReady: true,
});

export const FINAL_DECISION_POLICY_V2_VERSION = "frameone-final-decision-policy-v2" as const;

/** risk-rules-v2 coverage 감사용 snapshot. 필수 class / domain은 V1과 같다. */
export const FINAL_DECISION_POLICY_V2: FinalDecisionPolicy = deepFreeze({
  ...structuredClone(FINAL_DECISION_POLICY_V1),
  policyVersion: FINAL_DECISION_POLICY_V2_VERSION,
  requiredRuleSetVersion: "risk-rules-v2",
});

export const FINAL_DECISION_POLICY_V3_VERSION = "frameone-final-decision-policy-v3" as const;

/** risk-rules-v3 coverage 감사용 snapshot. 필수 class / domain은 V1·V2와 같다. */
export const FINAL_DECISION_POLICY_V3: FinalDecisionPolicy = deepFreeze({
  ...structuredClone(FINAL_DECISION_POLICY_V1),
  policyVersion: FINAL_DECISION_POLICY_V3_VERSION,
  requiredRuleSetVersion: "risk-rules-v3",
});

const POLICY_KEYS = new Set([
  "policyVersion",
  "requiredRuleSetVersion",
  "requiredRiskClasses",
  "requiredDomains",
  "requiresEvidenceReady",
  "requiresExpertReviewReady",
]);

function failure(code: FinalDecisionFailureCode, errors: readonly string[]): FinalDecisionFailure {
  return Object.freeze({
    ok: false as const,
    code,
    message: errors.join(" "),
    errors: Object.freeze([...errors]),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkEnumList(
  errors: string[],
  path: string,
  value: unknown,
  allowed: readonly string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}는 1개 이상인 배열이어야 합니다.`);
    return;
  }
  const seen = new Set<unknown>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !allowed.includes(entry)) {
      errors.push(`${path}[${index}] 값이 지원되지 않습니다.`);
    }
    if (seen.has(entry)) errors.push(`${path}[${index}] 중복: ${String(entry)}`);
    seen.add(entry);
  });
}

export function validateFinalDecisionPolicy(policy: unknown): FinalDecisionOutcome<FinalDecisionPolicy> {
  const errors: string[] = [];
  if (!isRecord(policy)) return failure("INVALID_FINAL_DECISION_POLICY", ["policy는 객체여야 합니다."]);
  for (const key of Object.keys(policy)) {
    if (!POLICY_KEYS.has(key)) errors.push(`policy.${key}: 정의되지 않은 필드입니다.`);
  }
  if (!isNonEmptyString(policy.policyVersion)) errors.push("policy.policyVersion이 비어 있습니다.");
  if (!isNonEmptyString(policy.requiredRuleSetVersion)) {
    errors.push("policy.requiredRuleSetVersion이 비어 있습니다.");
  }
  checkEnumList(errors, "policy.requiredRiskClasses", policy.requiredRiskClasses, RISK_CLASSES);
  checkEnumList(errors, "policy.requiredDomains", policy.requiredDomains, RISK_DOMAINS);
  if (policy.requiresEvidenceReady !== true) errors.push("policy.requiresEvidenceReady는 true여야 합니다.");
  if (policy.requiresExpertReviewReady !== true) {
    errors.push("policy.requiresExpertReviewReady는 true여야 합니다.");
  }
  if (errors.length > 0) return failure("INVALID_FINAL_DECISION_POLICY", errors);
  return Object.freeze({ ok: true as const, value: deepFreeze(structuredClone(policy as unknown as FinalDecisionPolicy)) });
}

const INPUT_KEYS = new Set(["policy", "riskRuleSet", "evidenceBundle", "riskRegister"]);

function inCanonicalOrder<T extends string>(canonical: readonly T[], values: Iterable<T>): readonly T[] {
  const set = new Set(values);
  return Object.freeze(canonical.filter((entry) => set.has(entry)));
}

/**
 * Bundle / RiskRegister의 candidateStoreId와 policy / riskRuleSet / register의 ruleSetVersion이 모두 같아야 한다.
 * 불일치는 오류다. DecisionReviewCompleteness는 caller에게 받지 않고 전달된 RiskRegister에서
 * buildDecisionReviewCompleteness로만 파생한다.
 */
export function buildFinalDecisionPolicyReadiness(input: {
  policy: FinalDecisionPolicy;
  riskRuleSet: RiskRuleSet;
  evidenceBundle: CandidateDecisionEvidenceBundle;
  riskRegister: RiskRegister;
}): FinalDecisionOutcome<FinalDecisionPolicyReadiness> {
  if (!isRecord(input)) return failure("INVALID_FINAL_DECISION_READINESS", ["input은 객체여야 합니다."]);
  const errors: string[] = [];
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.has(key)) errors.push(`input.${key}: 정의되지 않은 입력입니다.`);
  }
  const policyCheck = validateFinalDecisionPolicy(input.policy);
  if (!policyCheck.ok) errors.push(...policyCheck.errors.map((entry) => `policy: ${entry}`));
  const ruleSetCheck = validateRiskRuleSet(input.riskRuleSet);
  if (!ruleSetCheck.ok) errors.push(...ruleSetCheck.errors.map((entry) => `riskRuleSet: ${entry}`));
  const reviewOutcome = buildDecisionReviewCompleteness(input.riskRegister);
  if (!reviewOutcome.ok) errors.push(...reviewOutcome.errors.map((entry) => `riskRegister: ${entry}`));
  const bundle = input.evidenceBundle;
  if (!isRecord(bundle) || bundle.schemaVersion !== CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`evidenceBundle.schemaVersion은 ${CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION}이어야 합니다.`);
  } else if (!isNonEmptyString(bundle.candidateStoreId)) {
    errors.push("evidenceBundle.candidateStoreId가 비어 있습니다.");
  }
  if (errors.length > 0 || !policyCheck.ok || !ruleSetCheck.ok || !reviewOutcome.ok) {
    return failure("INVALID_FINAL_DECISION_READINESS", errors);
  }

  const policy = policyCheck.value;
  const ruleSet = ruleSetCheck.value;
  const review = reviewOutcome.value;

  const candidateStoreId = bundle.candidateStoreId;
  if (review.candidateStoreId !== candidateStoreId) {
    errors.push("riskRegister.candidateStoreId가 evidenceBundle.candidateStoreId와 다릅니다.");
  }
  const ruleSetVersion = policy.requiredRuleSetVersion;
  if (ruleSet.ruleSetVersion !== ruleSetVersion) {
    errors.push("riskRuleSet.ruleSetVersion이 policy.requiredRuleSetVersion과 다릅니다.");
  }
  if (review.ruleSetVersion !== ruleSetVersion) {
    errors.push("riskRegister.ruleSetVersion이 policy.requiredRuleSetVersion과 다릅니다.");
  }
  if (errors.length > 0) return failure("INVALID_FINAL_DECISION_READINESS", errors);

  const ruleClasses = new Set<RiskClass>(ruleSet.rules.map((rule) => rule.riskClass));
  const ruleDomains = new Set<RiskDomain>(ruleSet.rules.map((rule) => rule.domain));
  const requiredRiskClasses = inCanonicalOrder(RISK_CLASSES, policy.requiredRiskClasses);
  const requiredDomains = inCanonicalOrder(RISK_DOMAINS, policy.requiredDomains);
  const coveredRiskClasses = requiredRiskClasses.filter((entry) => ruleClasses.has(entry));
  const missingRiskClasses = requiredRiskClasses.filter((entry) => !ruleClasses.has(entry));
  const coveredDomains = requiredDomains.filter((entry) => ruleDomains.has(entry));
  const missingDomains = requiredDomains.filter((entry) => !ruleDomains.has(entry));

  const ruleCoverageReady = missingRiskClasses.length === 0 && missingDomains.length === 0;
  const reviewCompletenessReady = review.readyForHumanDecisionReview;

  return Object.freeze({
    ok: true as const,
    value: deepFreeze({
      schemaVersion: FINAL_DECISION_POLICY_READINESS_SCHEMA_VERSION,
      candidateStoreId,
      policyVersion: policy.policyVersion,
      ruleSetVersion,
      ruleCoverageReady,
      reviewCompletenessReady,
      readyForFinalVerdictEvaluation: ruleCoverageReady && reviewCompletenessReady,
      requiredRiskClasses: [...requiredRiskClasses],
      coveredRiskClasses,
      missingRiskClasses,
      requiredDomains: [...requiredDomains],
      coveredDomains,
      missingDomains,
      evidenceReady: review.evidenceReady,
      expertReviewReady: review.expertReviewReady,
      requiresHumanDecision: true as const,
      createsVerdict: false as const,
      createsScore: false as const,
    }),
  });
}
