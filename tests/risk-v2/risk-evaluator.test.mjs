import assert from "node:assert/strict";
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
const { RISK_RULE_SET_V1, RISK_RULE_SET_V1_VERSION } = lib("lib/risk-v2/rule-registry.ts");
const { createRiskPredicateRegistry, RISK_PREDICATE_REGISTRY_V1 } = lib("lib/risk-v2/predicates.ts");
const {
  evaluateRiskRules,
  matchesEvidenceRequirement,
  REMEDIATION_TEXT,
  riskFindingId,
} = lib("lib/risk-v2/evaluate.ts");
const { RISK_RULE_SET_SCHEMA_VERSION } = lib("lib/risk-v2/types.ts");
const { validateRiskEvaluationResult, validateRiskRuleSet } = lib("lib/risk-v2/validation.ts");
const { buildCandidateDecisionEvidenceBundle } = lib("lib/decision-evidence/candidate-bundle.ts");
const { buildTechnicalDecisionEvidence } = lib("lib/decision-evidence/technical-adapter.ts");
const { createDecisionEvidenceItem } = lib("lib/decision-evidence/helpers.ts");
const { buildDecisionEvidenceBundle } = lib("lib/decision-evidence/build-bundle.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");
const { createFieldEvidenceMeta } = lib("lib/field/field-evidence-meta.ts");
const { createDefaultElectrical } = lib("lib/field/facility.ts");
const { createEmptyMeasurementSet, createKnownMm } = lib("lib/field/measurement.ts");
const { createSiteSurveyId } = lib("lib/field/identifiers.ts");
const { createEmptyLayout } = lib("lib/space-fit/types.ts");
const { validateLayoutGeometry } = lib("lib/space-fit/element-geometry.ts");
const { createEquipmentDefinition, createEquipmentInstance, createKnownEquipmentMm } =
  lib("lib/equipment/types.ts");
const { buildTechnicalCheckReport } = lib("lib/technical-check/build-report.ts");

// ---- fixtures (sample/demo only; not real store, customer, or facility data) ----

const NOW = "2026-10-01T00:00:00.000Z";
const GENERATED_AT = "2026-10-01T05:00:00.000Z";
const INPUT = (evidenceBundle) => ({ evidenceBundle, ruleSetVersion: RISK_RULE_SET_V1_VERSION });

function baseBundle() {
  const context = createCandidateDecisionContext({ candidateStoreId: createCandidateStoreId(), createdAt: NOW });
  assert.equal(context.ok, true);
  return buildCandidateDecisionEvidenceBundle({
    context: context.value,
    generatedAt: GENERATED_AT,
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: null,
  });
}

/** real bundle metadata with explicit fixture bucket contents */
function fixtureBundle(buckets = {}) {
  return {
    ...baseBundle(),
    observedFacts: [],
    observedConstraints: [],
    missingInformation: [],
    expertReviewItems: [],
    geometryIssues: [],
    ...buckets,
  };
}

function aspect(kind, status = "NOT_APPLICABLE") {
  return { kind, status, message: `fixture ${kind} ${status}` };
}

function equipmentCheck(id, statuses = {}) {
  return {
    equipmentInstanceId: `fixture-eq-${id}`,
    equipmentDefinitionId: `fixture-def-${id}`,
    equipmentName: `fixture equipment ${id}`,
    dataStatus: "VERIFIED",
    electrical: aspect("electrical", statuses.electrical),
    water: aspect("water", statuses.water),
    drainage: aspect("drainage", statuses.drainage),
    exhaust: aspect("exhaust", statuses.exhaust),
    delivery: aspect("delivery", statuses.delivery),
  };
}

function technical(checks, powerSummary = { arithmeticStatus: "NOT_APPLICABLE", arithmeticMessage: null }) {
  return buildTechnicalDecisionEvidence({ equipmentChecks: checks, powerSummary });
}

const POWER_CONSTRAINT = { arithmeticStatus: "CONSTRAINT_OBSERVED", arithmeticMessage: "fixture 장비 요구전력 합계가 계약전력보다 큼" };

