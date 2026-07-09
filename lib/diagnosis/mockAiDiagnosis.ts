import { calculateBreakEven } from "./calculateBreakEven";
import { calculateRisk } from "./calculateRisk";
import { calculateStartupCost } from "./calculateStartupCost";
import { buildNarrative } from "./reportNarrative";
import { ConsultationRecord, DiagnosisResult } from "./types";

export function buildDiagnosisResult(record: ConsultationRecord): DiagnosisResult {
  const breakEvenResult = calculateBreakEven(record.breakEven);

  const startupCostResult = record.startupCost
    ? calculateStartupCost(
        record.startupCost,
        record.candidateStore.deposit,
        record.candidateStore.premium,
        record.consultation.startupBudget,
      )
    : undefined;

  const { verdict, reasons } = calculateRisk(
    record,
    breakEvenResult,
    startupCostResult,
  );
  const sections = buildNarrative(record, verdict, reasons, breakEvenResult);

  return {
    id: record.consultation.id,
    verdict,
    reasons,
    breakEvenResult,
    startupCostResult,
    startupCost: record.startupCost,
    startupCostDeposit: record.startupCost ? record.candidateStore.deposit : undefined,
    startupCostPremium: record.startupCost ? record.candidateStore.premium : undefined,
    startupBudget: record.startupCost ? record.consultation.startupBudget : undefined,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

export function mockAiDiagnosis(record: ConsultationRecord): DiagnosisResult {
  return buildDiagnosisResult(record);
}
