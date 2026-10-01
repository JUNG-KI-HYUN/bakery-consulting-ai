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

const { calculateEconomicFeasibility } = loadModule(
  path.join(repositoryRoot, "lib/economic-feasibility/engine.ts"),
);
const { buildEconomicDecisionEvidence } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/economic-adapter.ts"),
);
const { decisionEvidenceCreatesNoVerdictScoreRisk } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/helpers.ts"),
);

const FORBIDDEN_PHRASE_PATTERN =
  /성공\s*가능|실패\s*가능|수익성\s*좋|수익성\s*나쁨|계약\s*가능|계약\s*불가|좋은\s*조건|나쁜\s*조건|위험\s*점포|(?<![가-힣])위험(?![가-힣])|추천|조건부\s*추천|보류|(?<![가-힣])안전(?![가-힣])/;

function plan() {
  return {
    expectedTicket: 10_000,
    operatingDaysPerMonth: 25,
    salesScenario: {
      conservativeDailyTransactions: 80,
      baseDailyTransactions: 100,
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

function official() {
  return {
    officialMarketCode: "3110002",
    officialMarketName: "테스트 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    quarterCode: "20254",
    referencePeriod: "2025-Q4",
    sales: [
      {
        sourceId: "SRC-SEOUL-SALES",
        referencePeriod: "2025-Q4",
        geographyType: "official_market",
        geographyId: "3110002",
        geographyName: "테스트 공식상권",
        industryCode: "CS100005",
        industryName: "제과점",
        metric: "monthly_sales_amount",
        value: 120_000_000,
        unit: "KRW",
        dataStatus: "available",
      },
    ],
    stores: [
      {
        sourceId: "SRC-SEOUL-STORES",
        referencePeriod: "2025-Q4",
        geographyType: "official_market",
        geographyId: "3110002",
        geographyName: "테스트 공식상권",
        industryCode: "CS100005",
        industryName: "제과점",
        metric: "store_count",
        value: 4,
        unit: "count",
        dataStatus: "available",
      },
    ],
    dataStatus: "available",
  };
}

const rental = {
  schemaVersion: "frameone.rental-market-analysis.v1",
  filters: {},
  sampleCount: 4,
  sampleSufficiency: "REFERENCE_ONLY",
  selectedRecordIds: ["a", "b", "c", "d"],
  sourceComposition: { ONLINE_LISTING: 4 },
  referenceDate: "2026-09-22",
  deposit: { sampleCount: 4, median: 50_000_000, min: 30_000_000, max: 80_000_000 },
  rent: { sampleCount: 4, median: 2_400_000, min: 2_000_000, max: 3_500_000 },
  managementFee: { sampleCount: 4, median: 200_000, min: 0, max: 500_000 },
  rentPerExclusivePyeong: { sampleCount: 4, median: 150_000, min: 100_000, max: 200_000 },
  priceHistory: [],
  limitations: ["fixture"],
};

function buildResult(overrides = {}) {
  return calculateEconomicFeasibility({
    plan: plan(),
    officialMarketData: official(),
    rentalMarketResult: rental,
    rentalMarketScopeConfirmation: {
      status: "CONFIRMED",
      officialAreaId: "3110002",
      selectedRecordIds: rental.selectedRecordIds,
      basis: "fixture",
    },
    generatedAt: "2026-09-23T10:00:00.000Z",
    ...overrides,
  });
}

function matchingBinding(result) {
  return {
    generatedAt: result.metadata.generatedAt,
    engineVersion: result.metadata.engineVersion,
  };
}

function allText(evidence) {
  return [
    ...evidence.observedFacts,
    ...evidence.missingInformation,
    ...evidence.expertReviewItems,
  ]
    .map((item) => `${item.title}\n${item.description}`)
    .join("\n");
}

test("1. builds Economic Evidence from a normal EconomicFeasibilityResult", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  assert.ok(evidence.observedFacts.length > 0);
  assert.ok(evidence.observedFacts.every((item) => item.sourceDomain === "ECONOMIC"));
  assert.equal(evidence.createsRisk, false);
});

test("2. conservative/base/upside projections use ESTIMATE nature", () => {
  // Scenario summary는 사용자 입력 가정 기반 projection → ESTIMATE.
  // 내부 operatingProfit 등은 산식 결과이나 이번 Phase에서 item 세분화하지 않는다.
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  for (const key of ["conservative", "base", "upside"]) {
    const item = evidence.observedFacts.find((entry) =>
      entry.id.includes(`scenario-${key}-projection`),
    );
    assert.ok(item, key);
    assert.equal(item.nature, "ESTIMATE");
    assert.match(item.description, new RegExp(`monthlySales=${result.scenarios[key].monthlySales}`));
  }
  assert.ok(
    evidence.referenceProvenance.some(
      (entry) =>
        entry.kind === "FRAMEONE_ESTIMATE" || entry.kind === "FRAMEONE_CALCULATION",
    ),
  );
});

test("3. BEP uses DERIVED_CALCULATION", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  const bep = evidence.observedFacts.find((item) => item.category === "BEP");
  assert.ok(bep);
  assert.equal(bep.nature, "DERIVED_CALCULATION");
  assert.match(bep.description, new RegExp(`monthlyBepSales=${result.bep.monthlyBepSales}`));
});

test("4. rent ceiling uses DERIVED_CALCULATION", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  const ceiling = evidence.observedFacts.find((item) =>
    item.id.includes("rent-ceiling-summary"),
  );
  assert.ok(ceiling);
  assert.equal(ceiling.nature, "DERIVED_CALCULATION");
  assert.match(
    ceiling.description,
    new RegExp(`baseRentCeiling=${result.rentCeiling.baseRentCeiling}`),
  );
});

