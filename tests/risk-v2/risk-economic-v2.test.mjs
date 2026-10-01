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
} = lib("lib/risk-v2/rule-registry.ts");
const {
  ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY,
  RISK_PREDICATE_REGISTRY_V1,
  RISK_PREDICATE_REGISTRY_V2,
} = lib("lib/risk-v2/predicates.ts");
const { evaluateRiskRules, REMEDIATION_TEXT } = lib("lib/risk-v2/evaluate.ts");
const { validateRiskRuleSet } = lib("lib/risk-v2/validation.ts");
const { buildRiskRegister } = lib("lib/risk-v2/risk-register.ts");
const { buildDecisionReviewCompleteness } = lib("lib/risk-v2/decision-review.ts");
const {
  FINAL_DECISION_POLICY_V1,
  FINAL_DECISION_POLICY_V2,
  FINAL_DECISION_POLICY_V2_VERSION,
  buildFinalDecisionPolicyReadiness,
  validateFinalDecisionPolicy,
} = lib("lib/decision-v2/policy-readiness.ts");
const { calculateEconomicFeasibility } = lib("lib/economic-feasibility/engine.ts");
const { buildCandidateDecisionEvidenceBundle } = lib("lib/decision-evidence/candidate-bundle.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");

// ---- fixtures (sample/demo only; not real store, customer, sales, or rent data) ----

const NOW = "2026-10-01T00:00:00.000Z";
const BASE_ID = "ECONOMIC|OBSERVED_FACT|ECONOMIC|scenario-base-projection";
const BEP_ID = "ECONOMIC|OBSERVED_FACT|BEP|bep-summary";
const RULE_ID = "ECONOMIC.BASE_BELOW_BEP";

