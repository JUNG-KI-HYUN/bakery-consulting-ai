/**
 * Deterministic Risk Evaluator V1.
 *
 * Candidate Decision Evidence bundle (v1 또는 v2) → RuleDefinition → typed requirement matching
 * → optional predicate → RiskFinding → RiskEvaluationResult.
 * description / title 해석, regex 판정, LLM, I/O, clock, randomness 없음.
 * Score / Verdict를 만들지 않는다. severity는 rule.defaultSeverity를 그대로 쓴다.
 */

import type { DecisionEvidenceItem } from "../decision-evidence/types";
import {
  isSupportedCandidateEvidenceVersion,
  unsupportedCandidateEvidenceVersionError,
  type SupportedCandidateDecisionEvidenceBundle,
} from "./candidate-evidence-versions";
import {
  lookupRiskPredicate,
  RISK_PREDICATE_REGISTRY_V1,
  type RiskPredicateRegistry,
} from "./predicates";
import { RISK_RULE_SET_V1 } from "./rule-registry";
import {
  RISK_EVALUATION_RESULT_SCHEMA_VERSION,
  type RiskClass,
  type RiskEvaluationInput,
  type RiskEvaluationResult,
  type RiskEvidenceRequirement,
  type RiskFinding,
  type RiskRemediationType,
  type RiskResolutionStatus,
  type RiskRuleDefinition,
  type RiskRuleSet,
} from "./types";
import {
  validateRiskEvaluationResult,
  validateRiskFindingAgainstRule,
  validateRiskFindingEvidenceLinks,
  validateRiskRuleSet,
} from "./validation";

export type RiskEvaluationFailure = {
  readonly ok: false;
  readonly code: "INVALID_RISK_EVALUATION";
  readonly message: string;
  readonly errors: readonly string[];
};

export type RiskEvaluationOutcome =
  | { readonly ok: true; readonly value: RiskEvaluationResult }
  | RiskEvaluationFailure;

export type RiskEvaluationOptions = {
  readonly ruleSet?: RiskRuleSet;
  readonly predicates?: RiskPredicateRegistry;
};

export const INITIAL_RESOLUTION_STATUS: Readonly<Record<RiskClass, RiskResolutionStatus>> =
  Object.freeze({
    HARD_BLOCKER: "OPEN",
    CONDITIONAL_BLOCKER: "CONDITION_REQUIRED",
    ECONOMIC_STRESS: "OPEN",
    EVIDENCE_GAP: "NEEDS_CONFIRMATION",
    HUMAN_REVIEW_REQUIRED: "EXPERT_REVIEW_REQUIRED",
  });

export const REMEDIATION_TEXT: Readonly<Record<RiskRemediationType, string | null>> =
  Object.freeze({
    CONFIRM: "필요 근거를 확인하세요.",
    NEGOTIATE: "임대인 또는 상대방과 조건 협의가 필요합니다.",
    MEASURE: "현장 실측이 필요합니다.",
    EXPERT_REVIEW: "관련 전문가 확인이 필요합니다.",
    CHANGE_PLAN: "사업계획 또는 장비·공간 계획 조정 여부를 검토하세요.",
    NONE: null,
  });

const TYPED_SELECTORS = [
  "sourceDomain",
  "category",
  "bucket",
  "nature",
  "importance",
  "verificationStatus",
] as const;

/** typed selector AND equality. predicateKey는 여기서 보지 않는다. */
export function matchesEvidenceRequirement(
  item: DecisionEvidenceItem,
  requirement: RiskEvidenceRequirement,
): boolean {
  for (const selector of TYPED_SELECTORS) {
    const expected = requirement[selector];
    if (expected !== undefined && item[selector] !== expected) return false;
  }
  if (requirement.evidenceId !== undefined && item.id !== requirement.evidenceId) return false;
  return true;
}

