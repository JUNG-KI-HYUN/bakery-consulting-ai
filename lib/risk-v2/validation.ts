/**
 * Risk V2 contract pure validation. I/O 없음, 시간 생성 없음, Risk 평가 없음.
 * 통과 시 입력을 복제·freeze한 값을 돌려주며 입력 객체는 mutation/freeze하지 않는다.
 */

import type { CandidateDecisionEvidenceBundle } from "../decision-evidence/candidate-bundle";
import type {
  DecisionEvidenceBucket,
  DecisionEvidenceCategory,
  DecisionEvidenceImportance,
  DecisionEvidenceItem,
  DecisionEvidenceNature,
  DecisionEvidenceSourceDomain,
} from "../decision-evidence/types";
import { DECISION_EVIDENCE_CATEGORIES } from "../decision-evidence/types";
import type { VerificationStatus } from "../evidence/types";
import {
  RISK_CLASSES,
  RISK_DOMAINS,
  RISK_EVALUATION_RESULT_SCHEMA_VERSION,
  RISK_REMEDIATION_TYPES,
  RISK_RESOLUTION_STATUSES,
  RISK_RULE_SET_SCHEMA_VERSION,
  RISK_SEVERITIES,
  type RiskContractValidationResult,
  type RiskEvaluationResult,
  type RiskFinding,
  type RiskRuleDefinition,
  type RiskRuleSet,
} from "./types";

const SOURCE_DOMAINS: readonly DecisionEvidenceSourceDomain[] = [
  "FIELD",
  "TECHNICAL_CHECK",
  "SPACE_FIT",
  "EQUIPMENT",
  "LEASE",
  "ECONOMIC",
  "LOCATION",
];
const BUCKETS: readonly DecisionEvidenceBucket[] = [
  "OBSERVED_FACT",
  "OBSERVED_CONSTRAINT",
  "MISSING_INFORMATION",
  "EXPERT_REVIEW",
  "GEOMETRY_ISSUE",
];
const NATURES: readonly DecisionEvidenceNature[] = [
  "OBSERVATION",
  "REFERENCE_SUMMARY",
  "DERIVED_CALCULATION",
  "ESTIMATE",
  "INTEGRATION_STATE",
];
const IMPORTANCES: readonly DecisionEvidenceImportance[] = ["CORE", "SUPPORTING"];
const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "VERIFIED",
  "ESTIMATED",
  "UNKNOWN",
  "CONFLICTED",
  "STALE",
];
const ECONOMIC_STRESS_NATURES: readonly DecisionEvidenceNature[] = [
  "ESTIMATE",
  "DERIVED_CALCULATION",
  "REFERENCE_SUMMARY",
];
/** DERIVED_CALCULATION은 Domain별 의미가 달라 전역 금지하지 않는다. */
const HARD_BLOCKER_FORBIDDEN_NATURES: readonly DecisionEvidenceNature[] = [
  "ESTIMATE",
  "REFERENCE_SUMMARY",
  "INTEGRATION_STATE",
];
/** 값이 있을 때만 적용. undefined는 이 이유만으로 거부하지 않는다. */
const HARD_BLOCKER_FORBIDDEN_VERIFICATION: readonly VerificationStatus[] = [
  "ESTIMATED",
  "UNKNOWN",
  "CONFLICTED",
  "STALE",
];

function hardBlockerQualificationErrors(
  path: string,
  selector: {
    bucket?: unknown;
    nature?: unknown;
    verificationStatus?: unknown;
    sourceDomain?: unknown;
  },
): string[] {
  const errors: string[] = [];
  if (selector.bucket !== "OBSERVED_CONSTRAINT") {
    errors.push(`${path}: HARD_BLOCKER 근거는 bucket=OBSERVED_CONSTRAINT여야 합니다.`);
  }
  if (
    typeof selector.nature === "string" &&
    (HARD_BLOCKER_FORBIDDEN_NATURES as readonly string[]).includes(selector.nature)
  ) {
    errors.push(`${path}: nature=${selector.nature}는 HARD_BLOCKER 근거가 될 수 없습니다.`);
  }
  if (
    typeof selector.verificationStatus === "string" &&
    (HARD_BLOCKER_FORBIDDEN_VERIFICATION as readonly string[]).includes(selector.verificationStatus)
  ) {
    errors.push(`${path}: verificationStatus=${selector.verificationStatus}는 HARD_BLOCKER 근거가 될 수 없습니다.`);
  }
  if (selector.sourceDomain === "ECONOMIC") {
    errors.push(`${path}: Economic evidence는 HARD_BLOCKER 근거가 될 수 없습니다.`);
  }
  return errors;
}

