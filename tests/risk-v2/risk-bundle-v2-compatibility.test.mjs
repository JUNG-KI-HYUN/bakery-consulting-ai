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
  RISK_RULE_SET_V3,
} = lib("lib/risk-v2/rule-registry.ts");
const {
  RISK_PREDICATE_REGISTRY_V1,
  RISK_PREDICATE_REGISTRY_V2,
  RISK_PREDICATE_REGISTRY_V3,
} = lib("lib/risk-v2/predicates.ts");
const { evaluateRiskRules } = lib("lib/risk-v2/evaluate.ts");
const { buildRiskRegister } = lib("lib/risk-v2/risk-register.ts");
const { buildDecisionReviewCompleteness } = lib("lib/risk-v2/decision-review.ts");
const {
  isSupportedCandidateEvidenceVersion,
  SUPPORTED_CANDIDATE_EVIDENCE_VERSIONS,
} = lib("lib/risk-v2/candidate-evidence-versions.ts");
const {
  FINAL_DECISION_POLICY_V1,
  buildFinalDecisionPolicyReadiness,
} = lib("lib/decision-v2/policy-readiness.ts");
const {
  buildCandidateDecisionEvidenceBundle,
  buildCandidateDecisionEvidenceBundleV2,
} = lib("lib/decision-evidence/candidate-bundle.ts");
const { createCandidateDecisionContext, createCandidateDecisionContextV2 } =
  lib("lib/decision-integration/create-context.ts");
const { CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION } = lib("lib/lease-decision/types.ts");
const { calculateEconomicFeasibility } = lib("lib/economic-feasibility/engine.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");

// ---- fixtures (sample/demo only; not real store, customer, landlord, sales, or rent data) ----

const NOW = "2026-10-01T00:00:00.000Z";
const GENERATED_AT = "2026-10-01T05:00:00.000Z";
const DEMO_SNAPSHOT_ID = "demo-lease-snapshot-001";
const DEMO_OBSERVED_AT = "2026-09-20T10:00:00+09:00";
const CORE_MISSING_RULE = "EVIDENCE.CORE_MISSING";
const BEP_RULE_ID = "ECONOMIC.BASE_BELOW_BEP";
const RENT_RULE_ID = "ECONOMIC.RENT_ABOVE_BASE_CEILING";
const BINDING_ABSENT_ID = "LEASE|MISSING_INFORMATION|LEASE|candidate-lease-binding-absent";
const MONTHLY_RENT_MISSING_ID = "LEASE|MISSING_INFORMATION|LEASE|candidate-term-monthly-rent";
const EXHAUST_MISSING_ID = "LEASE|MISSING_INFORMATION|LEASE|candidate-consent-exhaust";
const EXHAUST_REFUSED_ID = "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-consent-exhaust";
const BUSINESS_RESTRICTION_ID = "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-condition-business-use-restriction";
const KNOWN_RULE_IDS = new Set(RISK_RULE_SET_V3.rules.map((rule) => rule.ruleId));
const RULE_SET_SOURCE_BEFORE = fs.readFileSync(
  path.join(repositoryRoot, "lib/risk-v2/rule-registry.ts"),
  "utf8",
);
const PREDICATE_SOURCE_BEFORE = fs.readFileSync(
  path.join(repositoryRoot, "lib/risk-v2/predicates.ts"),
  "utf8",
);

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

function economicResult() {
  return calculateEconomicFeasibility({
    plan: {
      expectedTicket: 10_000,
      operatingDaysPerMonth: 25,
      salesScenario: {
        conservativeDailyTransactions: 60,
        baseDailyTransactions: 60,
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
    },
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
}

function demoEvidence(overrides = {}) {
  return {
    verificationStatus: "UNKNOWN",
    sourceType: "OWNER_STATEMENT",
    confirmationRequirement: "DOCUMENT_REQUIRED",
    sourceRef: { opaqueSourceId: "demo-interview-ref-001" },
    observedAt: DEMO_OBSERVED_AT,
    ...overrides,
  };
}

const unknownValue = () => ({ status: "UNKNOWN", value: null, evidence: null });
const notConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null });
const consentNotConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null, consentAuthority: "UNKNOWN" });
const directConsent = (status) => ({ status, evidence: demoEvidence(), consentAuthority: "DIRECT_AUTHORITY" });
const withEvidence = (status) => ({ status, evidence: demoEvidence() });