function failure(errors: readonly string[]): RiskEvaluationFailure {
  return Object.freeze({
    ok: false as const,
    code: "INVALID_RISK_EVALUATION" as const,
    message: errors.join(" "),
    errors: Object.freeze([...errors]),
  });
}

function indexEvidence(
  bundle: SupportedCandidateDecisionEvidenceBundle,
  errors: string[],
): readonly DecisionEvidenceItem[] {
  const seen = new Map<string, string>();
  const items: DecisionEvidenceItem[] = [];
  const buckets: ReadonlyArray<readonly [string, readonly DecisionEvidenceItem[]]> = [
    ["observedFacts", bundle.observedFacts],
    ["observedConstraints", bundle.observedConstraints],
    ["missingInformation", bundle.missingInformation],
    ["expertReviewItems", bundle.expertReviewItems],
    ["geometryIssues", bundle.geometryIssues],
  ];
  for (const [bucketName, list] of buckets) {
    if (!Array.isArray(list)) {
      errors.push(`evidenceBundle.${bucketName}가 배열이 아닙니다.`);
      continue;
    }
    for (const item of list) {
      const previous = seen.get(item.id);
      if (previous !== undefined) {
        errors.push(`evidence id 중복: ${item.id} (${previous}, ${bucketName})`);
        continue;
      }
      seen.set(item.id, bucketName);
      items.push(item);
    }
  }
  return items;
}