/** Final Verdict / Score Layer 전용 이름. Risk V2 contract 어디에도 두지 않는다. */
const FORBIDDEN_KEYS = new Set([
  "recommendation",
  "verdict",
  "finalstatus",
  "approved",
  "approval",
  "rejected",
  "contractallowed",
  "contractdecision",
  "blockingdecision",
  "hardfail",
  "score",
  "riskscore",
  "totalscore",
  "totalriskscore",
  "weightedscore",
  "grade",
]);

const REQUIREMENT_KEYS = new Set([
  "requirementKey",
  "sourceDomain",
  "category",
  "bucket",
  "nature",
  "importance",
  "verificationStatus",
  "evidenceId",
  "predicateKey",
]);
const RULE_KEYS = new Set([
  "ruleId",
  "version",
  "domain",
  "riskClass",
  "title",
  "description",
  "evidenceRequirements",
  "defaultSeverity",
  "requiresHumanApproval",
  "remediationType",
]);
const RULE_SET_KEYS = new Set(["schemaVersion", "ruleSetVersion", "rules"]);
const HUMAN_ACCEPTANCE_KEYS = new Set(["acceptedByRef", "acceptedAt", "reason"]);
const FINDING_KEYS = new Set([
  "findingId",
  "ruleId",
  "ruleVersion",
  "domain",
  "riskClass",
  "severity",
  "title",
  "description",
  "evidenceIds",
  "missingRequirementKeys",
  "resolutionStatus",
  "remediation",
  "requiresHumanApproval",
  "humanAcceptance",
]);
const RESULT_KEYS = new Set([
  "schemaVersion",
  "candidateStoreId",
  "ruleSetVersion",
  "findings",
  "unresolvedFindingCount",
  "unresolvedHardBlockerCount",
  "unresolvedConditionalBlockerCount",
  "unresolvedEconomicStressCount",
  "unresolvedEvidenceGapCount",
  "unresolvedHumanReviewRequiredCount",
  "createsVerdict",
  "createsScore",
]);

type Errors = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkString(errors: Errors, path: string, value: unknown): void {
  if (!isNonEmptyString(value)) errors.push(`${path}는 비어 있지 않은 문자열이어야 합니다.`);
}

function checkEnum<T extends string>(
  errors: Errors,
  path: string,
  value: unknown,
  allowed: readonly T[],
): void {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    errors.push(`${path} 값이 지원되지 않습니다.`);
  }
}

function checkKeys(errors: Errors, path: string, value: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      errors.push(`${path}.${key}: verdict/score 필드는 Risk V2 contract에 둘 수 없습니다.`);
    } else if (!allowed.has(key)) {
      errors.push(`${path}.${key}: 정의되지 않은 필드입니다.`);
    }
  }
}

