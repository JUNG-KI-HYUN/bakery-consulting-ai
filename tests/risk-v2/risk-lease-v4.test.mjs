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
  RISK_RULE_SET_V2,
  RISK_RULE_SET_V3,
  RISK_RULE_SET_V4,
  RISK_RULE_SET_V4_VERSION,
} = lib("lib/risk-v2/rule-registry.ts");
const {
  RISK_PREDICATE_REGISTRY_V1,
  RISK_PREDICATE_REGISTRY_V2,
  RISK_PREDICATE_REGISTRY_V3,
  RISK_PREDICATE_REGISTRY_V4,
} = lib("lib/risk-v2/predicates.ts");
const { evaluateRiskRules } = lib("lib/risk-v2/evaluate.ts");
const { buildRiskRegister } = lib("lib/risk-v2/risk-register.ts");
const {
  FINAL_DECISION_POLICY_V1,
  FINAL_DECISION_POLICY_V2,
  FINAL_DECISION_POLICY_V3,
  FINAL_DECISION_POLICY_V4,
  FINAL_DECISION_POLICY_V4_VERSION,
  buildFinalDecisionPolicyReadiness,
} = lib("lib/decision-v2/policy-readiness.ts");
const { buildCandidateDecisionEvidenceBundleV2 } =
  lib("lib/decision-evidence/candidate-bundle.ts");
const { createCandidateDecisionContextV2 } =
  lib("lib/decision-integration/create-context.ts");
const { CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION } =
  lib("lib/lease-decision/types.ts");
const { calculateEconomicFeasibility } =
  lib("lib/economic-feasibility/engine.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");

// Sample/demo fixtures only. No real candidate, customer, landlord, sales, or rent data.
const NOW = "2026-10-01T00:00:00.000Z";
const GENERATED_AT = "2026-10-01T05:00:00.000Z";
const SNAPSHOT_ID = "demo-lease-v4-snapshot";
const OBSERVED_AT = "2026-09-20T10:00:00+09:00";

const LEASE_RULE_IDS = Object.freeze([
  "LEASE.BUSINESS_USE_RESTRICTION_PRESENT",
  "LEASE.BAKERY_USE_REFUSED",
  "LEASE.EXHAUST_CONSENT_REFUSED",
  "LEASE.ELECTRICAL_UPGRADE_REFUSED",
  "LEASE.CONSTRUCTION_CONSENT_REFUSED",
]);
const EXPECTED = Object.freeze({
  "LEASE.BUSINESS_USE_RESTRICTION_PRESENT": {
    evidenceId:
      "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-condition-business-use-restriction",
    remediation: "EXPERT_REVIEW",
  },
  "LEASE.BAKERY_USE_REFUSED": {
    evidenceId:
      "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-consent-bakery-manufacturing-use",
    remediation: "NEGOTIATE",
  },
  "LEASE.EXHAUST_CONSENT_REFUSED": {
    evidenceId: "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-consent-exhaust",
    remediation: "NEGOTIATE",
  },
  "LEASE.ELECTRICAL_UPGRADE_REFUSED": {
    evidenceId:
      "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-consent-electrical-upgrade",
    remediation: "NEGOTIATE",
  },
  "LEASE.CONSTRUCTION_CONSENT_REFUSED": {
    evidenceId: "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-consent-construction",
    remediation: "NEGOTIATE",
  },
});

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

function evidence(overrides = {}) {
  return {
    verificationStatus: "UNKNOWN",
    sourceType: "OWNER_STATEMENT",
    confirmationRequirement: "DOCUMENT_REQUIRED",
    sourceRef: { opaqueSourceId: "demo-owner-statement-ref" },
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

const unknownValue = () => ({ status: "UNKNOWN", value: null, evidence: null });
const notConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null });
const directConsent = (status) => ({
  status,
  evidence: evidence(),
  consentAuthority: "DIRECT_AUTHORITY",
});
const unconfirmedConsent = () => ({
  status: "NOT_CONFIRMED",
  evidence: null,
  consentAuthority: "UNKNOWN",
});