/** "%" 와 구분자(":" "@" ",")만 %XX로 바꾼다. 역변환이 유일하므로 서로 다른 입력이 같은 ID가 되지 않는다. */
function escapeIdPart(value: string): string {
  return value.replace(/[%:@,]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** hash 없이 ruleId·ruleVersion·정렬된 evidenceIds 전체로 만든 canonical identity. */
export function riskFindingId(ruleId: string, ruleVersion: string, evidenceIds: readonly string[]): string {
  const sorted = [...new Set(evidenceIds)].sort(compareText);
  return `risk-finding:${escapeIdPart(ruleId)}@${escapeIdPart(ruleVersion)}:${sorted.map(escapeIdPart).join(",")}`;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function evaluateRule(
  rule: RiskRuleDefinition,
  bundle: SupportedCandidateDecisionEvidenceBundle,
  items: readonly DecisionEvidenceItem[],
  predicates: RiskPredicateRegistry,
): RiskFinding | null {
  const matched = new Set<string>();
  for (const requirement of rule.evidenceRequirements) {
    const predicate =
      requirement.predicateKey === undefined
        ? null
        : lookupRiskPredicate(predicates, requirement.predicateKey);
    const selected = items.filter(
      (item) =>
        matchesEvidenceRequirement(item, requirement) &&
        (predicate === null || predicate({ bundle, rule, requirement, candidateEvidence: item })),
    );
    if (selected.length === 0) return null;
    for (const item of selected) matched.add(item.id);
  }

  const evidenceIds = [...matched].sort(compareText);
  const remediation = REMEDIATION_TEXT[rule.remediationType];
  return {
    findingId: riskFindingId(rule.ruleId, rule.version, evidenceIds),
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    domain: rule.domain,
    riskClass: rule.riskClass,
    severity: rule.defaultSeverity,
    title: rule.title,
    description: rule.description,
    evidenceIds,
    missingRequirementKeys: [],
    resolutionStatus: INITIAL_RESOLUTION_STATUS[rule.riskClass],
    remediation: remediation === null ? [] : [remediation],
    requiresHumanApproval: rule.requiresHumanApproval,
  };
}

/**
 * Rule의 모든 requirement가 1건 이상 매칭될 때만 rule당 finding 1개를 만든다.
 * 입력(bundle, rule set, evidence item)을 mutation/freeze하지 않는다.
 */
export function evaluateRiskRules(
  input: RiskEvaluationInput,
  options: RiskEvaluationOptions = {},
): RiskEvaluationOutcome {
  const ruleSetInput = options.ruleSet ?? RISK_RULE_SET_V1;
  const predicates = options.predicates ?? RISK_PREDICATE_REGISTRY_V1;
  const errors: string[] = [];

  const ruleSetResult = validateRiskRuleSet(ruleSetInput);
  if (!ruleSetResult.ok) return failure(ruleSetResult.errors.map((entry) => `rule set: ${entry}`));
  const ruleSet = ruleSetResult.value;

  if (input.ruleSetVersion !== ruleSet.ruleSetVersion) {
    errors.push(
      `ruleSetVersion 불일치: input=${String(input.ruleSetVersion)}, ruleSet=${ruleSet.ruleSetVersion}`,
    );
  }
  const bundle = input.evidenceBundle;
  if (!bundle || !isSupportedCandidateEvidenceVersion(bundle.schemaVersion)) {
    errors.push(unsupportedCandidateEvidenceVersionError());
    return failure(errors);
  }
  if (typeof bundle.candidateStoreId !== "string" || !bundle.candidateStoreId.trim()) {
    errors.push("evidenceBundle.candidateStoreId가 비어 있습니다.");
  }
  const items = indexEvidence(bundle, errors);

  for (const rule of ruleSet.rules) {
    for (const requirement of rule.evidenceRequirements) {
      if (
        requirement.predicateKey !== undefined &&
        lookupRiskPredicate(predicates, requirement.predicateKey) === null
      ) {
        errors.push(
          `등록되지 않은 predicateKey: ${requirement.predicateKey} (${rule.ruleId}@${rule.version})`,
        );
      }
    }
  }
  if (errors.length > 0) return failure(errors);

  const rules = [...ruleSet.rules].sort(
    (left, right) =>
      compareText(left.ruleId, right.ruleId) || compareText(left.version, right.version),
  );
  const findings: RiskFinding[] = [];
  for (const rule of rules) {
    const finding = evaluateRule(rule, bundle, items, predicates);
    if (finding === null) continue;
    const againstRule = validateRiskFindingAgainstRule(finding, rule);
    if (!againstRule.ok) {
      errors.push(...againstRule.errors.map((entry) => `generated finding ${finding.findingId}: ${entry}`));
      continue;
    }
    const links = validateRiskFindingEvidenceLinks(finding, bundle);
    if (!links.ok) {
      errors.push(...links.errors.map((entry) => `generated finding ${finding.findingId}: ${entry}`));
      continue;
    }
    findings.push(finding);
  }
  if (errors.length > 0) return failure(errors);

  findings.sort(
    (left, right) =>
      compareText(left.ruleId, right.ruleId) || compareText(left.findingId, right.findingId),
  );
  const unresolved = findings.filter((entry) => entry.resolutionStatus !== "RESOLVED");
  const unresolvedOf = (riskClass: RiskClass) =>
    unresolved.filter((entry) => entry.riskClass === riskClass).length;

  const resultCheck = validateRiskEvaluationResult({
    schemaVersion: RISK_EVALUATION_RESULT_SCHEMA_VERSION,
    candidateStoreId: bundle.candidateStoreId,
    ruleSetVersion: ruleSet.ruleSetVersion,
    findings,
    unresolvedFindingCount: unresolved.length,
    unresolvedHardBlockerCount: unresolvedOf("HARD_BLOCKER"),
    unresolvedConditionalBlockerCount: unresolvedOf("CONDITIONAL_BLOCKER"),
    unresolvedEconomicStressCount: unresolvedOf("ECONOMIC_STRESS"),
    unresolvedEvidenceGapCount: unresolvedOf("EVIDENCE_GAP"),
    unresolvedHumanReviewRequiredCount: unresolvedOf("HUMAN_REVIEW_REQUIRED"),
    createsVerdict: false,
    createsScore: false,
  });
  if (!resultCheck.ok) {
    return failure(resultCheck.errors.map((entry) => `generated result: ${entry}`));
  }
  return Object.freeze({ ok: true as const, value: resultCheck.value });
}