function minimalSnapshot(candidateStoreId) {
  return {
    schemaVersion: CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION,
    snapshotId: DEMO_SNAPSHOT_ID,
    candidateStoreId,
    capturedAt: GENERATED_AT,
    leaseTerms: {
      depositAmount: unknownValue(),
      monthlyRentAmount: unknownValue(),
      managementFeeAmount: unknownValue(),
      vatTreatment: notConfirmed(),
      premiumAmount: unknownValue(),
      premiumStatus: notConfirmed(),
      leaseTermMonths: unknownValue(),
      rentFreeMonths: unknownValue(),
      constructionPeriodDays: unknownValue(),
      handoverDate: unknownValue(),
    },
    contractConditions: {
      businessUseRestriction: notConfirmed(),
      subleaseRestriction: notConfirmed(),
      managementRegulation: notConfirmed(),
      restorationScope: notConfirmed(),
      repairResponsibility: notConfirmed(),
      permitFailureCondition: notConfirmed(),
      conditionPrecedent: notConfirmed(),
      specialClauseStatus: notConfirmed(),
      writtenConfirmationStatus: notConfirmed(),
      renewalCondition: notConfirmed(),
    },
    landlordConsents: {
      bakeryManufacturingUse: consentNotConfirmed(),
      exhaust: consentNotConfirmed(),
      electricalUpgrade: consentNotConfirmed(),
      signage: consentNotConfirmed(),
      construction: consentNotConfirmed(),
    },
    createsRisk: false,
    createsVerdict: false,
    createsScore: false,
  };
}

function pair({ binding = "snapshot", mutateSnapshot } = {}) {
  const result = economicResult();
  const candidateStoreId = createCandidateStoreId();
  const economicBinding = {
    generatedAt: result.metadata.generatedAt,
    engineVersion: result.metadata.engineVersion,
  };
  const shared = {
    candidateStoreId,
    createdAt: NOW,
    economicBinding,
  };
  const v1Context = createCandidateDecisionContext(shared);
  assert.equal(v1Context.ok, true, v1Context.message);
  const snapshot = binding === "absent" ? null : minimalSnapshot(candidateStoreId);
  if (snapshot && mutateSnapshot) mutateSnapshot(snapshot);
  const v2Context = createCandidateDecisionContextV2({
    ...shared,
    candidateLeaseBinding: binding === "absent" ? null : { snapshotId: DEMO_SNAPSHOT_ID },
  });
  assert.equal(v2Context.ok, true, v2Context.message);
  const input = {
    generatedAt: GENERATED_AT,
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: result,
  };
  return {
    candidateStoreId,
    v1: buildCandidateDecisionEvidenceBundle({ context: v1Context.value, ...input }),
    v2: buildCandidateDecisionEvidenceBundleV2({
      context: v2Context.value,
      ...input,
      candidateLeaseSnapshot: snapshot,
    }),
  };
}

function evaluate(bundle, ruleSet = RISK_RULE_SET_V1, predicates = RISK_PREDICATE_REGISTRY_V1) {
  const outcome = evaluateRiskRules(
    { evidenceBundle: bundle, ruleSetVersion: ruleSet.ruleSetVersion },
    { ruleSet, predicates },
  );
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function coreGap(evaluation) {
  const gaps = evaluation.findings.filter((entry) => entry.ruleId === CORE_MISSING_RULE);
  assert.equal(gaps.length, 1);
  return gaps[0];
}

function findingsOf(evaluation, ruleId) {
  return evaluation.findings.filter((entry) => entry.ruleId === ruleId);
}

function allItems(bundle) {
  return [
    ...bundle.observedFacts,
    ...bundle.observedConstraints,
    ...bundle.missingInformation,
    ...bundle.expertReviewItems,
    ...bundle.geometryIssues,
  ];
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

function assertNoVerdictOrScore(value) {
  assert.equal(value.createsVerdict, false);
  assert.equal(value.createsScore, false);
  const keys = collectKeys(value);
  for (const key of ["verdict", "recommendation", "finalStatus", "riskScore", "score", "approved", "rejected"]) {
    assert.equal(keys.has(key), false, key);
  }
}

function readinessOf(bundle, evaluation = evaluate(bundle)) {
  const register = buildRiskRegister({ evidenceBundle: bundle, evaluation });
  assert.equal(register.ok, true, register.message);
  const outcome = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V1,
    riskRuleSet: RISK_RULE_SET_V1,
    evidenceBundle: bundle,
    riskRegister: register.value,
  });
  assert.equal(outcome.ok, true, outcome.message);
  return { register: register.value, readiness: outcome.value };
}

