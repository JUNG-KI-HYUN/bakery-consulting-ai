import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "server-only") return {};
  return previousLoad.call(this, request, parent, isMain);
};
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = (specifier) =>
    originalRequire(
      specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
    );
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};
after(() => {
  Module._load = previousLoad;
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const lib = (relative) => loadModule(path.join(repositoryRoot, relative));
const riskTypes = lib("lib/risk-v2/types.ts");
const riskValidation = lib("lib/risk-v2/validation.ts");
const {
  RISK_CLASSES,
  RISK_DOMAINS,
  RISK_EVALUATION_RESULT_SCHEMA_VERSION,
  RISK_RESOLUTION_STATUSES,
  RISK_RULE_SET_SCHEMA_VERSION,
  RISK_SEVERITIES,
} = riskTypes;
const {
  validateRiskEvaluationResult,
  validateRiskFinding,
  validateRiskFindingAgainstRule,
  validateRiskFindingEvidenceLinks,
  validateRiskRuleDefinition,
  validateRiskRuleSet,
} = riskValidation;
const { buildCandidateDecisionEvidenceBundle } = lib("lib/decision-evidence/candidate-bundle.ts");
const { createDecisionEvidenceItem } = lib("lib/decision-evidence/helpers.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");
const { createFieldEvidenceMeta } = lib("lib/field/field-evidence-meta.ts");
const { buildTechnicalDecisionEvidence } = lib("lib/decision-evidence/technical-adapter.ts");

// ---- fixtures (sample rule / finding contracts only; not a rule registry) ----

function fixtureRule(overrides = {}) {
  return {
    ruleId: "fixture.electrical.capacity-gap",
    version: "fixture-1",
    domain: "ELECTRICAL",
    riskClass: "CONDITIONAL_BLOCKER",
    title: "fixture 전기 조건 확인",
    description: "fixture: 장비 전기 요구와 현장 전기 조건 대조가 필요한 경우를 표현하는 sample rule",
    evidenceRequirements: [
      { requirementKey: "electrical-constraint", sourceDomain: "TECHNICAL_CHECK", category: "ELECTRICAL", bucket: "OBSERVED_CONSTRAINT" },
    ],
    defaultSeverity: "MEDIUM",
    requiresHumanApproval: false,
    remediationType: "CONFIRM",
    ...overrides,
  };
}

function hardBlockerRule(overrides = {}) {
  return fixtureRule({
    ruleId: "fixture.space.verified-constraint",
    domain: "SPACE",
    riskClass: "HARD_BLOCKER",
    defaultSeverity: "CRITICAL",
    remediationType: "NONE",
    evidenceRequirements: [
      { requirementKey: "verified-constraint", bucket: "OBSERVED_CONSTRAINT", verificationStatus: "VERIFIED", category: "SPACE" },
    ],
    ...overrides,
  });
}

function fixtureFinding(overrides = {}) {
  return {
    findingId: "fixture-finding-1",
    ruleId: "fixture.electrical.capacity-gap",
    ruleVersion: "fixture-1",
    domain: "ELECTRICAL",
    riskClass: "CONDITIONAL_BLOCKER",
    severity: "MEDIUM",
    title: "fixture 전기 조건 확인",
    description: "fixture finding",
    evidenceIds: ["TECHNICAL_CHECK|OBSERVED_CONSTRAINT|ELECTRICAL|fixture-b", "TECHNICAL_CHECK|OBSERVED_CONSTRAINT|ELECTRICAL|fixture-a"],
    missingRequirementKeys: [],
    resolutionStatus: "CONDITION_REQUIRED",
    remediation: ["fixture: 임대인 서면 확인"],
    requiresHumanApproval: false,
    ...overrides,
  };
}

function fixtureResult(findings = [fixtureFinding()], overrides = {}) {
  const unresolved = findings.filter((entry) => entry.resolutionStatus !== "RESOLVED");
  const count = (riskClass) => unresolved.filter((entry) => entry.riskClass === riskClass).length;
  return {
    schemaVersion: RISK_EVALUATION_RESULT_SCHEMA_VERSION,
    candidateStoreId: "store_fixture",
    ruleSetVersion: "fixture-rule-set-1",
    findings,
    unresolvedFindingCount: unresolved.length,
    unresolvedHardBlockerCount: count("HARD_BLOCKER"),
    unresolvedConditionalBlockerCount: count("CONDITIONAL_BLOCKER"),
    unresolvedEconomicStressCount: count("ECONOMIC_STRESS"),
    unresolvedEvidenceGapCount: count("EVIDENCE_GAP"),
    unresolvedHumanReviewRequiredCount: count("HUMAN_REVIEW_REQUIRED"),
    createsVerdict: false,
    createsScore: false,
    ...overrides,
  };
}

const ACCEPTANCE = { acceptedByRef: "staff_fixture", acceptedAt: "2026-10-01T06:00:00.000Z", reason: "fixture 인지 후 수용" };

/** 실제 Technical adapter 출력. power summary constraint는 fieldEvidence 없이 생성된다. */
function technicalPowerConstraint() {
  const { observedConstraints } = buildTechnicalDecisionEvidence({
    equipmentChecks: [],
    powerSummary: { arithmeticStatus: "CONSTRAINT_OBSERVED", arithmeticMessage: "fixture 장비 요구전력 합계가 계약전력을 넘습니다." },
  });
  assert.equal(observedConstraints.length, 1);
  return observedConstraints[0];
}

function hardFinding(evidenceIds, overrides = {}) {
  return fixtureFinding({
    ruleId: "fixture.space.verified-constraint",
    riskClass: "HARD_BLOCKER",
    domain: "ELECTRICAL",
    severity: "CRITICAL",
    resolutionStatus: "OPEN",
    evidenceIds,
    ...overrides,
  });
}

function linkHard(item) {
  const bundle = { ...missingOnlyBundle(), observedConstraints: [item] };
  return validateRiskFindingEvidenceLinks(hardFinding([item.id]), bundle);
}

/** binding 없는 context → 각 adapter가 MISSING_INFORMATION만 내는 실제 bundle */
function missingOnlyBundle() {
  const context = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(context.ok, true);
  return buildCandidateDecisionEvidenceBundle({
    context: context.value,
    generatedAt: "2026-10-01T05:00:00.000Z",
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: null,
  });
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

const VERDICT_KEY_PATTERN = /^(recommendation|verdict|finalStatus|approved|approval|rejected|contractAllowed|contractDecision|hardFail)$/i;
const SCORE_KEY_PATTERN = /score|grade/i;

// ---- tests ----

test("1. valid RiskRuleDefinition passes and returns a frozen copy", () => {
  const rule = fixtureRule();
  const result = validateRiskRuleDefinition(rule);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.value, rule);
  assert.notEqual(result.value, rule);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.evidenceRequirements[0]), true);
  assert.equal(validateRiskRuleDefinition(hardBlockerRule()).ok, true);
});

