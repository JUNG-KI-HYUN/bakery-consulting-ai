import type { EconomicPlanInput } from "./types";
import {
  economicResultStatus,
  type BoundEconomicResult,
  type EconomicResultBinding,
} from "./workspace-binding";

export interface EconomicPlanDraft {
  expectedTicket: number | null;
  operatingDaysPerMonth: number | null;
  salesScenario: {
    conservativeDailyTransactions: number | null;
    baseDailyTransactions: number | null;
    upsideDailyTransactions: number | null;
  };
  variableCostRates: {
    materialCostRate: number | null;
    packagingCostRate: number | null;
    cardFeeRate: number | null;
    deliveryVariableRate: number | null;
    otherVariableRate: number | null;
  };
  fixedMonthlyCosts: {
    laborMonthly: number | null;
    rentMonthly: number | null;
    managementFeeMonthly: number | null;
    utilitiesMonthly: number | null;
    marketingMonthly: number | null;
    posAccountingMonthly: number | null;
    insuranceMonthly: number | null;
    otherFixedMonthly: number | null;
    deliveryFixedMonthly: number | null;
  };
  rentPlanning: { targetRentBurdenRate: number | null };
}

export function emptyEconomicPlanDraft(): EconomicPlanDraft {
  return {
    expectedTicket: null,
    operatingDaysPerMonth: null,
    salesScenario: {
      conservativeDailyTransactions: null,
      baseDailyTransactions: null,
      upsideDailyTransactions: null,
    },
    variableCostRates: {
      materialCostRate: null,
      packagingCostRate: null,
      cardFeeRate: null,
      deliveryVariableRate: null,
      otherVariableRate: null,
    },
    fixedMonthlyCosts: {
      laborMonthly: null,
      rentMonthly: null,
      managementFeeMonthly: null,
      utilitiesMonthly: null,
      marketingMonthly: null,
      posAccountingMonthly: null,
      insuranceMonthly: null,
      otherFixedMonthly: null,
      deliveryFixedMonthly: null,
    },
    rentPlanning: { targetRentBurdenRate: null },
  };
}

export function economicPlanDraftFromResult(result: BoundEconomicResult): EconomicPlanDraft {
  const plan = result.result.inputs;
  return {
    ...structuredClone(plan),
    fixedMonthlyCosts: {
      ...structuredClone(plan.fixedMonthlyCosts),
      deliveryFixedMonthly: plan.fixedMonthlyCosts.deliveryFixedMonthly ?? null,
    },
    rentPlanning: {
      targetRentBurdenRate: plan.rentPlanning.targetRentBurdenRate ?? null,
    },
  };
}