function evaluate(bundle, options) {
  const outcome = evaluateRiskRules(INPUT(bundle), options);
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

const byRule = (result, ruleId) => result.findings.filter((entry) => entry.ruleId === ruleId);

function item(overrides = {}) {
  return createDecisionEvidenceItem({
    sourceDomain: "FIELD",
    bucket: "OBSERVED_FACT",
    category: "SPACE",
    key: "fixture-item",
    title: "fixture",
    description: "fixture description",
    ...overrides,
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

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, strings));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, strings));
  return strings;
}

function realFieldElectricalCandidateBundle() {
  const def = createEquipmentDefinition({
    category: "OVEN",
    name: "fixture oven",
    dataStatus: "VERIFIED",
    createdAt: NOW,
    verifiedAt: NOW,
    source: { sourceType: "MANUFACTURER", sourceLabel: "fixture", verifiedAt: NOW },
    dimensions: { widthMm: createKnownEquipmentMm(900), depthMm: createKnownEquipmentMm(800) },
    electricalRequirement: { required: true, phase: "THREE" },
  });
  const measurement = {
    ...createEmptyMeasurementSet({
      surveyId: createSiteSurveyId(),
      candidateStoreId: createCandidateStoreId(),
      measuredAt: NOW,
      measuredBy: "field-staff",
    }),
    values: {
      roomWidthMm: createKnownMm(5800),
      roomDepthMm: createKnownMm(11200),
      frontageMm: createKnownMm(4000),
      ceilingHeightMm: createKnownMm(3100),
      entranceWidthMm: createKnownMm(1200),
      entranceHeightMm: createKnownMm(2200),
    },
  };
  let layout = createEmptyLayout({
    surveyId: measurement.surveyId,
    candidateStoreId: measurement.candidateStoreId,
    measurementId: measurement.measurementId,
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: NOW,
  });
  layout = Object.freeze({
    ...layout,
    equipmentInstances: Object.freeze([
      createEquipmentInstance({ equipmentDefinitionId: def.equipmentDefinitionId, layoutId: layout.layoutId, xMm: 1000, yMm: 1000, rotationDeg: 0, createdAt: NOW }),
    ]),
  });
  const facility = {
    electrical: {
      ...createDefaultElectrical(),
      phaseType: { value: "SINGLE_PHASE", evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }) },
    },
  };
  const technicalReport = buildTechnicalCheckReport({ layout, definitions: [def], facility, measurement, deliveryPath: null, generatedAt: NOW });
  const fieldBundle = buildDecisionEvidenceBundle({
    layout,
    definitions: [def],
    geometryWarnings: validateLayoutGeometry(layout, [def]),
    facility,
    measurement,
    deliveryPath: null,
    technicalReport,
    generatedAt: NOW,
  });
  const context = createCandidateDecisionContext({
    candidateStoreId: layout.candidateStoreId,
    createdAt: NOW,
    fieldBinding: { surveyId: layout.surveyId, layoutId: layout.layoutId },
  });
  assert.equal(context.ok, true, context.message);
  return buildCandidateDecisionEvidenceBundle({
    context: context.value,
    generatedAt: GENERATED_AT,
    fieldBundle,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: null,
  });
}

const FORBIDDEN_TEXT = /계약\s*(가능|불가)|조건부\s*추천|추천|보류|위험|불가능|설치\s*불가|반입\s*불가/;

// ---- Rule Registry ----

test("1. RISK_RULE_SET_V1 passes validation", () => {
  const result = validateRiskRuleSet(RISK_RULE_SET_V1);
  assert.equal(result.ok, true, result.message);
  assert.equal(RISK_RULE_SET_V1.ruleSetVersion, "risk-rules-v1");
  assert.equal(Object.isFrozen(RISK_RULE_SET_V1.rules[0].evidenceRequirements[0]), true);
});

test("2. only the 8 golden rules exist", () => {
  assert.deepEqual(RISK_RULE_SET_V1.rules.map((rule) => rule.ruleId), [
    "EVIDENCE.CORE_MISSING",
    "TECHNICAL.ELECTRICAL.CONSTRAINT",
    "TECHNICAL.EXHAUST.CONSTRAINT",
    "TECHNICAL.WATER.CONSTRAINT",
    "TECHNICAL.DRAINAGE.CONSTRAINT",
    "TECHNICAL.DELIVERY.CONSTRAINT",
    "TECHNICAL.ELECTRICAL.EXPERT_REVIEW",
    "TECHNICAL.EXHAUST.EXPERT_REVIEW",
  ]);
});

