import { calculateBreakEven } from "./calculateBreakEven";
import { calculateRisk } from "./calculateRisk";
import { buildNarrative } from "./reportNarrative";
import { ConsultationRecord, DiagnosisResult } from "./types";

export function mockAiDiagnosis(record: ConsultationRecord): DiagnosisResult {
  const breakEvenResult = calculateBreakEven(record.breakEven);
  const { verdict, reasons } = calculateRisk(record, breakEvenResult);
  const sections = buildNarrative(record, verdict, reasons, breakEvenResult);

  return {
    id: record.consultation.id,
    verdict,
    reasons,
    breakEvenResult,
    sections,
    generatedAt: new Date().toISOString(),
  };
}