function fixturePlan(baseDailyTransactions) {
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
      rentMonthly: 3_000_000,
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

/** real engine output; `mutate` edits a structuredClone (fixture-only edge cases) */
function economicResult({ baseDailyTransactions = 100, mutate } = {}) {
  const result = calculateEconomicFeasibility({
    plan: fixturePlan(baseDailyTransactions),
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

/** binding: "match" (economicBinding = result metadata), "none", or "stale" (different generatedAt) */
function economicBundle(options = {}, binding = "match") {
  const result = economicResult(options);
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

function evaluateV2(bundle) {
  const outcome = evaluateRiskRules(
    { evidenceBundle: bundle, ruleSetVersion: RISK_RULE_SET_V2_VERSION },
    { ruleSet: RISK_RULE_SET_V2, predicates: RISK_PREDICATE_REGISTRY_V2 },
  );
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function evaluateV1(bundle) {
  const outcome = evaluateRiskRules({ evidenceBundle: bundle, ruleSetVersion: RISK_RULE_SET_V1_VERSION });
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

const economicFindings = (evaluation) => evaluation.findings.filter((entry) => entry.ruleId === RULE_ID);
const numbersOf = (bundle) => bundle.domainEvidence.economic.referenceNullableNumbers;

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, strings));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, strings));
  return strings;
}

// ---- version immutability ----

test("V1 rule set is unchanged: 8 rules, no Economic rule; V2 = V1 rules + ECONOMIC.BASE_BELOW_BEP", () => {
  assert.equal(RISK_RULE_SET_V1.ruleSetVersion, "risk-rules-v1");
  assert.equal(RISK_RULE_SET_V1.rules.length, 8);
  assert.equal(RISK_RULE_SET_V1.rules.some((rule) => rule.domain === "ECONOMIC"), false);
  assert.equal(RISK_RULE_SET_V1.rules.some((rule) => rule.riskClass === "ECONOMIC_STRESS"), false);
  assert.equal(Object.isFrozen(RISK_RULE_SET_V1), true);
  assert.equal(Object.isFrozen(RISK_RULE_SET_V1.rules), true);

  assert.equal(RISK_RULE_SET_V2.ruleSetVersion, "risk-rules-v2");
  assert.equal(RISK_RULE_SET_V2_VERSION, "risk-rules-v2");
  assert.equal(RISK_RULE_SET_V2.rules.length, 9);
  assert.deepEqual(RISK_RULE_SET_V2.rules.slice(0, 8), RISK_RULE_SET_V1.rules);
  const added = RISK_RULE_SET_V2.rules.slice(8);
  assert.deepEqual(added.map((rule) => rule.ruleId), [RULE_ID]);
  assert.equal(added[0].domain, "ECONOMIC");
  assert.equal(added[0].riskClass, "ECONOMIC_STRESS");
  assert.equal(added[0].defaultSeverity, "HIGH");
  assert.equal(added[0].remediationType, "CHANGE_PLAN");
  assert.equal(RISK_RULE_SET_V2.rules.some((rule) => rule.riskClass === "HARD_BLOCKER"), false);
  assert.equal(validateRiskRuleSet(RISK_RULE_SET_V2).ok, true);
  assert.equal(Object.isFrozen(RISK_RULE_SET_V2.rules), true);
});

test("V1 predicate registry stays empty; V2 registry holds only the economic predicate", () => {
  assert.deepEqual(Object.keys(RISK_PREDICATE_REGISTRY_V1), []);
  assert.deepEqual(Object.keys(RISK_PREDICATE_REGISTRY_V2), [ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY]);
  assert.equal(ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY, "economic.baseBelowBep");
});

test("V1 evaluation is unchanged on an economic bundle and has no Economic finding", () => {
  const bundle = economicBundle({ baseDailyTransactions: 60 });
  const before = JSON.stringify(RISK_RULE_SET_V1);
  const defaultRun = evaluateV1(bundle);
  const explicitRun = evaluateRiskRules(
    { evidenceBundle: bundle, ruleSetVersion: RISK_RULE_SET_V1_VERSION },
    { ruleSet: RISK_RULE_SET_V1, predicates: RISK_PREDICATE_REGISTRY_V1 },
  );
  assert.equal(explicitRun.ok, true);
  assert.deepEqual(explicitRun.value, defaultRun);
  assert.equal(defaultRun.unresolvedEconomicStressCount, 0);
  assert.equal(defaultRun.findings.some((entry) => entry.domain === "ECONOMIC"), false);
  evaluateV2(bundle);
  assert.equal(JSON.stringify(RISK_RULE_SET_V1), before);
  assert.deepEqual(evaluateV1(bundle), defaultRun);
});

test("V2 rule set with the V1 predicate registry is rejected (unknown predicateKey)", () => {
  const outcome = evaluateRiskRules(
    { evidenceBundle: economicBundle(), ruleSetVersion: RISK_RULE_SET_V2_VERSION },
    { ruleSet: RISK_RULE_SET_V2 },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "INVALID_RISK_EVALUATION");
  assert.match(outcome.message, /economic\.baseBelowBep/);
});

// ---- BASE below BEP ----

test("base < BEP → one ECONOMIC_STRESS finding linked to base scenario and BEP evidence", () => {
  const bundle = economicBundle({ baseDailyTransactions: 60 });
  const numbers = numbersOf(bundle);
  assert.ok(numbers["scenarios.base.monthlySales"] < numbers["bep.monthlyBepSales"]);
  const evaluation = evaluateV2(bundle);
  const findings = economicFindings(evaluation);
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.riskClass, "ECONOMIC_STRESS");
  assert.equal(finding.domain, "ECONOMIC");
  assert.equal(finding.severity, "HIGH");
  assert.equal(finding.resolutionStatus, "OPEN");
  assert.equal(finding.requiresHumanApproval, false);
  assert.deepEqual(finding.remediation, [REMEDIATION_TEXT.CHANGE_PLAN]);
  assert.equal(REMEDIATION_TEXT.CHANGE_PLAN, "사업계획 또는 장비·공간 계획 조정 여부를 검토하세요.");
  assert.deepEqual(finding.evidenceIds, [BEP_ID, BASE_ID]);
  const ids = new Set([...bundle.observedFacts].map((item) => item.id));
  for (const id of finding.evidenceIds) assert.equal(ids.has(id), true, id);
  assert.equal(evaluation.unresolvedEconomicStressCount, 1);
});

test("base === BEP → 0 (equality does not trigger)", () => {
  const bundle = economicBundle({
    mutate: (result) => {
      result.bep.monthlyBepSales = result.scenarios.base.monthlySales;
    },
  });
  assert.equal(numbersOf(bundle)["scenarios.base.monthlySales"], numbersOf(bundle)["bep.monthlyBepSales"]);
  assert.equal(economicFindings(evaluateV2(bundle)).length, 0);
});

test("base > BEP → 0", () => {
  const bundle = economicBundle({ baseDailyTransactions: 100 });
  assert.ok(numbersOf(bundle)["scenarios.base.monthlySales"] > numbersOf(bundle)["bep.monthlyBepSales"]);
  assert.equal(economicFindings(evaluateV2(bundle)).length, 0);
});

test("base null or BEP null → 0 (null is not converted to 0)", () => {
  const baseNull = economicBundle({
    baseDailyTransactions: 60,
    mutate: (result) => {
      result.scenarios.base.monthlySales = null;
    },
  });
  const bepNull = economicBundle({
    baseDailyTransactions: 60,
    mutate: (result) => {
      result.bep.monthlyBepSales = null;
    },
  });
  assert.equal(numbersOf(baseNull)["scenarios.base.monthlySales"], null);
  assert.equal(numbersOf(bepNull)["bep.monthlyBepSales"], null);
  assert.equal(economicFindings(evaluateV2(baseNull)).length, 0);
  assert.equal(economicFindings(evaluateV2(bepNull)).length, 0);
});

test("economic validation errors → 0 even when base < BEP; existing missing evidence is kept", () => {
  const bundle = economicBundle({
    baseDailyTransactions: 60,
    mutate: (result) => {
      result.validation = { errors: ["fixture validation error"], warnings: [] };
    },
  });
  assert.ok(numbersOf(bundle)["scenarios.base.monthlySales"] < numbersOf(bundle)["bep.monthlyBepSales"]);
  assert.equal(bundle.domainEvidence.economic.referenceValidation.errors.length, 1);
  assert.ok(bundle.missingInformation.some((item) => item.id === "ECONOMIC|MISSING_INFORMATION|ECONOMIC|validation-errors"));
  const evaluation = evaluateV2(bundle);
  assert.equal(economicFindings(evaluation).length, 0);
  assert.equal(evaluation.unresolvedHardBlockerCount, 0);
});

test("economic binding absent or stale → 0 (numbers not bound to this candidate)", () => {
  for (const binding of ["none", "stale"]) {
    const bundle = economicBundle({ baseDailyTransactions: 60 }, binding);
    assert.ok(bundle.observedFacts.some((item) => item.id === BASE_ID), binding);
    assert.equal(economicFindings(evaluateV2(bundle)).length, 0, binding);
  }
});

// ---- aggregate / boundary ----

test("aggregate: Economic finding stays ECONOMIC_STRESS; no HARD_BLOCKER; no verdict/score", () => {
  const evaluation = evaluateV2(economicBundle({ baseDailyTransactions: 60 }));
  assert.equal(evaluation.unresolvedEconomicStressCount, 1);
  assert.equal(evaluation.unresolvedHardBlockerCount, 0);
  assert.equal(evaluation.findings.some((entry) => entry.riskClass === "HARD_BLOCKER"), false);
  assert.equal(evaluation.createsVerdict, false);
  assert.equal(evaluation.createsScore, false);
});

test("register keeps the Economic finding open; review readiness is not lowered by ECONOMIC_STRESS", () => {
  const bundle = economicBundle({ baseDailyTransactions: 60 });
  const evaluation = evaluateV2(bundle);
  const register = buildRiskRegister({ evidenceBundle: bundle, evaluation });
  assert.equal(register.ok, true, register.message);
  assert.equal(register.value.summary.unresolvedEconomicStress, 1);
  const review = buildDecisionReviewCompleteness(register.value);
  assert.equal(review.ok, true);
  const economicIds = economicFindings(evaluation).map((entry) => entry.findingId);
  assert.deepEqual(review.value.openEconomicStressFindingIds, economicIds);
  assert.equal(review.value.unresolvedEvidenceGapFindingIds.includes(economicIds[0]), false);
});

test("deterministic and input-pure", () => {
  const bundle = economicBundle({ baseDailyTransactions: 60 });
  const before = JSON.stringify(bundle);
  const first = evaluateV2(bundle);
  const second = evaluateV2(bundle);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(bundle), before);
});

