import type { MarketAnalysisContext, NearbyCategoryId } from "./market-analysis-context";
import type { MarketDataMetric } from "./types";
import type { OfficialMarketRelation } from "./official-market-spatial-relation";

type OfficialData = NonNullable<MarketAnalysisContext["publicData"]["selectedOfficialMarketData"]>;
type Observation = OfficialData["sales"][number];

const REQUEST_FAILURE = "조회 실패 · 재확인 필요";
const CATEGORIES: readonly { id: NearbyCategoryId; label: string }[] = [
  { id: "bakery", label: "베이커리 검색결과" },
  { id: "confectionery", label: "제과점 검색결과" },
  { id: "cafe", label: "카페 검색결과" },
];
const METRICS: readonly { source: "sales" | "stores"; metric: MarketDataMetric; label: string; suffix: string }[] = [
  { source: "sales", metric: "monthly_sales_amount", label: "월 추정매출", suffix: "원" },
  { source: "sales", metric: "monthly_sales_count", label: "월 매출건수", suffix: "건" },
  { source: "stores", metric: "similar_industry_store_count", label: "유사업종 점포 수", suffix: "개" },
  { source: "stores", metric: "store_count", label: "점포 수", suffix: "개" },
  { source: "stores", metric: "franchise_store_count", label: "프랜차이즈 점포 수", suffix: "개" },
  { source: "stores", metric: "opening_store_count", label: "개업 수", suffix: "개" },
  { source: "stores", metric: "closing_store_count", label: "폐업 수", suffix: "개" },
];

function hasUsableValue(observation: Observation): boolean {
  return observation.dataStatus === "available" && observation.value !== null && Number.isFinite(observation.value);
}

export function formatMarketMetric(observation: Observation, suffix: string): string {
  if (hasUsableValue(observation)) return `${observation.value!.toLocaleString("ko-KR")}${suffix}`;
  if (observation.dataStatus === "suppressed") return "비공개 자료";
  if (observation.dataStatus === "invalid") return "수치 확인 필요";
  return "자료 없음";
}

function periodLabel(referencePeriod: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(referencePeriod);
  return match ? `${match[1]}년 ${match[2]}분기 기준` : "기준분기 확인 필요";
}

function publicStatus(context: MarketAnalysisContext): string {
  const { publicData, officialMarkets } = context;
  if (publicData.requestStatus === "error") return REQUEST_FAILURE;
  if (publicData.requestStatus === "loading") return "조회 중";
  if (!officialMarkets.manuallySelected) return "통계 기준 공식상권 선택 필요";
  if (publicData.requestStatus !== "success") return "통계 조회 전";
  switch (publicData.status) {
    case "available": return "데이터 확인됨";
    case "partial": return "일부 자료 확인";
    case "missing": return "해당 기준 자료 없음";
    default: return "자료 확인 필요";
  }
}

function sourceStatus(observations: readonly Observation[]): string {
  if (observations.length === 0) return "해당 기준 자료 없음";
  if (observations.every(hasUsableValue)) return "데이터 확인됨";
  if (observations.some(hasUsableValue)) return "일부 수치 확인";
  return "수치 확인 필요";
}

const MANUAL_RELATION_LABELS: Record<OfficialMarketRelation, string> = {
  INSIDE: "후보점포 포함",
  RADIUS_OVERLAP: "분석반경 교차",
  OUTSIDE: "직접 공간관계 없음",
  UNKNOWN: "공간관계 확인 불가",
};
const MANUAL_RELATION_DESCRIPTIONS: Record<OfficialMarketRelation, string> = {
  INSIDE: "후보점포가 이 공식상권 내부에 있습니다.",
  RADIUS_OVERLAP: "후보점포는 상권 밖에 있지만, 분석반경과 공식상권이 겹칩니다.",
  OUTSIDE: "분석지점과 직접적인 공간관계가 확인되지 않은 직원 참고선택 상권입니다.",
  UNKNOWN: "공간관계를 확인할 수 없습니다.",
};

