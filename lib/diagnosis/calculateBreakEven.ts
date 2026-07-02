import { BreakEvenInput, BreakEvenResult } from "./types";

export function calculateBreakEven(input: BreakEvenInput): BreakEvenResult {
  const monthlySales = Math.max(input.expectedMonthlySales, 1);

  // 월세 부담률 = 월세 / 예상 월매출 × 100
  const rentBurdenRate = (input.rent / monthlySales) * 100;

  // 총 고정비 = 월세 + 관리비 + 인건비 + 광고비 + 기타 고정비
  const totalFixedCost =
    input.rent +
    input.maintenanceFee +
    input.laborCost +
    input.adCost +
    input.otherFixedCost;

  // 변동비율 = 원재료비율 + 카드수수료율 + 배달수수료율
  const variableCostRate =
    input.materialCostRate + input.cardFeeRate + input.deliveryFeeRate;

  // 손익분기 매출 = 총 고정비 / (1 - 변동비율)
  const denominator = 1 - variableCostRate;
  const breakEvenSales = denominator > 0 ? totalFixedCost / denominator : Infinity;

  const estimatedMonthlyNetProfit =
    monthlySales * (1 - variableCostRate) - totalFixedCost;

  // 권리금 회수 예상기간 = 권리금 / 예상 월순이익
  const premiumRecoveryMonths =
    estimatedMonthlyNetProfit > 0
      ? input.premium / estimatedMonthlyNetProfit
      : null;

  return {
    rentBurdenRate,
    totalFixedCost,
    variableCostRate,
    breakEvenSales,
    estimatedMonthlyNetProfit,
    premiumRecoveryMonths,
  };
}
