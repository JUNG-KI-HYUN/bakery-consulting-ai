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
const {
  FINAL_DECISION_POLICY_V1,
  FINAL_DECISION_POLICY_V1_VERSION,
  buildFinalDecisionPolicyReadiness,
  validateFinalDecisionPolicy,
} = lib("lib/decision-v2/policy-readiness.ts");
const { FINAL_DECISION_POLICY_READINESS_SCHEMA_VERSION } = lib("lib/decision-v2/types.ts");
const { buildRiskRegister } = lib("lib/risk-v2/risk-register.ts");
const { buildDecisionReviewCompleteness } = lib("lib/risk-v2/decision-review.ts");
const { evaluateRiskRules } = lib("lib/risk-v2/evaluate.ts");
const { RISK_RULE_SET_V1, RISK_RULE_SET_V1_VERSION } = lib("lib/risk-v2/rule-registry.ts");
const { RISK_RULE_SET_SCHEMA_VERSION } = lib("lib/risk-v2/types.ts");
const { buildCandidateDecisionEvidenceBundle } = lib("lib/decision-evidence/candidate-bundle.ts");
const { createDecisionEvidenceItem } = lib("lib/decision-evidence/helpers.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");

// ---- fixtures (sample/demo only; not real store, customer, or rule data) ----

const NOW = "2026-10-01T00:00:00.000Z";
const FIXTURE_RULE_SET_VERSION = "fixture-complete-rule-set";