function checkStringList(
  errors: Errors,
  path: string,
  value: unknown,
): readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 배열이어야 합니다.`);
    return [];
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      errors.push(`${path}[${index}]는 비어 있지 않은 문자열이어야 합니다.`);
      return;
    }
    if (seen.has(entry)) errors.push(`${path}[${index}] 중복: ${entry}`);
    seen.add(entry);
  });
  return value.filter(isNonEmptyString);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function finish<T>(errors: Errors, value: unknown): RiskContractValidationResult<T> {
  if (errors.length > 0) {
    return Object.freeze({
      ok: false as const,
      code: "INVALID_RISK_CONTRACT" as const,
      message: errors.join(" "),
      errors: Object.freeze([...errors]),
    });
  }
  return Object.freeze({ ok: true as const, value: deepFreeze(structuredClone(value)) as T });
}

function collectRequirementErrors(
  errors: Errors,
  path: string,
  value: unknown,
  riskClass: unknown,
): string | null {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return null;
  }
  checkKeys(errors, path, value, REQUIREMENT_KEYS);
  checkString(errors, `${path}.requirementKey`, value.requirementKey);
  if (value.sourceDomain !== undefined) checkEnum(errors, `${path}.sourceDomain`, value.sourceDomain, SOURCE_DOMAINS);
  if (value.category !== undefined) checkEnum(errors, `${path}.category`, value.category, DECISION_EVIDENCE_CATEGORIES as readonly DecisionEvidenceCategory[]);
  if (value.bucket !== undefined) checkEnum(errors, `${path}.bucket`, value.bucket, BUCKETS);
  if (value.nature !== undefined) checkEnum(errors, `${path}.nature`, value.nature, NATURES);
  if (value.importance !== undefined) checkEnum(errors, `${path}.importance`, value.importance, IMPORTANCES);
  if (value.verificationStatus !== undefined) {
    checkEnum(errors, `${path}.verificationStatus`, value.verificationStatus, VERIFICATION_STATUSES);
  }
  if (value.evidenceId !== undefined) checkString(errors, `${path}.evidenceId`, value.evidenceId);
  if (value.predicateKey !== undefined) checkString(errors, `${path}.predicateKey`, value.predicateKey);
  const selectors = [...REQUIREMENT_KEYS].filter((key) => key !== "requirementKey" && value[key] !== undefined);
  if (selectors.length === 0) errors.push(`${path}에는 최소 하나의 evidence selector가 필요합니다.`);

  if (riskClass === "HARD_BLOCKER") {
    errors.push(...hardBlockerQualificationErrors(path, value));
  }
  if (riskClass === "ECONOMIC_STRESS") {
    if (typeof value.nature !== "string" || !(ECONOMIC_STRESS_NATURES as readonly string[]).includes(value.nature)) {
      errors.push(`${path}: ECONOMIC_STRESS requirement의 nature는 ESTIMATE / DERIVED_CALCULATION / REFERENCE_SUMMARY 중 하나여야 합니다.`);
    }
  }
  return isNonEmptyString(value.requirementKey) ? value.requirementKey : null;
}

function collectRuleErrors(errors: Errors, path: string, value: unknown): void {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, RULE_KEYS);
  checkString(errors, `${path}.ruleId`, value.ruleId);
  checkString(errors, `${path}.version`, value.version);
  checkString(errors, `${path}.title`, value.title);
  checkString(errors, `${path}.description`, value.description);
  checkEnum(errors, `${path}.domain`, value.domain, RISK_DOMAINS);
  checkEnum(errors, `${path}.riskClass`, value.riskClass, RISK_CLASSES);
  checkEnum(errors, `${path}.defaultSeverity`, value.defaultSeverity, RISK_SEVERITIES);
  checkEnum(errors, `${path}.remediationType`, value.remediationType, RISK_REMEDIATION_TYPES);
  if (typeof value.requiresHumanApproval !== "boolean") {
    errors.push(`${path}.requiresHumanApproval은 boolean이어야 합니다.`);
  }

  if (!Array.isArray(value.evidenceRequirements) || value.evidenceRequirements.length === 0) {
    errors.push(`${path}.evidenceRequirements는 1개 이상이어야 합니다.`);
  } else {
    const keys = new Set<string>();
    value.evidenceRequirements.forEach((requirement, index) => {
      const key = collectRequirementErrors(
        errors,
        `${path}.evidenceRequirements[${index}]`,
        requirement,
        value.riskClass,
      );
      if (key !== null) {
        if (keys.has(key)) errors.push(`${path}.evidenceRequirements[${index}].requirementKey 중복: ${key}`);
        keys.add(key);
      }
    });
  }

  if (value.riskClass === "HARD_BLOCKER" && value.domain === "ECONOMIC") {
    errors.push(`${path}: ECONOMIC domain은 HARD_BLOCKER가 될 수 없습니다. ECONOMIC_STRESS를 사용합니다.`);
  }
  if (value.riskClass === "HUMAN_REVIEW_REQUIRED" && value.requiresHumanApproval !== true) {
    errors.push(`${path}: HUMAN_REVIEW_REQUIRED rule은 requiresHumanApproval=true여야 합니다.`);
  }
  if (
    (value.riskClass === "CONDITIONAL_BLOCKER" || value.riskClass === "EVIDENCE_GAP") &&
    value.remediationType === "NONE"
  ) {
    errors.push(`${path}: ${String(value.riskClass)} rule은 해소 경로(remediationType)가 필요합니다.`);
  }
}

export function validateRiskRuleDefinition(
  rule: unknown,
): RiskContractValidationResult<RiskRuleDefinition> {
  const errors: Errors = [];
  collectRuleErrors(errors, "rule", rule);
  return finish<RiskRuleDefinition>(errors, rule);
}

export function validateRiskRuleSet(ruleSet: unknown): RiskContractValidationResult<RiskRuleSet> {
  const errors: Errors = [];
  if (!isRecord(ruleSet)) {
    errors.push("ruleSet은 객체여야 합니다.");
    return finish<RiskRuleSet>(errors, ruleSet);
  }
  checkKeys(errors, "ruleSet", ruleSet, RULE_SET_KEYS);
  if (ruleSet.schemaVersion !== RISK_RULE_SET_SCHEMA_VERSION) {
    errors.push(`ruleSet.schemaVersion은 ${RISK_RULE_SET_SCHEMA_VERSION}이어야 합니다.`);
  }
  checkString(errors, "ruleSet.ruleSetVersion", ruleSet.ruleSetVersion);
  if (!Array.isArray(ruleSet.rules)) {
    errors.push("ruleSet.rules는 배열이어야 합니다.");
    return finish<RiskRuleSet>(errors, ruleSet);
  }
  const identities = new Set<string>();
  ruleSet.rules.forEach((rule, index) => {
    collectRuleErrors(errors, `ruleSet.rules[${index}]`, rule);
    if (isRecord(rule) && isNonEmptyString(rule.ruleId) && isNonEmptyString(rule.version)) {
      const identity = `${rule.ruleId}@${rule.version}`;
      if (identities.has(identity)) errors.push(`ruleSet.rules[${index}] rule identity 중복: ${identity}`);
      identities.add(identity);
    }
  });
  return finish<RiskRuleSet>(errors, ruleSet);
}

function collectFindingErrors(errors: Errors, path: string, value: unknown): void {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, FINDING_KEYS);
  checkString(errors, `${path}.findingId`, value.findingId);
  checkString(errors, `${path}.ruleId`, value.ruleId);
  checkString(errors, `${path}.ruleVersion`, value.ruleVersion);
  checkString(errors, `${path}.title`, value.title);
  checkString(errors, `${path}.description`, value.description);
  checkEnum(errors, `${path}.domain`, value.domain, RISK_DOMAINS);
  checkEnum(errors, `${path}.riskClass`, value.riskClass, RISK_CLASSES);
  checkEnum(errors, `${path}.severity`, value.severity, RISK_SEVERITIES);
  checkEnum(errors, `${path}.resolutionStatus`, value.resolutionStatus, RISK_RESOLUTION_STATUSES);
  if (typeof value.requiresHumanApproval !== "boolean") {
    errors.push(`${path}.requiresHumanApproval은 boolean이어야 합니다.`);
  }
  const evidenceIds = checkStringList(errors, `${path}.evidenceIds`, value.evidenceIds);
  const missingKeys = checkStringList(errors, `${path}.missingRequirementKeys`, value.missingRequirementKeys);
  checkStringList(errors, `${path}.remediation`, value.remediation);

  if (value.riskClass === "EVIDENCE_GAP") {
    if (evidenceIds.length === 0 && missingKeys.length === 0) {
      errors.push(`${path}: EVIDENCE_GAP finding은 evidenceIds 또는 missingRequirementKeys가 필요합니다.`);
    }
  } else {
    if (evidenceIds.length === 0) errors.push(`${path}: source evidence 없이 finding을 만들 수 없습니다.`);
    if (missingKeys.length > 0) {
      errors.push(`${path}: missingRequirementKeys는 EVIDENCE_GAP finding만 사용할 수 있습니다.`);
    }
  }
  if (value.riskClass === "HUMAN_REVIEW_REQUIRED" && value.requiresHumanApproval !== true) {
    errors.push(`${path}: HUMAN_REVIEW_REQUIRED finding은 requiresHumanApproval=true여야 합니다.`);
  }
  if (value.resolutionStatus === "EXPERT_REVIEW_REQUIRED" && value.requiresHumanApproval !== true) {
    errors.push(`${path}: EXPERT_REVIEW_REQUIRED 상태는 requiresHumanApproval=true여야 합니다.`);
  }

  const acceptance = value.humanAcceptance;
  if (value.resolutionStatus === "ACCEPTED_BY_HUMAN") {
    if (!isRecord(acceptance)) {
      errors.push(`${path}: ACCEPTED_BY_HUMAN은 humanAcceptance 기록이 필요합니다.`);
    } else {
      checkKeys(errors, `${path}.humanAcceptance`, acceptance, HUMAN_ACCEPTANCE_KEYS);
      checkString(errors, `${path}.humanAcceptance.acceptedByRef`, acceptance.acceptedByRef);
      checkString(errors, `${path}.humanAcceptance.acceptedAt`, acceptance.acceptedAt);
      checkString(errors, `${path}.humanAcceptance.reason`, acceptance.reason);
    }
  } else if (acceptance !== undefined) {
    errors.push(`${path}: humanAcceptance는 ACCEPTED_BY_HUMAN 상태에서만 둘 수 있습니다.`);
  }
}

export function validateRiskFinding(finding: unknown): RiskContractValidationResult<RiskFinding> {
  const errors: Errors = [];
  collectFindingErrors(errors, "finding", finding);
  return finish<RiskFinding>(errors, finding);
}

/** finding이 해당 rule identity·class·human approval 조건과 일치하는지만 본다. 평가하지 않는다. */
export function validateRiskFindingAgainstRule(
  finding: RiskFinding,
  rule: RiskRuleDefinition,
): RiskContractValidationResult<RiskFinding> {
  const errors: Errors = [];
  collectFindingErrors(errors, "finding", finding);
  collectRuleErrors(errors, "rule", rule);
  if (errors.length > 0) return finish<RiskFinding>(errors, finding);

  if (finding.ruleId !== rule.ruleId) errors.push("finding.ruleId가 rule과 다릅니다.");
  if (finding.ruleVersion !== rule.version) errors.push("finding.ruleVersion이 rule.version과 다릅니다.");
  if (finding.domain !== rule.domain) errors.push("finding.domain이 rule과 다릅니다.");
  if (finding.riskClass !== rule.riskClass) errors.push("finding.riskClass가 rule과 다릅니다.");
  if (rule.requiresHumanApproval && !finding.requiresHumanApproval) {
    errors.push("rule이 human approval을 요구하므로 finding.requiresHumanApproval=true여야 합니다.");
  }
  const requirementKeys = new Set(rule.evidenceRequirements.map((entry) => entry.requirementKey));
  for (const key of finding.missingRequirementKeys) {
    if (!requirementKeys.has(key)) errors.push(`finding.missingRequirementKeys에 rule에 없는 key가 있습니다: ${key}`);
  }
  return finish<RiskFinding>(errors, finding);
}

function bundleItems(bundle: CandidateDecisionEvidenceBundle): Map<string, DecisionEvidenceItem> {
  const items = new Map<string, DecisionEvidenceItem>();
  for (const list of [
    bundle.observedFacts,
    bundle.observedConstraints,
    bundle.missingInformation,
    bundle.expertReviewItems,
    bundle.geometryIssues,
  ]) {
    for (const item of list) if (!items.has(item.id)) items.set(item.id, item);
  }
  return items;
}

/**
 * finding.evidenceIds가 bundle에 실재하는지 확인한다.
 * HARD_BLOCKER는 최소 자격(OBSERVED_CONSTRAINT, 금지 nature·verification·ECONOMIC 아님)만 본다.
 * 충분히 확정된 근거인지는 rule별 predicate의 책임이다.
 */
export function validateRiskFindingEvidenceLinks(
  finding: RiskFinding,
  bundle: CandidateDecisionEvidenceBundle,
): RiskContractValidationResult<RiskFinding> {
  const errors: Errors = [];
  collectFindingErrors(errors, "finding", finding);
  if (errors.length > 0) return finish<RiskFinding>(errors, finding);

  const items = bundleItems(bundle);
  for (const evidenceId of finding.evidenceIds) {
    const item = items.get(evidenceId);
    if (!item) {
      errors.push(`finding.evidenceIds의 evidence가 bundle에 없습니다: ${evidenceId}`);
      continue;
    }
    if (finding.riskClass !== "HARD_BLOCKER") continue;
    errors.push(...hardBlockerQualificationErrors(`evidence ${evidenceId} (${item.bucket})`, item));
  }
  return finish<RiskFinding>(errors, finding);
}

const COUNT_FIELDS = [
  "unresolvedFindingCount",
  "unresolvedHardBlockerCount",
  "unresolvedConditionalBlockerCount",
  "unresolvedEconomicStressCount",
  "unresolvedEvidenceGapCount",
  "unresolvedHumanReviewRequiredCount",
] as const;

export function validateRiskEvaluationResult(
  result: unknown,
): RiskContractValidationResult<RiskEvaluationResult> {
  const errors: Errors = [];
  if (!isRecord(result)) {
    errors.push("result는 객체여야 합니다.");
    return finish<RiskEvaluationResult>(errors, result);
  }
  checkKeys(errors, "result", result, RESULT_KEYS);
  if (result.schemaVersion !== RISK_EVALUATION_RESULT_SCHEMA_VERSION) {
    errors.push(`result.schemaVersion은 ${RISK_EVALUATION_RESULT_SCHEMA_VERSION}이어야 합니다.`);
  }
  checkString(errors, "result.candidateStoreId", result.candidateStoreId);
  checkString(errors, "result.ruleSetVersion", result.ruleSetVersion);
  if (result.createsVerdict !== false) errors.push("result.createsVerdict는 false여야 합니다.");
  if (result.createsScore !== false) errors.push("result.createsScore는 false여야 합니다.");
  for (const field of COUNT_FIELDS) {
    const count = result[field];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      errors.push(`result.${field}는 0 이상의 정수여야 합니다.`);
    }
  }
  if (!Array.isArray(result.findings)) {
    errors.push("result.findings는 배열이어야 합니다.");
    return finish<RiskEvaluationResult>(errors, result);
  }

  const findingIds = new Set<string>();
  result.findings.forEach((finding, index) => {
    collectFindingErrors(errors, `result.findings[${index}]`, finding);
    if (isRecord(finding) && isNonEmptyString(finding.findingId)) {
      if (findingIds.has(finding.findingId)) {
        errors.push(`result.findings[${index}].findingId 중복: ${finding.findingId}`);
      }
      findingIds.add(finding.findingId);
    }
  });
  if (errors.length > 0) return finish<RiskEvaluationResult>(errors, result);

  // ACCEPTED_BY_HUMAN은 Risk가 남아 있으므로 unresolved에 포함한다.
  const unresolved = (result.findings as RiskFinding[]).filter(
    (entry) => entry.resolutionStatus !== "RESOLVED",
  );
  const unresolvedOf = (riskClass: RiskFinding["riskClass"]) =>
    unresolved.filter((entry) => entry.riskClass === riskClass).length;
  const expected: Record<(typeof COUNT_FIELDS)[number], number> = {
    unresolvedFindingCount: unresolved.length,
    unresolvedHardBlockerCount: unresolvedOf("HARD_BLOCKER"),
    unresolvedConditionalBlockerCount: unresolvedOf("CONDITIONAL_BLOCKER"),
    unresolvedEconomicStressCount: unresolvedOf("ECONOMIC_STRESS"),
    unresolvedEvidenceGapCount: unresolvedOf("EVIDENCE_GAP"),
    unresolvedHumanReviewRequiredCount: unresolvedOf("HUMAN_REVIEW_REQUIRED"),
  };
  for (const field of COUNT_FIELDS) {
    if (result[field] !== expected[field]) {
      errors.push(`result.${field}가 findings와 일치하지 않습니다 (expected ${expected[field]}).`);
    }
  }
  return finish<RiskEvaluationResult>(errors, result);
}