function snapshot(candidateStoreId, states = {}) {
  const value = {
    schemaVersion: CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
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
      businessUseRestriction: {
        status: "NO_RESTRICTION_STATED",
        evidence: evidence(),
      },
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
      bakeryManufacturingUse: directConsent("GRANTED"),
      exhaust: directConsent("GRANTED"),
      electricalUpgrade: directConsent("GRANTED"),
      signage: unconfirmedConsent(),
      construction: directConsent("GRANTED"),
    },
    createsRisk: false,
    createsVerdict: false,
    createsScore: false,
  };
  if (states.businessUseRestriction) {
    value.contractConditions.businessUseRestriction = states.businessUseRestriction;
  }
  for (const key of [
    "bakeryManufacturingUse",
    "exhaust",
    "electricalUpgrade",
    "construction",
  ]) {
    if (states[key]) value.landlordConsents[key] = states[key];
  }
  return value;
}

function adverseStates() {
  return {
    businessUseRestriction: {
      status: "RESTRICTION_PRESENT",
      evidence: evidence(),
    },
    bakeryManufacturingUse: directConsent("REFUSED"),
    exhaust: directConsent("REFUSED"),
    electricalUpgrade: directConsent("REFUSED"),
    construction: directConsent("REFUSED"),
  };
}

function buildBundle({ states = {}, integration = "valid" } = {}) {
  const result = economicResult();
  const candidateStoreId = createCandidateStoreId();
  const contextOutcome = createCandidateDecisionContextV2({
    candidateStoreId,
    createdAt: NOW,
    economicBinding: {
      generatedAt: result.metadata.generatedAt,
      engineVersion: result.metadata.engineVersion,
    },
    candidateLeaseBinding:
      integration === "binding-absent" ? null : { snapshotId: SNAPSHOT_ID },
  });
  assert.equal(contextOutcome.ok, true, contextOutcome.message);

  let candidateLeaseSnapshot = snapshot(candidateStoreId, states);
  if (integration === "snapshot-absent") candidateLeaseSnapshot = null;
  if (integration === "candidate-mismatch") {
    candidateLeaseSnapshot.candidateStoreId = createCandidateStoreId();
  }
  if (integration === "snapshot-mismatch") {
    candidateLeaseSnapshot.snapshotId = "demo-lease-v4-other-snapshot";
  }
  if (integration === "invalid") candidateLeaseSnapshot.createsRisk = true;

  return buildCandidateDecisionEvidenceBundleV2({
    context: contextOutcome.value,
    generatedAt: GENERATED_AT,
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: result,
    candidateLeaseSnapshot,
  });
}

