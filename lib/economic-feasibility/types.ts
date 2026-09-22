import type { BakeryOfficialMarketData } from "@/lib/market-data/services/bakery-official-market";
import type { RentalMarketResult } from "@/lib/research/types";

export type EconomicScenarioKey = "conservative" | "base" | "upside";

export type ProvenanceKind =
  | "OFFICIAL_DATA"
  | "FRAMEONE_RESEARCH"
  | "USER_INPUT"
  | "FRAMEONE_CALCULATION"
  | "FRAMEONE_ESTIMATE"
  | "NEEDS_CONFIRMATION";

export interface EconomicPlanInput {
  expectedTicket: number;
  operatingDaysPerMonth: number;
  salesScenario: {
    conservativeDailyTransactions: number;
    baseDailyTransactions: number;
    upsideDailyTransactions: number;
  };
  variableCostRates: {
    materialCostRate: number;
    packagingCostRate: number;
    cardFeeRate: number;
    deliveryVariableRate: number;
    otherVariableRate: number;
  };
  fixedMonthlyCosts: {
    laborMonthly: number;
    rentMonthly: number;
    managementFeeMonthly: number;
    utilitiesMonthly: number;
    marketingMonthly: number;
    posAccountingMonthly: number;
    insuranceMonthly: number;
    otherFixedMonthly: number;
    deliveryFixedMonthly?: number;
  };
  rentPlanning: {
    targetRentBurdenRate: number;
  };
}

export interface EconomicScenarioResult {
  key: EconomicScenarioKey;
  dailyTransactions: number;
  monthlySales: number | null;
  dailySales: number | null;
  materialCost: number | null;
  packagingCost: number | null;
  cardFee: number | null;
  deliveryVariableCost: number | null;
  otherVariableCost: number | null;
  totalVariableCost: number | null;
  totalFixedCost: number | null;
  totalCost: number | null;
  estimatedOperatingProfit: number | null;
  operatingMargin: number | null;
  rentBurdenRate: number | null;
  occupancyCostRate: number | null;
  laborRate: number | null;
  materialRate: number | null;
  primeCostRate: number | null;
  rentCeilingByTargetRate: number | null;
}

export interface OfficialPerStoreBenchmark {
  status: "AVAILABLE" | "NOT_AVAILABLE";
  label: "공식상권 제과점 점포당 참고매출";
  source: string[];
  officialAreaId: string | null;
  officialAreaName: string | null;
  period: string | null;
  industry: { code: string | null; name: string | null };
  totalSales: number | null;
  totalSalesLabel: "기준분기 공식상권 월 추정매출";
  storeCount: number | null;
  formula: "officialIndustrySales / officialIndustryStoreCount";
  value: number | null;
  unit: "KRW_PER_STORE_MONTH";
  valueType: "FRAMEONE_CALCULATED_REFERENCE";
  limitation: string;
  unavailableReasons: string[];
  sourceSemantics: {
    referencePeriodType: "QUARTER";
    salesValuePeriodType: "MONTH";
    salesSourceField: "THSMON_SELNG_AMT";
    storeCountSourceField: "STOR_CO";
  };
}

export interface RentalMarketReference {
  status: "AVAILABLE" | "NEEDS_CONFIRMATION" | "NOT_AVAILABLE";
  label: "FRAMEONE 확인 표본";
  scope: {
    status: "CONFIRMED" | "NEEDS_CONFIRMATION" | "NOT_AVAILABLE";
    officialAreaId: string | null;
    basis: string | null;
    selectedRecordIds: string[];
    reason: string;
  };
  sampleCount: number;
  sampleSufficiency: RentalMarketResult["sampleSufficiency"] | null;
  medianRent: number | null;
  minRent: number | null;
  maxRent: number | null;
  plannedRent: number;
  baseRentCeiling: number | null;
  plannedRentToCeiling: "BELOW_OR_EQUAL" | "ABOVE" | "NOT_AVAILABLE";
  medianRentToCeiling: "BELOW_OR_EQUAL" | "ABOVE" | "NOT_AVAILABLE";
  limitation: string;
}

export interface StressTestResult {
  key: "SALES_MINUS_10" | "SALES_MINUS_20" | "MATERIAL_PLUS_5PP" | "LABOR_PLUS_1M" | "RENT_PLUS_1M" | "TICKET_MINUS_1000";
  label: string;
  changedInput: { field: string; previousValue: number; currentValue: number };
  monthlySales: number | null;
  estimatedOperatingProfit: number | null;
  operatingProfitChange: number | null;
  operatingMargin: number | null;
  rentBurdenRate: number | null;
}

export interface EconomicFeasibilityResult {
  schemaVersion: "frameone.economic-feasibility.v1";
  inputs: EconomicPlanInput;
  officialBenchmark: OfficialPerStoreBenchmark;
  rentalMarketReference: RentalMarketReference;
  scenarios: Record<EconomicScenarioKey, EconomicScenarioResult>;
  bep: {
    variableCostRate: number | null;
    contributionMarginRate: number | null;
    monthlyBepSales: number | null;
    dailyBepSales: number | null;
    requiredDailyTransactionsForBep: number | null;
    baseBufferAmount: number | null;
    baseBufferRate: number | null;
  };
  rentCeiling: {
    targetRentBurdenRate: number;
    conservativeRentCeiling: number | null;
    baseRentCeiling: number | null;
    upsideRentCeiling: number | null;
  };
  stressTests: StressTestResult[];
  validation: { errors: string[]; warnings: string[] };
  limitations: string[];
  provenance: Array<{
    field: string;
    kind: ProvenanceKind;
    basedOn: ProvenanceKind[];
    sourceIds?: string[];
  }>;
  metadata: {
    engineVersion: "economic-feasibility-v1";
    generatedAt: string;
    officialDataIncluded: boolean;
    rentalMarketIncluded: boolean;
  };
}

export interface EconomicFeasibilityEngineInput {
  plan: EconomicPlanInput;
  officialMarketData: BakeryOfficialMarketData | null;
  rentalMarketResult: RentalMarketResult | null;
  rentalMarketScopeConfirmation?: {
    status: "CONFIRMED";
    officialAreaId: string;
    selectedRecordIds: string[];
    basis: string;
  } | null;
  generatedAt: string;
}