test("2. RiskClass has exactly five values", () => {
  assert.deepEqual([...RISK_CLASSES], [
    "HARD_BLOCKER",
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ]);
  assert.equal(Object.isFrozen(RISK_CLASSES), true);
  assert.deepEqual([...RISK_SEVERITIES], ["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  assert.equal(RISK_DOMAINS.includes("FIRE_SAFETY"), false);
  assert.equal(RISK_DOMAINS.includes("PERMIT"), false);
});

test("3. RiskClass contains no verdict values", () => {
  const verdictLike = /RECOMMEND|VERDICT|APPROVE|REJECT|HOLD|PASS|FAIL|추천|보류|위험|계약/;
  for (const value of [...RISK_CLASSES, ...RISK_RESOLUTION_STATUSES, ...RISK_SEVERITIES, ...RISK_DOMAINS]) {
    assert.doesNotMatch(value, verdictLike, value);
  }
  const unsupported = validateRiskRuleDefinition(fixtureRule({ riskClass: "RECOMMENDED" }));
  assert.equal(unsupported.ok, false);
  assert.ok(unsupported.errors.some((entry) => entry.includes("riskClass")));
});

test("4. empty ruleId is rejected", () => {
  for (const ruleId of ["", "   ", undefined]) {
    const result = validateRiskRuleDefinition(fixtureRule({ ruleId }));
    assert.equal(result.ok, false);
    assert.equal(result.code, "INVALID_RISK_CONTRACT");
    assert.ok(result.errors.some((entry) => entry.includes("ruleId")));
  }
});

test("5. empty version is rejected", () => {
  const result = validateRiskRuleDefinition(fixtureRule({ version: " " }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.includes("version")));
  assert.equal(validateRiskRuleDefinition(fixtureRule({ title: "" })).ok, false);
});

test("6. duplicate ruleId+version is rejected, different versions coexist", () => {
  const duplicate = validateRiskRuleSet({
    schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
    ruleSetVersion: "fixture-rule-set-1",
    rules: [fixtureRule(), fixtureRule()],
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((entry) => entry.includes("rule identity 중복")));

  const versions = validateRiskRuleSet({
    schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
    ruleSetVersion: "fixture-rule-set-1",
    rules: [fixtureRule(), fixtureRule({ version: "fixture-2" })],
  });
  assert.equal(versions.ok, true, versions.message);

  const requirementDup = validateRiskRuleDefinition(fixtureRule({
    evidenceRequirements: [
      { requirementKey: "same", bucket: "OBSERVED_CONSTRAINT" },
      { requirementKey: "same", bucket: "OBSERVED_FACT" },
    ],
  }));
  assert.equal(requirementDup.ok, false);
});

test("7. valid RiskFinding contract passes", () => {
  const result = validateRiskFinding(fixtureFinding());
  assert.equal(result.ok, true, result.message);
  assert.equal(Object.isFrozen(result.value), true);
  const againstRule = validateRiskFindingAgainstRule(fixtureFinding(), fixtureRule());
  assert.equal(againstRule.ok, true, againstRule.message);
});

test("8. finding preserves evidenceIds in order and rejects duplicates", () => {
  const finding = fixtureFinding();
  const result = validateRiskFinding(finding);
  assert.deepEqual(result.value.evidenceIds, finding.evidenceIds);
  const duplicate = validateRiskFinding(fixtureFinding({ evidenceIds: ["a|b|c|d", "a|b|c|d"] }));
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((entry) => entry.includes("중복")));
});

test("9. empty evidence id and evidence-less findings are rejected", () => {
  assert.equal(validateRiskFinding(fixtureFinding({ evidenceIds: [""] })).ok, false);
  assert.equal(validateRiskFinding(fixtureFinding({ evidenceIds: ["  "] })).ok, false);
  const none = validateRiskFinding(fixtureFinding({ evidenceIds: [] }));
  assert.equal(none.ok, false);
  assert.ok(none.errors.some((entry) => entry.includes("source evidence 없이")));

  const gap = validateRiskFinding(fixtureFinding({
    riskClass: "EVIDENCE_GAP",
    resolutionStatus: "NEEDS_CONFIRMATION",
    evidenceIds: [],
    missingRequirementKeys: ["electrical-constraint"],
  }));
  assert.equal(gap.ok, true, gap.message);
  const gapAgainstRule = validateRiskFindingAgainstRule(gap.value, fixtureRule({ riskClass: "EVIDENCE_GAP" }));
  assert.equal(gapAgainstRule.ok, true, gapAgainstRule.message);
  const unknownKey = validateRiskFindingAgainstRule(
    { ...gap.value, missingRequirementKeys: ["not-in-rule"] },
    fixtureRule({ riskClass: "EVIDENCE_GAP" }),
  );
  assert.equal(unknownKey.ok, false);
  const nonGap = validateRiskFinding(fixtureFinding({ missingRequirementKeys: ["electrical-constraint"] }));
  assert.equal(nonGap.ok, false);
});

test("10. a HARD_BLOCKER definition alone does not create findings", () => {
  const rule = hardBlockerRule();
  const validated = validateRiskRuleDefinition(rule);
  assert.equal(validated.ok, true);
  assert.equal(collectKeys(validated.value).has("findings"), false);
  const exported = [...Object.keys(riskTypes), ...Object.keys(riskValidation)];
  assert.equal(exported.some((name) => /evaluate|calculate|score|verdict|registry/i.test(name)), false);
  for (const name of Object.keys(riskValidation)) assert.match(name, /^validate/);
});

test("11. MISSING_INFORMATION cannot become HARD_BLOCKER", () => {
  const missingRule = validateRiskRuleDefinition(hardBlockerRule({
    evidenceRequirements: [{ requirementKey: "missing", bucket: "MISSING_INFORMATION", verificationStatus: "VERIFIED" }],
  }));
  assert.equal(missingRule.ok, false);
  for (const verificationStatus of ["UNKNOWN", "ESTIMATED", "CONFLICTED", "STALE"]) {
    const result = validateRiskRuleDefinition(hardBlockerRule({
      evidenceRequirements: [{ requirementKey: "constraint", bucket: "OBSERVED_CONSTRAINT", verificationStatus }],
    }));
    assert.equal(result.ok, false, verificationStatus);
  }
  for (const bucket of ["OBSERVED_FACT", "EXPERT_REVIEW", "GEOMETRY_ISSUE"]) {
    const result = validateRiskRuleDefinition(hardBlockerRule({
      evidenceRequirements: [{ requirementKey: "c", bucket }],
    }));
    assert.equal(result.ok, false, bucket);
  }
  const integrationState = validateRiskRuleDefinition(hardBlockerRule({
    evidenceRequirements: [{ requirementKey: "c", bucket: "OBSERVED_CONSTRAINT", verificationStatus: "VERIFIED", nature: "INTEGRATION_STATE" }],
  }));
  assert.equal(integrationState.ok, false);

  const bundle = missingOnlyBundle();
  assert.equal(bundle.observedConstraints.length, 0);
  const missingId = bundle.missingInformation.find((item) => item.id.endsWith("|field-binding-absent")).id;
  const hardOnMissing = validateRiskFindingEvidenceLinks(
    fixtureFinding({ riskClass: "HARD_BLOCKER", domain: "SPACE", severity: "CRITICAL", resolutionStatus: "OPEN", evidenceIds: [missingId] }),
    bundle,
  );
  assert.equal(hardOnMissing.ok, false);
  assert.ok(hardOnMissing.errors.some((entry) => entry.includes("OBSERVED_CONSTRAINT")));

  const gapOnMissing = validateRiskFindingEvidenceLinks(
    fixtureFinding({ riskClass: "EVIDENCE_GAP", domain: "EVIDENCE", resolutionStatus: "NEEDS_CONFIRMATION", evidenceIds: [missingId] }),
    bundle,
  );
  assert.equal(gapOnMissing.ok, true, gapOnMissing.message);

  const absent = validateRiskFindingEvidenceLinks(fixtureFinding({ evidenceIds: ["FIELD|OBSERVED_FACT|SPACE|not-there"] }), bundle);
  assert.equal(absent.ok, false);

  // fixture-only VERIFIED constraint item to show the accepted HARD_BLOCKER evidence shape
  const verified = createDecisionEvidenceItem({
    sourceDomain: "FIELD",
    bucket: "OBSERVED_CONSTRAINT",
    category: "SPACE",
    key: "fixture-verified-constraint",
    title: "fixture",
    description: "fixture verified constraint",
    fieldEvidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK", verificationStatus: "VERIFIED" }),
  });
  assert.equal(verified.verificationStatus, "VERIFIED");
  const fixtureBundle = { ...bundle, observedConstraints: [verified] };
  const hardOnVerified = validateRiskFindingEvidenceLinks(
    fixtureFinding({ riskClass: "HARD_BLOCKER", domain: "SPACE", severity: "CRITICAL", resolutionStatus: "OPEN", evidenceIds: [verified.id] }),
    fixtureBundle,
  );
  assert.equal(hardOnVerified.ok, true, hardOnVerified.message);
});

test("Economic stress cannot be declared as HARD_BLOCKER", () => {
  assert.equal(validateRiskRuleDefinition(hardBlockerRule({ domain: "ECONOMIC" })).ok, false);
  assert.equal(validateRiskRuleDefinition(hardBlockerRule({
    evidenceRequirements: [{ requirementKey: "bep", sourceDomain: "ECONOMIC", bucket: "OBSERVED_CONSTRAINT", verificationStatus: "VERIFIED" }],
  })).ok, false);
  const stress = validateRiskRuleDefinition(fixtureRule({
    ruleId: "fixture.economic.stress",
    domain: "ECONOMIC",
    riskClass: "ECONOMIC_STRESS",
    remediationType: "CHANGE_PLAN",
    evidenceRequirements: [{ requirementKey: "bep", sourceDomain: "ECONOMIC", category: "BEP", nature: "DERIVED_CALCULATION" }],
  }));
  assert.equal(stress.ok, true, stress.message);
  const stressWithoutNature = validateRiskRuleDefinition(fixtureRule({
    riskClass: "ECONOMIC_STRESS",
    domain: "ECONOMIC",
    evidenceRequirements: [{ requirementKey: "bep", sourceDomain: "ECONOMIC" }],
  }));
  assert.equal(stressWithoutNature.ok, false);
});

test("Human review and conditional boundaries are enforced in the contract", () => {
  assert.equal(validateRiskRuleDefinition(fixtureRule({ riskClass: "HUMAN_REVIEW_REQUIRED", requiresHumanApproval: false })).ok, false);
  assert.equal(validateRiskRuleDefinition(fixtureRule({ riskClass: "HUMAN_REVIEW_REQUIRED", requiresHumanApproval: true, remediationType: "EXPERT_REVIEW" })).ok, true);
  assert.equal(validateRiskRuleDefinition(fixtureRule({ remediationType: "NONE" })).ok, false);
  assert.equal(validateRiskFinding(fixtureFinding({ resolutionStatus: "EXPERT_REVIEW_REQUIRED", requiresHumanApproval: false })).ok, false);
  assert.equal(validateRiskFinding(fixtureFinding({ resolutionStatus: "EXPERT_REVIEW_REQUIRED", requiresHumanApproval: true })).ok, true);
  const mustApprove = validateRiskFindingAgainstRule(
    fixtureFinding({ requiresHumanApproval: false }),
    fixtureRule({ requiresHumanApproval: true }),
  );
  assert.equal(mustApprove.ok, false);
});

test("12. RiskEvaluationResult requires createsVerdict === false", () => {
  assert.equal(validateRiskEvaluationResult(fixtureResult()).ok, true);
  const result = validateRiskEvaluationResult(fixtureResult(undefined, { createsVerdict: true }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.includes("createsVerdict")));
});

test("13. RiskEvaluationResult requires createsScore === false", () => {
  const result = validateRiskEvaluationResult(fixtureResult(undefined, { createsScore: true }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.includes("createsScore")));
});

test("14. recommendation / verdict / approve / reject fields are rejected", () => {
  for (const key of ["recommendation", "verdict", "finalStatus", "approved", "rejected", "contractAllowed"]) {
    assert.equal(validateRiskFinding({ ...fixtureFinding(), [key]: "x" }).ok, false, key);
    assert.equal(validateRiskRuleDefinition({ ...fixtureRule(), [key]: "x" }).ok, false, key);
    assert.equal(validateRiskEvaluationResult({ ...fixtureResult(), [key]: "x" }).ok, false, key);
  }
  const source = fs.readFileSync(path.join(repositoryRoot, "lib/risk-v2/types.ts"), "utf8");
  assert.doesNotMatch(source, /\b(recommendation|verdict|finalStatus|approved|rejected|contractAllowed)\??\s*:/);
  assert.doesNotMatch(source, /"(추천|조건부 추천|보류|위험)"/);
  const keys = [...collectKeys(fixtureResult())];
  assert.deepEqual(keys.filter((key) => VERDICT_KEY_PATTERN.test(key)), []);
});

test("15. no total numeric risk score field", () => {
  for (const key of ["riskScore", "totalScore", "weightedScore", "score", "grade"]) {
    assert.equal(validateRiskEvaluationResult({ ...fixtureResult(), [key]: 100 }).ok, false, key);
    assert.equal(validateRiskFinding({ ...fixtureFinding(), [key]: 1 }).ok, false, key);
  }
  const source = fs.readFileSync(path.join(repositoryRoot, "lib/risk-v2/types.ts"), "utf8");
  assert.doesNotMatch(source, /\b\w*[sS]core\??\s*:\s*number/);
  const keys = [...collectKeys(validateRiskEvaluationResult(fixtureResult()).value)];
  assert.deepEqual(keys.filter((key) => SCORE_KEY_PATTERN.test(key) && key !== "createsScore"), []);
});

test("16. RESOLVED and ACCEPTED_BY_HUMAN are distinct", () => {
  assert.notEqual(RISK_RESOLUTION_STATUSES.indexOf("RESOLVED"), RISK_RESOLUTION_STATUSES.indexOf("ACCEPTED_BY_HUMAN"));
  const acceptance = { acceptedByRef: "staff_fixture", acceptedAt: "2026-10-01T06:00:00.000Z", reason: "fixture 인지 후 수용" };
  assert.equal(validateRiskFinding(fixtureFinding({ resolutionStatus: "ACCEPTED_BY_HUMAN" })).ok, false);
  const accepted = validateRiskFinding(fixtureFinding({ resolutionStatus: "ACCEPTED_BY_HUMAN", humanAcceptance: acceptance }));
  assert.equal(accepted.ok, true, accepted.message);
  assert.equal(validateRiskFinding(fixtureFinding({ resolutionStatus: "RESOLVED", humanAcceptance: acceptance })).ok, false);

  const findings = [
    fixtureFinding({ findingId: "f-resolved", resolutionStatus: "RESOLVED" }),
    fixtureFinding({ findingId: "f-accepted", resolutionStatus: "ACCEPTED_BY_HUMAN", humanAcceptance: acceptance }),
  ];
  const result = validateRiskEvaluationResult(fixtureResult(findings));
  assert.equal(result.ok, true, result.message);
  assert.equal(result.value.unresolvedFindingCount, 1);
  assert.equal(result.value.unresolvedConditionalBlockerCount, 1);
  const wrongCount = validateRiskEvaluationResult(fixtureResult(findings, { unresolvedFindingCount: 0 }));
  assert.equal(wrongCount.ok, false);
});

// ---- 6A.1 HARD_BLOCKER qualification without FIELD-specific VERIFIED coupling ----

test("6A.1-1. Technical OBSERVED_CONSTRAINT without verificationStatus is not rejected for that reason", () => {
  const item = technicalPowerConstraint();
  assert.equal(item.sourceDomain, "TECHNICAL_CHECK");
  assert.equal(item.bucket, "OBSERVED_CONSTRAINT");
  assert.equal(item.category, "ELECTRICAL");
  assert.equal(item.verificationStatus, undefined);
  assert.equal(item.nature, undefined);
  const linked = linkHard(item);
  assert.equal(linked.ok, true, linked.message);
  const rule = validateRiskRuleDefinition(hardBlockerRule({
    domain: "ELECTRICAL",
    evidenceRequirements: [{ requirementKey: "power", sourceDomain: "TECHNICAL_CHECK", category: "ELECTRICAL", bucket: "OBSERVED_CONSTRAINT" }],
  }));
  assert.equal(rule.ok, true, rule.message);
});

test("6A.1-2. the same item as MISSING_INFORMATION is rejected", () => {
  const item = { ...technicalPowerConstraint(), bucket: "MISSING_INFORMATION" };
  const linked = linkHard(item);
  assert.equal(linked.ok, false);
  assert.ok(linked.errors.some((entry) => entry.includes("OBSERVED_CONSTRAINT")));
});

test("6A.1-3/4/5. INTEGRATION_STATE, ESTIMATE, REFERENCE_SUMMARY are rejected; DERIVED_CALCULATION is not globally rejected", () => {
  for (const nature of ["INTEGRATION_STATE", "ESTIMATE", "REFERENCE_SUMMARY"]) {
    const linked = linkHard({ ...technicalPowerConstraint(), nature });
    assert.equal(linked.ok, false, nature);
    assert.ok(linked.errors.some((entry) => entry.includes(nature)));
    const rule = validateRiskRuleDefinition(hardBlockerRule({
      evidenceRequirements: [{ requirementKey: "c", bucket: "OBSERVED_CONSTRAINT", nature }],
    }));
    assert.equal(rule.ok, false, nature);
  }
  assert.equal(linkHard({ ...technicalPowerConstraint(), nature: "DERIVED_CALCULATION" }).ok, true);
  assert.equal(linkHard({ ...technicalPowerConstraint(), nature: "OBSERVATION" }).ok, true);
  for (const verificationStatus of ["UNKNOWN", "ESTIMATED", "CONFLICTED", "STALE"]) {
    assert.equal(linkHard({ ...technicalPowerConstraint(), verificationStatus }).ok, false, verificationStatus);
  }
});

test("6A.1-6. ECONOMIC source and domain are rejected for HARD_BLOCKER", () => {
  const linked = linkHard({ ...technicalPowerConstraint(), sourceDomain: "ECONOMIC" });
  assert.equal(linked.ok, false);
  assert.ok(linked.errors.some((entry) => entry.includes("Economic")));
  assert.equal(validateRiskRuleDefinition(hardBlockerRule({ domain: "ECONOMIC" })).ok, false);
});

test("6A.1-7. FIELD OBSERVED_CONSTRAINT + VERIFIED remains an accepted contract", () => {
  const verified = createDecisionEvidenceItem({
    sourceDomain: "FIELD",
    bucket: "OBSERVED_CONSTRAINT",
    category: "SPACE",
    key: "fixture-verified-constraint-61",
    title: "fixture",
    description: "fixture verified constraint",
    fieldEvidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK", verificationStatus: "VERIFIED" }),
  });
  assert.equal(linkHard(verified).ok, true);
  assert.equal(validateRiskRuleDefinition(hardBlockerRule()).ok, true);
});

test("6A.1-8/9/10. RESOLVED is excluded; OPEN and ACCEPTED_BY_HUMAN HARD_BLOCKERs are unresolved", () => {
  const findings = [
    hardFinding(["e|1"], { findingId: "h-resolved", resolutionStatus: "RESOLVED" }),
    hardFinding(["e|2"], { findingId: "h-open", resolutionStatus: "OPEN" }),
    hardFinding(["e|3"], { findingId: "h-accepted", resolutionStatus: "ACCEPTED_BY_HUMAN", humanAcceptance: ACCEPTANCE }),
  ];
  const result = validateRiskEvaluationResult(fixtureResult(findings));
  assert.equal(result.ok, true, result.message);
  assert.equal(result.value.unresolvedHardBlockerCount, 2);
  assert.equal(result.value.unresolvedFindingCount, 2);
  const includingResolved = validateRiskEvaluationResult(fixtureResult(findings, { unresolvedHardBlockerCount: 3 }));
  assert.equal(includingResolved.ok, false);
  const excludingAccepted = validateRiskEvaluationResult(fixtureResult(findings, { unresolvedHardBlockerCount: 1 }));
  assert.equal(excludingAccepted.ok, false);
});

test("6A.1-11/12/13. per-class unresolved counts and mismatch validation", () => {
  const findings = [
    hardFinding(["e|h"], { findingId: "f1" }),
    fixtureFinding({ findingId: "f2", resolutionStatus: "CONDITION_REQUIRED" }),
    fixtureFinding({ findingId: "f3", resolutionStatus: "RESOLVED" }),
    fixtureFinding({ findingId: "f4", riskClass: "ECONOMIC_STRESS", domain: "ECONOMIC", resolutionStatus: "OPEN" }),
    fixtureFinding({ findingId: "f5", riskClass: "EVIDENCE_GAP", domain: "EVIDENCE", resolutionStatus: "NEEDS_CONFIRMATION", evidenceIds: [], missingRequirementKeys: ["k"] }),
    fixtureFinding({ findingId: "f6", riskClass: "HUMAN_REVIEW_REQUIRED", resolutionStatus: "EXPERT_REVIEW_REQUIRED", requiresHumanApproval: true }),
    fixtureFinding({ findingId: "f7", riskClass: "HUMAN_REVIEW_REQUIRED", resolutionStatus: "RESOLVED", requiresHumanApproval: true }),
  ];
  const result = validateRiskEvaluationResult(fixtureResult(findings));
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(
    {
      unresolvedFindingCount: result.value.unresolvedFindingCount,
      unresolvedHardBlockerCount: result.value.unresolvedHardBlockerCount,
      unresolvedConditionalBlockerCount: result.value.unresolvedConditionalBlockerCount,
      unresolvedEconomicStressCount: result.value.unresolvedEconomicStressCount,
      unresolvedEvidenceGapCount: result.value.unresolvedEvidenceGapCount,
      unresolvedHumanReviewRequiredCount: result.value.unresolvedHumanReviewRequiredCount,
    },
    {
      unresolvedFindingCount: 5,
      unresolvedHardBlockerCount: 1,
      unresolvedConditionalBlockerCount: 1,
      unresolvedEconomicStressCount: 1,
      unresolvedEvidenceGapCount: 1,
      unresolvedHumanReviewRequiredCount: 1,
    },
  );
  for (const field of [
    "unresolvedFindingCount",
    "unresolvedHardBlockerCount",
    "unresolvedConditionalBlockerCount",
    "unresolvedEconomicStressCount",
    "unresolvedEvidenceGapCount",
    "unresolvedHumanReviewRequiredCount",
  ]) {
    const mismatch = validateRiskEvaluationResult(fixtureResult(findings, { [field]: result.value[field] + 1 }));
    assert.equal(mismatch.ok, false, field);
    assert.ok(mismatch.errors.some((entry) => entry.includes(field)));
  }
  for (const legacy of ["hardBlockerCount", "conditionalBlockerCount", "totalScore"]) {
    assert.equal(validateRiskEvaluationResult({ ...fixtureResult(findings), [legacy]: 1 }).ok, false, legacy);
  }
});

test("17. rule version is preserved and enforced on findings", () => {
  const rule = validateRiskRuleDefinition(fixtureRule({ version: "fixture-2026-10" })).value;
  assert.equal(rule.version, "fixture-2026-10");
  const ok = validateRiskFindingAgainstRule(fixtureFinding({ ruleVersion: "fixture-2026-10" }), rule);
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.value.ruleVersion, "fixture-2026-10");
  const stale = validateRiskFindingAgainstRule(fixtureFinding({ ruleVersion: "fixture-1" }), rule);
  assert.equal(stale.ok, false);
  assert.ok(stale.errors.some((entry) => entry.includes("ruleVersion")));
});

test("18. validated contracts are JSON serializable", () => {
  for (const value of [
    validateRiskRuleDefinition(fixtureRule()).value,
    validateRiskFinding(fixtureFinding()).value,
    validateRiskEvaluationResult(fixtureResult()).value,
  ]) {
    const serialized = JSON.stringify(value);
    assert.deepEqual(JSON.parse(serialized), value);
    assert.equal(serialized.includes("NaN"), false);
  }
});

test("19. inputs are not mutated or frozen", () => {
  const rule = fixtureRule();
  const finding = fixtureFinding();
  const result = fixtureResult([fixtureFinding()]);
  const before = JSON.stringify({ rule, finding, result });
  validateRiskRuleDefinition(rule);
  validateRiskFinding(finding);
  validateRiskEvaluationResult(result);
  validateRiskFindingAgainstRule(finding, rule);
  assert.equal(JSON.stringify({ rule, finding, result }), before);
  assert.equal(Object.isFrozen(rule), false);
  assert.equal(Object.isFrozen(rule.evidenceRequirements), false);
  assert.equal(Object.isFrozen(finding.evidenceIds), false);
  assert.equal(Object.isFrozen(result.findings), false);
});

test("20. DecisionEvidence / DecisionIntegration sources are unchanged", () => {
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", "lib/decision-evidence", "lib/decision-integration"],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim();
  assert.equal(changed, "");
});