/** Presentation only: no I/O, geometry, aggregate counts, scores or new facts.
 * All dynamic statements are derived from the supplied immutable Context.
 */
export function buildMarketSummaryPresentation(context: MarketAnalysisContext | null) {
  if (!context?.target) return {
    status: "empty" as const,
    message: "후보점포 주소를 입력하거나 지도에서 위치를 선택한 뒤 분석을 실행해 주세요.",
  };

  const radius = `${context.target.executedRadiusMeters}m`;
  const nearby = context.kakaoNearby;
  const categories = CATEGORIES.map(({ id, label }) => {
    const result = nearby[id];
    const pending = nearby.status === "idle" || nearby.status === "loading";
    const failed = !pending && (result?.status === "error" || (!result && nearby.status === "error"));
    const count = !pending && !failed && result?.status === "success" ? result.totalCount : null;
    return {
      id, label,
      value: count !== null && Number.isFinite(count) ? `${count.toLocaleString("ko-KR")}곳` :
        pending ? (nearby.status === "loading" ? "조회 중" : "조회 전") : failed ? REQUEST_FAILURE : "자료 확인 필요",
      // Context contains returned places, not live category visibility toggles.
      // Never claim these are all currently visible markers on the map.
      detail: count !== null && result ? `반환된 장소 ${result.places.length.toLocaleString("ko-KR")}곳` : null,
    };
  });
  const kakaoStatus = nearby.status === "error" ? REQUEST_FAILURE : nearby.status === "loading" ? "조회 중" :
    nearby.status === "idle" ? "조회 전" : CATEGORIES.every(({ id }) => nearby[id]?.status === "success" && nearby[id]?.totalCount !== null)
      ? "검색결과 확인됨" : "일부 자료 확인";

  const official = context.officialMarkets;
  const spatialReady = official.status === "success" && official.relatedMarkets !== null;
  const inside = spatialReady ? official.relatedMarkets!.filter((item) => item.relation === "INSIDE") : [];
  const overlaps = spatialReady ? official.relatedMarkets!.filter((item) => item.relation === "RADIUS_OVERLAP") : [];
  const unknown = official.unknownMarkets ?? [];
  const spatialStatus = official.status === "error" ? REQUEST_FAILURE : official.status === "loading" ? "경계 조회 중" :
    !spatialReady ? "공간관계 확인 전" : unknown.length > 0 ? "일부 공간관계 확인 필요" : "경계·공간관계 확인됨";
  const manual = official.manuallySelected;
  const manualRelation = manual?.spatialRelation?.relation ?? null;

  const statisticsStatus = publicStatus(context);
  const data = context.publicData.requestStatus === "success" ? context.publicData.selectedOfficialMarketData : null;
  const statisticsMarket = data?.officialMarketName ?? manual?.marketName ?? "공식상권 미선택";
  const period = data ? periodLabel(data.referencePeriod) : "기준분기 미확인";
  const metrics = data && context.publicData.status !== "missing" ? METRICS.flatMap((definition) => {
    const observation = data[definition.source].find((item) => item.metric === definition.metric);
    return observation ? [{ metric: definition.metric, label: definition.label, value: formatMarketMetric(observation, definition.suffix) }] : [];
  }) : [];
  const statisticsWarning = manual && manualRelation !== "INSIDE"
    ? `현재 통계 기준은 직원이 참고 선택한 ‘${manual.marketName}’ 공식상권입니다. 후보점포가 직접 포함된 공식상권 통계와 다를 수 있습니다.` : null;

  const confirmed: string[] = [];
  const reference: string[] = [];
  const needsCheck: string[] = [];
  for (const market of inside) confirmed.push(`후보점포는 ‘${market.marketName}’ 공식상권 내부에 있습니다.`);
  if (data && context.publicData.status !== "missing") {
    confirmed.push(`‘${statisticsMarket}’의 서울시 ${period} 공식통계가 ${context.publicData.status === "partial" ? "일부 " : ""}조회되었습니다.`);
  }
  if (overlaps.length > 0) reference.push(`${radius} 분석반경은 ${overlaps.length.toLocaleString("ko-KR")}개 공식상권과 교차합니다.`);
  for (const { id, label } of CATEGORIES) {
    const result = nearby[id];
    if (nearby.status !== "loading" && nearby.status !== "idle" && result?.status === "success" && result.totalCount !== null && result.totalCount > 0)
      reference.push(`${radius} 내 Kakao ${label}가 존재합니다.`);
  }
  if (statisticsWarning) reference.push(statisticsWarning);
  if (spatialReady && inside.length === 0 && overlaps.length === 0) reference.push("확인된 공식상권 중 분석지점·반경과 직접 겹치는 상권이 없습니다.");
  if (!spatialReady || unknown.length > 0) needsCheck.push("공식상권 공간관계를 추가로 확인해 주세요.");
  if (nearby.status === "error") needsCheck.push("Kakao 장소검색 조회 실패 항목을 재확인해 주세요.");
  if (context.publicData.requestStatus !== "success" || !data) needsCheck.push(`서울시 공식통계: ${statisticsStatus}. 기존 지도 아래에서 참고할 상권을 선택하고 통계를 조회해 주세요.`);
  else if (context.publicData.status === "partial" || context.publicData.status === "missing") needsCheck.push(`서울시 공식통계: ${statisticsStatus}. 확인되지 않은 자료를 0으로 해석하지 않습니다.`);
  if (data && [...data.sales, ...data.stores].some((item) => !hasUsableValue(item))) needsCheck.push("공식통계 중 비공개·미확인 수치를 별도로 확인해 주세요.");
  needsCheck.push("Kakao 검색결과는 실제 영업점 전수 데이터가 아닙니다. 현장에서 경쟁점의 영업 여부를 확인해 주세요.");
  needsCheck.push("계약 판단에는 임대차·시설·손익 자료 등의 별도 확인이 필요합니다.");

  return {
    status: "ready" as const,
    target: {
      address: context.target.confirmedAddress ?? (context.target.source === "map" ? "지도 선택 위치" : "확인주소 미제공"),
      radius, source: context.target.source === "address" ? "주소 분석" : "지도 분석",
      frameone: context.frameone.selectedMarketName ?? "주요상권 미선택",
    },
    nearby: { status: kakaoStatus, categories },
    spatial: {
      status: spatialStatus, ready: spatialReady,
      inside: inside.map((market) => market.marketName),
      overlaps: overlaps.map((market) => market.marketName),
      unknown: unknown.map((market) => market.marketName),
      manual: manual ? {
        name: manual.marketName,
        relation: manualRelation ? MANUAL_RELATION_LABELS[manualRelation] : "공간관계 확인 전",
        description: manualRelation ? MANUAL_RELATION_DESCRIPTIONS[manualRelation] : "선택한 공식상권의 공간관계를 아직 확인할 수 없습니다.",
      } : null,
    },
    statistics: { status: statisticsStatus, market: statisticsMarket, period, metrics, warning: statisticsWarning },
    sources: [
      { name: "Kakao 장소검색", status: kakaoStatus, scope: `${radius} · 검색결과 기준` },
      { name: "서울시 공식상권 경계", status: spatialStatus, scope: `실행 지점·${radius} 반경과 공식 경계 비교` },
      { name: "서울시 SALES", status: data ? sourceStatus(data.sales) : statisticsStatus, scope: `${statisticsMarket} · ${period}` },
      { name: "서울시 STORES", status: data ? sourceStatus(data.stores) : statisticsStatus, scope: `${statisticsMarket} · ${period}` },
    ],
    interpretation: { confirmed, reference, needsCheck },
  };
}