test("3-4. no HARD_BLOCKER or ECONOMIC_STRESS rules; no Economic/Location/Competition rules", () => {
  const classes = RISK_RULE_SET_V1.rules.map((rule) => rule.riskClass);
  assert.equal(classes.filter((value) => value === "HARD_BLOCKER").length, 0);
  assert.equal(classes.filter((value) => value === "ECONOMIC_STRESS").length, 0);
  for (const rule of RISK_RULE_SET_V1.rules) {
    assert.equal(["ECONOMIC", "LOCATION", "COMPETITION", "LEASE"].includes(rule.domain), false, rule.ruleId);
    for (const requirement of rule.evidenceRequirements) {
      assert.equal(["ECONOMIC", "LOCATION", "LEASE"].includes(requirement.sourceDomain), false, rule.ruleId);
    }
  }
});

test("5. rule identities are unique", () => {
  const identities = RISK_RULE_SET_V1.rules.map((rule) => `${rule.ruleId}@${rule.version}`);
  assert.equal(new Set(identities).size, identities.length);
});

test("6. rule definitions contain no callbacks", () => {
  const visit = (value) => {
    if (typeof value === "function") assert.fail("function in rule set");
    if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(RISK_RULE_SET_V1);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(RISK_RULE_SET_V1)));
  assert.equal(Object.keys(RISK_PREDICATE_REGISTRY_V1).length, 0);
});

// ---- Evidence Matcher ----

test("7-13. each typed selector matches by equality", () => {
  const verified = item({
    sourceDomain: "TECHNICAL_CHECK",
    bucket: "OBSERVED_CONSTRAINT",
    category: "ELECTRICAL",
    key: "m",
    importance: "CORE",
    nature: "OBSERVATION",
    fieldEvidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK", verificationStatus: "VERIFIED" }),
  });
  const cases = [
    [{ sourceDomain: "TECHNICAL_CHECK" }, { sourceDomain: "FIELD" }],
    [{ category: "ELECTRICAL" }, { category: "WATER" }],
    [{ bucket: "OBSERVED_CONSTRAINT" }, { bucket: "OBSERVED_FACT" }],
    [{ nature: "OBSERVATION" }, { nature: "ESTIMATE" }],
    [{ importance: "CORE" }, { importance: "SUPPORTING" }],
    [{ verificationStatus: "VERIFIED" }, { verificationStatus: "UNKNOWN" }],
    [{ evidenceId: verified.id }, { evidenceId: `${verified.id}x` }],
  ];
  for (const [hit, miss] of cases) {
    assert.equal(matchesEvidenceRequirement(verified, { requirementKey: "k", ...hit }), true, JSON.stringify(hit));
    assert.equal(matchesEvidenceRequirement(verified, { requirementKey: "k", ...miss }), false, JSON.stringify(miss));
  }
  const noNature = item({ key: "n" });
  assert.equal(matchesEvidenceRequirement(noNature, { requirementKey: "k", nature: "OBSERVATION" }), false);
  assert.equal(matchesEvidenceRequirement(noNature, { requirementKey: "k", verificationStatus: "VERIFIED" }), false);
});

