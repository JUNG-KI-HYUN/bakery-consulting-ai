import type { RentalScopeConfirmation } from "./types";

function normalizedRecordIds(recordIds: readonly string[]) {
  return [...new Set(recordIds.map((value) => value.trim()).filter(Boolean))].sort();
}

export function createRentalScopeConfirmation(input: {
  analysisRunId: string;
  officialMarketCode: string | null;
  method: RentalScopeConfirmation["method"];
  selectedRecordIds: readonly string[];
  basis: string;
}, runtime: { randomUUID?: () => string; now?: () => Date } = {}): RentalScopeConfirmation {
  if (!input.analysisRunId.trim()) throw new Error("analysisRunId는 비어 있을 수 없습니다.");
  if (!input.basis.trim()) throw new Error("임대 비교범위 확인 근거가 필요합니다.");
  const randomUUID = runtime.randomUUID ?? (() => globalThis.crypto.randomUUID());
  const now = runtime.now ?? (() => new Date());
  return Object.freeze({
    confirmationId: `rental-scope:${randomUUID()}`,
    analysisRunId: input.analysisRunId,
    officialMarketCode: input.officialMarketCode?.trim() || null,
    method: input.method,
    selectedRecordIds: Object.freeze(normalizedRecordIds(input.selectedRecordIds)) as unknown as string[],
    basis: input.basis.trim(),
    confirmedAt: now().toISOString(),
  });
}

export function isRentalScopeConfirmationCurrent(
  confirmation: RentalScopeConfirmation | null,
  expected: {
    analysisRunId: string | null | undefined;
    officialMarketCode: string | null | undefined;
    selectedRecordIds: readonly string[];
  },
) {
  if (!confirmation || !expected.analysisRunId) return false;
  return confirmation.analysisRunId === expected.analysisRunId &&
    confirmation.officialMarketCode === (expected.officialMarketCode ?? null) &&
    JSON.stringify(confirmation.selectedRecordIds) ===
      JSON.stringify(normalizedRecordIds(expected.selectedRecordIds));
}

export function rentalComparisonStatus(input: {
  availableRecordCount: number;
  confirmation: RentalScopeConfirmation | null;
  analysisRunId: string | null | undefined;
  officialMarketCode: string | null | undefined;
  selectedRecordIds: readonly string[];
}): "LINKED" | "NEEDS_CONFIRMATION" | "NOT_AVAILABLE" {
  if (input.availableRecordCount === 0) return "NOT_AVAILABLE";
  return isRentalScopeConfirmationCurrent(input.confirmation, input)
    ? "LINKED"
    : "NEEDS_CONFIRMATION";
}
