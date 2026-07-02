import {
  BreakEvenResult,
  ConsultationRecord,
  Verdict,
} from "./types";

interface RiskOutput {
  verdict: Verdict;
  reasons: string[];
}

export function calculateRisk(
  record: ConsultationRecord,
  breakEvenResult: BreakEvenResult,
): RiskOutput {
  const reasons: string[] = [];
  let score = 0;

  if (
    record.consultation.storeType === "제조형" &&
    record.facilityCheck.exhaustPossible !== "가능"
  ) {
    score += 3;
    reasons.push("제조형 매장인데 배기 가능성이 불확실하거나 불가합니다.");
  }

  if (
    record.facilityCheck.electricExpansionPossible === "불확실" ||
    record.facilityCheck.electricExpansionPossible === "불가"
  ) {
    score += 2;
    reasons.push("전기 증설 가능성이 낮거나 불확실합니다.");
  }

  if (breakEvenResult.rentBurdenRate > 15) {
    score += 2;
    reasons.push("월세 부담률이 15%를 초과합니다.");
  }

  if (record.facilityCheck.productionSpaceSecured !== "가능") {
    score += 2;
    reasons.push("제조공간 확보가 불확실하거나 어렵습니다.");
  }

  if (!record.facilityCheck.drawingConfirmed) {
    score += 1;
    reasons.push("도면 또는 현장사진 미확인으로 레이아웃 판단 신뢰도가 낮습니다.");
  }

  let verdict: Verdict = "추천";
  if (score >= 7) verdict = "위험";
  else if (score >= 5) verdict = "보류";
  else if (score >= 2) verdict = "조건부 추천";

  if (reasons.length === 0) {
    reasons.push("핵심 조건이 전반적으로 양호합니다.");
  }

  return { verdict, reasons };
}
