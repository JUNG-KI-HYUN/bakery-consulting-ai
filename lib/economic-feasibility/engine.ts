import type { MarketDataObservation } from "@/lib/market-data/types";
import type {
  EconomicFeasibilityEngineInput,
  EconomicFeasibilityResult,
  EconomicPlanInput,
  EconomicScenarioKey,
  EconomicScenarioResult,
  OfficialPerStoreBenchmark,
  StressTestResult,
} from "./types";

const SCENARIO_TRANSACTION_FIELDS: Record<EconomicScenarioKey, keyof EconomicPlanInput["salesScenario"]> = {
  conservative: "conservativeDailyTransactions",
  base: "baseDailyTransactions",
  upside: "upsideDailyTransactions",
};

function finiteNonnegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function safeRatio(numerator: number | null, denominator: number | null) {
  return numerator !== null && denominator !== null && denominator > 0
    ? numerator / denominator
    : null;
}

function sumIfValid(values: number[]) {
  return values.every(finiteNonnegative) ? values.reduce((sum, value) => sum + value, 0) : null;
}

function fixedCostValues(plan: EconomicPlanInput) {
  const fixed = plan.fixedMonthlyCosts;
  return [
    fixed.laborMonthly,
    fixed.rentMonthly,
    fixed.managementFeeMonthly,
    fixed.utilitiesMonthly,
    fixed.marketingMonthly,
    fixed.posAccountingMonthly,
    fixed.insuranceMonthly,
    fixed.otherFixedMonthly,
    fixed.deliveryFixedMonthly ?? 0,
  ];
}

function variableRateValues(plan: EconomicPlanInput) {
  const rates = plan.variableCostRates;
  return [
    rates.materialCostRate,
    rates.packagingCostRate,
    rates.cardFeeRate,
    rates.deliveryVariableRate,
    rates.otherVariableRate,
  ];
}

function calculateScenario(
  key: EconomicScenarioKey,
  plan: EconomicPlanInput,
  overrides: { expectedTicket?: number; dailyTransactions?: number } = {},
): EconomicScenarioResult {
  const expectedTicket = overrides.expectedTicket ?? plan.expectedTicket;
  const dailyTransactions = overrides.dailyTransactions
    ?? plan.salesScenario[SCENARIO_TRANSACTION_FIELDS[key]];
  const coreValid = expectedTicket > 0
    && Number.isFinite(expectedTicket)
    && plan.operatingDaysPerMonth > 0
    && Number.isFinite(plan.operatingDaysPerMonth)
    && finiteNonnegative(dailyTransactions);
  // V1 매출은 예측값이 아니라 사용자 입력 객단가 × 일 결제건수 × 월 영업일이다.
  const monthlySales = coreValid
    ? expectedTicket * dailyTransactions * plan.operatingDaysPerMonth
    : null;
  const rates = plan.variableCostRates;
  const ratesValid = variableRateValues(plan).every(finiteNonnegative);
  // 각 변동비 = 월매출 × 사용자가 입력한 해당 비율이며, 모든 변동비의 합이 총변동비다.
  const cost = (rate: number) => monthlySales !== null && ratesValid ? monthlySales * rate : null;
  const materialCost = cost(rates.materialCostRate);
  const packagingCost = cost(rates.packagingCostRate);
  const cardFee = cost(rates.cardFeeRate);
  const deliveryVariableCost = cost(rates.deliveryVariableRate);
  const otherVariableCost = cost(rates.otherVariableRate);
  const totalVariableCost = sumNullable([
    materialCost,
    packagingCost,
    cardFee,
    deliveryVariableCost,
    otherVariableCost,
  ]);
  const totalFixedCost = sumIfValid(fixedCostValues(plan));
  // 총비용 = 총변동비 + 월 고정비, 추정 영업이익 = 월매출 - 총비용이다.
  const totalCost = totalVariableCost !== null && totalFixedCost !== null
    ? totalVariableCost + totalFixedCost
    : null;
  const estimatedOperatingProfit = monthlySales !== null && totalCost !== null
    ? monthlySales - totalCost
    : null;

  return {
    key,
    dailyTransactions,
    monthlySales,
    dailySales: monthlySales !== null ? monthlySales / plan.operatingDaysPerMonth : null,
    materialCost,
    packagingCost,
    cardFee,
    deliveryVariableCost,
    otherVariableCost,
    totalVariableCost,
    totalFixedCost,
    totalCost,
    estimatedOperatingProfit,
    operatingMargin: safeRatio(estimatedOperatingProfit, monthlySales),
    rentBurdenRate: safeRatio(plan.fixedMonthlyCosts.rentMonthly, monthlySales),
    occupancyCostRate: safeRatio(
      plan.fixedMonthlyCosts.rentMonthly + plan.fixedMonthlyCosts.managementFeeMonthly,
      monthlySales,
    ),
    laborRate: safeRatio(plan.fixedMonthlyCosts.laborMonthly, monthlySales),
    materialRate: safeRatio(materialCost, monthlySales),
    primeCostRate: materialCost !== null
      ? safeRatio(materialCost + plan.fixedMonthlyCosts.laborMonthly, monthlySales)
      : null,
    rentCeilingByTargetRate: monthlySales !== null
      && finiteNonnegative(plan.rentPlanning.targetRentBurdenRate)
      && plan.rentPlanning.targetRentBurdenRate <= 1
      ? monthlySales * plan.rentPlanning.targetRentBurdenRate
      : null,
  };
}

