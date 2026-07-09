import { StartupCostInput, StartupCostResult } from "./types";

export function calculateStartupCost(
  startupCost: StartupCostInput,
  deposit: number,
  premium: number,
  startupBudget: number,
): StartupCostResult {
  // 총 창업비용 = 보증금 + 권리금 + 인테리어비 + 제조장비비 + 판매장비비 + 간판비 + 초도물품비 + 인허가관련비 + 예비비
  const totalCost =
    deposit +
    premium +
    startupCost.interiorCost +
    startupCost.productionEquipmentCost +
    startupCost.salesEquipmentCost +
    startupCost.signageCost +
    startupCost.initialSuppliesCost +
    startupCost.licenseRelatedCost +
    startupCost.reserveCost;

  // 예산 대비 차액 = 창업예산 - 총 창업비용
  const budgetDifference = startupBudget - totalCost;

  // 예산 초과율(%) = (총 창업비용 - 창업예산) / 창업예산 × 100
  const budgetOverRatePercent =
    startupBudget > 0 ? ((totalCost - startupBudget) / startupBudget) * 100 : 0;

  // 예비비 비율(%) = 예비비 / 총 창업비용 × 100
  const reserveRatePercent =
    totalCost > 0 ? (startupCost.reserveCost / totalCost) * 100 : 0;

  return {
    totalCost,
    budgetDifference,
    budgetOverRatePercent,
    reserveRatePercent,
  };
}