const COVERAGE_KEYS = [
  "ruleCoverageReady",
  "requiredRiskClasses",
  "coveredRiskClasses",
  "missingRiskClasses",
  "requiredDomains",
  "coveredDomains",
  "missingDomains",
];

test("supported versions are exactly v1 and v2", () => {
  assert.deepEqual([...SUPPORTED_CANDIDATE_EVIDENCE_VERSIONS], [
    "candidate-decision-evidence-v1",
    "candidate-decision-evidence-v2",
  ]);
  assert.equal(isSupportedCandidateEvidenceVersion("candidate-decision-evidence-v1"), true);
  assert.equal(isSupportedCandidateEvidenceVersion("candidate-decision-evidence-v2"), true);
  for (const rejected of [
    "candidate-decision-evidence-v3",
    "candidate-decision-evidence-",
    "candidate-decision-evidence-v1-extra",
    "candidate-decision-evidence-v2 ",
    "unknown",
    "",
    undefined,
    null,
  ]) {
    assert.equal(isSupportedCandidateEvidenceVersion(rejected), false, String(rejected));
  }
  for (const relative of [
    "lib/risk-v2/candidate-evidence-versions.ts",
    "lib/risk-v2/evaluate.ts",
    "lib/risk-v2/risk-register.ts",
    "lib/decision-v2/policy-readiness.ts",
  ]) {
    const source = fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
    assert.equal(source.includes("startsWith("), false, relative);
    assert.equal(source.includes("candidateLease"), false, relative);
  }
});

test("1-4. Bundle V1 and V2 are accepted; v3, unknown, empty, and undefined are rejected", () => {
  const { v1, v2 } = pair();
  assert.equal(v1.schemaVersion, "candidate-decision-evidence-v1");
  assert.equal(v2.schemaVersion, "candidate-decision-evidence-v2");
  assert.equal(evaluate(v1).ruleSetVersion, RISK_RULE_SET_V1_VERSION);
  assert.equal(evaluate(v2).ruleSetVersion, RISK_RULE_SET_V1_VERSION);

  const accepted = evaluate(v1);
  for (const schemaVersion of [
    "candidate-decision-evidence-v3",
    "not-a-candidate-evidence-schema",
    "",
    undefined,
  ]) {
    const rejected = { ...v2, schemaVersion };
    const evaluation = evaluateRiskRules({
      evidenceBundle: rejected,
      ruleSetVersion: RISK_RULE_SET_V1_VERSION,
    });
    assert.equal(evaluation.ok, false, String(schemaVersion));
    assert.equal(evaluation.code, "INVALID_RISK_EVALUATION");
    assert.match(evaluation.message, /candidate-decision-evidence-v1/);
    assert.match(evaluation.message, /candidate-decision-evidence-v2/);

    const register = buildRiskRegister({ evidenceBundle: rejected, evaluation: accepted });
    assert.equal(register.ok, false, String(schemaVersion));
    assert.equal(register.code, "INVALID_RISK_REGISTER");

    const policy = buildFinalDecisionPolicyReadiness({
      policy: FINAL_DECISION_POLICY_V1,
      riskRuleSet: RISK_RULE_SET_V1,
      evidenceBundle: rejected,
      riskRegister: readinessOf(v1).register,
    });
    assert.equal(policy.ok, false, String(schemaVersion));
    assert.equal(policy.code, "INVALID_FINAL_DECISION_READINESS");
  }
});

