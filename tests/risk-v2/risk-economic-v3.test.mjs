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
  RISK_RULE_SET_V1,
  RISK_RULE_SET_V1_VERSION,
  RISK_RULE_SET_V2,
  RISK_RULE_SET_V2_VERSION,
  RISK_RULE_SET_V3,
  RISK_RULE_SET_V3_VERSION,
} = lib("lib/risk-v2/rule-registry.ts");
const {
  ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY,
  ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY,
  RISK_PREDICATE_REGISTRY_V1,
  RISK_PREDICATE_REGISTRY_V2,
  RISK_PREDICATE_REGISTRY_V3,
} = lib("lib/risk-v2/predicates.ts");
const { evaluateRiskRules, REMEDIATION_TEXT } = lib("lib/risk-v2/evaluate.ts");
const { validateRiskRuleSet } = lib("lib/risk-v2/validation.ts");
const { buildRiskRegister } = lib("lib/risk-v2/risk-register.ts");
const {
  FINAL_DECISION_POLICY_V1,
  FINAL_DECISION_POLICY_V2,
  FINAL_DECISION_POLICY_V3,
  FINAL_DECISION_POLICY_V3_VERSION,
  buildFinalDecisionPolicyReadiness,
  validateFinalDecisionPolicy,
} = lib("lib/decision-v2/policy-readiness.ts");
const { calculateEconomicFeasibility } = lib("lib/economic-feasibility/engine.ts");
const { buildCandidateDecisionEvidenceBundle } = lib("lib/decision-evidence/candidate-bundle.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");

// ---- fixtures (sample/demo only; not real store, customer, sales, or rent data) ----

const NOW = "2026-10-01T00:00:00.000Z";
const RENT_RULE_ID = "ECONOMIC.RENT_ABOVE_BASE_CEILING";
const BEP_RULE_ID = "ECONOMIC.BASE_BELOW_BEP";
const RENT_EVIDENCE_ID = "ECONOMIC|OBSERVED_FACT|ECONOMIC|rental-market-reference-usage";
const ECONOMIC_RULE_IDS = new Set([RENT_RULE_ID, BEP_RULE_ID]);

function fixturePlan({ baseDailyTransactions, rentMonthly }) {
  return {
    expectedTicket: 10_000,
    operatingDaysPerMonth: 25,
    salesScenario: {
      conservativeDailyTransactions: Math.min(80, baseDailyTransactions),
      baseDailyTransactions,
      upsideDailyTransactions: 120,
    },
    variableCostRates: {
      materialCostRate: 0.3,
      packagingCostRate: 0.05,
      cardFeeRate: 0.02,
      deliveryVariableRate: 0.03,
      otherVariableRate: 0.01,
    },
    fixedMonthlyCosts: {
      laborMonthly: 6_000_000,
      rentMonthly,
      managementFeeMonthly: 500_000,
      utilitiesMonthly: 500_000,
      marketingMonthly: 200_000,
      posAccountingMonthly: 100_000,
      insuranceMonthly: 200_000,
      otherFixedMonthly: 300_000,
      deliveryFixedMonthly: 200_000,
    },
    rentPlanning: { targetRentBurdenRate: 0.1 },
  };
}

function fixtureOfficial() {
  const row = (sourceId, metric, value, unit) => ({
    sourceId,
    referencePeriod: "2025-Q4",
    geographyType: "official_market",
    geographyId: "fixture-market",
    geographyName: "fixture 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    metric,
    value,
    unit,
    dataStatus: "available",
  });
  return {
    officialMarketCode: "fixture-market",
    officialMarketName: "fixture 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    quarterCode: "20254",
    referencePeriod: "2025-Q4",
    sales: [row("FIXTURE-SALES", "monthly_sales_amount", 120_000_000, "KRW")],
    stores: [row("FIXTURE-STORES", "store_count", 4, "count")],
    dataStatus: "available",
  };
}

