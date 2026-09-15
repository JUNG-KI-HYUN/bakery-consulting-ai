import type { MarketAnalysisRequestStatus } from "../market-analysis-context";
import type {
  BakeryOfficialMarketTrend,
  BakeryOfficialMarketTrendPeriod,
} from "../services/bakery-official-market";
import type {
  MarketDataMetric,
  MarketDataObservation,
  MarketDataSourceId,
  MarketDataUnit,
} from "../types";
import type { AnalysisRunSnapshot } from "./run";
import {
  createAvailableResult,
  createUnavailableResult,
  type BasicLocationAnalysisLayer,
  type BasicLocationAnalysisUnit,
  type BasicLocationLimitation,
  type BasicLocationResult,
  type BasicLocationValueType,
} from "./results";

const BAKERY_INDUSTRY_CODE = "CS100005";
const SOURCE_NAMES: Record<"SRC-SEOUL-SALES" | "SRC-SEOUL-STORES", string> = {
  "SRC-SEOUL-SALES": "서울시 상권분석서비스 추정매출",
  "SRC-SEOUL-STORES": "서울시 상권분석서비스 점포",
};

const OFFICIAL_AREA_SCOPE_LIMITATIONS = [
  {
    code: "OFFICIAL_AREA_SCOPE_ONLY",
    message: "이 통계는 명시된 서울시 공식상권 전체에만 적용됩니다.",
    severity: "CAUTION",
  },
  {
    code: "UNIT_SCOPE_MISMATCH_RISK",
    message: "사용자가 지정한 300m/500m 반경 또는 FRAMEONE Market 통계가 아닙니다.",
    severity: "CAUTION",
  },
] as const satisfies readonly BasicLocationLimitation[];

const SALES_LIMITATIONS = [
  ...OFFICIAL_AREA_SCOPE_LIMITATIONS,
  {
    code: "ESTIMATED_NOT_ACTUAL",
    message: "서울시 공식상권 추정매출 자료이며 실제 점포 매출이 아닙니다.",
    severity: "CAUTION",
  },
  {
    code: "NOT_STORE_LEVEL_REVENUE",
    message: "후보점포의 실제매출 또는 예상매출로 사용할 수 없습니다.",
    severity: "CAUTION",
  },
] as const satisfies readonly BasicLocationLimitation[];

const TREND_LIMITATIONS = [
  ...OFFICIAL_AREA_SCOPE_LIMITATIONS,
  {
    code: "PERIOD_MISMATCH_RISK",
    message: "각 Result의 기준분기를 확인해야 하며 서로 다른 분기를 같은 시점 값으로 비교할 수 없습니다.",
    severity: "CAUTION",
  },
] as const satisfies readonly BasicLocationLimitation[];

interface MetricDefinition {
  metric: MarketDataMetric;
  label: string;
  unit: MarketDataUnit;
}

const SALES_METRICS = [
  { metric: "monthly_sales_amount", label: "공식상권 월 추정매출", unit: "KRW" },
  { metric: "monthly_sales_count", label: "공식상권 월 추정매출 건수", unit: "count" },
] as const satisfies readonly MetricDefinition[];

const STORE_METRICS = [
  { metric: "similar_industry_store_count", label: "공식상권 유사업종 점포 수", unit: "count" },
  { metric: "store_count", label: "공식상권 점포 수", unit: "count" },
  { metric: "franchise_store_count", label: "공식상권 프랜차이즈 점포 수", unit: "count" },
  { metric: "opening_rate", label: "공식상권 개업률", unit: "percent" },
  { metric: "opening_store_count", label: "공식상권 개업 점포 수", unit: "count" },
  { metric: "closing_rate", label: "공식상권 폐업률", unit: "percent" },
  { metric: "closing_store_count", label: "공식상권 폐업 점포 수", unit: "count" },
] as const satisfies readonly MetricDefinition[];

export interface OfficialObservationSourceState {
  status: MarketAnalysisRequestStatus;
  referencePeriod: string | null;
  observations: readonly MarketDataObservation[] | null;
  error: string | null;
  fetchedAt: string;
}