function evaluation(bundle, predicates = RISK_PREDICATE_REGISTRY_V4, ruleSet = RISK_RULE_SET_V4) {
  const outcome = evaluateRiskRules(
    { evidenceBundle: bundle, ruleSetVersion: ruleSet.ruleSetVersion },
    { ruleSet, predicates },
  );
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function leaseFindings(result) {
  return result.findings.filter((finding) => finding.domain === "LEASE");
}

function allEvidenceItems(bundle) {
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

test("1-7. V1/V2/V3 stay immutable; V4 contains exactly fifteen rules and five predicates", () => {
  assert.deepEqual(
    [RISK_RULE_SET_V1.rules.length, RISK_RULE_SET_V2.rules.length, RISK_RULE_SET_V3.rules.length],
    [8, 9, 10],
  );
  assert.equal(RISK_RULE_SET_V4.ruleSetVersion, RISK_RULE_SET_V4_VERSION);
  assert.equal(RISK_RULE_SET_V4.rules.length, 15);
  assert.deepEqual(RISK_RULE_SET_V4.rules.slice(0, 10), RISK_RULE_SET_V3.rules);
  assert.deepEqual(
    RISK_RULE_SET_V4.rules.slice(10).map((rule) => rule.ruleId),
    LEASE_RULE_IDS,
  );
  for (const value of [
    RISK_RULE_SET_V1,
    RISK_RULE_SET_V2,
    RISK_RULE_SET_V3,
    RISK_RULE_SET_V4,
    RISK_PREDICATE_REGISTRY_V1,
    RISK_PREDICATE_REGISTRY_V2,
    RISK_PREDICATE_REGISTRY_V3,
    RISK_PREDICATE_REGISTRY_V4,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  const v3Keys = Object.keys(RISK_PREDICATE_REGISTRY_V3);
  const v4Keys = Object.keys(RISK_PREDICATE_REGISTRY_V4);
  assert.equal(v4Keys.length, v3Keys.length + 5);
  for (const key of v3Keys) {
    assert.equal(RISK_PREDICATE_REGISTRY_V4[key], RISK_PREDICATE_REGISTRY_V3[key], key);
  }

  const rejected = evaluateRiskRules(
    {
      evidenceBundle: buildBundle({ states: adverseStates() }),
      ruleSetVersion: RISK_RULE_SET_V4_VERSION,
    },
    { ruleSet: RISK_RULE_SET_V4, predicates: RISK_PREDICATE_REGISTRY_V3 },
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /lease\./);
});

test("8-15. each typed adverse state triggers only its rule; all five aggregate uniquely", () => {
  const cases = [
    [
      "LEASE.BUSINESS_USE_RESTRICTION_PRESENT",
      {
        businessUseRestriction: {
          status: "RESTRICTION_PRESENT",
          evidence: evidence(),
        },
      },
    ],
    ["LEASE.BAKERY_USE_REFUSED", { bakeryManufacturingUse: directConsent("REFUSED") }],
    ["LEASE.EXHAUST_CONSENT_REFUSED", { exhaust: directConsent("REFUSED") }],
    [
      "LEASE.ELECTRICAL_UPGRADE_REFUSED",
      { electricalUpgrade: directConsent("REFUSED") },
    ],
    ["LEASE.CONSTRUCTION_CONSENT_REFUSED", { construction: directConsent("REFUSED") }],
  ];
  for (const [ruleId, states] of cases) {
    const findings = leaseFindings(evaluation(buildBundle({ states })));
    assert.equal(findings.length, 1, ruleId);
    assert.equal(findings[0].ruleId, ruleId);
    assert.deepEqual(findings[0].evidenceIds, [EXPECTED[ruleId].evidenceId]);
  }

  const findings = leaseFindings(evaluation(buildBundle({ states: adverseStates() })));
  assert.equal(findings.length, 5);
  assert.equal(new Set(findings.map((finding) => finding.ruleId)).size, 5);
  assert.equal(new Set(findings.map((finding) => finding.findingId)).size, 5);
  assert.deepEqual(
    findings.map((finding) => finding.ruleId).sort(),
    [...LEASE_RULE_IDS].sort(),
  );
});

test("16-21. clear and non-adverse statuses create no Lease finding", () => {
  assert.deepEqual(leaseFindings(evaluation(buildBundle())), []);
  for (const status of ["GRANTED", "NOT_CONFIRMED", "NOT_APPLICABLE"]) {
    const consent =
      status === "NOT_CONFIRMED"
        ? unconfirmedConsent()
        : status === "NOT_APPLICABLE"
          ? { status, evidence: evidence(), consentAuthority: "UNKNOWN" }
          : directConsent(status);
    for (const key of [
      "bakeryManufacturingUse",
      "exhaust",
      "electricalUpgrade",
      "construction",
    ]) {
      assert.deepEqual(
        leaseFindings(evaluation(buildBundle({ states: { [key]: consent } }))),
        [],
        `${key}:${status}`,
      );
    }
  }
  for (const status of [
    "NO_RESTRICTION_STATED",
    "NOT_CONFIRMED",
    "NOT_APPLICABLE",
  ]) {
    const restriction =
      status === "NOT_CONFIRMED"
        ? notConfirmed()
        : { status, evidence: evidence() };
    assert.deepEqual(
      leaseFindings(
        evaluation(buildBundle({ states: { businessUseRestriction: restriction } })),
      ),
      [],
      status,
    );
  }
});

test("22-25. all integration failures keep Candidate Lease null and create zero adverse Lease findings", () => {
  const expectedGaps = {
    "binding-absent": "candidate-lease-binding-absent",
    "snapshot-absent": "candidate-lease-snapshot-absent",
    "candidate-mismatch": "candidate-lease-candidate-store-mismatch",
    "snapshot-mismatch": "candidate-lease-snapshot-mismatch",
    invalid: "candidate-lease-snapshot-invalid",
  };
  for (const [integration, gapKey] of Object.entries(expectedGaps)) {
    const bundle = buildBundle({ states: adverseStates(), integration });
    assert.equal(bundle.domainEvidence.candidateLease, null, integration);
    assert.ok(
      bundle.missingInformation.some((item) => item.id.endsWith(`|${gapKey}`)),
      integration,
    );
    assert.deepEqual(leaseFindings(evaluation(bundle)), [], integration);
  }
});

test("26-28. rule requirement and typed predicate are both required", () => {
  const bundle = buildBundle({ states: { exhaust: directConsent("REFUSED") } });
  const ruleSetWithoutExactEvidence = structuredClone(RISK_RULE_SET_V4);
  const exhaustRule = ruleSetWithoutExactEvidence.rules.find(
    (rule) => rule.ruleId === "LEASE.EXHAUST_CONSENT_REFUSED",
  );
  exhaustRule.evidenceRequirements[0].evidenceId =
    "LEASE|OBSERVED_CONSTRAINT|LEASE|candidate-consent-signage";
  assert.equal(
    leaseFindings(
      evaluation(bundle, RISK_PREDICATE_REGISTRY_V4, ruleSetWithoutExactEvidence),
    ).some((finding) => finding.ruleId === "LEASE.EXHAUST_CONSENT_REFUSED"),
    false,
  );

  const typedFalse = structuredClone(bundle);
  typedFalse.domainEvidence.candidateLease.typedState.landlordConsents.exhaust.status =
    "GRANTED";
  assert.ok(
    typedFalse.observedConstraints.some(
      (item) => item.id === EXPECTED["LEASE.EXHAUST_CONSENT_REFUSED"].evidenceId,
    ),
  );
  assert.equal(
    leaseFindings(evaluation(typedFalse)).some(
      (finding) => finding.ruleId === "LEASE.EXHAUST_CONSENT_REFUSED",
    ),
    false,
  );
});

test("29-31. descriptions are irrelevant and every evidence link resolves exactly", () => {
  const originalBundle = buildBundle({ states: adverseStates() });
  const original = evaluation(originalBundle);
  const rewritten = structuredClone(originalBundle);
  for (const bucket of [
    "observedFacts",
    "observedConstraints",
    "missingInformation",
    "expertReviewItems",
    "geometryIssues",
  ]) {
    rewritten[bucket] = rewritten[bucket].map((item) => ({
      ...item,
      description: `rewritten-demo-${item.id}`,
    }));
    if (Array.isArray(rewritten.domainEvidence.candidateLease[bucket])) {
      rewritten.domainEvidence.candidateLease[bucket] =
        rewritten.domainEvidence.candidateLease[bucket].map((item) => ({
        ...item,
        description: `domain-rewritten-demo-${item.id}`,
        }));
    }
  }
  assert.deepEqual(leaseFindings(evaluation(rewritten)), leaseFindings(original));

  const present = new Set(allEvidenceItems(originalBundle).map((item) => item.id));
  for (const finding of leaseFindings(original)) {
    assert.deepEqual(finding.evidenceIds, [EXPECTED[finding.ruleId].evidenceId]);
    assert.equal(present.has(finding.evidenceIds[0]), true, finding.ruleId);
    assert.equal(finding.riskClass, "CONDITIONAL_BLOCKER");
    assert.equal(finding.severity, "HIGH");
    assert.equal(
      RISK_RULE_SET_V4.rules.find((rule) => rule.ruleId === finding.ruleId)
        .remediationType,
      EXPECTED[finding.ruleId].remediation,
    );
    assert.equal(finding.remediation.length, 1);
    assert.equal(finding.requiresHumanApproval, true);
  }
});

test("32-35. no Hard Blocker or duplicate gap; Economic V3 findings are preserved", () => {
  const bundle = buildBundle({ states: adverseStates() });
  const v3 = evaluation(bundle, RISK_PREDICATE_REGISTRY_V3, RISK_RULE_SET_V3);
  const v4 = evaluation(bundle);
  assert.deepEqual(
    v4.findings.filter((finding) => finding.domain === "ECONOMIC"),
    v3.findings.filter((finding) => finding.domain === "ECONOMIC"),
  );
  assert.equal(v4.findings.filter((finding) => finding.riskClass === "HARD_BLOCKER").length, 0);
  assert.equal(v4.unresolvedHardBlockerCount, 0);
  assert.equal(
    v4.findings.filter((finding) => finding.ruleId === "EVIDENCE.CORE_MISSING").length,
    1,
  );
  assert.equal(
    RISK_RULE_SET_V4.rules.filter((rule) => rule.riskClass === "HARD_BLOCKER").length,
    0,
  );
});

test("36-39. Policy V4 covers Lease but remains unready with expected gaps", () => {
  assert.deepEqual(
    [
      FINAL_DECISION_POLICY_V1.requiredRuleSetVersion,
      FINAL_DECISION_POLICY_V2.requiredRuleSetVersion,
      FINAL_DECISION_POLICY_V3.requiredRuleSetVersion,
    ],
    ["risk-rules-v1", "risk-rules-v2", "risk-rules-v3"],
  );
  assert.equal(FINAL_DECISION_POLICY_V4.policyVersion, FINAL_DECISION_POLICY_V4_VERSION);
  assert.equal(FINAL_DECISION_POLICY_V4.requiredRuleSetVersion, RISK_RULE_SET_V4_VERSION);
  assert.deepEqual(
    FINAL_DECISION_POLICY_V4.requiredRiskClasses,
    FINAL_DECISION_POLICY_V3.requiredRiskClasses,
  );
  assert.deepEqual(
    FINAL_DECISION_POLICY_V4.requiredDomains,
    FINAL_DECISION_POLICY_V3.requiredDomains,
  );

  const bundle = buildBundle({ states: adverseStates() });
  const result = evaluation(bundle);
  const register = buildRiskRegister({ evidenceBundle: bundle, evaluation: result });
  assert.equal(register.ok, true, register.message);
  const outcome = buildFinalDecisionPolicyReadiness({
    policy: FINAL_DECISION_POLICY_V4,
    riskRuleSet: RISK_RULE_SET_V4,
    evidenceBundle: bundle,
    riskRegister: register.value,
  });
  assert.equal(outcome.ok, true, outcome.message);
  const readiness = outcome.value;
  assert.deepEqual(readiness.coveredRiskClasses, [
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ]);
  assert.deepEqual(readiness.missingRiskClasses, ["HARD_BLOCKER"]);
  assert.deepEqual(readiness.coveredDomains, [
    "LEASE",
    "ECONOMIC",
    "ELECTRICAL",
    "WATER",
    "DRAINAGE",
    "EXHAUST",
    "DELIVERY",
    "EVIDENCE",
  ]);
  assert.deepEqual(readiness.missingDomains, ["LOCATION", "SPACE"]);
  assert.equal(readiness.ruleCoverageReady, false);
  assert.equal(readiness.readyForFinalVerdictEvaluation, false);
  assert.equal(readiness.createsVerdict, false);
  assert.equal(readiness.createsScore, false);
});

test("40. V4 evaluation is deterministic, input-pure, and leaks no Verdict or Score", () => {
  const bundle = buildBundle({ states: adverseStates() });
  const before = JSON.stringify(bundle);
  const first = evaluation(bundle);
  const second = evaluation(bundle);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(bundle), before);
  const keys = collectKeys(first);
  for (const key of [
    "verdict",
    "recommendation",
    "finalStatus",
    "riskScore",
    "score",
    "approved",
    "rejected",
  ]) {
    assert.equal(keys.has(key), false, key);
  }
  assert.equal(first.createsVerdict, false);
  assert.equal(first.createsScore, false);
});