test("5-7. RiskRuleSet V1, V2, and V3 stay unchanged and reproduce on Bundle V1", () => {
  assert.equal(RISK_RULE_SET_V1.rules.length, 8);
  assert.equal(RISK_RULE_SET_V2.rules.length, 9);
  assert.equal(RISK_RULE_SET_V3.rules.length, 10);
  assert.equal(RISK_RULE_SET_V1.rules.some((rule) => rule.domain === "LEASE" || rule.domain === "ECONOMIC"), false);
  assert.deepEqual(RISK_RULE_SET_V2.rules.slice(0, 8), RISK_RULE_SET_V1.rules);
  assert.deepEqual(RISK_RULE_SET_V3.rules.slice(0, 9), RISK_RULE_SET_V2.rules);
  const { v1 } = pair();
  const cases = [
    [RISK_RULE_SET_V1, RISK_PREDICATE_REGISTRY_V1, 0],
    [RISK_RULE_SET_V2, RISK_PREDICATE_REGISTRY_V2, 1],
    [RISK_RULE_SET_V3, RISK_PREDICATE_REGISTRY_V3, 2],
  ];
  for (const [ruleSet, predicates, economicCount] of cases) {
    const first = evaluate(v1, ruleSet, predicates);
    const second = evaluate(v1, ruleSet, predicates);
    assert.deepEqual(second, first);
    assert.equal(first.ruleSetVersion, ruleSet.ruleSetVersion);
    assert.equal(
      first.findings.filter((entry) => entry.riskClass === "ECONOMIC_STRESS").length,
      economicCount,
    );
  }
  assert.equal(fs.readFileSync(path.join(repositoryRoot, "lib/risk-v2/rule-registry.ts"), "utf8"), RULE_SET_SOURCE_BEFORE);
});

test("8. V2 missing lease binding is one EVIDENCE_GAP and includes the binding-absent id", () => {
  const { v1, v2 } = pair({ binding: "absent" });
  assert.equal(v2.domainEvidence.candidateLease, null);
  assert.ok(v2.missingInformation.some((item) => item.id === BINDING_ABSENT_ID));
  const v1Gap = coreGap(evaluate(v1));
  const v2Gap = coreGap(evaluate(v2));
  assert.equal(v2Gap.riskClass, "EVIDENCE_GAP");
  assert.equal(v2Gap.resolutionStatus, "NEEDS_CONFIRMATION");
  for (const id of v1Gap.evidenceIds) assert.ok(v2Gap.evidenceIds.includes(id), id);
  assert.ok(v2Gap.evidenceIds.includes(BINDING_ABSENT_ID));
  assert.notEqual(v2Gap.findingId, v1Gap.findingId);
  assert.deepEqual(
    v2Gap.evidenceIds.filter((id) => !v1Gap.evidenceIds.includes(id)),
    [BINDING_ABSENT_ID],
  );
});

test("9-10. unknown monthly rent and NOT_CONFIRMED exhaust consent stay inside the aggregated CORE gap", () => {
  const { v1, v2 } = pair();
  assert.ok(v2.missingInformation.some((item) => item.id === MONTHLY_RENT_MISSING_ID));
  assert.ok(v2.missingInformation.some((item) => item.id === EXHAUST_MISSING_ID));
  const v1Gap = coreGap(evaluate(v1));
  const gap = coreGap(evaluate(v2));
  assert.ok(gap.evidenceIds.includes(MONTHLY_RENT_MISSING_ID));
  assert.ok(gap.evidenceIds.includes(EXHAUST_MISSING_ID));
  for (const id of v1Gap.evidenceIds) assert.ok(gap.evidenceIds.includes(id), id);
  assert.ok(gap.evidenceIds.length > v1Gap.evidenceIds.length);
  assert.notEqual(gap.findingId, v1Gap.findingId);
});

test("11-12. confirmed REFUSED consent and business restriction do not create a lease rule or Hard Blocker", () => {
  const { v2 } = pair({
    mutateSnapshot(snapshot) {
      snapshot.landlordConsents.exhaust = directConsent("REFUSED");
      snapshot.contractConditions.businessUseRestriction = withEvidence("RESTRICTION_PRESENT");
    },
  });
  assert.ok(v2.observedConstraints.some((item) => item.id === EXHAUST_REFUSED_ID));
  assert.ok(v2.observedConstraints.some((item) => item.id === BUSINESS_RESTRICTION_ID));
  assert.equal(v2.missingInformation.some((item) => item.id === EXHAUST_MISSING_ID), false);
  const evaluation = evaluate(v2, RISK_RULE_SET_V3, RISK_PREDICATE_REGISTRY_V3);
  assert.equal(evaluation.unresolvedHardBlockerCount, 0);
  assert.equal(evaluation.findings.some((entry) => entry.riskClass === "HARD_BLOCKER"), false);
  for (const finding of evaluation.findings) assert.ok(KNOWN_RULE_IDS.has(finding.ruleId), finding.ruleId);
  const linked = new Set(evaluation.findings.flatMap((entry) => entry.evidenceIds));
  assert.equal(linked.has(EXHAUST_REFUSED_ID), false);
  assert.equal(linked.has(BUSINESS_RESTRICTION_ID), false);
});

