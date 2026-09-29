import type { EconomicFeasibilityResult } from "./types";

export interface OfficialBenchmarkIdentity {
  officialMarketCode: string;
  quarterCode: string;
  industryCode: string;
}

export interface EconomicResultBinding {
  analysisRunId: string;
  officialBenchmarkIdentity: OfficialBenchmarkIdentity | null;
  rentalConfirmationId: string | null;
  assumptionRevision: number;
}

export interface BoundEconomicResult {
  generatedAt: string;
  binding: EconomicResultBinding;
  result: EconomicFeasibilityResult;
}

export function officialBenchmarkIdentity(input: {
  officialMarketCode: string;
  quarterCode: string;
  industryCode: string;
} | null): OfficialBenchmarkIdentity | null {
  return input
    ? {
        officialMarketCode: input.officialMarketCode,
        quarterCode: input.quarterCode,
        industryCode: input.industryCode,
      }
    : null;
}

export function economicResultStatus(
  snapshot: BoundEconomicResult | null,
  expected: EconomicResultBinding | null,
): "CURRENT" | "STALE" | "NOT_RUN" {
  if (!snapshot || !expected) return "NOT_RUN";
  return JSON.stringify(snapshot.binding) === JSON.stringify(expected)
    ? "CURRENT"
    : "STALE";
}