test("5. official benchmark uses REFERENCE_SUMMARY", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  const benchmark = evidence.observedFacts.find((item) =>
    item.id.includes("official-benchmark"),
  );
  assert.ok(benchmark);
  assert.equal(benchmark.nature, "REFERENCE_SUMMARY");
  assert.doesNotMatch(benchmark.description, /달성할\s*수\s*있다/);
});

test("6. rental market reference uses REFERENCE_SUMMARY without Lease median duplication", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  const rentalRef = evidence.observedFacts.find((item) =>
    item.id.includes("rental-market-reference-usage"),
  );
  assert.ok(rentalRef);
  assert.equal(rentalRef.nature, "REFERENCE_SUMMARY");
  assert.match(rentalRef.description, /plannedRentToCeiling=/);
  assert.match(rentalRef.description, /목표 임대료 부담률 기준 계산값과의 관계/);
  assert.equal(
    evidence.observedFacts.some((item) => item.sourceDomain === "LEASE"),
    false,
  );
});

test("7. null economicBinding → MISSING_INFORMATION + INTEGRATION_STATE", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: null,
  });
  const unbound = evidence.missingInformation.find((item) =>
    item.id.includes("economic-binding-absent"),
  );
  assert.ok(unbound);
  assert.equal(unbound.nature, "INTEGRATION_STATE");
});

test("8. null economicResult → MISSING_INFORMATION + INTEGRATION_STATE", () => {
  const evidence = buildEconomicDecisionEvidence({
    economicResult: null,
    economicBinding: {
      generatedAt: "2026-09-23T10:00:00.000Z",
      engineVersion: "economic-feasibility-v1",
    },
  });
  const absent = evidence.missingInformation.find((item) =>
    item.id.includes("economic-result-absent"),
  );
  assert.ok(absent);
  assert.equal(absent.nature, "INTEGRATION_STATE");
  assert.equal(evidence.observedFacts.length, 0);
});

test("9. generatedAt mismatch → MISSING_INFORMATION + INTEGRATION_STATE", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: {
      generatedAt: "1999-01-01T00:00:00.000Z",
      engineVersion: result.metadata.engineVersion,
    },
  });
  const mismatch = evidence.missingInformation.find((item) =>
    item.id.includes("generated-at-mismatch"),
  );
  assert.ok(mismatch);
  assert.equal(mismatch.nature, "INTEGRATION_STATE");
});

test("10. engineVersion mismatch → MISSING_INFORMATION + INTEGRATION_STATE", () => {
  const result = buildResult();
  const evidenceMismatch = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: {
      generatedAt: result.metadata.generatedAt,
      engineVersion: "not-a-real-version",
    },
  });
  const mismatch = evidenceMismatch.missingInformation.find((item) =>
    item.id.includes("engine-version-mismatch"),
  );
  assert.ok(mismatch);
  assert.equal(mismatch.nature, "INTEGRATION_STATE");
});

