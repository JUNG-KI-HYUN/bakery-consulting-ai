import { SBIZ365_SOURCE_TYPE, type Sbiz365ExtractedFact, type Sbiz365ImportResult } from "./types";
import {
  PORK33_PROFILE,
  type Pork33AnalysisScope,
  type Pork33EvidenceRef,
  type Pork33ExcludedFact,
  type Pork33Field,
  type Pork33MeetingView,
  type Pork33RelevantProfile,
  type Pork33SearchPriority,
  type TrendPoint,
} from "./pork33-types";

const FIELD_REQUIRED = [
  "actualApartmentMainEntrance",
  "commuteHomeRoute",
  "shortTermParking",
  "vehicleAccess",
  "storeVisibility",
] as const;

const RELEVANT_FACT_KEYS = new Set([
  "selectedStoreCount",
  "selectedStoreCountTrend",
  "estimatedMonthlyAverageSales",
  "selectedMonthlySalesTrend",
  "selectedMonthlyTransactionsTrend",
  "salesWeekdayWeekendShares",
  "salesDayShares",
  "salesTimeBandShares",
  "buyerAgeShares",
  "buyerGenderShares",
  "householdCount",
  "collectiveHousingCount",
  "apartmentUnitCount",
  "apartmentComplexSizeBuckets",
  "largeRetailCount",
  "subwayStationCount",
  "busStopCount",
  "stationRidership",
  "dailyAverageFloatingPopulation",
  "floatingPopulationTimeBandRatios",
  "salesScopeFallback",
]);

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", "").match(/-?[\d.]+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
}
function parseJson<T>(fact: Sbiz365ExtractedFact | undefined): T | null {
  if (!fact) return null;
  try {
    return JSON.parse(fact.value) as T;
  } catch {
    return null;
  }
}
function unavailable<T>(): Pork33Field<T> {
  return { status: "NOT_AVAILABLE", value: null, evidenceRef: null };
}
function evidenceId(field: string, fact: Sbiz365ExtractedFact) {
  return `${field}:p${fact.evidence.page}`;
}
function sourceField<T>(input: {
  result: Sbiz365ImportResult;
  evidenceRefs: Pork33EvidenceRef[];
  field: string;
  factKey: string;
  value: T | null;
  unit: string | null;
  scope?: Pork33AnalysisScope;
  qualityFlags?: string[];
}): Pork33Field<T> {
  const fact = input.result.facts[input.factKey];
  if (!fact || input.value === null) return unavailable<T>();
  const id = evidenceId(input.field, fact);
  input.evidenceRefs.push({
    id,
    source: SBIZ365_SOURCE_TYPE,
    sourceFile: input.result.fileName,
    sourcePage: fact.evidence.page,
    sourceLabel: fact.evidence.label,
    sourceText: fact.evidence.sourceText,
    period: input.result.referencePeriod,
    geography: input.result.areaName,
    analysisScope: input.scope ?? "SELECTION_AREA",
    unit: input.unit,
    rawValue: fact.value,
    normalizedValue: input.value,
    dataQualityFlags: input.qualityFlags ?? [],
  });
  return { status: "AVAILABLE", value: input.value, evidenceRef: id };
}
function computedField<T>(input: {
  result: Sbiz365ImportResult;
  evidenceRefs: Pork33EvidenceRef[];
  field: string;
  value: T | null;
  unit: string | null;
  sourceField: Pork33Field<unknown>;
  formula: string;
}): Pork33Field<T> {
  if (input.value === null || !input.sourceField.evidenceRef) return unavailable<T>();
  const source = input.evidenceRefs.find((item) => item.id === input.sourceField.evidenceRef);
  if (!source) return unavailable<T>();
  const id = `${input.field}:calculated`;
  input.evidenceRefs.push({
    ...source,
    id,
    source: "SYSTEM_CALCULATION",
    sourceLabel: input.formula,
    analysisScope: "SYSTEM_CALCULATION",
    unit: input.unit,
    rawValue: source.normalizedValue,
    normalizedValue: input.value,
    dataQualityFlags: [...source.dataQualityFlags],
  });
  return { status: "AVAILABLE", value: input.value, evidenceRef: id };
}
function yoy(trend: TrendPoint[] | null) {
  if (!trend || trend.length < 2 || trend[0].value === 0) return null;
  return Math.round(((trend.at(-1)!.value / trend[0].value - 1) * 100) * 10) / 10;
}
function peak(values: Record<string, number> | null) {
  if (!values || Object.keys(values).length === 0) return null;
  return Object.entries(values).reduce((best, current) => (current[1] > best[1] ? current : best))[0];
}
function excludedFacts(result: Sbiz365ImportResult): Pork33ExcludedFact[] {
  return Object.values(result.facts)
    .filter((fact) => !RELEVANT_FACT_KEYS.has(fact.key))
    .map((fact) => {
      const automatedNarrative = fact.key.startsWith("highest");
      const nonSelection = fact.key.startsWith("hinterland");
      const generalDemographic = [
        "residentPopulation",
        "workerPopulation",
        "floatingPopulationGenderRatios",
        "floatingPopulationAgeRatios",
        "floatingPopulationDayRatios",
      ].includes(fact.key);
      return {
        field: fact.key,
        status: "EXCLUDED" as const,
        reason: automatedNarrative
          ? "SBIZ365_AUTOMATED_NARRATIVE" as const
          : nonSelection
            ? "NON_SELECTION_GEOGRAPHY" as const
            : generalDemographic
              ? "GENERAL_DEMOGRAPHIC_NOT_PURCHASE_PATTERN" as const
              : "NOT_RELEVANT_TO_PORK33_SITE_SCREENING" as const,
        sourcePage: fact.evidence.page,
        sourceLabel: fact.evidence.label,
      };
    });
}
export function buildPork33RelevantProfile(result: Sbiz365ImportResult): Pork33RelevantProfile {
  const evidenceRefs: Pork33EvidenceRef[] = [];
  const fallback = Boolean(result.facts.salesScopeFallback);
  const salesScope = fallback ? "ADMIN_DONG" : "SELECTION_AREA";
  const qualityFlags = fallback ? ["SALES_SCOPE_FALLBACK", "LOW_STORE_COUNT"] : [];

  const storeTrendValue = parseJson<TrendPoint[]>(result.facts.selectedStoreCountTrend);
  const salesTrendValue = parseJson<TrendPoint[]>(result.facts.selectedMonthlySalesTrend);
  const transactionTrendValue = parseJson<TrendPoint[]>(result.facts.selectedMonthlyTransactionsTrend);
  const daySharesValue = parseJson<Record<string, number>>(result.facts.salesDayShares);
  const timeSharesValue = parseJson<Record<string, number>>(result.facts.salesTimeBandShares);
  const ageSharesValue = parseJson<Record<string, number>>(result.facts.buyerAgeShares);
  const genderSharesValue = parseJson<Record<string, number>>(result.facts.buyerGenderShares);
  const weekdayWeekend = parseJson<{ weekday: number; weekend: number }>(result.facts.salesWeekdayWeekendShares);
  const buckets = parseJson<Record<string, number>>(result.facts.apartmentComplexSizeBuckets);
  const floatingTime = result.facts.floatingPopulationTimeBandRatios?.value.match(/([^;]+?)\s([\d.]+)%/g)?.reduce<Record<string, number>>((acc, item) => {
    const match = item.trim().match(/^(.+?)\s([\d.]+)%$/);
    if (match) acc[match[1]] = Number(match[2]);
    return acc;
  }, {}) ?? null;

  const storeCount = sourceField({ result, evidenceRefs, field: "industryDemand.storeCount", factKey: "selectedStoreCount", value: parseNumber(result.facts.selectedStoreCount?.value), unit: "count" });
  const storeCountTrend = sourceField({ result, evidenceRefs, field: "industryDemand.storeCountTrend", factKey: "selectedStoreCountTrend", value: storeTrendValue, unit: "count" });
  const salesTrend = sourceField({ result, evidenceRefs, field: "industryDemand.salesTrend", factKey: "selectedMonthlySalesTrend", value: salesTrendValue, unit: "10k_KRW", scope: salesScope, qualityFlags });
  const transactionTrend = sourceField({ result, evidenceRefs, field: "industryDemand.transactionTrend", factKey: "selectedMonthlyTransactionsTrend", value: transactionTrendValue, unit: "transactions", scope: salesScope, qualityFlags });
  const dayShares = sourceField({ result, evidenceRefs, field: "purchasePattern.dayShares", factKey: "salesDayShares", value: daySharesValue, unit: "percent" });
  const timeShares = sourceField({ result, evidenceRefs, field: "purchasePattern.timeShares", factKey: "salesTimeBandShares", value: timeSharesValue, unit: "percent" });
  const buyerAgeShares = sourceField({ result, evidenceRefs, field: "purchasePattern.buyerAgeShares", factKey: "buyerAgeShares", value: ageSharesValue, unit: "percent" });
  const footTimeShares = sourceField({ result, evidenceRefs, field: "footTraffic.timeShares", factKey: "floatingPopulationTimeBandRatios", value: floatingTime, unit: "percent" });

  const complex1500To2000 = sourceField({ result, evidenceRefs, field: "residentialBase.complex1500To2000", factKey: "apartmentComplexSizeBuckets", value: buckets?.complex1500To2000 ?? null, unit: "complexes" });
  const complex2000Plus = sourceField({ result, evidenceRefs, field: "residentialBase.complex2000Plus", factKey: "apartmentComplexSizeBuckets", value: buckets?.complex2000Plus ?? null, unit: "complexes" });
  const hasLargeComplex = buckets ? (buckets.complex1500To2000 ?? 0) + (buckets.complex2000Plus ?? 0) > 0 : null;

  return {
    profile: PORK33_PROFILE,
    sourceFile: result.fileName,
    areaName: result.areaName,
    industry: result.industry,
    referencePeriod: result.referencePeriod,
    industryDemand: {
      storeCount,
      storeCountTrend,
      storeCountYoY: computedField({ result, evidenceRefs, field: "industryDemand.storeCountYoY", value: yoy(storeTrendValue), unit: "percent", sourceField: storeCountTrend, formula: "(latest / 12-month-prior - 1) × 100" }),
      monthlySalesPerStore: sourceField({ result, evidenceRefs, field: "industryDemand.monthlySalesPerStore", factKey: "selectedMonthlySalesTrend", value: salesTrendValue?.at(-1)?.value ?? null, unit: "10k_KRW", scope: salesScope, qualityFlags }),
      salesTrend,
      salesYoY: computedField({ result, evidenceRefs, field: "industryDemand.salesYoY", value: yoy(salesTrendValue), unit: "percent", sourceField: salesTrend, formula: "(latest / 12-month-prior - 1) × 100" }),
      monthlyTransactionsPerStore: sourceField({ result, evidenceRefs, field: "industryDemand.monthlyTransactionsPerStore", factKey: "selectedMonthlyTransactionsTrend", value: transactionTrendValue?.at(-1)?.value ?? null, unit: "transactions", scope: salesScope, qualityFlags }),
      transactionTrend,
      transactionsYoY: computedField({ result, evidenceRefs, field: "industryDemand.transactionsYoY", value: yoy(transactionTrendValue), unit: "percent", sourceField: transactionTrend, formula: "(latest / 12-month-prior - 1) × 100" }),
      salesScopeFallback: fallback,
      salesScope,
    },
    purchasePattern: {
      weekdayShare: sourceField({ result, evidenceRefs, field: "purchasePattern.weekdayShare", factKey: "salesWeekdayWeekendShares", value: weekdayWeekend?.weekday ?? null, unit: "percent" }),
      weekendShare: sourceField({ result, evidenceRefs, field: "purchasePattern.weekendShare", factKey: "salesWeekdayWeekendShares", value: weekdayWeekend?.weekend ?? null, unit: "percent" }),
      dayShares,
      peakDay: computedField({ result, evidenceRefs, field: "purchasePattern.peakDay", value: peak(daySharesValue), unit: null, sourceField: dayShares, formula: "maximum selected-area day sales share" }),
      timeShares,
      peakTimeBand: computedField({ result, evidenceRefs, field: "purchasePattern.peakTimeBand", value: peak(timeSharesValue), unit: null, sourceField: timeShares, formula: "maximum selected-area time-band sales share" }),
      buyerAgeShares,
      primaryBuyerAgeBand: computedField({ result, evidenceRefs, field: "purchasePattern.primaryBuyerAgeBand", value: peak(ageSharesValue), unit: null, sourceField: buyerAgeShares, formula: "maximum selected-area buyer age sales share" }),
      buyerGenderShares: sourceField({ result, evidenceRefs, field: "purchasePattern.buyerGenderShares", factKey: "buyerGenderShares", value: genderSharesValue, unit: "percent" }),
    },
    residentialBase: {
      households: sourceField({ result, evidenceRefs, field: "residentialBase.households", factKey: "householdCount", value: parseNumber(result.facts.householdCount?.value), unit: "households" }),
      collectiveHousingUnits: sourceField({ result, evidenceRefs, field: "residentialBase.collectiveHousingUnits", factKey: "collectiveHousingCount", value: parseNumber(result.facts.collectiveHousingCount?.value), unit: "units" }),
      apartmentUnits: sourceField({ result, evidenceRefs, field: "residentialBase.apartmentUnits", factKey: "apartmentUnitCount", value: parseNumber(result.facts.apartmentUnitCount?.value), unit: "units" }),
      complex1000To1500: sourceField({ result, evidenceRefs, field: "residentialBase.complex1000To1500", factKey: "apartmentComplexSizeBuckets", value: buckets?.complex1000To1500 ?? null, unit: "complexes" }),
      complex1500To2000,
      complex2000Plus,
      largeComplexSignal: hasLargeComplex === null ? "UNKNOWN" : hasLargeComplex ? "POSITIVE" : "NEUTRAL",
    },
    anchors: {
      largeRetailCount: sourceField({ result, evidenceRefs, field: "anchors.largeRetailCount", factKey: "largeRetailCount", value: parseNumber(result.facts.largeRetailCount?.value), unit: "count" }),
      subwayStationCount: sourceField({ result, evidenceRefs, field: "anchors.subwayStationCount", factKey: "subwayStationCount", value: parseNumber(result.facts.subwayStationCount?.value), unit: "count" }),
      busStopCount: sourceField({ result, evidenceRefs, field: "anchors.busStopCount", factKey: "busStopCount", value: parseNumber(result.facts.busStopCount?.value), unit: "count" }),
      stationRidership: sourceField({ result, evidenceRefs, field: "anchors.stationRidership", factKey: "stationRidership", value: parseNumber(result.facts.stationRidership?.value.split(" ").at(-1)), unit: "people_per_day" }),
    },
    footTraffic: {
      dailyAverage: sourceField({ result, evidenceRefs, field: "footTraffic.dailyAverage", factKey: "dailyAverageFloatingPopulation", value: parseNumber(result.facts.dailyAverageFloatingPopulation?.value), unit: "people_per_day" }),
      peakTimeBand: computedField({ result, evidenceRefs, field: "footTraffic.peakTimeBand", value: peak(floatingTime), unit: null, sourceField: footTimeShares, formula: "maximum selected-area foot-traffic time-band share" }),
    },
    fieldRequired: [...FIELD_REQUIRED],
    excludedFacts: excludedFacts(result),
    evidenceRefs,
    rawImport: { sourceType: result.sourceType, fileName: result.fileName, extractionStatus: result.extractionStatus, unknowns: result.unknowns },
  };
}
function displayValue(field: Pork33Field<number>, suffix: string) {
  return field.value === null ? "확인 필요" : `${field.value.toLocaleString("ko-KR")}${suffix}`;
}
function fieldEvidence(...fields: Pork33Field<unknown>[]) {
  return fields.flatMap((field) => field.evidenceRef ? [field.evidenceRef] : []);
}