const FIXTURE_RENTAL = Object.freeze({
  schemaVersion: "frameone.rental-market-analysis.v1",
  filters: {},
  sampleCount: 4,
  sampleSufficiency: "REFERENCE_ONLY",
  selectedRecordIds: ["fixture-a", "fixture-b", "fixture-c", "fixture-d"],
  sourceComposition: { ONLINE_LISTING: 4 },
  referenceDate: "2026-09-22",
  deposit: { sampleCount: 4, median: 50_000_000, min: 30_000_000, max: 80_000_000 },
  rent: { sampleCount: 4, median: 2_400_000, min: 2_000_000, max: 3_500_000 },
  managementFee: { sampleCount: 4, median: 200_000, min: 0, max: 500_000 },
  rentPerExclusivePyeong: { sampleCount: 4, median: 150_000, min: 100_000, max: 200_000 },
  priceHistory: [],
  limitations: ["fixture"],
});

/** fixture scenarios; the engine's own relations are asserted in each test */
const SCENARIOS = Object.freeze({
  rentOnly: { baseDailyTransactions: 100, rentMonthly: 3_000_000 },
  both: { baseDailyTransactions: 60, rentMonthly: 3_000_000 },
  bepOnly: { baseDailyTransactions: 60, rentMonthly: 1_400_000 },
  neither: { baseDailyTransactions: 100, rentMonthly: 2_000_000 },
});

function economicResult(scenario, mutate) {
  const result = calculateEconomicFeasibility({
    plan: fixturePlan(scenario),
    officialMarketData: fixtureOfficial(),
    rentalMarketResult: structuredClone(FIXTURE_RENTAL),
    rentalMarketScopeConfirmation: {
      status: "CONFIRMED",
      officialAreaId: "fixture-market",
      selectedRecordIds: [...FIXTURE_RENTAL.selectedRecordIds],
      basis: "fixture",
    },
    generatedAt: "2026-09-23T10:00:00.000Z",
  });
  if (!mutate) return result;
  const cloned = structuredClone(result);
  mutate(cloned);
  return cloned;
}

/** binding: "match", "none", or "stale" */
function economicBundle(scenario, { binding = "match", mutate } = {}) {
  const result = economicResult(scenario, mutate);
  const economicBinding =
    binding === "none"
      ? null
      : {
          generatedAt: binding === "stale" ? "1999-01-01T00:00:00.000Z" : result.metadata.generatedAt,
          engineVersion: result.metadata.engineVersion,
        };
  const context = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: NOW,
    economicBinding,
  });
  assert.equal(context.ok, true, context.message);
  return buildCandidateDecisionEvidenceBundle({
    context: context.value,
    generatedAt: "2026-10-01T05:00:00.000Z",
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: result,
  });
}

