import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { economicV101Expected, economicV101SanityPlan } from "./fixtures/v1.0.1-sanity.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};
after(() => {
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const { calculateEconomicFeasibility, buildOfficialPerStoreBenchmark } = loadModule(
  path.join(repositoryRoot, "lib/economic-feasibility/engine.ts"),
);

function plan(overrides = {}) {
  const value = {
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
  return {
    ...value,
    ...overrides,
    salesScenario: { ...value.salesScenario, ...overrides.salesScenario },
    variableCostRates: { ...value.variableCostRates, ...overrides.variableCostRates },
    fixedMonthlyCosts: { ...value.fixedMonthlyCosts, ...overrides.fixedMonthlyCosts },
    rentPlanning: { ...value.rentPlanning, ...overrides.rentPlanning },
  };
}

function observation(sourceId, metric, value, unit, overrides = {}) {
  return {
    sourceId,
    referencePeriod: "2025-Q4",
    geographyType: "official_market",
    geographyId: "3110002",
    geographyName: "테스트 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    metric,
    value,
    unit,
    dataStatus: "available",
    ...overrides,
  };
}

function official(overrides = {}) {
  return {
    officialMarketCode: "3110002",
    officialMarketName: "테스트 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    quarterCode: "20254",
    referencePeriod: "2025-Q4",
    sales: [observation("SRC-SEOUL-SALES", "monthly_sales_amount", 120_000_000, "KRW")],
    stores: [observation("SRC-SEOUL-STORES", "store_count", 4, "count")],
    dataStatus: "available",
    ...overrides,
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

const confirmedRentalScope = {
  status: "CONFIRMED",
  officialAreaId: "3110002",
  selectedRecordIds: rental.selectedRecordIds,
  basis: "fixture에서 대상 표본과 공식상권 범위를 수동 대조함",
};

function calculate(planValue = plan(), officialValue = official(), rentalValue = rental, scopeValue = confirmedRentalScope) {
  return calculateEconomicFeasibility({
    plan: planValue,
    officialMarketData: officialValue,
    rentalMarketResult: rentalValue,
    rentalMarketScopeConfirmation: scopeValue,
    generatedAt: "2026-09-22T00:00:00.000Z",
  });
}

test("보수·기준·상향 월매출과 일매출은 사용자 입력 공식으로 계산한다", () => {
  const result = calculate();
  assert.equal(result.scenarios.conservative.monthlySales, 20_000_000);
  assert.equal(result.scenarios.base.monthlySales, 25_000_000);
  assert.equal(result.scenarios.upside.monthlySales, 30_000_000);
  assert.equal(result.scenarios.base.dailySales, 1_000_000);
});

test("변동비 각 항목과 합계, 고정비, 총비용을 계산한다", () => {
  const base = calculate().scenarios.base;
  assert.equal(base.materialCost, 7_500_000);
  assert.equal(base.packagingCost, 1_250_000);
  assert.equal(base.cardFee, 500_000);
  assert.equal(base.deliveryVariableCost, 750_000);
  assert.equal(base.otherVariableCost, 250_000);
  assert.equal(base.totalVariableCost, 10_250_000);
  assert.equal(base.totalFixedCost, 11_000_000);
  assert.equal(base.totalCost, 21_250_000);
});

test("영업이익과 주요 비용 비율을 계산한다", () => {
  const base = calculate().scenarios.base;
  assert.equal(base.estimatedOperatingProfit, 3_750_000);
  assert.equal(base.operatingMargin, 0.15);
  assert.equal(base.rentBurdenRate, 0.12);
  assert.equal(base.occupancyCostRate, 0.14);
  assert.equal(base.laborRate, 0.24);
  assert.equal(base.materialRate, 0.3);
  assert.equal(base.primeCostRate, 0.54);
});

test("BEP·일 BEP·필요 결제건수와 BASE 여유를 계산한다", () => {
  const result = calculate();
  assert.equal(result.bep.variableCostRate, 0.41000000000000003);
  assert.ok(Math.abs(result.bep.monthlyBepSales - (11_000_000 / 0.59)) < 0.001);
  assert.ok(Math.abs(result.bep.dailyBepSales - (11_000_000 / 0.59 / 25)) < 0.001);
  assert.ok(Math.abs(result.bep.requiredDailyTransactionsForBep - (11_000_000 / 0.59 / 25 / 10_000)) < 0.001);
  assert.ok(Math.abs(result.bep.baseBufferAmount - (25_000_000 - 11_000_000 / 0.59)) < 0.001);
  assert.ok(Math.abs(result.bep.baseBufferRate - result.bep.baseBufferAmount / 25_000_000) < 0.001);
});

test("객단가 0·영업일 0·공헌이익률 0 이하는 안전하게 계산하지 않는다", () => {
  const zeroTicket = calculate(plan({ expectedTicket: 0 }));
  assert.equal(zeroTicket.bep.requiredDailyTransactionsForBep, null);
  assert.ok(zeroTicket.validation.errors.some((message) => message.includes("객단가")));
  const zeroDays = calculate(plan({ operatingDaysPerMonth: 0 }));
  assert.equal(zeroDays.bep.dailyBepSales, null);
  assert.equal(zeroDays.scenarios.base.monthlySales, null);
  const noContribution = calculate(plan({ variableCostRates: { materialCostRate: 1 } }));
  assert.equal(noContribution.bep.monthlyBepSales, null);
  assert.ok(noContribution.validation.warnings.some((message) => message.includes("100%")));
});

test("사용자 목표부담률 기준 세 시나리오 월세상한을 계산한다", () => {
  const result = calculate();
  assert.equal(result.rentCeiling.conservativeRentCeiling, 2_000_000);
  assert.equal(result.rentCeiling.baseRentCeiling, 2_500_000);
  assert.equal(result.rentCeiling.upsideRentCeiling, 3_000_000);
});

test("BASE 민감도 6종은 각 충격만 독립 적용한다", () => {
  const result = calculate();
  const byKey = Object.fromEntries(result.stressTests.map((item) => [item.key, item]));
  assert.equal(byKey.SALES_MINUS_10.monthlySales, 22_500_000);
  assert.equal(byKey.SALES_MINUS_20.monthlySales, 20_000_000);
  assert.equal(byKey.MATERIAL_PLUS_5PP.estimatedOperatingProfit, 2_500_000);
  assert.equal(byKey.LABOR_PLUS_1M.estimatedOperatingProfit, 2_750_000);
  assert.equal(byKey.RENT_PLUS_1M.estimatedOperatingProfit, 2_750_000);
  assert.equal(byKey.TICKET_MINUS_1000.monthlySales, 22_500_000);
  assert.equal(byKey.TICKET_MINUS_1000.changedInput.currentValue, 9_000);
});

test("공식 SALES/STORES가 같은 상권·기간·업종일 때만 점포당 참고매출을 계산한다", () => {
  const benchmark = buildOfficialPerStoreBenchmark(official());
  assert.equal(benchmark.status, "AVAILABLE");
  assert.equal(benchmark.value, 30_000_000);
  assert.equal(benchmark.totalSales, 120_000_000);
  assert.equal(benchmark.storeCount, 4);
  assert.equal(benchmark.industry.code, "CS100005");
  assert.equal(benchmark.totalSalesLabel, "기준분기 공식상권 월 추정매출");
  assert.deepEqual(benchmark.sourceSemantics, {
    referencePeriodType: "QUARTER",
    salesValuePeriodType: "MONTH",
    salesSourceField: "THSMON_SELNG_AMT",
    storeCountSourceField: "STOR_CO",
  });
  assert.match(benchmark.limitation, /예상매출이 아니라/);
});

test("공식 상권·기간·업종 불일치와 점포수 0은 benchmark를 차단한다", () => {
  const areaMismatch = official({ sales: [observation("SRC-SEOUL-SALES", "monthly_sales_amount", 120_000_000, "KRW", { geographyId: "999" })] });
  const periodMismatch = official({ stores: [observation("SRC-SEOUL-STORES", "store_count", 4, "count", { referencePeriod: "2025-Q3" })] });
  const industryMismatch = official({ stores: [observation("SRC-SEOUL-STORES", "store_count", 4, "count", { industryCode: "CS100006" })] });
  const zeroStores = official({ stores: [observation("SRC-SEOUL-STORES", "store_count", 0, "count")] });
  for (const value of [areaMismatch, periodMismatch, industryMismatch, zeroStores]) {
    assert.equal(buildOfficialPerStoreBenchmark(value).status, "NOT_AVAILABLE");
    assert.equal(buildOfficialPerStoreBenchmark(value).value, null);
  }
});

test("Rental Market 중앙값과 계획 월세·BASE 상한의 수학적 관계만 제공한다", () => {
  const reference = calculate().rentalMarketReference;
  assert.equal(reference.sampleCount, 4);
  assert.equal(reference.medianRent, 2_400_000);
  assert.equal(reference.plannedRentToCeiling, "ABOVE");
  assert.equal(reference.medianRentToCeiling, "BELOW_OR_EQUAL");
  assert.match(reference.limitation, /시장 전체 평균.*아닙니다/);
});

test("Rental Market scope 근거가 없거나 현재 상권·표본과 다르면 자동 비교하지 않는다", () => {
  const missing = calculate(plan(), official(), rental, null).rentalMarketReference;
  assert.equal(missing.status, "NEEDS_CONFIRMATION");
  assert.equal(missing.scope.status, "NEEDS_CONFIRMATION");
  assert.equal(missing.sampleCount, 0);
  assert.equal(missing.medianRent, null);
  assert.equal(missing.minRent, null);
  assert.equal(missing.maxRent, null);
  assert.equal(missing.medianRentToCeiling, "NOT_AVAILABLE");
  assert.match(missing.scope.reason, /자동 비교하지 않습니다/);

  const wrongArea = calculate(plan(), official(), rental, { ...confirmedRentalScope, officialAreaId: "9999999" });
  assert.equal(wrongArea.rentalMarketReference.status, "NEEDS_CONFIRMATION");
  const wrongRecords = calculate(plan(), official(), rental, { ...confirmedRentalScope, selectedRecordIds: ["a"] });
  assert.equal(wrongRecords.rentalMarketReference.status, "NEEDS_CONFIRMATION");
  const noBasis = calculate(plan(), official(), rental, { ...confirmedRentalScope, basis: " " });
  assert.equal(noBasis.rentalMarketReference.status, "NEEDS_CONFIRMATION");
});

test("V1.0.1 deterministic sanity fixture의 손익·BEP·비율·상한·stress를 검산한다", () => {
  const result = calculate(economicV101SanityPlan);
  const expected = economicV101Expected;
  const close = (actual, wanted) => assert.ok(Math.abs(actual - wanted) < 1e-9, `${actual} !== ${wanted}`);
  assert.equal(result.scenarios.conservative.monthlySales, expected.monthlySales.conservative);
  assert.equal(result.scenarios.base.monthlySales, expected.monthlySales.base);
  assert.equal(result.scenarios.upside.monthlySales, expected.monthlySales.upside);
  assert.equal(result.scenarios.base.totalVariableCost, expected.baseTotalVariableCost);
  assert.equal(result.scenarios.base.totalFixedCost, expected.totalFixedCost);
  assert.equal(result.scenarios.base.estimatedOperatingProfit, expected.baseOperatingProfit);
  close(result.bep.monthlyBepSales, expected.monthlyBepSales);
  close(result.bep.dailyBepSales, expected.dailyBepSales);
  close(result.bep.requiredDailyTransactionsForBep, expected.requiredDailyTransactionsForBep);
  close(result.scenarios.base.rentBurdenRate, expected.ratios.rent);
  close(result.scenarios.base.occupancyCostRate, expected.ratios.occupancy);
  close(result.scenarios.base.laborRate, expected.ratios.labor);
  close(result.scenarios.base.materialRate, expected.ratios.material);
  close(result.scenarios.base.primeCostRate, expected.ratios.prime);
  assert.equal(result.rentCeiling.conservativeRentCeiling, expected.rentCeiling.conservative);
  assert.equal(result.rentCeiling.baseRentCeiling, expected.rentCeiling.base);
  assert.equal(result.rentCeiling.upsideRentCeiling, expected.rentCeiling.upside);
  close(result.bep.baseBufferAmount, expected.bepBufferAmount);
  const stress = Object.fromEntries(result.stressTests.map((item) => [item.key, item.estimatedOperatingProfit]));
  for (const [key, operatingProfit] of Object.entries(expected.stressOperatingProfit)) close(stress[key], operatingProfit);
});

test("provenance와 직렬화 가능한 단일 result를 제공하며 NaN·Infinity가 없다", () => {
  const result = calculate();
  assert.equal(result.schemaVersion, "frameone.economic-feasibility.v1");
  assert.equal(result.provenance.find((item) => item.field === "officialBenchmark.value").kind, "FRAMEONE_CALCULATION");
  assert.equal(result.provenance.find((item) => item.field === "scenarios").kind, "FRAMEONE_ESTIMATE");
  const json = JSON.stringify(result);
  assert.doesNotThrow(() => JSON.parse(json));
  assert.doesNotMatch(json, /NaN|Infinity/);
  const assertFiniteTree = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    else if (Array.isArray(value)) value.forEach(assertFiniteTree);
    else if (value && typeof value === "object") Object.values(value).forEach(assertFiniteTree);
  };
  assertFiniteTree(result);
  assertFiniteTree(calculate(economicV101SanityPlan));
  assertFiniteTree(calculate(plan({ expectedTicket: 0 })));
  assertFiniteTree(calculate(plan({ operatingDaysPerMonth: 0 })));
  assertFiniteTree(calculate(plan({ variableCostRates: { materialCostRate: 1 } })));
});

test("상담 UI는 engine result를 사용하고 필수 제한 문구를 표시한다", () => {
  const page = fs.readFileSync(path.join(repositoryRoot, "app/markets/economic-feasibility/EconomicFeasibilityClient.tsx"), "utf8");
  assert.match(page, /calculateEconomicFeasibility/);
  assert.match(page, /공식상권 제과점 점포당 참고매출/);
  assert.match(page, /민감도 분석/);
  assert.match(page, /후보점포 예상매출이 아니라 공식상권 참고지표입니다/);
  assert.match(page, /현재 임대 조사표본의 분석범위가 선택한 상권과 연결되지 않아 자동 비교하지 않습니다/);
  assert.match(page, /입력값 기준 추정/);
  assert.doesNotMatch(page, /적정 월세|안전한 월세|생존확률|성공확률/);
});
