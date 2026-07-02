import { BreakEvenResult, ConsultationRecord, DiagnosisSections, Verdict } from "./types";

export function buildNarrative(
  record: ConsultationRecord,
  verdict: Verdict,
  reasons: string[],
  breakEven: BreakEvenResult,
): DiagnosisSections {
  const brand = record.brandMarketing;
  const sketch = record.interiorSketch;
  const target = brand?.targetCustomer || "동네 단골 고객";
  const signature = brand?.signatureMenu || "시그니처 메뉴 후보 검토 필요";
  const keywords = brand?.localKeywords || "지역 키워드 추가 검토 필요";
  const operationType = sketch?.operationType || "운영 방식 확인 필요";
  const tone = sketch?.interiorTone || "인테리어 톤 확인 필요";
  const showcase = sketch?.showcasePosition || "쇼케이스 위치 확인 필요";
  const counter = sketch?.counterPosition || "카운터 위치 확인 필요";
  const kitchen = sketch?.kitchenPosition || "제조공간 위치 확인 필요";
  const hall = sketch?.hallUsage || "홀 활용 확인 필요";
  const customerFlow = sketch?.customerFlow || "고객 동선 확인 필요";
  const staffFlow = sketch?.staffFlow || "직원 동선 확인 필요";
  const lowCostIdeas = sketch?.lowCostIdeas || "저비용 인테리어 아이디어 검토 필요";
  const checkRequired = sketch?.checkRequired || "기둥/급배수/배기/전기 동선 확인 필요";

  return {
    candidateSummary: `${record.consultation.title} (샘플 데이터) 후보지는 ${record.consultation.storeType} 중심 운영을 가정한 1차 검토 대상입니다.`,
    keyRisks: reasons,
    locationAnalysis:
      "상권 정보는 1차 MVP 기준 정성 검토(참고값)입니다. 실제 유동/매출 데이터는 별도 API 연동 후 확인이 필요합니다.",
    leaseAnalysis: `보증금 ${record.candidateStore.deposit.toLocaleString()}원, 월세 ${record.candidateStore.rent.toLocaleString()}원 기준이며 특약 협의 필요사항은 '${record.candidateStore.specialTerms}'입니다.`,
    facilityRiskAnalysis:
      "베이커리는 시설에서 많이 막힐 수 있습니다. 전기, 배기, 급배수, 소방, 위생, 인허가 관련 항목은 현장 실측과 전문가 확인이 필요합니다.",
    layoutFeasibilityAnalysis:
      record.facilityCheck.drawingConfirmed
        ? "도면/사진 확인 기준으로 장비 반입 및 제조/판매 동선은 참고 수준에서 검토되었습니다."
        : "도면/사진 미확인 상태이므로 매장 세팅 가능성은 반드시 현장 검증이 필요합니다.",
    breakEvenAnalysis: `추정 월 손익분기 매출은 약 ${Math.round(
      breakEven.breakEvenSales,
    ).toLocaleString()}원(참고값)이며, 추정 월순이익은 약 ${Math.round(
      breakEven.estimatedMonthlyNetProfit,
    ).toLocaleString()}원입니다. 이 수치는 입력값 기준 추정치이며 실제 결과는 달라질 수 있습니다.`,
    marketingPotentialAnalysis:
      "오픈 초기 3개월은 고객이 이 매장을 기억하게 만드는 시간입니다. 지도/리뷰 채널과 지역 제휴, 시식/체험형 프로모션을 함께 검토하는 편이 좋습니다(참고안).",
    brandStoryDirection:
      "이 점포, 계약 전에 먼저 확인해볼게요. 점포는 계약 전에 검증하고 브랜드는 오픈 전에 설계해야 합니다. 고객이 기억할 한 문장과 시그니처 메뉴를 함께 정리하는 것이 좋습니다.",
    marketingPotential:
      "상권이 좋아도 이야기가 없으면 기억되기 어렵고, 이야기가 좋아도 비용 구조가 무너지면 오래 버티기 어렵습니다. 네이버 플레이스, 블로그, 인스타그램 소재는 실행 가능성을 검토할 수 있습니다.",
    threeMonthMarketingPlan:
      "오픈 전 2주는 플레이스 기본 세팅과 촬영 콘텐츠를 준비하고, 1개월차는 리뷰 확보, 2개월차는 지역 키워드 노출, 3개월차는 단골 전환 이벤트 중심으로 운영을 검토할 수 있습니다(참고용입니다).",
    localKeywordStrategy: `대표 고객층은 ${target}을 우선 가정하고, 지역 키워드는 '${keywords}' 기준으로 콘텐츠 일관성을 맞추는 전략이 검토가 필요합니다.`,
    reviewAndRegularCustomerStrategy: `시그니처 메뉴 후보 '${signature}'를 중심으로 첫 방문 리뷰 유도와 재방문 스탬프/세트 제안을 병행하면 단골 전환 가능성이 있습니다.`,
    interiorToneSuggestion: `추천 인테리어 톤은 '${tone}' 방향으로 검토 가능하며, 실제 시공 가능 여부는 전문가 확인이 필요합니다.`,
    layoutIdea: `운영 방식은 '${operationType}' 기준으로, 제조공간은 '${kitchen}' 배치를 우선 검토하는 편이 안전합니다. 확정 전에는 현장 조건 확인이 필요합니다.`,
    equipmentPlacementIdea: `쇼케이스는 '${showcase}', 카운터/픽업대는 '${counter}' 위치 아이디어로 1차 검토할 수 있습니다.`,
    hallUsageIdea: `홀/대기 공간은 '${hall}' 구성을 우선 고려하되, 현장 폭과 동선 간섭 여부 확인이 필요합니다.`,
    customerFlowOpinion: `고객 동선은 '${customerFlow}' 흐름을 기준으로 검토 가능하며, 혼잡 시간대 시뮬레이션이 권장됩니다.`,
    staffFlowOpinion: `직원 동선은 '${staffFlow}' 기준으로 검토 가능하나, 장비 반입/배기 위치와 함께 재검토가 필요합니다.`,
    lowCostInteriorIdeas: `저비용 개선 아이디어: ${lowCostIdeas}.`,
    interiorCheckRequired: `우선 확인 권장 항목: ${checkRequired}.`,
    finalJudgment: `최종 판단은 '${verdict}'이며, 본 결과는 AI 보조 진단 기반 참고 의견입니다.`,
    preContractQuestions: [
      "배기/전기 증설 관련 건물주 및 관리주체 확약 가능 여부는?",
      "원상복구 범위와 특약 조항을 서면으로 명확히 남길 수 있는가?",
      "인허가/위생/소방 점검을 계약 전 완료할 수 있는가?",
    ],
  };
}