test("no final-verdict, contract-decision, or business-outcome phrases in the rule or finding", () => {
  const forbidden = /조건부\s*추천|추천|보류|위험|계약\s*(가능|불가)|진행\s*가능|안전|사업\s*실패|수익\s*불가|영업\s*불가|^(RECOMMEND|CONDITIONAL_RECOMMEND|HOLD|RISK)$/;
  const evaluation = evaluateV2(economicBundle({ baseDailyTransactions: 60 }));
  for (const value of [RISK_RULE_SET_V2.rules.slice(8), economicFindings(evaluation)]) {
    for (const text of collectStrings(value)) assert.equal(forbidden.test(text), false, text);
  }
});

// ---- Final Decision Policy V2 coverage ----

test("Policy V2 snapshot: same requirements as V1, new version, risk-rules-v2; V1 policy unchanged", () => {
  assert.equal(validateFinalDecisionPolicy(FINAL_DECISION_POLICY_V2).ok, true);
  assert.equal(FINAL_DECISION_POLICY_V2.policyVersion, FINAL_DECISION_POLICY_V2_VERSION);
  assert.equal(FINAL_DECISION_POLICY_V2_VERSION, "frameone-final-decision-policy-v2");
  assert.equal(FINAL_DECISION_POLICY_V2.requiredRuleSetVersion, "risk-rules-v2");
  assert.deepEqual(FINAL_DECISION_POLICY_V2.requiredRiskClasses, FINAL_DECISION_POLICY_V1.requiredRiskClasses);
  assert.deepEqual(FINAL_DECISION_POLICY_V2.requiredDomains, FINAL_DECISION_POLICY_V1.requiredDomains);
  assert.equal(FINAL_DECISION_POLICY_V1.policyVersion, "frameone-final-decision-policy-v1");
  assert.equal(FINAL_DECISION_POLICY_V1.requiredRuleSetVersion, "risk-rules-v1");
});

