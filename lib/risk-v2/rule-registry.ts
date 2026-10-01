/**
 * Risk Rule Registry V1 — 현재 typed Evidence로 검증 가능한 golden rule만 둔다.
 *
 * HARD_BLOCKER rule은 없다. 현재 Evidence에는 "해소 불가"를 나타내는 typed field가 없으므로
 * CONSTRAINT_OBSERVED를 HARD_BLOCKER로 승격하지 않는다.
 * Economic / Location / Competition rule도 typed predicate가 정의될 때까지 두지 않는다.
 */

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