export interface OfficialTrendSourceState {
  status: MarketAnalysisRequestStatus;
  trend: BakeryOfficialMarketTrend | null;
  error: string | null;
  fetchedAt: string;
}

export interface OfficialMarketStatisticsAdapterInput {
  snapshot: AnalysisRunSnapshot;
  officialMarketCode: string;
  officialMarketName: string;
  sales: OfficialObservationSourceState;
  stores: OfficialObservationSourceState;
  trend: OfficialTrendSourceState;
}

interface ObservationAdapterInput {
  snapshot: AnalysisRunSnapshot;
  officialMarketCode: string;
  officialMarketName: string;
  state: OfficialObservationSourceState;
}

interface TrendAdapterInput {
  snapshot: AnalysisRunSnapshot;
  officialMarketCode: string;
  officialMarketName: string;
  state: OfficialTrendSourceState;
}

function requireNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path}가 비어 있습니다.`);
}

function requireTimestamp(value: string, path: string) {
  requireNonEmpty(value, path);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${path}가 유효한 시각이 아닙니다.`);
}

function requireOfficialIdentity(code: string, name: string) {
  if (!/^\d+$/.test(code)) throw new Error("officialMarketCode는 숫자로 된 공식상권 코드여야 합니다.");
  requireNonEmpty(name, "officialMarketName");
}

function requireReferencePeriod(value: string | null, path: string): asserts value is string {
  if (value === null || !/^\d{4}-Q[1-4]$/.test(value)) {
    throw new Error(`${path}는 YYYY-Q1~Q4 형식이어야 합니다.`);
  }
}

function requireQuarterMatches(quarterCode: string, referencePeriod: string, path: string) {
  const match = /^(\d{4})([1-4])$/.exec(quarterCode);
  if (!match || `${match[1]}-Q${match[2]}` !== referencePeriod) {
    throw new Error(`${path}의 quarterCode와 referencePeriod가 일치하지 않습니다.`);
  }
}

function officialUnit(code: string, name: string): BasicLocationAnalysisUnit {
  return { type: "OFFICIAL_COMMERCIAL_AREA", id: code, label: name };
}

function source(sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES") {
  return { sourceId, sourceName: SOURCE_NAMES[sourceId], sourceType: "PUBLIC_DATA_OFFICIAL" as const };
}

function locator(sourceId: MarketDataSourceId, code: string, referencePeriod: string | null) {
  const section = sourceId === "SRC-SEOUL-SALES" ? "sales" : "stores";
  const quarterCode = referencePeriod?.replace("-Q", "") ?? null;
  return `/api/markets/bakery-data?marketCode=${code}${quarterCode ? `&quarterCode=${quarterCode}` : ""}#${section}`;
}

function missingReasonForStatus(status: MarketAnalysisRequestStatus) {
  if (status === "error") return "SOURCE_ERROR" as const;
  if (status === "success") return "NO_DATA" as const;
  return "NOT_CALCULATED" as const;
}

function unavailableResult(input: {
  snapshot: AnalysisRunSnapshot;
  code: string;
  name: string;
  sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES";
  metricKey: string;
  metricLabel: string;
  unit: string | null;
  referencePeriod: string | null;
  updatedAt: string;
  missingReason: "NO_DATA" | "NOT_CALCULATED" | "SOURCE_ERROR" | "UNKNOWN";
  limitations: readonly BasicLocationLimitation[];
  methodologyNote: string | null;
  analysisLayer: BasicLocationAnalysisLayer;
}) {
  return createUnavailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: input.analysisLayer,
    analysisUnit: officialUnit(input.code, input.name),
    metricKey: input.metricKey,
    metricLabel: input.metricLabel,
    unit: input.unit,
    primarySource: source(input.sourceId),
    sourceReferences: [{
      sourceId: input.sourceId,
      locator: locator(input.sourceId, input.code, input.referencePeriod),
      sourceVersion: null,
    }],
    referenceDate: null,
    referencePeriod: input.referencePeriod,
    limitations: [...input.limitations],
    missingReason: input.missingReason,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "HIDDEN",
    methodologyNote: input.methodologyNote,
    updatedAt: input.updatedAt,
  });
}

