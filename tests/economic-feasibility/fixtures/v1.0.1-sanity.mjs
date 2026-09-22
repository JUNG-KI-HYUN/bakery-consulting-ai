export const economicV101SanityPlan = {
  expectedTicket: 10_000,
  operatingDaysPerMonth: 25,
  salesScenario: {
    conservativeDailyTransactions: 80,
    baseDailyTransactions: 100,
    upsideDailyTransactions: 120,
  },
  variableCostRates: {
    materialCostRate: 0.32,
    packagingCostRate: 0.03,
    cardFeeRate: 0.02,
    deliveryVariableRate: 0,
    otherVariableRate: 0.03,
  },
  fixedMonthlyCosts: {
    laborMonthly: 8_000_000,
    rentMonthly: 4_000_000,
    managementFeeMonthly: 500_000,
    utilitiesMonthly: 1_000_000,
    marketingMonthly: 500_000,
    posAccountingMonthly: 200_000,
    insuranceMonthly: 300_000,
    otherFixedMonthly: 500_000,
    deliveryFixedMonthly: 0,
  },
  rentPlanning: { targetRentBurdenRate: 0.1 },
};

export const economicV101Expected = {
  monthlySales: { conservative: 20_000_000, base: 25_000_000, upside: 30_000_000 },
  baseTotalVariableCost: 10_000_000,
  totalFixedCost: 15_000_000,
  baseOperatingProfit: 0,
  monthlyBepSales: 25_000_000,
  dailyBepSales: 1_000_000,
  requiredDailyTransactionsForBep: 100,
  ratios: { rent: 0.16, occupancy: 0.18, labor: 0.32, material: 0.32, prime: 0.64 },
  rentCeiling: { conservative: 2_000_000, base: 2_500_000, upside: 3_000_000 },
  bepBufferAmount: 0,
  stressOperatingProfit: {
    SALES_MINUS_10: -1_500_000,
    SALES_MINUS_20: -3_000_000,
    MATERIAL_PLUS_5PP: -1_250_000,
    LABOR_PLUS_1M: -1_000_000,
    RENT_PLUS_1M: -1_000_000,
    TICKET_MINUS_1000: -1_500_000,
  },
};