test("11. null numeric values keep null semantics — no string \"null\", no coercion to 0", () => {
  const result = buildResult();
  const cloned = structuredClone(result);
  cloned.scenarios.base.monthlySales = null;
  cloned.bep.dailyBepSales = null;
  cloned.bep.monthlyBepSales = null;
  cloned.bep.variableCostRate = null;
  cloned.bep.contributionMarginRate = null;
  cloned.bep.requiredDailyTransactionsForBep = null;
  cloned.bep.baseBufferAmount = null;
  cloned.bep.baseBufferRate = null;
  cloned.rentCeiling.baseRentCeiling = null;
  cloned.rentCeiling.conservativeRentCeiling = null;
  cloned.rentCeiling.upsideRentCeiling = null;
  if (cloned.stressTests[0]) {
    cloned.stressTests[0].monthlySales = null;
    cloned.stressTests[0].estimatedOperatingProfit = null;
    cloned.stressTests[0].operatingProfitChange = null;
  }
  const evidence = buildEconomicDecisionEvidence({
    economicResult: cloned,
    economicBinding: matchingBinding(cloned),
  });
  const base = evidence.observedFacts.find((item) =>
    item.id.includes("scenario-base-projection"),
  );
  const bep = evidence.observedFacts.find((item) => item.category === "BEP");
  const ceiling = evidence.observedFacts.find((item) =>
    item.id.includes("rent-ceiling-summary"),
  );
  const stress = evidence.observedFacts.find((item) =>
    item.id.includes("stress-tests-summary"),
  );
  assert.match(base.description, /monthlySales=확인 필요/);
  assert.match(bep.description, /dailyBepSales=확인 필요/);
  assert.match(bep.description, /monthlyBepSales=확인 필요/);
  assert.match(ceiling.description, /baseRentCeiling=확인 필요/);
  assert.match(stress.description, /monthlySales=확인 필요/);
  assert.doesNotMatch(base.description, /monthlySales=0(?!\d)/);
  assert.doesNotMatch(bep.description, /dailyBepSales=0(?!\d)/);

  // structured metadata keeps actual JSON null, not string "null"
  assert.equal(evidence.referenceNullableNumbers["scenarios.base.monthlySales"], null);
  assert.equal(evidence.referenceNullableNumbers["bep.dailyBepSales"], null);
  assert.equal(evidence.referenceNullableNumbers["bep.monthlyBepSales"], null);
  assert.equal(evidence.referenceNullableNumbers["rentCeiling.baseRentCeiling"], null);
  assert.equal(
    evidence.referenceNullableNumbers[`stressTests.${cloned.stressTests[0].key}.monthlySales`],
    null,
  );

  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /:"null"/);
  assert.match(serialized, /"scenarios\.base\.monthlySales":null/);
  assert.equal(base.nature, "ESTIMATE");
  assert.equal(bep.nature, "DERIVED_CALCULATION");
});

test("12. provenance is preserved without FIELD enum mapping", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  assert.equal(evidence.referenceProvenance.length, result.provenance.length);
  assert.ok(evidence.referenceProvenance.length > 0);
  for (let index = 0; index < result.provenance.length; index += 1) {
    assert.equal(evidence.referenceProvenance[index].field, result.provenance[index].field);
    assert.equal(evidence.referenceProvenance[index].kind, result.provenance[index].kind);
  }
  assert.equal(
    evidence.observedFacts.every((item) => item.verificationStatus === undefined),
    true,
  );
});

test("13. limitations are preserved as referenceLimitations", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  assert.deepEqual(evidence.referenceLimitations, result.limitations);
  assert.equal(evidence.expertReviewItems.length, 0);
});

test("14. validation warnings/errors are preserved", () => {
  const result = buildResult();
  const cloned = structuredClone(result);
  cloned.validation = {
    errors: ["fixture-error"],
    warnings: ["fixture-warning"],
  };
  const evidence = buildEconomicDecisionEvidence({
    economicResult: cloned,
    economicBinding: matchingBinding(cloned),
  });
  assert.deepEqual(evidence.referenceValidation.errors, ["fixture-error"]);
  assert.deepEqual(evidence.referenceValidation.warnings, ["fixture-warning"]);
  assert.ok(
    evidence.missingInformation.some((item) => item.id.includes("validation-errors")),
  );
});

test("15. does not mutate economicResult or economicBinding", () => {
  const result = buildResult();
  const binding = matchingBinding(result);
  const resultSnapshot = structuredClone(result);
  const bindingSnapshot = structuredClone(binding);
  buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: binding,
  });
  assert.deepEqual(result, resultSnapshot);
  assert.deepEqual(binding, bindingSnapshot);
});

test("16. Economic Decision Evidence is JSON serializable", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  const json = JSON.stringify(evidence);
  const parsed = JSON.parse(json);
  assert.equal(parsed.createsRisk, false);
  assert.equal(parsed.observedFacts[0].sourceDomain, "ECONOMIC");
  assert.ok(Array.isArray(parsed.referenceProvenance));
  assert.equal(typeof parsed.referenceNullableNumbers, "object");
  assert.doesNotMatch(json, /:"null"/);
});

test("17. createsRisk / createsScore / createsVerdict are false", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  assert.equal(evidence.createsVerdict, false);
  assert.equal(evidence.createsScore, false);
  assert.equal(evidence.createsRisk, false);
  assert.equal(decisionEvidenceCreatesNoVerdictScoreRisk(evidence), true);
  assert.equal(evidence.observedConstraints, undefined);
});