function baseBundle() {
  const context = createCandidateDecisionContext({ candidateStoreId: createCandidateStoreId(), createdAt: NOW });
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

/** no evidence at all → V1 evaluation yields 0 findings → human review readiness true */
function emptyBundle() {
  return {
    ...baseBundle(),
    observedFacts: [],
    observedConstraints: [],
    missingInformation: [],
    expertReviewItems: [],
    geometryIssues: [],
  };
}

function fact(sourceDomain, category, nature) {
  return createDecisionEvidenceItem({
    sourceDomain,
    bucket: "OBSERVED_FACT",
    category,
    key: `fixture-${category.toLowerCase()}`,
    title: "fixture",
    description: `fixture ${sourceDomain} fact`,
    nature,
  });
}

/** Location / Lease / Economic / Space evidence present, but no matching Risk rule */
function evidenceRichBundle() {
  return {
    ...emptyBundle(),
    observedFacts: [
      fact("LOCATION", "LOCATION", "REFERENCE_SUMMARY"),
      fact("LEASE", "LEASE", "OBSERVATION"),
      fact("ECONOMIC", "BEP", "DERIVED_CALCULATION"),
      fact("SPACE_FIT", "SPACE", "OBSERVATION"),
    ],
  };
}

const NEVER_PRESENT = "fixture-evidence-never-present";

function fixtureRule(ruleId, domain, riskClass, requirement, extra = {}) {
  return {
    ruleId,
    version: "1",
    domain,
    riskClass,
    title: `fixture ${ruleId}`,
    description: "fixture rule for coverage tests only",
    evidenceRequirements: [{ requirementKey: "fixture", evidenceId: NEVER_PRESENT, ...requirement }],
    defaultSeverity: "MEDIUM",
    requiresHumanApproval: true,
    remediationType: "CONFIRM",
    ...extra,
  };
}

/** V1 rules + fixture rules covering the remaining required classes/domains. Fixture rules never match evidence. */
function completeRuleSet() {
  return {
    schemaVersion: RISK_RULE_SET_SCHEMA_VERSION,
    ruleSetVersion: FIXTURE_RULE_SET_VERSION,
    rules: [
      ...structuredClone(RISK_RULE_SET_V1.rules),
      fixtureRule("FIXTURE.SPACE.HARD", "SPACE", "HARD_BLOCKER", {
        sourceDomain: "SPACE_FIT",
        bucket: "OBSERVED_CONSTRAINT",
        nature: "OBSERVATION",
      }, { defaultSeverity: "CRITICAL", remediationType: "CHANGE_PLAN" }),
      fixtureRule("FIXTURE.ECONOMIC.STRESS", "ECONOMIC", "ECONOMIC_STRESS", {
        sourceDomain: "ECONOMIC",
        nature: "DERIVED_CALCULATION",
      }),
      fixtureRule("FIXTURE.LEASE.CONDITION", "LEASE", "CONDITIONAL_BLOCKER", { sourceDomain: "LEASE" }, {
        remediationType: "NEGOTIATE",
      }),
      fixtureRule("FIXTURE.LOCATION.REVIEW", "LOCATION", "HUMAN_REVIEW_REQUIRED", { sourceDomain: "LOCATION" }, {
        remediationType: "EXPERT_REVIEW",
      }),
    ],
  };
}

function fixturePolicy(overrides = {}) {
  return { ...structuredClone(FINAL_DECISION_POLICY_V1), requiredRuleSetVersion: FIXTURE_RULE_SET_VERSION, ...overrides };
}

/** real evaluator → real register for the given bundle / rule set */
function pipeline(bundle, ruleSet = RISK_RULE_SET_V1) {
  const evaluation = evaluateRiskRules(
    { evidenceBundle: bundle, ruleSetVersion: ruleSet.ruleSetVersion },
    { ruleSet },
  );
  assert.equal(evaluation.ok, true, evaluation.message);
  const riskRegister = buildRiskRegister({ evidenceBundle: bundle, evaluation: evaluation.value });
  assert.equal(riskRegister.ok, true, riskRegister.message);
  return { evidenceBundle: bundle, riskRegister: riskRegister.value };
}

function reviewOf(riskRegister) {
  const outcome = buildDecisionReviewCompleteness(riskRegister);
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function readiness(input) {
  const outcome = buildFinalDecisionPolicyReadiness(input);
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function v1Readiness(bundle) {
  return readiness({ policy: FINAL_DECISION_POLICY_V1, riskRuleSet: RISK_RULE_SET_V1, ...pipeline(bundle) });
}

function completeReadiness(bundle) {
  const riskRuleSet = completeRuleSet();
  return readiness({ policy: fixturePolicy(), riskRuleSet, ...pipeline(bundle, riskRuleSet) });
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

const V1_MISSING_DOMAINS = ["LOCATION", "LEASE", "ECONOMIC", "SPACE"];

// ---- Policy ----

test("1-3. FinalDecisionPolicy V1 is valid with 5 required classes and the exact required domains", () => {
  const checked = validateFinalDecisionPolicy(FINAL_DECISION_POLICY_V1);
  assert.equal(checked.ok, true, checked.message);
  assert.equal(FINAL_DECISION_POLICY_V1.policyVersion, FINAL_DECISION_POLICY_V1_VERSION);
  assert.equal(FINAL_DECISION_POLICY_V1_VERSION, "frameone-final-decision-policy-v1");
  assert.equal(FINAL_DECISION_POLICY_V1.requiredRuleSetVersion, RISK_RULE_SET_V1_VERSION);
  assert.deepEqual(FINAL_DECISION_POLICY_V1.requiredRiskClasses, [
    "HARD_BLOCKER",
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ]);
  assert.deepEqual(FINAL_DECISION_POLICY_V1.requiredDomains, [
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
  ]);
  assert.equal(FINAL_DECISION_POLICY_V1.requiredDomains.includes("COMPETITION"), false);
  assert.equal(FINAL_DECISION_POLICY_V1.requiredDomains.includes("RESTROOM"), false);
  assert.equal(FINAL_DECISION_POLICY_V1.requiresEvidenceReady, true);
  assert.equal(FINAL_DECISION_POLICY_V1.requiresExpertReviewReady, true);
  assert.equal(Object.isFrozen(FINAL_DECISION_POLICY_V1.requiredDomains), true);
});

// ---- current risk-rules-v1 ----

test("4-11. risk-rules-v1 lacks HARD_BLOCKER / ECONOMIC_STRESS and LOCATION / LEASE / ECONOMIC / SPACE → coverage not ready", () => {
  const result = v1Readiness(baseBundle());
  assert.equal(result.schemaVersion, FINAL_DECISION_POLICY_READINESS_SCHEMA_VERSION);
  assert.equal(result.policyVersion, FINAL_DECISION_POLICY_V1_VERSION);
  assert.equal(result.ruleSetVersion, RISK_RULE_SET_V1_VERSION);
  assert.deepEqual(result.coveredRiskClasses, ["CONDITIONAL_BLOCKER", "EVIDENCE_GAP", "HUMAN_REVIEW_REQUIRED"]);
  assert.deepEqual(result.missingRiskClasses, ["HARD_BLOCKER", "ECONOMIC_STRESS"]);
  assert.deepEqual(result.missingDomains, V1_MISSING_DOMAINS);
  assert.deepEqual(result.coveredDomains, ["ELECTRICAL", "WATER", "DRAINAGE", "EXHAUST", "DELIVERY", "EVIDENCE"]);
  assert.equal(result.ruleCoverageReady, false);
  assert.equal(result.readyForFinalVerdictEvaluation, false);
});

test("12. human decision review ready but rule coverage missing → final verdict evaluation not ready", () => {
  const input = pipeline(emptyBundle());
  assert.equal(input.riskRegister.entries.length, 0);
  assert.equal(reviewOf(input.riskRegister).readyForHumanDecisionReview, true);
  const result = readiness({ policy: FINAL_DECISION_POLICY_V1, riskRuleSet: RISK_RULE_SET_V1, ...input });
  assert.equal(result.reviewCompletenessReady, true);
  assert.equal(result.evidenceReady, true);
  assert.equal(result.expertReviewReady, true);
  assert.equal(result.ruleCoverageReady, false);
  assert.equal(result.readyForFinalVerdictEvaluation, false);
});

// ---- complete fixture rule set ----

test("13-14. complete fixture rule set → coverage ready; with review ready → final verdict evaluation ready", () => {
  const result = completeReadiness(emptyBundle());
  assert.deepEqual(result.missingRiskClasses, []);
  assert.deepEqual(result.missingDomains, []);
  assert.deepEqual(result.coveredRiskClasses, result.requiredRiskClasses);
  assert.deepEqual(result.coveredDomains, result.requiredDomains);
  assert.equal(result.ruleCoverageReady, true);
  assert.equal(result.reviewCompletenessReady, true);
  assert.equal(result.readyForFinalVerdictEvaluation, true);
  assert.equal(result.ruleSetVersion, FIXTURE_RULE_SET_VERSION);
});

test("15. complete rules + review not ready (open evidence gap) → final verdict evaluation not ready", () => {
  const riskRuleSet = completeRuleSet();
  const input = pipeline(baseBundle(), riskRuleSet);
  assert.equal(reviewOf(input.riskRegister).evidenceReady, false);
  const result = readiness({ policy: fixturePolicy(), riskRuleSet, ...input });
  assert.equal(result.ruleCoverageReady, true);
  assert.equal(result.reviewCompletenessReady, false);
  assert.equal(result.evidenceReady, false);
  assert.equal(result.readyForFinalVerdictEvaluation, false);
});

test("16. finding count does not change coverage (0 findings vs several findings)", () => {
  const none = v1Readiness(emptyBundle());
  const some = v1Readiness(baseBundle());
  for (const key of ["coveredRiskClasses", "missingRiskClasses", "coveredDomains", "missingDomains", "ruleCoverageReady"]) {
    assert.deepEqual(none[key], some[key], key);
  }
  const noneComplete = completeReadiness(emptyBundle());
  const someComplete = completeReadiness(baseBundle());
  assert.equal(noneComplete.ruleCoverageReady, true);
  assert.equal(someComplete.ruleCoverageReady, true);
});

test("17. Location / Lease / Economic / Space evidence present without rules → domains stay missing", () => {
  const bundle = evidenceRichBundle();
  assert.deepEqual(
    bundle.observedFacts.map((entry) => entry.sourceDomain),
    ["LOCATION", "LEASE", "ECONOMIC", "SPACE_FIT"],
  );
  const result = v1Readiness(bundle);
  assert.deepEqual(result.missingDomains, V1_MISSING_DOMAINS);
  assert.equal(result.ruleCoverageReady, false);
});

// ---- identity / version validation ----

test("18. candidateStoreId mismatch between bundle and register → INVALID_FINAL_DECISION_READINESS", () => {
  const first = pipeline(emptyBundle());
  const second = pipeline(emptyBundle());
  assert.notEqual(first.evidenceBundle.candidateStoreId, second.evidenceBundle.candidateStoreId);
  for (const input of [
    { ...first, evidenceBundle: second.evidenceBundle },
    { ...first, riskRegister: second.riskRegister },
  ]) {
    const outcome = buildFinalDecisionPolicyReadiness({ policy: FINAL_DECISION_POLICY_V1, riskRuleSet: RISK_RULE_SET_V1, ...input });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, "INVALID_FINAL_DECISION_READINESS");
    assert.match(outcome.message, /candidateStoreId/);
  }
});

test("19. ruleSetVersion mismatch across policy / riskRuleSet / register → error, not a silent false", () => {
  const v1Input = pipeline(emptyBundle());
  const complete = completeRuleSet();
  const completeInput = pipeline(emptyBundle(), complete);
  const cases = [
    { policy: FINAL_DECISION_POLICY_V1, riskRuleSet: complete, ...v1Input },
    { policy: fixturePolicy(), riskRuleSet: complete, ...v1Input },
    { policy: FINAL_DECISION_POLICY_V1, riskRuleSet: RISK_RULE_SET_V1, ...completeInput },
  ];
  for (const input of cases) {
    const outcome = buildFinalDecisionPolicyReadiness(input);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, "INVALID_FINAL_DECISION_READINESS");
    assert.match(outcome.message, /ruleSetVersion/);
  }
});

test("20-21. invalid policies: duplicate class, duplicate domain, empty lists, unsupported enum, empty versions", () => {
  const invalid = [
    fixturePolicy({ requiredRiskClasses: ["HARD_BLOCKER", "HARD_BLOCKER"] }),
    fixturePolicy({ requiredDomains: ["EVIDENCE", "LEASE", "LEASE"] }),
    fixturePolicy({ requiredRiskClasses: [] }),
    fixturePolicy({ requiredDomains: [] }),
    fixturePolicy({ requiredRiskClasses: ["CATASTROPHIC"] }),
    fixturePolicy({ requiredDomains: ["FIRE_SAFETY"] }),
    fixturePolicy({ policyVersion: " " }),
    fixturePolicy({ requiredRuleSetVersion: "" }),
    fixturePolicy({ requiresEvidenceReady: false }),
    fixturePolicy({ verdict: "fixture" }),
  ];
  for (const policy of invalid) {
    const checked = validateFinalDecisionPolicy(policy);
    assert.equal(checked.ok, false, JSON.stringify(policy));
    assert.equal(checked.code, "INVALID_FINAL_DECISION_POLICY");
  }
  const riskRuleSet = completeRuleSet();
  const outcome = buildFinalDecisionPolicyReadiness({
    policy: fixturePolicy({ requiredDomains: ["EVIDENCE", "EVIDENCE"] }),
    riskRuleSet,
    ...pipeline(emptyBundle(), riskRuleSet),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "INVALID_FINAL_DECISION_READINESS");
  assert.match(outcome.message, /중복/);
});

// ---- purity / determinism / serialization ----

// ---- 6D.1 lineage: completeness is always derived from the given RiskRegister ----

/** two registers for the same candidate and ruleSetVersion: one with an EVIDENCE_GAP, one without */
function sameCandidatePair() {
  const withGap = baseBundle();
  const withoutGap = { ...withGap, missingInformation: [] };
  const gapInput = pipeline(withGap);
  const cleanInput = pipeline(withoutGap);
  assert.equal(gapInput.riskRegister.candidateStoreId, cleanInput.riskRegister.candidateStoreId);
  assert.equal(gapInput.riskRegister.ruleSetVersion, cleanInput.riskRegister.ruleSetVersion);
  assert.ok(gapInput.riskRegister.entries.some((entry) => entry.riskClass === "EVIDENCE_GAP"));
  assert.equal(cleanInput.riskRegister.entries.length, 0);
  return { gapInput, cleanInput };
}

test("6D.1-1/4. caller cannot pass a separate DecisionReviewCompleteness, even one for the same candidate/version", () => {
  const { gapInput, cleanInput } = sameCandidatePair();
  const forged = reviewOf(cleanInput.riskRegister);
  assert.equal(forged.readyForHumanDecisionReview, true);
  const outcome = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V1,
    riskRuleSet: RISK_RULE_SET_V1,
    ...gapInput,
    reviewCompleteness: forged,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "INVALID_FINAL_DECISION_READINESS");
  assert.match(outcome.message, /reviewCompleteness/);
});

test("6D.1-2. readiness review fields equal buildDecisionReviewCompleteness(riskRegister)", () => {
  for (const bundle of [emptyBundle(), baseBundle()]) {
    const input = pipeline(bundle);
    const expected = reviewOf(input.riskRegister);
    const result = readiness({ policy: FINAL_DECISION_POLICY_V1, riskRuleSet: RISK_RULE_SET_V1, ...input });
    assert.equal(result.reviewCompletenessReady, expected.readyForHumanDecisionReview);
    assert.equal(result.evidenceReady, expected.evidenceReady);
    assert.equal(result.expertReviewReady, expected.expertReviewReady);
  }
});

test("6D.1-3. adding an EVIDENCE_GAP to the RiskRegister → reviewCompletenessReady false", () => {
  const { gapInput, cleanInput } = sameCandidatePair();
  const clean = readiness({
    policy: FINAL_DECISION_POLICY_V1,
    riskRuleSet: RISK_RULE_SET_V1,
    evidenceBundle: gapInput.evidenceBundle,
    riskRegister: cleanInput.riskRegister,
  });
  const gap = readiness({ policy: FINAL_DECISION_POLICY_V1, riskRuleSet: RISK_RULE_SET_V1, ...gapInput });
  assert.equal(clean.reviewCompletenessReady, true);
  assert.equal(gap.reviewCompletenessReady, false);
  assert.equal(gap.evidenceReady, false);
  assert.equal(gap.readyForFinalVerdictEvaluation, false);
});

test("22. inputs are not mutated or frozen", () => {
  const riskRuleSet = completeRuleSet();
  const policy = fixturePolicy();
  const input = pipeline(emptyBundle(), riskRuleSet);
  const riskRegister = structuredClone(input.riskRegister);
  const before = JSON.stringify({ policy, riskRuleSet, riskRegister });
  readiness({ ...input, policy, riskRuleSet, riskRegister });
  assert.equal(JSON.stringify({ policy, riskRuleSet, riskRegister }), before);
  assert.equal(Object.isFrozen(policy), false);
  assert.equal(Object.isFrozen(policy.requiredDomains), false);
  assert.equal(Object.isFrozen(riskRuleSet), false);
  assert.equal(Object.isFrozen(riskRuleSet.rules), false);
  assert.equal(Object.isFrozen(riskRegister), false);
  assert.equal(Object.isFrozen(riskRegister.entries), false);
});

test("23. deterministic, canonical ordering regardless of rule order or policy list order", () => {
  const riskRuleSet = completeRuleSet();
  const input = pipeline(emptyBundle(), riskRuleSet);
  const baseline = readiness({ policy: fixturePolicy(), riskRuleSet, ...input });
  const reordered = readiness({
    ...input,
    riskRuleSet: { ...riskRuleSet, rules: [...riskRuleSet.rules].reverse() },
    policy: fixturePolicy({
      requiredRiskClasses: [...FINAL_DECISION_POLICY_V1.requiredRiskClasses].reverse(),
      requiredDomains: [...FINAL_DECISION_POLICY_V1.requiredDomains].reverse(),
    }),
  });
  assert.deepEqual(reordered, baseline);
  assert.deepEqual(baseline.requiredRiskClasses, [
    "HARD_BLOCKER",
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ]);
  assert.deepEqual(baseline.requiredDomains, [
    "LOCATION",
    "LEASE",
    "ECONOMIC",
    "SPACE",
    "ELECTRICAL",
    "WATER",
    "DRAINAGE",
    "EXHAUST",
    "DELIVERY",
    "EVIDENCE",
  ]);
  const v1First = v1Readiness(baseBundle());
  const v1Second = v1Readiness(baseBundle());
  assert.deepEqual({ ...v1First, candidateStoreId: null }, { ...v1Second, candidateStoreId: null });
});

test("24. readiness is JSON serializable and frozen", () => {
  const result = v1Readiness(baseBundle());
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.missingDomains), true);
});