function validateMetricValue(value: number, unit: MarketDataUnit, path: string) {
  if (!Number.isFinite(value)) throw new Error(`${path}는 finite 숫자여야 합니다.`);
  if ((unit === "KRW" || unit === "count") && value < 0) throw new Error(`${path}는 음수일 수 없습니다.`);
  if (unit === "percent" && (value < 0 || value > 100)) throw new Error(`${path}는 0~100 범위여야 합니다.`);
}

function validateObservation(
  observation: MarketDataObservation,
  definition: MetricDefinition,
  sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES",
  input: ObservationAdapterInput,
) {
  if (observation.sourceId !== sourceId) throw new Error(`${definition.metric} Source ID가 일치하지 않습니다.`);
  if (observation.geographyType !== "official_market") throw new Error(`${definition.metric} geographyType이 공식상권이 아닙니다.`);
  if (observation.geographyId !== input.officialMarketCode) throw new Error(`${definition.metric} 공식상권 ID가 일치하지 않습니다.`);
  if (observation.geographyName && observation.geographyName !== input.officialMarketName) {
    throw new Error(`${definition.metric} 공식상권명이 일치하지 않습니다.`);
  }
  if (observation.industryCode !== BAKERY_INDUSTRY_CODE) throw new Error(`${definition.metric} 업종코드가 제과점이 아닙니다.`);
  if (observation.metric !== definition.metric || observation.unit !== definition.unit) {
    throw new Error(`${definition.metric} metric 또는 unit이 일치하지 않습니다.`);
  }
  if (observation.referencePeriod !== input.state.referencePeriod) {
    throw new Error(`${definition.metric} referencePeriod가 요청 기간과 일치하지 않습니다.`);
  }
  if (observation.dataStatus === "available") {
    if (observation.value === null) throw new Error(`${definition.metric} available 값이 null입니다.`);
    validateMetricValue(observation.value, observation.unit, definition.metric);
  } else if (observation.value !== null) {
    throw new Error(`${definition.metric} 결측 상태의 value는 null이어야 합니다.`);
  }
}