function dayLabel(value: string | null) {
  return value ? `${value}요일` : "주요 요일";
}

function timeLabel(value: string | null) {
  return value ? `${value}시` : "주요 시간대";
}

function searchPriorities(profile: Pork33RelevantProfile): Pork33SearchPriority[] {
  const priorities: Pork33SearchPriority[] = [];
  const largeEvidence = fieldEvidence(profile.residentialBase.complex1500To2000, profile.residentialBase.complex2000Plus, profile.anchors.largeRetailCount);
  if (profile.residentialBase.largeComplexSignal === "POSITIVE" && largeEvidence.length >= 2) {
    priorities.push({ rank: priorities.length + 1, title: "대단지 주출입구 주변", description: "1,500세대 이상 단지의 주출입구와 생활편의시설이 연결되는 구간을 우선 조사하는 것이 적절합니다.", evidenceRefs: largeEvidence.slice(0, 3), fieldRequired: ["actualApartmentMainEntrance", "commuteHomeRoute"] });
  }
  const eveningEvidence = fieldEvidence(profile.purchasePattern.weekendShare, profile.purchasePattern.peakTimeBand, profile.residentialBase.households);
  if (eveningEvidence.length >= 2) {
    priorities.push({ rank: priorities.length + 1, title: "주거 귀가동선 상가", description: `${dayLabel(profile.purchasePattern.peakDay.value)}과 ${timeLabel(profile.purchasePattern.peakTimeBand.value)} 구매패턴에 맞는 주거 귀가동선의 1층 상가를 확인하는 것이 적절합니다.`, evidenceRefs: eveningEvidence.slice(0, 3), fieldRequired: ["commuteHomeRoute", "storeVisibility"] });
  }
  const vehicleEvidence = fieldEvidence(profile.industryDemand.monthlyTransactionsPerStore, profile.residentialBase.households);
  if (vehicleEvidence.length >= 2) {
    priorities.push({ rank: priorities.length + 1, title: "생활구매 접근 구간", description: "주거 배후에서 반복 구매가 가능한 접근 구간을 확인하고 차량 진입과 단기정차 조건을 함께 점검해야 합니다.", evidenceRefs: vehicleEvidence, fieldRequired: ["vehicleAccess", "shortTermParking"] });
  }
  return priorities.slice(0, 3);
}