test("14. multiple selectors are AND", () => {
  const constraint = technical([equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED" })]).observedConstraints[0];
  assert.equal(matchesEvidenceRequirement(constraint, { requirementKey: "k", sourceDomain: "TECHNICAL_CHECK", category: "ELECTRICAL", bucket: "OBSERVED_CONSTRAINT" }), true);
  assert.equal(matchesEvidenceRequirement(constraint, { requirementKey: "k", sourceDomain: "TECHNICAL_CHECK", category: "WATER", bucket: "OBSERVED_CONSTRAINT" }), false);
});

test("15. identical description does not match", () => {
  const target = item({ key: "target", description: "same text" });
  const other = item({ key: "other", description: "same text" });
  assert.equal(matchesEvidenceRequirement(other, { requirementKey: "k", evidenceId: target.id }), false);
  const rule = {
    ...RISK_RULE_SET_V1.rules[0],
    ruleId: "FIXTURE.EXACT_ID",
    evidenceRequirements: [{ requirementKey: "exact", evidenceId: target.id }],
  };
  const ruleSet = { schemaVersion: RISK_RULE_SET_SCHEMA_VERSION, ruleSetVersion: "fixture-rules", rules: [rule] };
  const outcome = evaluateRiskRules({ evidenceBundle: fixtureBundle({ observedFacts: [other] }), ruleSetVersion: "fixture-rules" }, { ruleSet });
  assert.equal(outcome.ok, true, outcome.message);
  assert.equal(outcome.value.findings.length, 0);
});

test("16. unknown predicateKey is an evaluation error, registered predicate filters", () => {
  const constraint = technical([equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED" })]).observedConstraints[0];
  const rule = {
    ...RISK_RULE_SET_V1.rules[1],
    ruleId: "FIXTURE.PREDICATE",
    evidenceRequirements: [{ requirementKey: "p", bucket: "OBSERVED_CONSTRAINT", predicateKey: "fixture.core-only" }],
  };
  const ruleSet = { schemaVersion: RISK_RULE_SET_SCHEMA_VERSION, ruleSetVersion: "fixture-rules", rules: [rule] };
  const input = { evidenceBundle: fixtureBundle({ observedConstraints: [constraint] }), ruleSetVersion: "fixture-rules" };

  const unknown = evaluateRiskRules(input, { ruleSet });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "INVALID_RISK_EVALUATION");
  assert.ok(unknown.errors.some((entry) => entry.includes("fixture.core-only")));

  const calls = [];
  const predicates = createRiskPredicateRegistry({
    "fixture.core-only": (context) => {
      calls.push(context.candidateEvidence.id);
      assert.equal(context.rule.ruleId, "FIXTURE.PREDICATE");
      assert.equal(context.requirement.requirementKey, "p");
      return context.candidateEvidence.importance === "CORE";
    },
  });
  const ok = evaluateRiskRules(input, { ruleSet, predicates });
  assert.equal(ok.ok, true, ok.message);
  assert.deepEqual(ok.value.findings[0].evidenceIds, [constraint.id]);
  assert.deepEqual(calls, [constraint.id]);
  const rejecting = createRiskPredicateRegistry({ "fixture.core-only": () => false });
  assert.equal(evaluateRiskRules(input, { ruleSet, predicates: rejecting }).value.findings.length, 0);
});

test("evaluation errors: ruleSetVersion mismatch, invalid rule set, duplicate evidence id", () => {
  const mismatch = evaluateRiskRules({ evidenceBundle: fixtureBundle(), ruleSetVersion: "risk-rules-v0" });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.errors.some((entry) => entry.includes("ruleSetVersion")));

  const badRuleSet = { ...RISK_RULE_SET_V1, rules: [...RISK_RULE_SET_V1.rules, RISK_RULE_SET_V1.rules[0]] };
  const invalid = evaluateRiskRules(INPUT(fixtureBundle()), { ruleSet: badRuleSet });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((entry) => entry.startsWith("rule set:")));

  const shared = item({ key: "dup" });
  const duplicate = evaluateRiskRules(INPUT(fixtureBundle({ observedFacts: [shared], observedConstraints: [shared] })));
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((entry) => entry.includes("evidence id 중복")));
});

// ---- Evaluation ----

test("17. empty bundle yields a deterministic empty result", () => {
  const result = evaluate(fixtureBundle());
  assert.equal(result.findings.length, 0);
  assert.equal(result.unresolvedFindingCount, 0);
  assert.equal(result.ruleSetVersion, "risk-rules-v1");
  assert.deepEqual(evaluate(fixtureBundle({})).findings, []);
});

