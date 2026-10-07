/**
 * Risk Rule Registry V1 — 현재 typed Evidence로 검증 가능한 golden rule만 둔다.
 *
 * HARD_BLOCKER rule은 없다. 현재 Evidence에는 "해소 불가"를 나타내는 typed field가 없으므로
 * CONSTRAINT_OBSERVED를 HARD_BLOCKER로 승격하지 않는다.
 * V1에는 Economic / Location / Competition rule이 없다. Economic rule은 V2에만 둔다.
 */

import { makeDecisionEvidenceId } from "../decision-evidence/helpers";
import {
  ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY,
  ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY,
  LEASE_BAKERY_USE_REFUSED_PREDICATE_KEY,
  LEASE_BUSINESS_USE_RESTRICTION_PRESENT_PREDICATE_KEY,
  LEASE_CONSTRUCTION_CONSENT_REFUSED_PREDICATE_KEY,
  LEASE_ELECTRICAL_UPGRADE_REFUSED_PREDICATE_KEY,
  LEASE_EXHAUST_CONSENT_REFUSED_PREDICATE_KEY,
} from "./predicates";
import {
  RISK_RULE_SET_SCHEMA_VERSION,
  type RiskRemediationType,
  type RiskRuleDefinition,
  type RiskRuleSet,
} from "./types";

export const RISK_RULE_SET_V1_VERSION = "risk-rules-v1" as const;

const RULE_VERSION = "1";

function technicalConstraintRule(input: {
  ruleId: string;
  domain: "ELECTRICAL" | "EXHAUST" | "WATER" | "DRAINAGE" | "DELIVERY";
  category: "ELECTRICAL" | "EXHAUST" | "WATER" | "DRAINAGE" | "DELIVERY";
  title: string;
  description: string;
  remediationType: RiskRemediationType;
}): RiskRuleDefinition {
  return {
    ruleId: input.ruleId,
    version: RULE_VERSION,
    domain: input.domain,
    riskClass: "CONDITIONAL_BLOCKER",
    title: input.title,
    description: input.description,
    evidenceRequirements: [
      {
        requirementKey: "technical-constraint",
        sourceDomain: "TECHNICAL_CHECK",
        bucket: "OBSERVED_CONSTRAINT",
        category: input.category,
      },
    ],
    defaultSeverity: "HIGH",
    requiresHumanApproval: true,
    remediationType: input.remediationType,
  };
}

function technicalExpertReviewRule(input: {
  ruleId: string;
  domain: "ELECTRICAL" | "EXHAUST";
  category: "ELECTRICAL" | "EXHAUST";
  title: string;
  description: string;
}): RiskRuleDefinition {
  return {
    ruleId: input.ruleId,
    version: RULE_VERSION,
    domain: input.domain,
    riskClass: "HUMAN_REVIEW_REQUIRED",
    title: input.title,
    description: input.description,
    evidenceRequirements: [
      {
        requirementKey: "technical-expert-review",
        sourceDomain: "TECHNICAL_CHECK",
        bucket: "EXPERT_REVIEW",
        category: input.category,
      },
    ],
    defaultSeverity: "MEDIUM",
    requiresHumanApproval: true,
    remediationType: "EXPERT_REVIEW",
  };
}

const NOT_FINAL =
  "계약 전 해소 조건 또는 추가 확인·조정이 필요하다는 의미이며, 설치 여부를 확정한 결과가 아닙니다.";