function evaluate(bundle, ruleSet, predicates) {
  const outcome = evaluateRiskRules(
    { evidenceBundle: bundle, ruleSetVersion: ruleSet.ruleSetVersion },
    predicates ? { ruleSet, predicates } : { ruleSet },
  );
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

const evaluateV3 = (bundle) => evaluate(bundle, RISK_RULE_SET_V3, RISK_PREDICATE_REGISTRY_V3);
const evaluateV2 = (bundle) => evaluate(bundle, RISK_RULE_SET_V2, RISK_PREDICATE_REGISTRY_V2);
const findingsOf = (evaluation, ruleId) => evaluation.findings.filter((entry) => entry.ruleId === ruleId);
const economicFindings = (evaluation) => evaluation.findings.filter((entry) => ECONOMIC_RULE_IDS.has(entry.ruleId));
const rentPlanningOf = (bundle) => bundle.domainEvidence.economic.referenceRentPlanning;
const numbersOf = (bundle) => bundle.domainEvidence.economic.referenceNullableNumbers;

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

// ---- 1-8. version immutability ----

test("1-6. V1 = 8 (no Economic), V2 = 9 (BASE_BELOW_BEP only), V3 = 10 (+ RENT_ABOVE_BASE_CEILING)", () => {
  assert.equal(RISK_RULE_SET_V1.ruleSetVersion, "risk-rules-v1");
  assert.equal(RISK_RULE_SET_V1.rules.length, 8);
  assert.equal(RISK_RULE_SET_V1.rules.some((rule) => rule.domain === "ECONOMIC"), false);

  assert.equal(RISK_RULE_SET_V2.ruleSetVersion, "risk-rules-v2");
  assert.equal(RISK_RULE_SET_V2.rules.length, 9);
  assert.deepEqual(
    RISK_RULE_SET_V2.rules.filter((rule) => rule.domain === "ECONOMIC").map((rule) => rule.ruleId),
    [BEP_RULE_ID],
  );

  assert.equal(RISK_RULE_SET_V3_VERSION, "risk-rules-v3");
  assert.equal(RISK_RULE_SET_V3.ruleSetVersion, "risk-rules-v3");
  assert.equal(RISK_RULE_SET_V3.rules.length, 10);
  assert.deepEqual(RISK_RULE_SET_V3.rules.slice(0, 9), RISK_RULE_SET_V2.rules);
  const [added] = RISK_RULE_SET_V3.rules.slice(9);
  assert.equal(added.ruleId, RENT_RULE_ID);
  assert.equal(added.version, "1");
  assert.equal(added.domain, "ECONOMIC");
  assert.equal(added.riskClass, "ECONOMIC_STRESS");
  assert.equal(added.defaultSeverity, "HIGH");
  assert.equal(added.remediationType, "NEGOTIATE");
  assert.equal(added.requiresHumanApproval, false);
  assert.equal(RISK_RULE_SET_V3.rules.some((rule) => rule.riskClass === "HARD_BLOCKER"), false);
  assert.equal(validateRiskRuleSet(RISK_RULE_SET_V3).ok, true);
  for (const ruleSet of [RISK_RULE_SET_V1, RISK_RULE_SET_V2, RISK_RULE_SET_V3]) {
    assert.equal(Object.isFrozen(ruleSet), true);
    assert.equal(Object.isFrozen(ruleSet.rules), true);
  }
});

test("7. V1 / V2 rule sets and predicate registries are unchanged by V3", () => {
  const v1 = JSON.stringify(RISK_RULE_SET_V1);
  const v2 = JSON.stringify(RISK_RULE_SET_V2);
  assert.deepEqual(Object.keys(RISK_PREDICATE_REGISTRY_V1), []);
  assert.deepEqual(Object.keys(RISK_PREDICATE_REGISTRY_V2), [ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY]);
  assert.deepEqual(Object.keys(RISK_PREDICATE_REGISTRY_V3), [
    ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY,
    ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY,
  ]);
  assert.equal(ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY, "economic.plannedRentAboveBaseCeiling");
  assert.equal(RISK_PREDICATE_REGISTRY_V3[ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY], RISK_PREDICATE_REGISTRY_V2[ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY]);
  evaluateV3(economicBundle(SCENARIOS.both));
  assert.equal(JSON.stringify(RISK_RULE_SET_V1), v1);
  assert.equal(JSON.stringify(RISK_RULE_SET_V2), v2);
});

test("8. V1 / V2 evaluation results are unchanged (no rent finding outside V3)", () => {
  const bundle = economicBundle(SCENARIOS.both);
  const v1Before = evaluate(bundle, RISK_RULE_SET_V1);
  const v2Before = evaluateV2(bundle);
  evaluateV3(bundle);
  assert.deepEqual(evaluate(bundle, RISK_RULE_SET_V1), v1Before);
  assert.deepEqual(evaluateV2(bundle), v2Before);
  assert.equal(v1Before.ruleSetVersion, RISK_RULE_SET_V1_VERSION);
  assert.equal(v2Before.ruleSetVersion, RISK_RULE_SET_V2_VERSION);
  assert.equal(findingsOf(v1Before, RENT_RULE_ID).length, 0);
  assert.equal(findingsOf(v2Before, RENT_RULE_ID).length, 0);
  assert.equal(findingsOf(v2Before, BEP_RULE_ID).length, 1);
  assert.equal(v1Before.unresolvedEconomicStressCount, 0);
  assert.equal(v2Before.unresolvedEconomicStressCount, 1);
});

test("V3 rule set with the V2 predicate registry is rejected (unknown predicateKey)", () => {
  const outcome = evaluateRiskRules(
    { evidenceBundle: economicBundle(SCENARIOS.rentOnly), ruleSetVersion: RISK_RULE_SET_V3_VERSION },
    { ruleSet: RISK_RULE_SET_V3, predicates: RISK_PREDICATE_REGISTRY_V2 },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "INVALID_RISK_EVALUATION");
  assert.match(outcome.message, /economic\.plannedRentAboveBaseCeiling/);
});

// ---- 9-15. predicate ----

test("9 / 16-17. ABOVE → one ECONOMIC_STRESS finding linked to rental-market-reference-usage", () => {
  const bundle = economicBundle(SCENARIOS.rentOnly);
  assert.equal(rentPlanningOf(bundle).plannedRentToCeiling, "ABOVE");
  const evaluation = evaluateV3(bundle);
  const findings = findingsOf(evaluation, RENT_RULE_ID);
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.riskClass, "ECONOMIC_STRESS");
  assert.equal(finding.domain, "ECONOMIC");
  assert.equal(finding.severity, "HIGH");
  assert.equal(finding.resolutionStatus, "OPEN");
  assert.equal(finding.requiresHumanApproval, false);
  assert.deepEqual(finding.remediation, [REMEDIATION_TEXT.NEGOTIATE]);
  assert.deepEqual(finding.evidenceIds, [RENT_EVIDENCE_ID]);
  const item = bundle.observedFacts.find((entry) => entry.id === RENT_EVIDENCE_ID);
  assert.ok(item);
  assert.equal(item.sourceDomain, "ECONOMIC");
  assert.equal(item.bucket, "OBSERVED_FACT");
  assert.equal(item.category, "ECONOMIC");
  assert.equal(item.nature, "REFERENCE_SUMMARY");
});