function sumNullable(values: Array<number | null>) {
  return values.every((value): value is number => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function compatibleObservation(
  observation: MarketDataObservation | undefined,
  expected: { sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES"; metric: string; unit: "KRW" | "count"; area: string; period: string; industry: string },
) {
  return observation !== undefined
    && observation.sourceId === expected.sourceId
    && observation.metric === expected.metric
    && observation.unit === expected.unit
    && observation.dataStatus === "available"
    && observation.geographyType === "official_market"
    && observation.geographyId === expected.area
    && observation.referencePeriod === expected.period
    && observation.industryCode === expected.industry
    && observation.value !== null
    && Number.isFinite(observation.value);
}

export function buildOfficialPerStoreBenchmark(
  data: EconomicFeasibilityEngineInput["officialMarketData"],
): OfficialPerStoreBenchmark {
  const unavailableReasons: string[] = [];
  if (!data) unavailableReasons.push("공식 SALES/STORES 자료가 선택되지 않았습니다.");
  const sales = data?.sales.find((item) => item.metric === "monthly_sales_amount");
  const stores = data?.stores.find((item) => item.metric === "store_count");
  if (data) {
    const expected = { area: data.officialMarketCode, period: data.referencePeriod, industry: data.industryCode };
    if (data.industryCode !== "CS100005") {
      unavailableReasons.push("공식자료의 업종이 제과점(CS100005)이 아닙니다.");
    }
    if (data.quarterCode.replace(/^(\d{4})([1-4])$/, "$1-Q$2") !== data.referencePeriod) {
      unavailableReasons.push("공식자료의 분기 코드와 기준기간이 일치하지 않습니다.");
    }
    if (!compatibleObservation(sales, { ...expected, sourceId: "SRC-SEOUL-SALES", metric: "monthly_sales_amount", unit: "KRW" })) {
      unavailableReasons.push("SALES의 공식상권·기간·업종·단위 또는 공개상태가 호환되지 않습니다.");
    }
    if (!compatibleObservation(stores, { ...expected, sourceId: "SRC-SEOUL-STORES", metric: "store_count", unit: "count" })) {
      unavailableReasons.push("STORES의 공식상권·기간·업종·단위 또는 공개상태가 호환되지 않습니다.");
    }
    if (stores?.value !== null && stores?.value !== undefined && stores.value <= 0) {
      unavailableReasons.push("공식 점포 수가 0 이하이므로 나눗셈을 수행하지 않습니다.");
    }
    if (sales?.value !== null && sales?.value !== undefined && sales.value < 0) {
      unavailableReasons.push("공식 추정매출이 음수이므로 계산하지 않습니다.");
    }
  }
  const salesValue = sales?.value ?? null;
  const storeCount = stores?.value ?? null;
  const available = unavailableReasons.length === 0 && salesValue !== null && storeCount !== null;
  return {
    status: available ? "AVAILABLE" : "NOT_AVAILABLE",
    label: "공식상권 제과점 점포당 참고매출",
    source: ["서울시 상권분석서비스 추정매출", "서울시 상권분석서비스 점포"],
    officialAreaId: data?.officialMarketCode ?? null,
    officialAreaName: data?.officialMarketName ?? null,
    period: data?.referencePeriod ?? null,
    industry: { code: data?.industryCode ?? null, name: data?.industryName ?? null },
    totalSales: available ? salesValue : null,
    totalSalesLabel: "기준분기 공식상권 월 추정매출",
    storeCount: available ? storeCount : null,
    formula: "officialIndustrySales / officialIndustryStoreCount",
    value: available ? salesValue / storeCount : null,
    unit: "KRW_PER_STORE_MONTH",
    valueType: "FRAMEONE_CALCULATED_REFERENCE",
    limitation: "후보점포의 예상매출이 아니라, 동일 공식상권·동일 기간·동일 업종 통계를 점포수로 나눈 참고지표입니다.",
    unavailableReasons,
    sourceSemantics: {
      referencePeriodType: "QUARTER",
      salesValuePeriodType: "MONTH",
      salesSourceField: "THSMON_SELNG_AMT",
      storeCountSourceField: "STOR_CO",
    },
  };
}

function relation(value: number | null, ceiling: number | null) {
  if (value === null || ceiling === null) return "NOT_AVAILABLE" as const;
  return value <= ceiling ? "BELOW_OR_EQUAL" as const : "ABOVE" as const;
}

function validatePlan(plan: EconomicPlanInput) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(Number.isFinite(plan.expectedTicket) && plan.expectedTicket > 0)) errors.push("객단가는 0보다 커야 합니다.");
  if (!(Number.isFinite(plan.operatingDaysPerMonth) && plan.operatingDaysPerMonth > 0)) errors.push("월 영업일은 0보다 커야 합니다.");
  for (const [name, value] of Object.entries(plan.salesScenario)) {
    if (!finiteNonnegative(value)) errors.push(`${name}은(는) 0 이상의 숫자여야 합니다.`);
  }
  for (const [name, value] of [...Object.entries(plan.variableCostRates), ...Object.entries(plan.fixedMonthlyCosts)]) {
    if (value !== undefined && !finiteNonnegative(value)) errors.push(`${name}은(는) 0 이상의 숫자여야 합니다.`);
  }
  const target = plan.rentPlanning.targetRentBurdenRate;
  if (!(Number.isFinite(target) && target >= 0 && target <= 1)) errors.push("목표 월세부담률은 0% 이상 100% 이하로 입력해야 합니다.");
  const variableCostRate = sumIfValid(variableRateValues(plan));
  if (variableCostRate !== null && variableCostRate >= 1) warnings.push("총 변동비율이 100% 이상이므로 BEP를 계산할 수 없습니다.");
  return { errors, warnings };
}

function stressResult(
  key: StressTestResult["key"],
  label: string,
  field: string,
  previousValue: number,
  currentValue: number,
  scenario: EconomicScenarioResult,
  baseProfit: number | null,
): StressTestResult {
  return {
    key,
    label,
    changedInput: { field, previousValue, currentValue },
    monthlySales: scenario.monthlySales,
    estimatedOperatingProfit: scenario.estimatedOperatingProfit,
    operatingProfitChange: scenario.estimatedOperatingProfit !== null && baseProfit !== null
      ? scenario.estimatedOperatingProfit - baseProfit
      : null,
    operatingMargin: scenario.operatingMargin,
    rentBurdenRate: scenario.rentBurdenRate,
  };
}

export function calculateEconomicFeasibility(input: EconomicFeasibilityEngineInput): EconomicFeasibilityResult {
  const plan = structuredClone(input.plan);
  const validation = validatePlan(plan);
  const scenarios = {
    conservative: calculateScenario("conservative", plan),
    base: calculateScenario("base", plan),
    upside: calculateScenario("upside", plan),
  };
  const totalFixedCost = sumIfValid(fixedCostValues(plan));
  const variableCostRate = sumIfValid(variableRateValues(plan));
  const contributionMarginRate = variableCostRate !== null ? 1 - variableCostRate : null;
  // BEP = 월 고정비 / 공헌이익률. 공헌이익률이 0 이하이면 계산하지 않는다.
  const monthlyBepSales = totalFixedCost !== null && contributionMarginRate !== null && contributionMarginRate > 0
    ? totalFixedCost / contributionMarginRate
    : null;
  const dailyBepSales = monthlyBepSales !== null && plan.operatingDaysPerMonth > 0
    ? monthlyBepSales / plan.operatingDaysPerMonth
    : null;
  const requiredDailyTransactionsForBep = dailyBepSales !== null && plan.expectedTicket > 0
    ? dailyBepSales / plan.expectedTicket
    : null;
  const baseSales = scenarios.base.monthlySales;
  // BASE 여유는 기준 시나리오 월매출에서 월 BEP를 뺀 금액과 그 월매출 대비 비율이다.
  const baseBufferAmount = baseSales !== null && monthlyBepSales !== null ? baseSales - monthlyBepSales : null;
  const baseBufferRate = safeRatio(baseBufferAmount, baseSales);

  const baseTransactions = plan.salesScenario.baseDailyTransactions;
  const salesMinus10 = calculateScenario("base", plan, { dailyTransactions: baseTransactions * 0.9 });
  const salesMinus20 = calculateScenario("base", plan, { dailyTransactions: baseTransactions * 0.8 });
  const materialPlan = structuredClone(plan);
  materialPlan.variableCostRates.materialCostRate += 0.05;
  const laborPlan = structuredClone(plan);
  laborPlan.fixedMonthlyCosts.laborMonthly += 1_000_000;
  const rentPlan = structuredClone(plan);
  rentPlan.fixedMonthlyCosts.rentMonthly += 1_000_000;
  const ticketScenario = calculateScenario("base", plan, { expectedTicket: plan.expectedTicket - 1_000 });
  const baseProfit = scenarios.base.estimatedOperatingProfit;
  const stressTests = [
    stressResult("SALES_MINUS_10", "매출 -10%", "baseDailyTransactions", baseTransactions, baseTransactions * 0.9, salesMinus10, baseProfit),
    stressResult("SALES_MINUS_20", "매출 -20%", "baseDailyTransactions", baseTransactions, baseTransactions * 0.8, salesMinus20, baseProfit),
    stressResult("MATERIAL_PLUS_5PP", "원재료율 +5%p", "materialCostRate", plan.variableCostRates.materialCostRate, materialPlan.variableCostRates.materialCostRate, calculateScenario("base", materialPlan), baseProfit),
    stressResult("LABOR_PLUS_1M", "인건비 +100만원", "laborMonthly", plan.fixedMonthlyCosts.laborMonthly, laborPlan.fixedMonthlyCosts.laborMonthly, calculateScenario("base", laborPlan), baseProfit),
    stressResult("RENT_PLUS_1M", "월세 +100만원", "rentMonthly", plan.fixedMonthlyCosts.rentMonthly, rentPlan.fixedMonthlyCosts.rentMonthly, calculateScenario("base", rentPlan), baseProfit),
    stressResult("TICKET_MINUS_1000", "객단가 -1,000원", "expectedTicket", plan.expectedTicket, plan.expectedTicket - 1_000, ticketScenario, baseProfit),
  ];
  const officialBenchmark = buildOfficialPerStoreBenchmark(input.officialMarketData);
  const rental = input.rentalMarketResult;
  const baseRentCeiling = scenarios.base.rentCeilingByTargetRate;
  const scope = input.rentalMarketScopeConfirmation ?? null;
  const sameRecordScope = rental !== null && scope !== null
    && scope.selectedRecordIds.length === rental.selectedRecordIds.length
    && [...scope.selectedRecordIds].sort().every((recordId, index) => recordId === [...rental.selectedRecordIds].sort()[index]);
  const rentalScopeConfirmed = rental !== null
    && input.officialMarketData !== null
    && scope?.status === "CONFIRMED"
    && scope.officialAreaId === input.officialMarketData.officialMarketCode
    && scope.basis.trim().length > 0
    && sameRecordScope;
  const rentalHasComparableValues = rentalScopeConfirmed && rental.rent.median !== null;
  const rentalStatus = rental === null || rental.rent.median === null
    ? "NOT_AVAILABLE" as const
    : rentalScopeConfirmed ? "AVAILABLE" as const : "NEEDS_CONFIRMATION" as const;
  const rentalScopeReason = rental === null
    ? "임대 조사자료가 없습니다."
    : rentalScopeConfirmed
      ? "선택한 공식상권과 대상 임대표본의 범위가 명시적으로 확인되었습니다."
      : "현재 임대 조사표본의 분석범위가 선택한 상권과 연결되지 않아 자동 비교하지 않습니다.";
  const rentalMarketReference = {
    status: rentalStatus,
    label: "FRAMEONE 확인 표본" as const,
    scope: {
      status: rental === null ? "NOT_AVAILABLE" as const : rentalScopeConfirmed ? "CONFIRMED" as const : "NEEDS_CONFIRMATION" as const,
      officialAreaId: rentalScopeConfirmed ? scope.officialAreaId : null,
      basis: rentalScopeConfirmed ? scope.basis.trim() : null,
      selectedRecordIds: rentalScopeConfirmed ? [...scope.selectedRecordIds] : [],
      reason: rentalScopeReason,
    },
    sampleCount: rentalHasComparableValues ? rental.sampleCount : 0,
    sampleSufficiency: rentalHasComparableValues ? rental.sampleSufficiency : null,
    medianRent: rentalHasComparableValues ? rental.rent.median : null,
    minRent: rentalHasComparableValues ? rental.rent.min : null,
    maxRent: rentalHasComparableValues ? rental.rent.max : null,
    plannedRent: plan.fixedMonthlyCosts.rentMonthly,
    baseRentCeiling,
    plannedRentToCeiling: relation(plan.fixedMonthlyCosts.rentMonthly, baseRentCeiling),
    medianRentToCeiling: relation(rentalHasComparableValues ? rental.rent.median : null, baseRentCeiling),
    limitation: rentalScopeConfirmed
      ? "범위가 확인된 FRAMEONE 광고·확인자료 표본이며 시장 전체 평균 또는 실제 계약가격이 아닙니다."
      : rentalScopeReason,
  };

  return {
    schemaVersion: "frameone.economic-feasibility.v1",
    inputs: plan,
    officialBenchmark,
    rentalMarketReference,
    scenarios,
    bep: { variableCostRate, contributionMarginRate, monthlyBepSales, dailyBepSales, requiredDailyTransactionsForBep, baseBufferAmount, baseBufferRate },
    rentCeiling: {
      targetRentBurdenRate: plan.rentPlanning.targetRentBurdenRate,
      conservativeRentCeiling: scenarios.conservative.rentCeilingByTargetRate,
      baseRentCeiling,
      upsideRentCeiling: scenarios.upside.rentCeilingByTargetRate,
    },
    stressTests,
    validation,
    limitations: [
      "본 분석은 입력된 사업계획과 확인 가능한 공식·조사자료를 기반으로 한 참고용 추정치입니다.",
      "실제 매출과 수익은 입지, 제품구성, 운영시간, 인력, 원가, 계절성 등 여러 조건에 따라 달라질 수 있습니다.",
      "세무·노무·부가세·보험료 등은 사업형태와 고용조건에 따라 달라질 수 있으므로 세무사·노무사 등 전문가 확인이 필요합니다.",
      "보증금과 권리금은 월 고정비에 포함하지 않으며 초기투자비 회수는 계산하지 않습니다.",
    ],
    provenance: [
      { field: "officialBenchmark.sourceValues", kind: "OFFICIAL_DATA", basedOn: [], sourceIds: ["SRC-SEOUL-SALES", "SRC-SEOUL-STORES"] },
      { field: "officialBenchmark.value", kind: "FRAMEONE_CALCULATION", basedOn: ["OFFICIAL_DATA"], sourceIds: ["SRC-SEOUL-SALES", "SRC-SEOUL-STORES"] },
      { field: "rentalMarketReference", kind: rentalScopeConfirmed ? "FRAMEONE_RESEARCH" : "NEEDS_CONFIRMATION", basedOn: ["FRAMEONE_RESEARCH"] },
      { field: "inputs", kind: "USER_INPUT", basedOn: [] },
      { field: "scenarios", kind: "FRAMEONE_ESTIMATE", basedOn: ["USER_INPUT"] },
      { field: "bep", kind: "FRAMEONE_CALCULATION", basedOn: ["USER_INPUT"] },
      { field: "stressTests", kind: "FRAMEONE_CALCULATION", basedOn: ["USER_INPUT"] },
      { field: "taxLaborVatInsurance", kind: "NEEDS_CONFIRMATION", basedOn: ["USER_INPUT"] },
    ],
    metadata: {
      engineVersion: "economic-feasibility-v1",
      generatedAt: input.generatedAt,
      officialDataIncluded: officialBenchmark.status === "AVAILABLE",
      rentalMarketIncluded: rentalMarketReference.status === "AVAILABLE",
    },
  };
}