function requiredNonnegative(value: number | null, label: string, errors: string[]) {
  if (value === null) {
    errors.push(`${label}을(를) 입력해 주세요.`);
    return false;
  }
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${label}은(는) 0 이상의 숫자여야 합니다.`);
    return false;
  }
  return true;
}

export function economicPlanFromDraft(draft: EconomicPlanDraft): {
  plan: EconomicPlanInput | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!requiredNonnegative(draft.expectedTicket, "객단가", errors) || draft.expectedTicket === 0) {
    if (draft.expectedTicket === 0) errors.push("객단가는 0보다 커야 합니다.");
  }
  if (!requiredNonnegative(draft.operatingDaysPerMonth, "월 영업일", errors) || draft.operatingDaysPerMonth === 0) {
    if (draft.operatingDaysPerMonth === 0) errors.push("월 영업일은 0보다 커야 합니다.");
  }

  const fields: Array<[number | null, string]> = [
    [draft.salesScenario.conservativeDailyTransactions, "보수 일 결제건수"],
    [draft.salesScenario.baseDailyTransactions, "기준 일 결제건수"],
    [draft.salesScenario.upsideDailyTransactions, "상향 일 결제건수"],
    [draft.variableCostRates.materialCostRate, "원재료비율"],
    [draft.variableCostRates.packagingCostRate, "포장비율"],
    [draft.variableCostRates.cardFeeRate, "카드수수료율"],
    [draft.variableCostRates.deliveryVariableRate, "배달 변동비율"],
    [draft.variableCostRates.otherVariableRate, "기타 변동비율"],
    [draft.fixedMonthlyCosts.laborMonthly, "월 인건비"],
    [draft.fixedMonthlyCosts.rentMonthly, "월세"],
    [draft.fixedMonthlyCosts.managementFeeMonthly, "월 관리비"],
    [draft.fixedMonthlyCosts.utilitiesMonthly, "월 공과금"],
    [draft.fixedMonthlyCosts.marketingMonthly, "월 마케팅비"],
    [draft.fixedMonthlyCosts.posAccountingMonthly, "POS·회계비"],
    [draft.fixedMonthlyCosts.insuranceMonthly, "월 보험료"],
    [draft.fixedMonthlyCosts.otherFixedMonthly, "기타 고정비"],
  ];
  for (const [value, label] of fields) requiredNonnegative(value, label, errors);
  if (draft.fixedMonthlyCosts.deliveryFixedMonthly !== null) {
    requiredNonnegative(draft.fixedMonthlyCosts.deliveryFixedMonthly, "배달 고정비", errors);
  }
  if (draft.rentPlanning.targetRentBurdenRate !== null) {
    requiredNonnegative(draft.rentPlanning.targetRentBurdenRate, "목표 월세부담률", errors);
    if (draft.rentPlanning.targetRentBurdenRate > 1) {
      errors.push("목표 월세부담률은 100% 이하여야 합니다.");
    }
  }
  if (errors.length > 0) return { plan: null, errors };

  return {
    plan: {
      expectedTicket: draft.expectedTicket!,
      operatingDaysPerMonth: draft.operatingDaysPerMonth!,
      salesScenario: {
        conservativeDailyTransactions: draft.salesScenario.conservativeDailyTransactions!,
        baseDailyTransactions: draft.salesScenario.baseDailyTransactions!,
        upsideDailyTransactions: draft.salesScenario.upsideDailyTransactions!,
      },
      variableCostRates: {
        materialCostRate: draft.variableCostRates.materialCostRate!,
        packagingCostRate: draft.variableCostRates.packagingCostRate!,
        cardFeeRate: draft.variableCostRates.cardFeeRate!,
        deliveryVariableRate: draft.variableCostRates.deliveryVariableRate!,
        otherVariableRate: draft.variableCostRates.otherVariableRate!,
      },
      fixedMonthlyCosts: {
        laborMonthly: draft.fixedMonthlyCosts.laborMonthly!,
        rentMonthly: draft.fixedMonthlyCosts.rentMonthly!,
        managementFeeMonthly: draft.fixedMonthlyCosts.managementFeeMonthly!,
        utilitiesMonthly: draft.fixedMonthlyCosts.utilitiesMonthly!,
        marketingMonthly: draft.fixedMonthlyCosts.marketingMonthly!,
        posAccountingMonthly: draft.fixedMonthlyCosts.posAccountingMonthly!,
        insuranceMonthly: draft.fixedMonthlyCosts.insuranceMonthly!,
        otherFixedMonthly: draft.fixedMonthlyCosts.otherFixedMonthly!,
        ...(draft.fixedMonthlyCosts.deliveryFixedMonthly === null
          ? {}
          : { deliveryFixedMonthly: draft.fixedMonthlyCosts.deliveryFixedMonthly }),
      },
      rentPlanning: draft.rentPlanning.targetRentBurdenRate === null
        ? {}
        : { targetRentBurdenRate: draft.rentPlanning.targetRentBurdenRate },
    },
    errors,
  };
}

export function economicResultStatusForDraft(
  result: BoundEconomicResult | null,
  expected: EconomicResultBinding | null,
  draft: EconomicPlanDraft,
): "CURRENT" | "STALE" | "NOT_RUN" {
  if (!result || !expected) return "NOT_RUN";
  const validated = economicPlanFromDraft(draft);
  if (!validated.plan || JSON.stringify(validated.plan) !== JSON.stringify(result.result.inputs)) return "STALE";
  return economicResultStatus(result, expected);
}