test("10. BELOW_OR_EQUAL → 0", () => {
  const bundle = economicBundle(SCENARIOS.neither);
  assert.equal(rentPlanningOf(bundle).plannedRentToCeiling, "BELOW_OR_EQUAL");
  assert.equal(findingsOf(evaluateV3(bundle), RENT_RULE_ID).length, 0);
});

test("11. NOT_AVAILABLE (base ceiling null) → 0; values are kept as-is", () => {
  const bundle = economicBundle(SCENARIOS.rentOnly, {
    mutate: (result) => {
      result.rentalMarketReference.baseRentCeiling = null;
      result.rentalMarketReference.plannedRentToCeiling = "NOT_AVAILABLE";
    },
  });
  assert.equal(rentPlanningOf(bundle).plannedRentToCeiling, "NOT_AVAILABLE");
  assert.equal(rentPlanningOf(bundle).baseRentCeiling, null);
  assert.equal(findingsOf(evaluateV3(bundle), RENT_RULE_ID).length, 0);
});

test("12. referenceRentPlanning null → 0", () => {
  const bundle = economicBundle(SCENARIOS.rentOnly);
  const economic = bundle.domainEvidence.economic;
  const withoutPlanning = {
    ...bundle,
    domainEvidence: { ...bundle.domainEvidence, economic: { ...economic, referenceRentPlanning: null } },
  };
  assert.equal(findingsOf(evaluateV3(withoutPlanning), RENT_RULE_ID).length, 0);

  const context = createCandidateDecisionContext({ candidateStoreId: createCandidateStoreId(), createdAt: NOW });
  const noResult = buildCandidateDecisionEvidenceBundle({
    context: context.value,
    generatedAt: "2026-10-01T05:00:00.000Z",
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: null,
  });
  assert.equal(noResult.domainEvidence.economic.referenceRentPlanning, null);
  assert.equal(economicFindings(evaluateV3(noResult)).length, 0);
});

test("13. economic validation errors → 0 even when ABOVE", () => {
  const bundle = economicBundle(SCENARIOS.rentOnly, {
    mutate: (result) => {
      result.validation = { errors: ["fixture validation error"], warnings: [] };
    },
  });
  assert.equal(rentPlanningOf(bundle).plannedRentToCeiling, "ABOVE");
  assert.equal(bundle.domainEvidence.economic.referenceValidation.errors.length, 1);
  assert.equal(findingsOf(evaluateV3(bundle), RENT_RULE_ID).length, 0);
});