test("18-19. CORE missing becomes EVIDENCE_GAP, never HARD_BLOCKER", () => {
  const bundle = baseBundle();
  const core = bundle.missingInformation.filter((entry) => entry.importance === "CORE").map((entry) => entry.id).sort();
  assert.ok(core.length > 0);
  const result = evaluate(bundle);
  const [gap] = byRule(result, "EVIDENCE.CORE_MISSING");
  assert.equal(gap.riskClass, "EVIDENCE_GAP");
  assert.equal(gap.severity, "HIGH");
  assert.equal(gap.resolutionStatus, "NEEDS_CONFIRMATION");
  assert.deepEqual(gap.evidenceIds, core);
  assert.deepEqual(gap.missingRequirementKeys, []);
  assert.deepEqual(gap.remediation, [REMEDIATION_TEXT.CONFIRM]);
  assert.equal(gap.requiresHumanApproval, false);
  assert.equal(result.findings.some((entry) => entry.riskClass === "HARD_BLOCKER"), false);
});

test("SUPPORTING missing alone does not trigger the CORE gap rule", () => {
  const supporting = item({ bucket: "MISSING_INFORMATION", key: "supporting", importance: "SUPPORTING" });
  assert.equal(evaluate(fixtureBundle({ missingInformation: [supporting] })).findings.length, 0);
});