function adaptObservations(
  input: ObservationAdapterInput,
  sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES",
  definitions: readonly MetricDefinition[],
  analysisLayer: BasicLocationAnalysisLayer,
  limitations: readonly BasicLocationLimitation[],
  valueType: BasicLocationValueType,
): readonly BasicLocationResult[] {
  requireOfficialIdentity(input.officialMarketCode, input.officialMarketName);
  requireTimestamp(input.state.fetchedAt, "fetchedAt");
  if (input.state.status === "success") {
    requireReferencePeriod(input.state.referencePeriod, "referencePeriod");
    if (!Array.isArray(input.state.observations)) throw new Error("성공한 Source에는 observations 배열이 필요합니다.");
  }

  const observations = input.state.observations ?? [];
  const allowedMetrics = new Set(definitions.map((definition) => definition.metric));
  for (const observation of observations) {
    if (!allowedMetrics.has(observation.metric)) {
      throw new Error(`${sourceId}에 허용되지 않은 metric이 포함되었습니다: ${observation.metric}`);
    }
  }
  const results = definitions.map((definition) => {
    const matches = observations.filter((item) => item.metric === definition.metric);
    if (matches.length > 1) throw new Error(`${definition.metric} observation이 중복되었습니다.`);
    const observation = matches[0];
    const metricKey = `official_commercial_area.${sourceId === "SRC-SEOUL-SALES" ? "sales" : "stores"}.${definition.metric}`;
    if (input.state.status !== "success" || !observation) {
      return unavailableResult({
        snapshot: input.snapshot,
        code: input.officialMarketCode,
        name: input.officialMarketName,
        sourceId,
        metricKey,
        metricLabel: definition.label,
        unit: definition.unit,
        referencePeriod: input.state.referencePeriod,
        updatedAt: input.state.fetchedAt,
        missingReason: missingReasonForStatus(input.state.status),
        limitations,
        methodologyNote: input.state.error,
        analysisLayer,
      });
    }

    validateObservation(observation, definition, sourceId, input);
    if (observation.dataStatus !== "available" || observation.value === null) {
      return unavailableResult({
        snapshot: input.snapshot,
        code: input.officialMarketCode,
        name: input.officialMarketName,
        sourceId,
        metricKey,
        metricLabel: definition.label,
        unit: definition.unit,
        referencePeriod: observation.referencePeriod,
        updatedAt: input.state.fetchedAt,
        missingReason: observation.dataStatus === "invalid" ? "UNKNOWN" : "NO_DATA",
        limitations: observation.dataStatus === "suppressed"
          ? [...limitations, { code: "SOURCE_SUPPRESSED", message: "공식 Source가 이 값을 비공개 또는 억제 상태로 제공했습니다.", severity: "CAUTION" }]
          : observation.dataStatus === "invalid"
            ? [...limitations, { code: "INVALID_SOURCE_VALUE", message: "기존 parser가 원천값을 유효한 숫자로 확인하지 못했습니다.", severity: "CAUTION" }]
            : limitations,
        methodologyNote: `normalized dataStatus=${observation.dataStatus}`,
        analysisLayer,
      });
    }

    return createAvailableResult({
      analysisRunId: input.snapshot.analysisRunId,
      analysisLayer,
      analysisUnit: officialUnit(input.officialMarketCode, input.officialMarketName),
      metricKey,
      metricLabel: definition.label,
      value: observation.value,
      unit: observation.unit,
      valueType,
      primarySource: source(sourceId),
      sourceReferences: [{ sourceId, locator: locator(sourceId, input.officialMarketCode, observation.referencePeriod), sourceVersion: null }],
      referenceDate: null,
      referencePeriod: observation.referencePeriod,
      confidence: "HIGH",
      confidenceReasons: [
        { code: "DIRECT_OFFICIAL_SOURCE", message: "서울시 공식 Source의 정규화된 직접값입니다." },
        { code: "PERIOD_CLEAR", message: `기준기간 ${observation.referencePeriod}을 보존했습니다.` },
      ],
      limitations: [...limitations],
      fieldCheckRequired: false,
      fieldCheckKeys: [],
      customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
      methodologyNote: sourceId === "SRC-SEOUL-SALES"
        ? "공식 Source가 제공한 추정매출 성격을 유지하며 실제 또는 후보점포 매출로 변환하지 않았습니다."
        : "공식상권 점포 통계이며 Kakao 장소검색 반환건수와 합산하지 않습니다.",
      updatedAt: input.state.fetchedAt,
    });
  });

  return Object.freeze(results);
}

export function adaptOfficialSalesResults(input: ObservationAdapterInput) {
  return adaptObservations(input, "SRC-SEOUL-SALES", SALES_METRICS, "DEMAND", SALES_LIMITATIONS, "ESTIMATED_VALUE");
}

export function adaptOfficialStoresResults(input: ObservationAdapterInput) {
  return adaptObservations(input, "SRC-SEOUL-STORES", STORE_METRICS, "COMPETITION", OFFICIAL_AREA_SCOPE_LIMITATIONS, "OFFICIAL_VALUE");
}

function trendUnavailable(
  input: TrendAdapterInput,
  period: BakeryOfficialMarketTrendPeriod | null,
  metric: string,
  label: string,
  unit: MarketDataUnit,
  sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES",
  missingReason: "NO_DATA" | "NOT_CALCULATED" | "SOURCE_ERROR",
) {
  return unavailableResult({
    snapshot: input.snapshot,
    code: input.officialMarketCode,
    name: input.officialMarketName,
    sourceId,
    metricKey: `official_commercial_area.trend.${period?.quarterCode ?? "unavailable"}.${metric}`,
    metricLabel: label,
    unit,
    referencePeriod: period?.referencePeriod ?? null,
    updatedAt: input.state.fetchedAt,
    missingReason,
    limitations: sourceId === "SRC-SEOUL-SALES" ? [...SALES_LIMITATIONS, ...TREND_LIMITATIONS.slice(2)] : TREND_LIMITATIONS,
    methodologyNote: input.state.error,
    analysisLayer: "MARKET_CHANGE",
  });
}