test("18. forbids judgment phrases", () => {
  const result = buildResult();
  const cases = [
    buildEconomicDecisionEvidence({
      economicResult: result,
      economicBinding: matchingBinding(result),
    }),
    buildEconomicDecisionEvidence({
      economicResult: null,
      economicBinding: null,
    }),
    buildEconomicDecisionEvidence({
      economicResult: result,
      economicBinding: {
        generatedAt: "mismatch",
        engineVersion: "not-a-real-version",
      },
    }),
  ];
  for (const evidence of cases) {
    assert.doesNotMatch(allText(evidence), FORBIDDEN_PHRASE_PATTERN);
  }
});

// ---- typed rent planning reference (copied from engine output, no recalculation) ----

function planWithRent(rentMonthly) {
  const base = plan();
  return { ...base, fixedMonthlyCosts: { ...base.fixedMonthlyCosts, rentMonthly } };
}

function rentPlanningOf(result) {
  return buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  }).referenceRentPlanning;
}

test("19. referenceRentPlanning copies plannedRent / baseRentCeiling / plannedRentToCeiling (ABOVE) as typed values", () => {
  const result = buildResult();
  assert.equal(result.rentalMarketReference.plannedRentToCeiling, "ABOVE");
  const planning = rentPlanningOf(result);
  assert.deepEqual(Object.keys(planning).sort(), ["baseRentCeiling", "plannedRent", "plannedRentToCeiling"]);
  assert.equal(planning.plannedRent, result.rentalMarketReference.plannedRent);
  assert.equal(planning.baseRentCeiling, result.rentalMarketReference.baseRentCeiling);
  assert.equal(planning.plannedRentToCeiling, "ABOVE");
  assert.equal(typeof planning.plannedRent, "number");
  assert.equal(typeof planning.baseRentCeiling, "number");
  assert.equal(Object.isFrozen(planning), true);
});

test("20. BELOW_OR_EQUAL relation from the engine is preserved", () => {
  const result = buildResult({ plan: planWithRent(2_000_000) });
  assert.equal(result.rentalMarketReference.plannedRentToCeiling, "BELOW_OR_EQUAL");
  const planning = rentPlanningOf(result);
  assert.equal(planning.plannedRentToCeiling, "BELOW_OR_EQUAL");
  assert.equal(planning.plannedRent, result.rentalMarketReference.plannedRent);
  assert.equal(planning.baseRentCeiling, result.rentalMarketReference.baseRentCeiling);
});

test("21. NOT_AVAILABLE and baseRentCeiling null are kept as-is (not BELOW_OR_EQUAL, not 0, not false)", () => {
  const cloned = structuredClone(buildResult());
  cloned.rentalMarketReference.baseRentCeiling = null;
  cloned.rentalMarketReference.plannedRentToCeiling = "NOT_AVAILABLE";
  const planning = rentPlanningOf(cloned);
  assert.equal(planning.baseRentCeiling, null);
  assert.equal(planning.plannedRentToCeiling, "NOT_AVAILABLE");
  assert.notEqual(planning.baseRentCeiling, 0);
  assert.notEqual(planning.plannedRentToCeiling, "BELOW_OR_EQUAL");
  assert.equal(planning.plannedRent, cloned.rentalMarketReference.plannedRent);
  assert.doesNotMatch(JSON.stringify(planning), /"baseRentCeiling":(0|"null"|false)/);
});

test("22. typed values are readable without the description; null economicResult → referenceRentPlanning null", () => {
  const result = buildResult();
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  const withoutText = JSON.parse(JSON.stringify(evidence));
  for (const item of withoutText.observedFacts) item.description = "";
  assert.deepEqual(withoutText.referenceRentPlanning, {
    plannedRent: result.rentalMarketReference.plannedRent,
    baseRentCeiling: result.rentalMarketReference.baseRentCeiling,
    plannedRentToCeiling: result.rentalMarketReference.plannedRentToCeiling,
  });
  const absent = buildEconomicDecisionEvidence({ economicResult: null, economicBinding: null });
  assert.equal(absent.referenceRentPlanning, null);
});

test("23. rent planning reference: no mutation, JSON serializable, no Risk / Verdict / Score", () => {
  const result = buildResult();
  const snapshot = structuredClone(result);
  const evidence = buildEconomicDecisionEvidence({
    economicResult: result,
    economicBinding: matchingBinding(result),
  });
  assert.deepEqual(result, snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(evidence.referenceRentPlanning)), evidence.referenceRentPlanning);
  assert.equal(evidence.createsRisk, false);
  assert.equal(evidence.createsVerdict, false);
  assert.equal(evidence.createsScore, false);
  assert.equal(evidence.observedConstraints, undefined);
  for (const key of Object.keys(evidence.referenceRentPlanning)) {
    assert.doesNotMatch(key, /risk|verdict|score|recommend|approv/i);
  }
});