export function buildPork33MeetingView(profile: Pork33RelevantProfile): Pork33MeetingView {
  const large = profile.residentialBase.largeComplexSignal;
  const storeCount = displayValue(profile.industryDemand.storeCount, "개");
  const headline = large === "POSITIVE"
    ? `${profile.areaName ?? "분석지역"}은 1,500세대 이상 공동주택 배후가 확인됩니다. 정육점 통계 ${storeCount}와 실제 주출입구 위치는 함께 현장 확인이 필요합니다.`
    : `${profile.areaName ?? "분석지역"}은 주거 배후와 정육점 구매패턴을 먼저 검토할 수 있습니다. 1,500세대 이상 단지는 자료에서 확인되지 않아 현장 범위를 넓게 살펴봐야 합니다.`;
  const peakDay = dayLabel(profile.purchasePattern.peakDay.value);
  const peakTime = timeLabel(profile.purchasePattern.peakTimeBand.value);
  const priorities = searchPriorities(profile);

  return {
    areaName: profile.areaName,
    headline,
    keyNumbers: [
      { label: "정육점 업소수", value: storeCount, evidenceRef: profile.industryDemand.storeCount.evidenceRef },
      { label: "업소당 월평균 매출", value: displayValue(profile.industryDemand.monthlySalesPerStore, "만원"), evidenceRef: profile.industryDemand.monthlySalesPerStore.evidenceRef },
      { label: "선택영역 세대수", value: displayValue(profile.residentialBase.households, "세대"), evidenceRef: profile.residentialBase.households.evidenceRef },
      { label: "1,500세대 이상 단지", value: large === "POSITIVE" ? "확인" : large === "NEUTRAL" ? "표상 없음" : "확인 필요", evidenceRef: profile.residentialBase.complex1500To2000.evidenceRef },
    ],
    positiveSignals: [
      ...(large === "POSITIVE" ? ["1,500세대 이상 공동주택 단지가 확인됩니다."] : []),
      ...(profile.purchasePattern.peakTimeBand.value ? [`${peakTime} 매출 비중이 가장 큽니다.`] : []),
    ].slice(0, 2),
    checkRequired: ["실제 아파트 주출입구와 귀가동선을 확인해야 합니다.", "정육점 실제 영업 여부와 위치를 확인해야 합니다.", "차량 접근과 단기정차 조건을 확인해야 합니다."].slice(0, 3),
    p2MapInsights: [
      large === "POSITIVE" ? "대단지 공동주택이 있는 방향을 우선 확인합니다." : "주거 배후의 주요 출입 방향을 현장에서 확인합니다.",
      profile.anchors.largeRetailCount.value === null ? "생활편의시설 위치는 추가 확인이 필요합니다." : `대형유통시설 ${profile.anchors.largeRetailCount.value}개는 생활구매 anchor로만 참고합니다.`,
      "정육점과 마트의 실제 위치는 SBIZ와 Kakao 확인 후 지도에 표시합니다.",
    ],
    p3ResidentialSummary: `선택영역은 ${displayValue(profile.residentialBase.households, "세대")}, 아파트 ${displayValue(profile.residentialBase.apartmentUnits, "호")}입니다. 1,500세대 이상 단지 신호는 ${large}입니다.`,
    p4PurchaseSummary: `${peakDay}과 ${peakTime} 매출 비중이 가장 큽니다. 현장에서는 이 시간대의 귀가동선을 확인해야 합니다.`,
    p5CompetitionSummary: `소상공인365 선택영역 정육점 통계는 ${storeCount}입니다. SBIZ 사업체와 Kakao 지도 확인 수는 합산하지 않고 별도로 확인해야 합니다.`,
    p6SearchPriorities: priorities,
    p7MeetingConclusion: "현재 단계: 지역 스크리닝 완료 / 현장 매물조사 권장",
  };
}