const RULES: readonly RiskRuleDefinition[] = [
  {
    ruleId: "EVIDENCE.CORE_MISSING",
    version: RULE_VERSION,
    domain: "EVIDENCE",
    riskClass: "EVIDENCE_GAP",
    title: "핵심 자료 미확보",
    description:
      "CORE로 분류된 MISSING_INFORMATION evidence가 있습니다. 해당 자료가 확인되기 전에는 관련 항목을 판단 근거로 사용할 수 없습니다.",
    evidenceRequirements: [
      { requirementKey: "core-missing", bucket: "MISSING_INFORMATION", importance: "CORE" },
    ],
    defaultSeverity: "HIGH",
    requiresHumanApproval: false,
    remediationType: "CONFIRM",
  },
  technicalConstraintRule({
    ruleId: "TECHNICAL.ELECTRICAL.CONSTRAINT",
    domain: "ELECTRICAL",
    category: "ELECTRICAL",
    title: "전기 조건 제약 관찰",
    description: `Technical Check에서 전기 관련 제약이 관찰되었습니다. ${NOT_FINAL}`,
    remediationType: "EXPERT_REVIEW",
  }),
  technicalConstraintRule({
    ruleId: "TECHNICAL.EXHAUST.CONSTRAINT",
    domain: "EXHAUST",
    category: "EXHAUST",
    title: "배기 조건 제약 관찰",
    description: `Technical Check에서 배기 관련 제약이 관찰되었습니다. ${NOT_FINAL}`,
    remediationType: "EXPERT_REVIEW",
  }),
  technicalConstraintRule({
    ruleId: "TECHNICAL.WATER.CONSTRAINT",
    domain: "WATER",
    category: "WATER",
    title: "급수 조건 제약 관찰",
    description: `Technical Check에서 급수 관련 제약이 관찰되었습니다. ${NOT_FINAL}`,
    remediationType: "EXPERT_REVIEW",
  }),
  technicalConstraintRule({
    ruleId: "TECHNICAL.DRAINAGE.CONSTRAINT",
    domain: "DRAINAGE",
    category: "DRAINAGE",
    title: "배수 조건 제약 관찰",
    description: `Technical Check에서 배수 관련 제약이 관찰되었습니다. ${NOT_FINAL}`,
    remediationType: "EXPERT_REVIEW",
  }),
  technicalConstraintRule({
    ruleId: "TECHNICAL.DELIVERY.CONSTRAINT",
    domain: "DELIVERY",
    category: "DELIVERY",
    title: "장비 반입경로 제약 관찰",
    description:
      "Technical Check에서 장비 반입경로 제약이 관찰되었습니다. 분해·포장·대체 경로 등은 확인되지 않았으며, 반입 여부를 확정한 결과가 아닙니다.",
    remediationType: "CONFIRM",
  }),
  technicalExpertReviewRule({
    ruleId: "TECHNICAL.ELECTRICAL.EXPERT_REVIEW",
    domain: "ELECTRICAL",
    category: "ELECTRICAL",
    title: "전기 항목 전문가 확인 필요",
    description:
      "Technical Check에서 전기 항목이 전문가 확인 대상으로 분류되었습니다. 시설 적합 여부를 확정한 결과가 아닙니다.",
  }),
  technicalExpertReviewRule({
    ruleId: "TECHNICAL.EXHAUST.EXPERT_REVIEW",
    domain: "EXHAUST",
    category: "EXHAUST",
    title: "배기 항목 전문가 확인 필요",
    description:
      "Technical Check에서 배기 항목이 전문가 확인 대상으로 분류되었습니다. 시설 적합 여부를 확정한 결과가 아닙니다.",
  }),
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const RISK_RULE_SET_V1: RiskRuleSet = deepFreeze({
  schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
  ruleSetVersion: RISK_RULE_SET_V1_VERSION,
  rules: RULES,
});

/**
 * Risk Rule Set V2 = V1 rules + Economic Stress rules. RISK_PREDICATE_REGISTRY_V2와 함께 평가한다.
 * ruleSetVersion은 content version이다. risk-rules-v1 내용은 바꾸지 않는다.
 *
 * Economic finding은 ECONOMIC_STRESS로만 둔다. HARD_BLOCKER로 승격하지 않는다.
 * 계획 임대료 vs BASE ceiling rule은 plannedRent / plannedRentToCeiling이 typed metadata로
 * 노출되지 않아 두지 않았다 (Evidence contract 확장 필요).
 */
export const RISK_RULE_SET_V2_VERSION = "risk-rules-v2" as const;

const ECONOMIC_RULES: readonly RiskRuleDefinition[] = [
  {
    ruleId: "ECONOMIC.BASE_BELOW_BEP",
    version: RULE_VERSION,
    domain: "ECONOMIC",
    riskClass: "ECONOMIC_STRESS",
    title: "BASE 시나리오 월매출이 월 손익분기 매출보다 낮음",
    description:
      "입력된 BASE 시나리오 월매출(사업계획 가정 기반 projection)이 Economic engine이 계산한 월 손익분기 매출보다 낮습니다. 기존 계산값끼리 비교한 결과이며 사업 성패나 계약 여부를 판정하지 않습니다.",
    evidenceRequirements: [
      {
        requirementKey: "base-scenario-projection",
        sourceDomain: "ECONOMIC",
        bucket: "OBSERVED_FACT",
        category: "ECONOMIC",
        nature: "ESTIMATE",
        evidenceId: makeDecisionEvidenceId({
          sourceDomain: "ECONOMIC",
          bucket: "OBSERVED_FACT",
          category: "ECONOMIC",
          key: "scenario-base-projection",
        }),
        predicateKey: ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY,
      },
      {
        requirementKey: "bep-summary",
        sourceDomain: "ECONOMIC",
        bucket: "OBSERVED_FACT",
        category: "BEP",
        nature: "DERIVED_CALCULATION",
        evidenceId: makeDecisionEvidenceId({
          sourceDomain: "ECONOMIC",
          bucket: "OBSERVED_FACT",
          category: "BEP",
          key: "bep-summary",
        }),
        predicateKey: ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY,
      },
    ],
    defaultSeverity: "HIGH",
    requiresHumanApproval: false,
    remediationType: "CHANGE_PLAN",
  },
];

export const RISK_RULE_SET_V2: RiskRuleSet = deepFreeze({
  schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
  ruleSetVersion: RISK_RULE_SET_V2_VERSION,
  rules: [...RISK_RULE_SET_V1.rules, ...ECONOMIC_RULES],
});

/**
 * Risk Rule Set V3 = V2 rules + 계획 월세 vs BASE 목표 임대료 상한 rule. RISK_PREDICATE_REGISTRY_V3와 함께 평가한다.
 * risk-rules-v1 / risk-rules-v2 내용은 바꾸지 않는다.
 */
export const RISK_RULE_SET_V3_VERSION = "risk-rules-v3" as const;

const ECONOMIC_RENT_RULES: readonly RiskRuleDefinition[] = [
  {
    ruleId: "ECONOMIC.RENT_ABOVE_BASE_CEILING",
    version: RULE_VERSION,
    domain: "ECONOMIC",
    riskClass: "ECONOMIC_STRESS",
    title: "계획 월세가 BASE 목표 임대료 상한 초과",
    description:
      "현재 입력된 사업계획 기준으로 계획 월세가 BASE 시나리오의 목표 임대료 상한을 초과합니다. Economic engine의 기존 관계 결과를 읽은 것이며 사업 성패나 계약 여부를 판정하지 않습니다.",
    evidenceRequirements: [
      {
        requirementKey: "rental-market-reference-usage",
        sourceDomain: "ECONOMIC",
        bucket: "OBSERVED_FACT",
        category: "ECONOMIC",
        nature: "REFERENCE_SUMMARY",
        evidenceId: makeDecisionEvidenceId({
          sourceDomain: "ECONOMIC",
          bucket: "OBSERVED_FACT",
          category: "ECONOMIC",
          key: "rental-market-reference-usage",
        }),
        predicateKey: ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY,
      },
    ],
    defaultSeverity: "HIGH",
    requiresHumanApproval: false,
    remediationType: "NEGOTIATE",
  },
];

export const RISK_RULE_SET_V3: RiskRuleSet = deepFreeze({
  schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
  ruleSetVersion: RISK_RULE_SET_V3_VERSION,
  rules: [...RISK_RULE_SET_V2.rules, ...ECONOMIC_RENT_RULES],
});

/**
 * Risk Rule Set V4 = V3 rules + Candidate Lease constraint rules.
 * REFUSED / RESTRICTION_PRESENT는 사람 검토가 필요한 조건으로만 분류하며 HARD_BLOCKER로 승격하지 않는다.
 */
export const RISK_RULE_SET_V4_VERSION = "risk-rules-v4" as const;

function candidateLeaseConstraintRule(input: {
  ruleId: string;
  title: string;
  description: string;
  evidenceKey: string;
  predicateKey: string;
  remediationType: "EXPERT_REVIEW" | "NEGOTIATE";
}): RiskRuleDefinition {
  return {
    ruleId: input.ruleId,
    version: RULE_VERSION,
    domain: "LEASE",
    riskClass: "CONDITIONAL_BLOCKER",
    title: input.title,
    description: input.description,
    evidenceRequirements: [
      {
        requirementKey: "candidate-lease-constraint",
        sourceDomain: "LEASE",
        bucket: "OBSERVED_CONSTRAINT",
        category: "LEASE",
        nature: "OBSERVATION",
        importance: "CORE",
        evidenceId: makeDecisionEvidenceId({
          sourceDomain: "LEASE",
          bucket: "OBSERVED_CONSTRAINT",
          category: "LEASE",
          key: input.evidenceKey,
        }),
        predicateKey: input.predicateKey,
      },
    ],
    defaultSeverity: "HIGH",
    requiresHumanApproval: true,
    remediationType: input.remediationType,
  };
}

const CANDIDATE_LEASE_RULES: readonly RiskRuleDefinition[] = [
  candidateLeaseConstraintRule({
    ruleId: "LEASE.BUSINESS_USE_RESTRICTION_PRESENT",
    title: "후보점포 사용 제한 확인",
    description:
      "현재 후보점포 계약자료에 업종 또는 사용 제한이 기록되어 있습니다. 제한의 대상·범위와 베이커리 운영에 미치는 영향은 관련 전문가의 추가 검토가 필요합니다.",
    evidenceKey: "candidate-condition-business-use-restriction",
    predicateKey: LEASE_BUSINESS_USE_RESTRICTION_PRESENT_PREDICATE_KEY,
    remediationType: "EXPERT_REVIEW",
  }),
  candidateLeaseConstraintRule({
    ruleId: "LEASE.BAKERY_USE_REFUSED",
    title: "베이커리 제조형 사용 동의 거절 기록",
    description:
      "현재 확인 근거에서 베이커리 제조형 사용에 대한 임대인 동의가 거절 상태로 기록되어 있습니다. 운영계획과 협의 가능성을 사람이 추가 검토해야 합니다.",
    evidenceKey: "candidate-consent-bakery-manufacturing-use",
    predicateKey: LEASE_BAKERY_USE_REFUSED_PREDICATE_KEY,
    remediationType: "NEGOTIATE",
  }),
  candidateLeaseConstraintRule({
    ruleId: "LEASE.EXHAUST_CONSENT_REFUSED",
    title: "배기 관련 임대인 동의 거절 기록",
    description:
      "배기 관련 임대인 동의가 거절 상태로 기록되어 있습니다. 기존 배기 사용, 대체 경로 또는 장비·제조 방식의 가능성은 별도 확인이 필요합니다.",
    evidenceKey: "candidate-consent-exhaust",
    predicateKey: LEASE_EXHAUST_CONSENT_REFUSED_PREDICATE_KEY,
    remediationType: "NEGOTIATE",
  }),
  candidateLeaseConstraintRule({
    ruleId: "LEASE.ELECTRICAL_UPGRADE_REFUSED",
    title: "전기 증설 관련 임대인 동의 거절 기록",
    description:
      "전기 증설 관련 임대인 동의가 거절 상태로 기록되어 있습니다. 기존 전력용량의 충분성은 이 항목에서 판단하지 않으며 별도 확인이 필요합니다.",
    evidenceKey: "candidate-consent-electrical-upgrade",
    predicateKey: LEASE_ELECTRICAL_UPGRADE_REFUSED_PREDICATE_KEY,
    remediationType: "NEGOTIATE",
  }),
  candidateLeaseConstraintRule({
    ruleId: "LEASE.CONSTRUCTION_CONSENT_REFUSED",
    title: "공사 관련 임대인 동의 거절 기록",
    description:
      "공사 관련 임대인 동의가 거절 상태로 기록되어 있습니다. 현재 운영계획에 실제 공사가 필요한지는 이 항목에서 판단하지 않으며 별도 확인이 필요합니다.",
    evidenceKey: "candidate-consent-construction",
    predicateKey: LEASE_CONSTRUCTION_CONSENT_REFUSED_PREDICATE_KEY,
    remediationType: "NEGOTIATE",
  }),
];

export const RISK_RULE_SET_V4: RiskRuleSet = deepFreeze({
  schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
  ruleSetVersion: RISK_RULE_SET_V4_VERSION,
  rules: [...RISK_RULE_SET_V3.rules, ...CANDIDATE_LEASE_RULES],
});