function trendDatasetUnavailable(
  input: TrendAdapterInput,
  missingReason: "NO_DATA" | "NOT_CALCULATED" | "SOURCE_ERROR",
) {
  return createUnavailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: "MARKET_CHANGE",
    analysisUnit: officialUnit(input.officialMarketCode, input.officialMarketName),
    metricKey: "official_commercial_area.trend.dataset",
    metricLabel: "공식상권 Trend",
    unit: null,
    primarySource: { sourceId: null, sourceName: "FRAMEONE 공식상권 Trend 계산", sourceType: "SYSTEM_CALCULATION" },
    sourceReferences: [
      { sourceId: "SRC-SEOUL-SALES", locator: locator("SRC-SEOUL-SALES", input.officialMarketCode, null), sourceVersion: null },
      { sourceId: "SRC-SEOUL-STORES", locator: locator("SRC-SEOUL-STORES", input.officialMarketCode, null), sourceVersion: null },
    ],
    referenceDate: null,
    referencePeriod: null,
    limitations: [...SALES_LIMITATIONS, ...TREND_LIMITATIONS.slice(2)],
    missingReason,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "HIDDEN",
    methodologyNote: input.state.error,
    updatedAt: input.state.fetchedAt,
  });
}

function trendAvailable(input: TrendAdapterInput, period: BakeryOfficialMarketTrendPeriod, definition: {
  metric: string;
  label: string;
  value: number;
  unit: MarketDataUnit;
  sourceId: "SRC-SEOUL-SALES" | "SRC-SEOUL-STORES";
  valueType: BasicLocationValueType;
}) {
  const calculated = definition.valueType === "CALCULATED_VALUE";
  if (calculated) {
    if (!Number.isFinite(definition.value)) throw new Error(`${definition.metric}는 finite 숫자여야 합니다.`);
  } else {
    validateMetricValue(definition.value, definition.unit, definition.metric);
  }
  return createAvailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: "MARKET_CHANGE",
    analysisUnit: officialUnit(input.officialMarketCode, input.officialMarketName),
    metricKey: `official_commercial_area.trend.${period.quarterCode}.${definition.metric}`,
    metricLabel: definition.label,
    value: definition.value,
    unit: definition.unit,
    valueType: definition.valueType,
    primarySource: calculated
      ? { sourceId: null, sourceName: "FRAMEONE 공식상권 Trend 계산", sourceType: "SYSTEM_CALCULATION" }
      : source(definition.sourceId),
    sourceReferences: [{
      sourceId: definition.sourceId,
      locator: locator(definition.sourceId, input.officialMarketCode, period.referencePeriod),
      sourceVersion: null,
    }],
    referenceDate: null,
    referencePeriod: period.referencePeriod,
    confidence: calculated ? "MEDIUM" : "HIGH",
    confidenceReasons: calculated
      ? [{ code: "CALCULATION_ASSUMPTION", message: "기존 Trend 계산이 연속 분기의 공식값을 비교한 결과입니다." }]
      : [{ code: "DIRECT_OFFICIAL_SOURCE", message: "기존 Trend가 보존한 해당 분기의 공식 Source 값입니다." }],
    limitations: definition.sourceId === "SRC-SEOUL-SALES"
      ? [...SALES_LIMITATIONS, ...TREND_LIMITATIONS.slice(2)]
      : [...TREND_LIMITATIONS],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
    methodologyNote: calculated
      ? "기존 buildBakeryOfficialMarketTrend 계산 결과이며 새로운 Trend를 계산하지 않았습니다."
      : "기존 Trend 구조에 보존된 분기별 Source 값입니다.",
    updatedAt: input.state.fetchedAt,
  });
}