test("14-15. economic binding absent or mismatched → 0 even when ABOVE", () => {
  for (const binding of ["none", "stale"]) {
    const bundle = economicBundle(SCENARIOS.rentOnly, { binding });
    assert.equal(rentPlanningOf(bundle).plannedRentToCeiling, "ABOVE", binding);
    assert.ok(bundle.observedFacts.some((item) => item.id === RENT_EVIDENCE_ID), binding);
    assert.equal(findingsOf(evaluateV3(bundle), RENT_RULE_ID).length, 0, binding);
  }
});

test("18. changing or blanking descriptions does not change the result (typed metadata only)", () => {
  const rewrite = (bundle, description) => ({
    ...bundle,
    observedFacts: bundle.observedFacts.map((item) => ({ ...item, description })),
  });
  const above = economicBundle(SCENARIOS.rentOnly);
  const below = economicBundle(SCENARIOS.neither);
  for (const bundle of [above, below]) {
    const baseline = evaluateV3(bundle);
    for (const description of ["", "plannedRentToCeiling=BELOW_OR_EQUAL", "plannedRentToCeiling=ABOVE"]) {
      assert.deepEqual(evaluateV3(rewrite(bundle, description)), baseline, description);
    }
  }
});

// ---- 22-23. aggregate and individual cases ----

test("22. BASE_BELOW_BEP + RENT_ABOVE_BASE_CEILING both trigger → unresolvedEconomicStressCount 2", () => {
  const bundle = economicBundle(SCENARIOS.both);
  assert.ok(numbersOf(bundle)["scenarios.base.monthlySales"] < numbersOf(bundle)["bep.monthlyBepSales"]);
  assert.equal(rentPlanningOf(bundle).plannedRentToCeiling, "ABOVE");
  const evaluation = evaluateV3(bundle);
  const findings = economicFindings(evaluation);
  assert.equal(evaluation.unresolvedEconomicStressCount, 2);
  assert.deepEqual(findings.map((entry) => entry.ruleId).sort(), [BEP_RULE_ID, RENT_RULE_ID]);
  assert.equal(new Set(findings.map((entry) => entry.findingId)).size, 2);
  assert.ok(findings.every((entry) => entry.riskClass === "ECONOMIC_STRESS"));
  assert.equal(evaluation.unresolvedHardBlockerCount, 0);
  assert.equal(evaluation.createsVerdict, false);
  assert.equal(evaluation.createsScore, false);
});

test("23. BEP only → 1, rent only → 1, neither → 0", () => {
  const bepOnly = economicBundle(SCENARIOS.bepOnly);
  assert.ok(numbersOf(bepOnly)["scenarios.base.monthlySales"] < numbersOf(bepOnly)["bep.monthlyBepSales"]);
  assert.equal(rentPlanningOf(bepOnly).plannedRentToCeiling, "BELOW_OR_EQUAL");
  const bepEvaluation = evaluateV3(bepOnly);
  assert.equal(bepEvaluation.unresolvedEconomicStressCount, 1);
  assert.deepEqual(economicFindings(bepEvaluation).map((entry) => entry.ruleId), [BEP_RULE_ID]);

  const rentOnly = economicBundle(SCENARIOS.rentOnly);
  assert.ok(numbersOf(rentOnly)["scenarios.base.monthlySales"] > numbersOf(rentOnly)["bep.monthlyBepSales"]);
  const rentEvaluation = evaluateV3(rentOnly);
  assert.equal(rentEvaluation.unresolvedEconomicStressCount, 1);
  assert.deepEqual(economicFindings(rentEvaluation).map((entry) => entry.ruleId), [RENT_RULE_ID]);

  const neither = economicBundle(SCENARIOS.neither);
  assert.ok(numbersOf(neither)["scenarios.base.monthlySales"] > numbersOf(neither)["bep.monthlyBepSales"]);
  assert.equal(rentPlanningOf(neither).plannedRentToCeiling, "BELOW_OR_EQUAL");
  assert.equal(evaluateV3(neither).unresolvedEconomicStressCount, 0);
});

// ---- 24. Policy V3 ----