test("13-14. V2 economic stress matches V1 and does not read candidateLease", () => {
  const { v1, v2 } = pair();
  assert.deepEqual(v2.domainEvidence.economic, v1.domainEvidence.economic);
  assert.deepEqual(v2.domainEvidence.lease, v1.domainEvidence.lease);
  assert.deepEqual(v2.domainEvidence.field, v1.domainEvidence.field);
  assert.deepEqual(v2.domainEvidence.location, v1.domainEvidence.location);
  assert.notEqual(v2.domainEvidence.candidateLease, null);
  const v1Bep = findingsOf(evaluate(v1, RISK_RULE_SET_V2, RISK_PREDICATE_REGISTRY_V2), BEP_RULE_ID);
  const v2Bep = findingsOf(evaluate(v2, RISK_RULE_SET_V2, RISK_PREDICATE_REGISTRY_V2), BEP_RULE_ID);
  assert.equal(v1Bep.length, 1);
  assert.deepEqual(v2Bep, v1Bep);
  assert.equal(v2Bep[0].riskClass, "ECONOMIC_STRESS");
  assert.equal(v2Bep[0].evidenceIds.every((id) => id.startsWith("ECONOMIC|")), true);

  const v1Rent = findingsOf(evaluate(v1, RISK_RULE_SET_V3, RISK_PREDICATE_REGISTRY_V3), RENT_RULE_ID);
  const v2Rent = findingsOf(evaluate(v2, RISK_RULE_SET_V3, RISK_PREDICATE_REGISTRY_V3), RENT_RULE_ID);
  assert.equal(v1Rent.length, 1);
  assert.deepEqual(v2Rent, v1Rent);
  assert.equal(v2Rent[0].riskClass, "ECONOMIC_STRESS");
  assert.equal(v2Rent[0].evidenceIds.every((id) => id.startsWith("ECONOMIC|")), true);
  assert.equal(fs.readFileSync(path.join(repositoryRoot, "lib/risk-v2/predicates.ts"), "utf8"), PREDICATE_SOURCE_BEFORE);
  assert.equal(PREDICATE_SOURCE_BEFORE.includes("candidateLease"), false);
});

test("15-17. no CORE missing yields no gap; multiple CORE ids stay one finding and all links resolve", () => {
  const { v2 } = pair();
  const coreIds = v2.missingInformation.filter((item) => item.importance === "CORE").map((item) => item.id).sort();
  assert.ok(coreIds.length > 1);
  const aggregated = evaluate(v2);
  const gap = coreGap(aggregated);
  assert.deepEqual(gap.evidenceIds, coreIds);
  const present = new Set(allItems(v2).map((item) => item.id));
  for (const finding of aggregated.findings) {
    for (const id of finding.evidenceIds) assert.equal(present.has(id), true, id);
  }

  const withoutCore = {
    ...v2,
    missingInformation: v2.missingInformation.filter((item) => item.importance !== "CORE"),
  };
  assert.equal(withoutCore.missingInformation.some((item) => item.importance === "CORE"), false);
  const cleared = evaluate(withoutCore);
  assert.equal(findingsOf(cleared, CORE_MISSING_RULE).length, 0);
});