export function adaptOfficialTrendResults(input: TrendAdapterInput): readonly BasicLocationResult[] {
  requireOfficialIdentity(input.officialMarketCode, input.officialMarketName);
  requireTimestamp(input.state.fetchedAt, "fetchedAt");
  if (input.state.status !== "success" || input.state.trend === null) {
    const reason = input.state.status === "error" ? "SOURCE_ERROR" : "NOT_CALCULATED";
    return Object.freeze([trendDatasetUnavailable(input, reason)]);
  }

  const trend = input.state.trend;
  if (trend.officialMarketCode !== input.officialMarketCode) throw new Error("Trend 공식상권 ID가 일치하지 않습니다.");
  if (trend.officialMarketName && trend.officialMarketName !== input.officialMarketName) throw new Error("Trend 공식상권명이 일치하지 않습니다.");
  if (trend.industryCode !== BAKERY_INDUSTRY_CODE) throw new Error("Trend 업종코드가 제과점이 아닙니다.");
  if (!Array.isArray(trend.periods)) throw new Error("Trend periods 배열이 필요합니다.");
  if (trend.periods.length === 0) {
    return Object.freeze([trendDatasetUnavailable(input, "NO_DATA")]);
  }
  if (trend.periods.length > 4) throw new Error("기존 Trend 범위인 최근 4개 분기를 초과했습니다.");

  const output: BasicLocationResult[] = [];
  let previousQuarter = "";
  for (const period of trend.periods) {
    requireReferencePeriod(period.referencePeriod, "trend.referencePeriod");
    requireQuarterMatches(period.quarterCode, period.referencePeriod, "trend period");
    if (previousQuarter && previousQuarter >= period.quarterCode) throw new Error("Trend periods가 시간순이 아니거나 중복되었습니다.");
    previousQuarter = period.quarterCode;
    const expectedPeriodStatus = period.estimatedSalesAmount !== null && period.storeCount !== null
      ? "available"
      : period.estimatedSalesAmount !== null || period.storeCount !== null
        ? "partial"
        : "missing";
    if (period.dataStatus !== expectedPeriodStatus) throw new Error("Trend period dataStatus가 값의 가용성과 일치하지 않습니다.");
    const metrics = [
      { metric: "estimated_sales_amount", label: "공식상권 월 추정매출 추이", value: period.estimatedSalesAmount, unit: "KRW", sourceId: "SRC-SEOUL-SALES", valueType: "ESTIMATED_VALUE" },
      { metric: "store_count", label: "공식상권 점포 수 추이", value: period.storeCount, unit: "count", sourceId: "SRC-SEOUL-STORES", valueType: "OFFICIAL_VALUE" },
      { metric: "sales_qoq_rate", label: "공식상권 추정매출 전분기 대비", value: period.salesQoqRate, unit: "percent", sourceId: "SRC-SEOUL-SALES", valueType: "CALCULATED_VALUE" },
      { metric: "store_count_delta", label: "공식상권 점포 수 전분기 대비 증감", value: period.storeCountDelta, unit: "count", sourceId: "SRC-SEOUL-STORES", valueType: "CALCULATED_VALUE" },
    ] as const;
    for (const metric of metrics) {
      output.push(metric.value === null
        ? trendUnavailable(
          input,
          period,
          metric.metric,
          metric.label,
          metric.unit,
          metric.sourceId,
          metric.valueType === "CALCULATED_VALUE" ? "NOT_CALCULATED" : "NO_DATA",
        )
        : trendAvailable(input, period, { ...metric, value: metric.value }));
    }
  }

  const latest = trend.periods.at(-1);
  if (!latest || trend.latestQuarterCode !== latest.quarterCode || trend.latestReferencePeriod !== latest.referencePeriod) {
    throw new Error("Trend 최신 분기 metadata가 periods와 일치하지 않습니다.");
  }
  const expectedTrendStatus = trend.periods.every((period) => period.dataStatus === "available")
    ? "available"
    : "partial";
  if (trend.dataStatus !== expectedTrendStatus) throw new Error("Trend dataStatus가 periods와 일치하지 않습니다.");
  return Object.freeze(output);
}

export function adaptOfficialMarketStatisticsResults(
  input: OfficialMarketStatisticsAdapterInput,
): readonly BasicLocationResult[] {
  const common = {
    snapshot: input.snapshot,
    officialMarketCode: input.officialMarketCode,
    officialMarketName: input.officialMarketName,
  };
  return Object.freeze([
    ...adaptOfficialSalesResults({ ...common, state: input.sales }),
    ...adaptOfficialStoresResults({ ...common, state: input.stores }),
    ...adaptOfficialTrendResults({ ...common, state: input.trend }),
  ]);
}