test("Policy V2 readiness: ECONOMIC_STRESS / ECONOMIC covered; HARD_BLOCKER, LOCATION, LEASE, SPACE still missing → not ready", () => {
  const bundle = economicBundle({ baseDailyTransactions: 60 });
  const register = buildRiskRegister({ evidenceBundle: bundle, evaluation: evaluateV2(bundle) });
  assert.equal(register.ok, true, register.message);
  const outcome = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V2,
    riskRuleSet: RISK_RULE_SET_V2,
    evidenceBundle: bundle,
    riskRegister: register.value,
  });
  assert.equal(outcome.ok, true, outcome.message);
  const result = outcome.value;
  assert.deepEqual(result.coveredRiskClasses, [
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ]);
  assert.deepEqual(result.missingRiskClasses, ["HARD_BLOCKER"]);
  assert.ok(result.coveredDomains.includes("ECONOMIC"));
  assert.deepEqual(result.missingDomains, ["LOCATION", "LEASE", "SPACE"]);
  assert.equal(result.ruleCoverageReady, false);
  assert.equal(result.readyForFinalVerdictEvaluation, false);
  assert.equal(result.createsVerdict, false);
  assert.equal(result.createsScore, false);

  const v1Bundle = economicBundle({ baseDailyTransactions: 60 });
  const v1Register = buildRiskRegister({ evidenceBundle: v1Bundle, evaluation: evaluateV1(v1Bundle) });
  const v1 = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V1,
    riskRuleSet: RISK_RULE_SET_V1,
    evidenceBundle: v1Bundle,
    riskRegister: v1Register.value,
  });
  assert.equal(v1.ok, true, v1.message);
  assert.deepEqual(v1.value.missingRiskClasses, ["HARD_BLOCKER", "ECONOMIC_STRESS"]);
  assert.deepEqual(v1.value.missingDomains, ["LOCATION", "LEASE", "ECONOMIC", "SPACE"]);
});