test("18-20. Risk Register accepts V2, rejects a missing evidence link, and review completeness comes from that register", () => {
  const { v2 } = pair();
  const evaluation = evaluate(v2);
  const register = buildRiskRegister({ evidenceBundle: v2, evaluation });
  assert.equal(register.ok, true, register.message);
  assert.equal(register.value.candidateStoreId, v2.candidateStoreId);
  assert.equal(register.value.ruleSetVersion, evaluation.ruleSetVersion);
  assert.ok(register.value.entries.some((entry) => entry.evidenceIds.includes(MONTHLY_RENT_MISSING_ID)));
  const present = new Set(allItems(v2).map((item) => item.id));
  for (const entry of register.value.entries) {
    for (const id of entry.evidenceIds) assert.equal(present.has(id), true, id);
  }

  const broken = {
    ...evaluation,
    findings: evaluation.findings.map((finding, index) =>
      index === 0
        ? { ...finding, evidenceIds: ["LEASE|MISSING_INFORMATION|LEASE|not-in-bundle"] }
        : finding,
    ),
  };
  const rejected = buildRiskRegister({ evidenceBundle: v2, evaluation: broken });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "INVALID_RISK_REGISTER");
  assert.match(rejected.message, /not-in-bundle/);

  const review = buildDecisionReviewCompleteness(register.value);
  assert.equal(review.ok, true, review.message);
  const readiness = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V1,
    riskRuleSet: RISK_RULE_SET_V1,
    evidenceBundle: v2,
    riskRegister: register.value,
  });
  assert.equal(readiness.ok, true, readiness.message);
  assert.equal(readiness.value.candidateStoreId, review.value.candidateStoreId);
  assert.equal(readiness.value.ruleSetVersion, review.value.ruleSetVersion);
  assert.equal(readiness.value.evidenceReady, review.value.evidenceReady);
  assert.equal(readiness.value.expertReviewReady, review.value.expertReviewReady);
  assert.equal(readiness.value.reviewCompletenessReady, review.value.readyForHumanDecisionReview);
  const source = fs.readFileSync(path.join(repositoryRoot, "lib/decision-v2/policy-readiness.ts"), "utf8");
  assert.match(source, /buildDecisionReviewCompleteness\(input\.riskRegister\)/);
  assert.equal(source.includes("reviewCompleteness:"), false);
});

test("21-24. Policy Readiness accepts V2, keeps V1 coverage, and stays not ready for a final verdict", () => {
  const { v1, v2 } = pair();
  const left = readinessOf(v1);
  const right = readinessOf(v2);
  assert.equal(right.readiness.schemaVersion, left.readiness.schemaVersion);
  for (const key of COVERAGE_KEYS) assert.deepEqual(right.readiness[key], left.readiness[key], key);
  assert.equal(right.readiness.ruleCoverageReady, false);
  assert.ok(right.readiness.missingRiskClasses.includes("HARD_BLOCKER"));
  assert.ok(right.readiness.missingDomains.includes("LEASE"));
  assert.equal(right.readiness.readyForFinalVerdictEvaluation, false);
  assert.equal(
    right.readiness.readyForFinalVerdictEvaluation,
    right.readiness.ruleCoverageReady && right.readiness.reviewCompletenessReady,
  );
  assert.deepEqual(evaluate(v1), evaluate(v1));
});

test("25-28. V2 output is deterministic and input-pure, with no verdict or score", () => {
  const { v1, v2 } = pair();
  const beforeBundle = JSON.stringify(v2);
  const beforeRules = JSON.stringify(RISK_RULE_SET_V1);
  const raw = structuredClone(v2);
  assert.equal(Object.isFrozen(raw), false);
  const first = evaluate(raw);
  const second = evaluate(v2);
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(raw), false);
  assert.equal(JSON.stringify(raw), beforeBundle);
  assert.equal(JSON.stringify(v2), beforeBundle);
  assert.equal(JSON.stringify(RISK_RULE_SET_V1), beforeRules);
  assert.equal(first.ruleSetVersion, RISK_RULE_SET_V1_VERSION);
  for (const finding of first.findings) {
    assert.equal(typeof finding.findingId, "string");
    assert.ok(finding.evidenceIds.length > 0);
    assert.equal(typeof finding.resolutionStatus, "string");
  }
  assertNoVerdictOrScore(first);

  const beforeEvaluation = JSON.stringify(first);
  const register = buildRiskRegister({ evidenceBundle: raw, evaluation: structuredClone(first) });
  assert.equal(register.ok, true, register.message);
  assert.equal(JSON.stringify(raw), beforeBundle);
  assert.equal(JSON.stringify(first), beforeEvaluation);
  assertNoVerdictOrScore(register.value);

  const policy = buildFinalDecisionPolicyReadiness({
    policy: structuredClone(FINAL_DECISION_POLICY_V1),
    riskRuleSet: RISK_RULE_SET_V1,
    evidenceBundle: raw,
    riskRegister: structuredClone(register.value),
  });
  assert.equal(policy.ok, true, policy.message);
  assert.equal(JSON.stringify(raw), beforeBundle);
  assert.equal(Object.isFrozen(FINAL_DECISION_POLICY_V1), true);
  assertNoVerdictOrScore(policy.value);
  assert.equal(policy.value.requiresHumanDecision, true);
  assert.deepEqual(evaluate(v1), evaluate(v1));
});