test("20-21. electrical constraint (incl. power summary without verificationStatus) becomes CONDITIONAL_BLOCKER", () => {
  const evidence = technical([equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED" })], POWER_CONSTRAINT);
  const power = evidence.observedConstraints.find((entry) => entry.id.endsWith("|power-sum-vs-contract"));
  assert.equal(power.verificationStatus, undefined);
  const result = evaluate(fixtureBundle({ observedConstraints: evidence.observedConstraints }));
  const [finding] = byRule(result, "TECHNICAL.ELECTRICAL.CONSTRAINT");
  assert.equal(finding.riskClass, "CONDITIONAL_BLOCKER");
  assert.equal(finding.domain, "ELECTRICAL");
  assert.equal(finding.severity, "HIGH");
  assert.equal(finding.resolutionStatus, "CONDITION_REQUIRED");
  assert.equal(finding.requiresHumanApproval, true);
  assert.deepEqual(finding.remediation, [REMEDIATION_TEXT.EXPERT_REVIEW]);
  assert.ok(finding.evidenceIds.includes(power.id));
  assert.equal(finding.evidenceIds.length, 2);

  const powerOnly = evaluate(fixtureBundle({ observedConstraints: technical([], POWER_CONSTRAINT).observedConstraints }));
  assert.deepEqual(byRule(powerOnly, "TECHNICAL.ELECTRICAL.CONSTRAINT")[0].evidenceIds, [power.id]);
});

test("real FIELD → Candidate Bundle → evaluator produces electrical CONDITIONAL_BLOCKER", () => {
  const bundle = realFieldElectricalCandidateBundle();
  assert.ok(bundle.observedConstraints.some((entry) => entry.sourceDomain === "TECHNICAL_CHECK" && entry.category === "ELECTRICAL"));
  const result = evaluate(bundle);
  const [finding] = byRule(result, "TECHNICAL.ELECTRICAL.CONSTRAINT");
  assert.equal(finding.riskClass, "CONDITIONAL_BLOCKER");
  assert.ok(finding.evidenceIds.every((id) => bundle.observedConstraints.some((entry) => entry.id === id)));
  assert.ok(byRule(result, "EVIDENCE.CORE_MISSING").length === 1);
});

test("22-23 + water/drainage. each technical constraint category maps to its own CONDITIONAL_BLOCKER", () => {
  const evidence = technical([
    equipmentCheck("a", { exhaust: "CONSTRAINT_OBSERVED", delivery: "CONSTRAINT_OBSERVED" }),
    equipmentCheck("b", { water: "CONSTRAINT_OBSERVED", drainage: "CONSTRAINT_OBSERVED" }),
  ]);
  const result = evaluate(fixtureBundle({ observedConstraints: evidence.observedConstraints }));
  const expectations = {
    "TECHNICAL.EXHAUST.CONSTRAINT": ["EXHAUST", REMEDIATION_TEXT.EXPERT_REVIEW],
    "TECHNICAL.DELIVERY.CONSTRAINT": ["DELIVERY", REMEDIATION_TEXT.CONFIRM],
    "TECHNICAL.WATER.CONSTRAINT": ["WATER", REMEDIATION_TEXT.EXPERT_REVIEW],
    "TECHNICAL.DRAINAGE.CONSTRAINT": ["DRAINAGE", REMEDIATION_TEXT.EXPERT_REVIEW],
  };
  for (const [ruleId, [domain, remediation]] of Object.entries(expectations)) {
    const findings = byRule(result, ruleId);
    assert.equal(findings.length, 1, ruleId);
    assert.equal(findings[0].riskClass, "CONDITIONAL_BLOCKER");
    assert.equal(findings[0].domain, domain);
    assert.equal(findings[0].requiresHumanApproval, true);
    assert.deepEqual(findings[0].remediation, [remediation]);
    assert.equal(findings[0].evidenceIds.length, 1);
  }
  assert.equal(byRule(result, "TECHNICAL.ELECTRICAL.CONSTRAINT").length, 0);
  assert.doesNotMatch(byRule(result, "TECHNICAL.DELIVERY.CONSTRAINT")[0].description, /반입\s*불가/);
});

test("24-25. electrical / exhaust EXPERT_REVIEW becomes HUMAN_REVIEW_REQUIRED", () => {
  const evidence = technical([equipmentCheck("a", { electrical: "EXPERT_REVIEW_REQUIRED", exhaust: "EXPERT_REVIEW_REQUIRED", water: "EXPERT_REVIEW_REQUIRED" })]);
  const result = evaluate(fixtureBundle({ expertReviewItems: evidence.expertReviewItems }));
  for (const ruleId of ["TECHNICAL.ELECTRICAL.EXPERT_REVIEW", "TECHNICAL.EXHAUST.EXPERT_REVIEW"]) {
    const [finding] = byRule(result, ruleId);
    assert.equal(finding.riskClass, "HUMAN_REVIEW_REQUIRED");
    assert.equal(finding.resolutionStatus, "EXPERT_REVIEW_REQUIRED");
    assert.equal(finding.requiresHumanApproval, true);
    assert.deepEqual(finding.remediation, [REMEDIATION_TEXT.EXPERT_REVIEW]);
  }
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings.some((entry) => entry.riskClass === "HARD_BLOCKER" || entry.riskClass === "CONDITIONAL_BLOCKER"), false);
});

test("26. NOT_AVAILABLE / MISSING / INSUFFICIENT never become HARD_BLOCKER", () => {
  const evidence = technical([equipmentCheck("a", { electrical: "INSUFFICIENT_DATA", water: "INSUFFICIENT_DATA", delivery: "NOT_APPLICABLE" })]);
  const result = evaluate(fixtureBundle({ missingInformation: [...baseBundle().missingInformation, ...evidence.missingInformation] }));
  assert.equal(result.unresolvedHardBlockerCount, 0);
  assert.equal(result.findings.some((entry) => entry.riskClass !== "EVIDENCE_GAP"), false);
});

test("27-28. Economic and Location/Competition evidence create no findings in V1", () => {
  const facts = [
    item({ sourceDomain: "ECONOMIC", category: "BEP", key: "bep", nature: "DERIVED_CALCULATION", importance: "CORE" }),
    item({ sourceDomain: "ECONOMIC", category: "ECONOMIC", key: "rent-ceiling", nature: "ESTIMATE", importance: "CORE" }),
    item({ sourceDomain: "LOCATION", category: "COMPETITION", key: "kakao", nature: "OBSERVATION", importance: "CORE" }),
    item({ sourceDomain: "LOCATION", category: "DEMAND", key: "living", nature: "REFERENCE_SUMMARY" }),
    item({ sourceDomain: "LEASE", category: "LEASE", key: "rent", nature: "REFERENCE_SUMMARY" }),
  ];
  const result = evaluate(fixtureBundle({ observedFacts: facts }));
  assert.equal(result.findings.length, 0);
  assert.equal(result.unresolvedEconomicStressCount, 0);
});

test("29-31. three matching constraints → one finding, sorted evidenceIds, deterministic findingId", () => {
  const evidence = technical([
    equipmentCheck("c", { electrical: "CONSTRAINT_OBSERVED" }),
    equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED" }),
    equipmentCheck("b", { electrical: "CONSTRAINT_OBSERVED" }),
  ]);
  assert.equal(evidence.observedConstraints.length, 3);
  const result = evaluate(fixtureBundle({ observedConstraints: evidence.observedConstraints }));
  const findings = byRule(result, "TECHNICAL.ELECTRICAL.CONSTRAINT");
  assert.equal(findings.length, 1);
  const ids = evidence.observedConstraints.map((entry) => entry.id);
  assert.deepEqual(findings[0].evidenceIds, [...ids].sort());
  assert.equal(findings[0].findingId, riskFindingId("TECHNICAL.ELECTRICAL.CONSTRAINT", "1", [...ids].sort()));

  const reversed = evaluate(fixtureBundle({ observedConstraints: [...evidence.observedConstraints].reverse() }));
  assert.equal(byRule(reversed, "TECHNICAL.ELECTRICAL.CONSTRAINT")[0].findingId, findings[0].findingId);
  const fewer = evaluate(fixtureBundle({ observedConstraints: evidence.observedConstraints.slice(0, 2) }));
  assert.notEqual(byRule(fewer, "TECHNICAL.ELECTRICAL.CONSTRAINT")[0].findingId, findings[0].findingId);
});

test("6B.1 findingId is canonical (no hash) and delimiter-unambiguous", () => {
  const ids = ["TECHNICAL_CHECK|OBSERVED_CONSTRAINT|ELECTRICAL|b", "TECHNICAL_CHECK|OBSERVED_CONSTRAINT|ELECTRICAL|a"];
  const id = riskFindingId("TECHNICAL.ELECTRICAL.CONSTRAINT", "1", ids);
  assert.equal(
    id,
    "risk-finding:TECHNICAL.ELECTRICAL.CONSTRAINT@1:TECHNICAL_CHECK|OBSERVED_CONSTRAINT|ELECTRICAL|a,TECHNICAL_CHECK|OBSERVED_CONSTRAINT|ELECTRICAL|b",
  );
  assert.equal(riskFindingId("TECHNICAL.ELECTRICAL.CONSTRAINT", "1", [...ids].reverse()), id);
  assert.equal(riskFindingId("TECHNICAL.ELECTRICAL.CONSTRAINT", "1", [ids[0], ids[1], ids[0]]), id);
  assert.notEqual(riskFindingId("TECHNICAL.ELECTRICAL.CONSTRAINT", "1", [ids[0]]), id);
  assert.notEqual(riskFindingId("TECHNICAL.ELECTRICAL.CONSTRAINT", "2", ids), id);

  assert.notEqual(riskFindingId("r", "1", ["x,y"]), riskFindingId("r", "1", ["x", "y"]));
  assert.notEqual(riskFindingId("r@1", "2", ["e"]), riskFindingId("r", "1@2", ["e"]));
  assert.notEqual(riskFindingId("r", "1:e", ["f"]), riskFindingId("r", "1", ["e:f"]));
  assert.notEqual(riskFindingId("r", "1", ["%2C"]), riskFindingId("r", "1", [","]));
  assert.equal(riskFindingId("r", "1", [","]), "risk-finding:r@1:%2C");
  assert.equal(riskFindingId("r", "1", ["%2C"]), "risk-finding:r@1:%252C");
});

function mixedBundle() {
  const evidence = technical(
    [equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED", exhaust: "EXPERT_REVIEW_REQUIRED", water: "CONSTRAINT_OBSERVED" })],
    POWER_CONSTRAINT,
  );
  const base = baseBundle();
  return {
    ...base,
    observedConstraints: evidence.observedConstraints,
    expertReviewItems: evidence.expertReviewItems,
  };
}

test("32. same input twice is deepEqual and findings are sorted by ruleId", () => {
  const bundle = mixedBundle();
  const first = evaluate(bundle);
  const second = evaluate(bundle);
  assert.deepEqual(first, second);
  const ruleIds = first.findings.map((entry) => entry.ruleId);
  assert.deepEqual(ruleIds, [...ruleIds].sort());
});

test("33. inputs are not mutated or frozen", () => {
  const evidence = technical([equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED" })]);
  const mutableItem = { ...evidence.observedConstraints[0] };
  const bundle = { ...fixtureBundle(), observedConstraints: [mutableItem] };
  const ruleSet = structuredClone(RISK_RULE_SET_V1);
  const before = JSON.stringify({ bundle, ruleSet });
  const outcome = evaluateRiskRules(INPUT(bundle), { ruleSet });
  assert.equal(outcome.ok, true, outcome.message);
  assert.equal(JSON.stringify({ bundle, ruleSet }), before);
  assert.equal(Object.isFrozen(bundle), false);
  assert.equal(Object.isFrozen(bundle.observedConstraints), false);
  assert.equal(Object.isFrozen(mutableItem), false);
  assert.equal(Object.isFrozen(ruleSet.rules[0]), false);
  assert.equal(Object.isFrozen(outcome.value), true);
});

test("34. result is JSON serializable and passes contract validation", () => {
  const result = evaluate(mixedBundle());
  const serialized = JSON.stringify(result);
  assert.deepEqual(JSON.parse(serialized), result);
  assert.equal(validateRiskEvaluationResult(JSON.parse(serialized)).ok, true);
});

// ---- Counts ----

test("35-40. unresolved counts are exact", () => {
  const result = evaluate(mixedBundle());
  assert.equal(result.unresolvedConditionalBlockerCount, 2);
  assert.equal(result.unresolvedEvidenceGapCount, 1);
  assert.equal(result.unresolvedHumanReviewRequiredCount, 1);
  assert.equal(result.unresolvedHardBlockerCount, 0);
  assert.equal(result.unresolvedEconomicStressCount, 0);
  assert.equal(result.unresolvedFindingCount, 4);
  assert.equal(result.findings.length, 4);
  assert.equal(result.findings.some((entry) => entry.resolutionStatus === "RESOLVED" || entry.resolutionStatus === "ACCEPTED_BY_HUMAN"), false);
});

test("41-42. validation fixture: RESOLVED excluded, ACCEPTED_BY_HUMAN kept", () => {
  const result = evaluate(mixedBundle());
  const findings = result.findings.map((entry) => ({ ...entry }));
  const conditional = findings.filter((entry) => entry.riskClass === "CONDITIONAL_BLOCKER");
  conditional[0].resolutionStatus = "RESOLVED";
  conditional[1].resolutionStatus = "ACCEPTED_BY_HUMAN";
  conditional[1].humanAcceptance = { acceptedByRef: "staff_fixture", acceptedAt: "2026-10-01T06:00:00.000Z", reason: "fixture" };
  const adjusted = {
    ...result,
    findings,
    unresolvedFindingCount: 3,
    unresolvedConditionalBlockerCount: 1,
  };
  assert.equal(validateRiskEvaluationResult(adjusted).ok, true);
  assert.equal(validateRiskEvaluationResult({ ...adjusted, unresolvedConditionalBlockerCount: 2 }).ok, false);
  assert.equal(validateRiskEvaluationResult({ ...adjusted, unresolvedConditionalBlockerCount: 0 }).ok, false);
});

// ---- Boundary ----

test("43-48. no verdict / recommendation / score fields", () => {
  const result = evaluate(mixedBundle());
  assert.equal(result.createsVerdict, false);
  assert.equal(result.createsScore, false);
  const keys = [...collectKeys(result)];
  for (const key of ["verdict", "recommendation", "riskScore", "totalScore", "weightedScore", "score", "grade", "approved", "rejected", "contractAllowed"]) {
    assert.equal(keys.includes(key), false, key);
  }
  assert.deepEqual(keys.filter((key) => /score|verdict|recommend/i.test(key) && !["createsScore", "createsVerdict"].includes(key)), []);
});

test("49-50. no contract-decision or final-judgement wording in rules, remediation, or results", () => {
  const strings = [
    ...collectStrings(RISK_RULE_SET_V1),
    ...collectStrings(REMEDIATION_TEXT),
    ...collectStrings(evaluate(mixedBundle())),
  ];
  for (const text of strings) assert.doesNotMatch(text, FORBIDDEN_TEXT, text);
});