// ---- boundary ----

test("25-31. createsVerdict/createsScore false, requiresHumanDecision true, no verdict/recommendation/riskScore/finalStatus", () => {
  for (const result of [v1Readiness(baseBundle()), completeReadiness(emptyBundle())]) {
    assert.equal(result.createsVerdict, false);
    assert.equal(result.createsScore, false);
    assert.equal(result.requiresHumanDecision, true);
    const keys = [...collectKeys(result)];
    for (const forbidden of ["verdict", "recommendation", "riskScore", "score", "finalStatus", "grade", "approval"]) {
      assert.equal(keys.includes(forbidden), false, forbidden);
    }
    assert.deepEqual(
      keys.filter((key) => /verdict|recommend|score|grade|^approv|finalstatus|contract/i.test(key)
        && !["createsVerdict", "createsScore", "readyForFinalVerdictEvaluation"].includes(key)),
      [],
    );
  }
});

test("32-33. no final-verdict values and no contract-decision phrases", () => {
  const forbiddenValue = /^(RECOMMEND|CONDITIONAL_RECOMMEND|HOLD|RISK)$/;
  const forbiddenPhrase = /조건부\s*추천|추천|보류|위험|계약\s*(가능|불가)|진행\s*가능|안전/;
  for (const value of [FINAL_DECISION_POLICY_V1, v1Readiness(baseBundle()), completeReadiness(emptyBundle())]) {
    for (const text of collectStrings(value)) {
      assert.equal(forbiddenValue.test(text), false, text);
      assert.equal(forbiddenPhrase.test(text), false, text);
    }
  }
});