export function buildPork33SimpleReportInput(profile: Pork33RelevantProfile, meetingView: Pork33MeetingView, mapInput: unknown) {
  return {
    profile: profile.profile,
    reportPurpose: "FIRST_MEETING_SALES_CONSULTING_VIEW",
    displayPolicy: { maxKeyValuesPerPage: 5, conclusionFirst: true, rawTablesVisible: false },
    areaName: profile.areaName,
    p1: { headline: meetingView.headline, keyNumbers: meetingView.keyNumbers.slice(0, 4), positiveSignals: meetingView.positiveSignals.slice(0, 2), checkRequired: meetingView.checkRequired.slice(0, 3) },
    p2: { map: mapInput, insights: meetingView.p2MapInsights.slice(0, 3) },
    p3: { headline: meetingView.p3ResidentialSummary, keyValues: [profile.residentialBase.households, profile.residentialBase.collectiveHousingUnits, profile.residentialBase.apartmentUnits, { status: "AVAILABLE", value: profile.residentialBase.largeComplexSignal, evidenceRef: profile.residentialBase.complex1500To2000.evidenceRef }] },
    p4: { headline: meetingView.p4PurchaseSummary, weekdayShare: profile.purchasePattern.weekdayShare, weekendShare: profile.purchasePattern.weekendShare, dayShares: profile.purchasePattern.dayShares, timeShares: profile.purchasePattern.timeShares, peakDay: profile.purchasePattern.peakDay, peakTimeBand: profile.purchasePattern.peakTimeBand },
    p5: { headline: meetingView.p5CompetitionSummary, industryStatisticalStoreCount: profile.industryDemand.storeCount, businessRegistryCount: unavailable<number>(), mapSearchCount: unavailable<number>(), combinedCount: null },
    p6: { headline: "현장 매물조사 우선 구간", priorities: meetingView.p6SearchPriorities.slice(0, 3), fieldRequired: profile.fieldRequired },
    p7: { residentialBase: profile.residentialBase.largeComplexSignal, industryDemand: "NEUTRAL", competition: profile.industryDemand.storeCount.value === null ? "UNKNOWN" : "NEUTRAL", siteSearchReadiness: "CAUTION", conclusion: meetingView.p7MeetingConclusion, contractDecision: null },
  };
}