function readinessV3(bundle) {
  const register = buildRiskRegister({ evidenceBundle: bundle, evaluation: evaluateV3(bundle) });
  assert.equal(register.ok, true, register.message);
  const outcome = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V3,
    riskRuleSet: RISK_RULE_SET_V3,
    evidenceBundle: bundle,
    riskRegister: register.value,
  });
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

test("24. Policy V3: new snapshot; V1 / V2 unchanged; coverage gap unchanged; not ready even when review is ready", () => {
  assert.equal(validateFinalDecisionPolicy(FINAL_DECISION_POLICY_V3).ok, true);
  assert.equal(FINAL_DECISION_POLICY_V3_VERSION, "frameone-final-decision-policy-v3");
  assert.equal(FINAL_DECISION_POLICY_V3.policyVersion, FINAL_DECISION_POLICY_V3_VERSION);
  assert.equal(FINAL_DECISION_POLICY_V3.requiredRuleSetVersion, "risk-rules-v3");
  assert.deepEqual(FINAL_DECISION_POLICY_V3.requiredRiskClasses, FINAL_DECISION_POLICY_V2.requiredRiskClasses);
  assert.deepEqual(FINAL_DECISION_POLICY_V3.requiredDomains, FINAL_DECISION_POLICY_V2.requiredDomains);
  assert.equal(FINAL_DECISION_POLICY_V1.requiredRuleSetVersion, "risk-rules-v1");
  assert.equal(FINAL_DECISION_POLICY_V2.requiredRuleSetVersion, "risk-rules-v2");
  assert.equal(FINAL_DECISION_POLICY_V2.policyVersion, "frameone-final-decision-policy-v2");

  const withGaps = economicBundle(SCENARIOS.both);
  const reviewReadyBundle = { ...economicBundle(SCENARIOS.both), missingInformation: [] };
  for (const bundle of [withGaps, reviewReadyBundle]) {
    const result = readinessV3(bundle);
    assert.equal(result.policyVersion, FINAL_DECISION_POLICY_V3_VERSION);
    assert.equal(result.ruleSetVersion, "risk-rules-v3");
    assert.deepEqual(result.coveredRiskClasses, [
      "CONDITIONAL_BLOCKER",
      "ECONOMIC_STRESS",
      "EVIDENCE_GAP",
      "HUMAN_REVIEW_REQUIRED",
    ]);
    assert.deepEqual(result.missingRiskClasses, ["HARD_BLOCKER"]);
    assert.deepEqual(result.coveredDomains, ["ECONOMIC", "ELECTRICAL", "WATER", "DRAINAGE", "EXHAUST", "DELIVERY", "EVIDENCE"]);
    assert.deepEqual(result.missingDomains, ["LOCATION", "LEASE", "SPACE"]);
    assert.equal(result.ruleCoverageReady, false);
    assert.equal(result.readyForFinalVerdictEvaluation, false);
  }
  assert.equal(readinessV3(withGaps).reviewCompletenessReady, false);
  assert.equal(readinessV3(reviewReadyBundle).reviewCompletenessReady, true);
});

// ---- 25. boundary ----

test("25. no verdict / score fields and no final-verdict or contract-decision phrases", () => {
  const bundle = { ...economicBundle(SCENARIOS.both), missingInformation: [] };
  const evaluation = evaluateV3(bundle);
  const outputs = [RISK_RULE_SET_V3.rules.slice(9), evaluation, readinessV3(bundle), FINAL_DECISION_POLICY_V3];
  const forbiddenKeys = ["verdict", "recommendation", "finalStatus", "riskScore", "score", "grade", "approved", "contractAllowed"];
  const forbiddenPhrase = /조건부\s*추천|추천|보류|위험|계약\s*(가능|불가)|진행\s*가능|안전|사업\s*실패|수익\s*불가|^(RECOMMEND|CONDITIONAL_RECOMMEND|HOLD|RISK)$/;
  for (const value of outputs) {
    const keys = [...collectKeys(value)];
    for (const key of forbiddenKeys) assert.equal(keys.includes(key), false, key);
    for (const text of collectStrings(value)) assert.equal(forbiddenPhrase.test(text), false, text);
  }
});
