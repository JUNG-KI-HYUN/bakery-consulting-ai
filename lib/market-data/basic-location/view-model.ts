import type {
  BasicLocationAnalysisUnit,
  BasicLocationConfidence,
  BasicLocationConfidenceReason,
  BasicLocationLimitation,
  BasicLocationMissingReason,
  BasicLocationResult,
  BasicLocationResultStatus,
  BasicLocationSource,
  BasicLocationSourceReference,
  BasicLocationResultValue,
  BasicLocationValueType,
} from "./results";
import type {
  BasicLocationAudience,
  DisplayableBasicLocationResult,
} from "./display-policy";
import { applyBasicLocationDisplayPolicy } from "./display-policy";
import type {
  BasicLocationInterpretation,
  BasicLocationInterpretationSignal,
} from "./interpretation";

const VIEW_MODEL_SCHEMA_VERSION = "p0-basic-location-view-model-v1" as const;

export interface P0BasicLocationResultViewModel {
  resultId: string;
  analysisLayer: BasicLocationResult["analysisLayer"];
  analysisUnit: BasicLocationAnalysisUnit;
  metricKey: string;
  metricLabel: string;
  value: BasicLocationResultValue;
  unit: string | null;
  valueType: BasicLocationValueType;
  status: BasicLocationResultStatus;
  confidence: BasicLocationConfidence;
  primarySource: BasicLocationSource | null;
  sourceReferences: readonly BasicLocationSourceReference[];
  referenceDate: string | null;
  referencePeriod: string | null;
  confidenceReasons: readonly BasicLocationConfidenceReason[];
  limitations: readonly BasicLocationLimitation[];
  missingReason: BasicLocationMissingReason | null;
  fieldCheckRequired: boolean;
  fieldCheckKeys: readonly string[];
  requiresNote: boolean;
}

export interface P0BasicLocationAnalysisContextViewModel {
  analysisRunId: string;
  target: {
    latitude: number | null;
    longitude: number | null;
    radiusMeters: 300 | 500 | null;
    source: "address" | "map" | null;
    confirmedAddress: string | null;
  };
  frameone: {
    districtId: string | null;
    districtName: string | null;
    marketId: string | null;
    marketName: string | null;
    submarketId: string | null;
    submarketName: string | null;
    nodeId: string | null;
    nodeName: string | null;
  };
}

export interface P0BasicLocationAvailableEvidenceViewModel {
  target: readonly P0BasicLocationResultViewModel[];
  frameone: readonly P0BasicLocationResultViewModel[];
  kakaoObserved: readonly P0BasicLocationResultViewModel[];
  other: readonly P0BasicLocationResultViewModel[];
}

export interface P0BasicLocationOfficialReferenceViewModel {
  relation: readonly P0BasicLocationResultViewModel[];
  sales: readonly P0BasicLocationResultViewModel[];
  stores: readonly P0BasicLocationResultViewModel[];
  trend: readonly P0BasicLocationResultViewModel[];
  other: readonly P0BasicLocationResultViewModel[];
}

export interface P0BasicLocationCurrentInterpretationViewModel {
  summary: BasicLocationInterpretationSignal | null;
  confirmedSignals: readonly BasicLocationInterpretationSignal[];
  referenceSignals: readonly BasicLocationInterpretationSignal[];
  riskSignals: readonly BasicLocationInterpretationSignal[];
}

export interface P0BasicLocationLimitationResultViewModel {
  resultId: string;
  metricKey: string;
  metricLabel: string;
  status: BasicLocationResultStatus;
  valueType: BasicLocationValueType;
  missingReason: BasicLocationMissingReason | null;
  limitations: readonly BasicLocationLimitation[];
  requiresNote: boolean;
}

export interface P0BasicLocationLimitationsViewModel {
  results: readonly P0BasicLocationLimitationResultViewModel[];
  unknowns: readonly BasicLocationInterpretationSignal[];
}

export interface P0BasicLocationFieldHandoffViewModel {
  nextChecks: readonly BasicLocationInterpretationSignal[];
}

export interface P0BasicLocationPresentationFeatureViewModel {
  id: string;
  message: string;
  basisResultIds: readonly string[];
}

export interface P0BasicLocationPresentationStatusCardViewModel {
  id: "radius" | "kakao" | "official-market" | "analysis-stage";
  label: string;
  value: string;
}

export interface P0BasicLocationPresentationRoadmapItemViewModel {
  id: string;
  label: string;
  statusLabel: "추가 분석 예정";
}

export interface P0BasicLocationPresentationUnavailableItemViewModel {
  id: string;
  label: string;
  stateLabel: string;
}

export interface P0BasicLocationPresentationMetricViewModel {
  id: string;
  label: string;
  value: BasicLocationResultValue;
  unit: string | null;
  statusLabel: "확인" | "일부 확인" | "자료 확인 필요";
  referencePeriod: string | null;
  analysisUnitLabel: string | null;
  valueType: BasicLocationValueType | null;
  basisResultIds: readonly string[];
}

export interface P0BasicLocationPresentationOfficialAreaViewModel {
  name: string;
  basisResultIds: readonly string[];
}

export interface P0BasicLocationPresentationEvidenceViewModel {
  kakao: {
    statusLabel: "확인" | "일부 자료 확인 필요" | "자료 확인 필요";
    metrics: readonly P0BasicLocationPresentationMetricViewModel[];
  };
  officialRelation: {
    available: boolean;
    included: readonly P0BasicLocationPresentationOfficialAreaViewModel[];
    overlapping: readonly P0BasicLocationPresentationOfficialAreaViewModel[];
    basisResultIds: readonly string[];
  };
  officialStats: {
    marketName: string;
    referencePeriod: string | null;
    sales: readonly P0BasicLocationPresentationMetricViewModel[];
    stores: readonly P0BasicLocationPresentationMetricViewModel[];
  } | null;
  trend: {
    marketName: string;
    referencePeriod: string | null;
    metrics: readonly P0BasicLocationPresentationMetricViewModel[];
  } | null;
}

export interface P0BasicLocationPresentationViewModel {
  header: {
    marketName: string | null;
    submarketName: string | null;
    radiusMeters: 300 | 500 | null;
    targetSourceLabel: "주소 검색" | "지도 선택" | "위치 선택 방식 확인 필요";
    confirmedAddress: string | null;
  };
  statusCards: readonly P0BasicLocationPresentationStatusCardViewModel[];
  summary: {
    confirmedFeatures: readonly P0BasicLocationPresentationFeatureViewModel[];
    unavailableNow: readonly P0BasicLocationPresentationUnavailableItemViewModel[];
    nextAnalysis: readonly P0BasicLocationPresentationRoadmapItemViewModel[];
  };
  evidence: P0BasicLocationPresentationEvidenceViewModel;
}

export interface P0BasicLocationViewModel {
  schemaVersion: typeof VIEW_MODEL_SCHEMA_VERSION;
  analysisRunId: string;
  audience: BasicLocationAudience;
  analysisContext: P0BasicLocationAnalysisContextViewModel;
  marketIdentity: readonly P0BasicLocationResultViewModel[];
  availableEvidence: P0BasicLocationAvailableEvidenceViewModel;
  officialMarketReference: P0BasicLocationOfficialReferenceViewModel;
  currentInterpretation: P0BasicLocationCurrentInterpretationViewModel;
  limitations: P0BasicLocationLimitationsViewModel;
  fieldHandoff: P0BasicLocationFieldHandoffViewModel;
  dataEvidence: readonly P0BasicLocationResultViewModel[];
  presentation: P0BasicLocationPresentationViewModel;
}

export interface BuildP0BasicLocationViewModelInput {
  analysisRunId: string;
  audience: BasicLocationAudience;
  displayableResults: readonly DisplayableBasicLocationResult[];
  interpretation: BasicLocationInterpretation;
}

export class P0BasicLocationViewModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P0BasicLocationViewModelValidationError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function cloneSource(source: BasicLocationSource | null): BasicLocationSource | null {
  return source ? { ...source } : null;
}

function cloneSourceReference(
  reference: BasicLocationSourceReference,
): BasicLocationSourceReference {
  return { ...reference };
}

function toResultViewModel(
  displayable: DisplayableBasicLocationResult,
): P0BasicLocationResultViewModel {
  const { result } = displayable;
  return {
    resultId: result.resultId,
    analysisLayer: result.analysisLayer,
    analysisUnit: { ...result.analysisUnit },
    metricKey: result.metricKey,
    metricLabel: result.metricLabel,
    value: Array.isArray(result.value) ? [...result.value] : result.value,
    unit: result.unit,
    valueType: result.valueType,
    status: result.status,
    confidence: result.confidence,
    confidenceReasons: result.confidenceReasons.map((reason) => ({ ...reason })),
    primarySource: cloneSource(result.primarySource),
    sourceReferences: result.sourceReferences.map(cloneSourceReference),
    referenceDate: result.referenceDate,
    referencePeriod: result.referencePeriod,
    limitations: result.limitations.map((limitation) => ({ ...limitation })),
    missingReason: result.missingReason,
    fieldCheckRequired: result.fieldCheckRequired,
    fieldCheckKeys: [...result.fieldCheckKeys],
    requiresNote: displayable.requiresNote,
  };
}

function cloneSignal(
  signal: BasicLocationInterpretationSignal,
): BasicLocationInterpretationSignal {
  return {
    id: signal.id,
    message: signal.message,
    basisResultIds: [...signal.basisResultIds],
  };
}

function isVisibleSignal(
  signal: BasicLocationInterpretationSignal,
  visibleResultIds: ReadonlySet<string>,
): boolean {
  return (
    signal.basisResultIds.length > 0 &&
    signal.basisResultIds.every((resultId) => visibleResultIds.has(resultId))
  );
}

function filterSignals(
  signals: readonly BasicLocationInterpretationSignal[],
  visibleResultIds: ReadonlySet<string>,
): BasicLocationInterpretationSignal[] {
  return signals
    .filter((signal) => isVisibleSignal(signal, visibleResultIds))
    .map(cloneSignal);
}

function findResult(
  results: readonly DisplayableBasicLocationResult[],
  metricKey: string,
): BasicLocationResult | undefined {
  return results.find(({ result }) => result.metricKey === metricKey)?.result;
}

function stringValue(result: BasicLocationResult | undefined): string | null {
  return result && typeof result.value === "string" ? result.value : null;
}

function numberValue(result: BasicLocationResult | undefined): number | null {
  return result && typeof result.value === "number" && Number.isFinite(result.value)
    ? result.value
    : null;
}

function buildAnalysisContext(
  analysisRunId: string,
  results: readonly DisplayableBasicLocationResult[],
): P0BasicLocationAnalysisContextViewModel {
  const radius = numberValue(findResult(results, "analysis.target.radius_meters"));
  const source = stringValue(findResult(results, "analysis.target.source"));

  return {
    analysisRunId,
    target: {
      latitude: numberValue(findResult(results, "analysis.target.latitude")),
      longitude: numberValue(findResult(results, "analysis.target.longitude")),
      radiusMeters: radius === 300 || radius === 500 ? radius : null,
      source: source === "address" || source === "map" ? source : null,
      confirmedAddress: stringValue(
        findResult(results, "analysis.target.confirmed_address"),
      ),
    },
    frameone: {
      districtId: stringValue(findResult(results, "frameone.district.id")),
      districtName:
        stringValue(findResult(results, "frameone.district.name")) ??
        stringValue(findResult(results, "frameone.market.district_name")),
      marketId: stringValue(findResult(results, "frameone.market.id")),
      marketName: stringValue(findResult(results, "frameone.market.name")),
      submarketId: stringValue(findResult(results, "frameone.submarket.id")),
      submarketName: stringValue(findResult(results, "frameone.submarket.name")),
      nodeId: stringValue(findResult(results, "frameone.node.id")),
      nodeName: stringValue(findResult(results, "frameone.node.name")),
    },
  };
}

function presentationTargetSourceLabel(
  source: P0BasicLocationAnalysisContextViewModel["target"]["source"],
): P0BasicLocationPresentationViewModel["header"]["targetSourceLabel"] {
  if (source === "address") return "주소 검색";
  if (source === "map") return "지도 선택";
  return "위치 선택 방식 확인 필요";
}

function findDisplayableResult(
  results: readonly DisplayableBasicLocationResult[],
  metricKey: string,
): DisplayableBasicLocationResult | undefined {
  return results.find(({ result }) => result.metricKey === metricKey);
}

function availableResultIds(
  results: readonly DisplayableBasicLocationResult[],
  metricKeys: readonly string[],
): string[] {
  return results
    .filter(({ result }) =>
      metricKeys.includes(result.metricKey) &&
      result.status !== "BLOCKED" &&
      result.status !== "NOT_AVAILABLE" &&
      result.value !== null,
    )
    .map(({ result }) => result.resultId);
}

function relationResults(
  results: readonly DisplayableBasicLocationResult[],
  relation: "INSIDE" | "RADIUS_OVERLAP",
) {
  return results.filter(({ result }) =>
    result.metricKey === "official_commercial_area.spatial_relation" &&
    result.status === "AVAILABLE" &&
    result.value === relation,
  );
}

const KAKAO_CATEGORY_METRIC_KEYS = [
  "kakao.nearby.bakery.returned_count",
  "kakao.nearby.confectionery.returned_count",
  "kakao.nearby.cafe.returned_count",
] as const;

const KAKAO_PRESENTATION_METRICS = [
  { metricKey: "kakao.nearby.bakery.returned_count", label: "베이커리 검색" },
  { metricKey: "kakao.nearby.confectionery.returned_count", label: "제과점 검색" },
  { metricKey: "kakao.nearby.cafe.returned_count", label: "카페 검색" },
  { metricKey: "kakao.nearby.unique_returned_count", label: "중복 제거 장소" },
] as const;

const PRESENTATION_UNAVAILABLE_ITEMS: readonly P0BasicLocationPresentationUnavailableItemViewModel[] = Object.freeze([
  Object.freeze({ id: "living-population-demand", label: "생활인구 기반 수요", stateLabel: "아직 분석 전" }),
  Object.freeze({ id: "pedestrian-flow", label: "실제 보행 흐름", stateLabel: "추가 데이터 분석 필요" }),
  Object.freeze({ id: "stay-potential", label: "체류 가능성", stateLabel: "추가 분석 예정" }),
  Object.freeze({ id: "promising-segment", label: "출점 유망구간", stateLabel: "후속 분석 단계" }),
]);

const PRESENTATION_NEXT_ANALYSIS: readonly P0BasicLocationPresentationRoadmapItemViewModel[] = Object.freeze([
  Object.freeze({ id: "living-population", label: "생활인구 기반 수요", statusLabel: "추가 분석 예정" }),
  Object.freeze({ id: "transit-pedestrian", label: "지하철·버스 및 보행 연결", statusLabel: "추가 분석 예정" }),
  Object.freeze({ id: "stay-facilities", label: "체류 유발시설 / Stay Potential", statusLabel: "추가 분석 예정" }),
  Object.freeze({ id: "competition-structure", label: "경쟁점 구조", statusLabel: "추가 분석 예정" }),
]);

function presentationMetricStatus(
  displayable: DisplayableBasicLocationResult | undefined,
): P0BasicLocationPresentationMetricViewModel["statusLabel"] {
  if (displayable?.result.status === "AVAILABLE") return "확인";
  if (displayable?.result.status === "PARTIAL" && displayable.result.value !== null) {
    return "일부 확인";
  }
  return "자료 확인 필요";
}

function toPresentationMetric(
  displayable: DisplayableBasicLocationResult | undefined,
  id: string,
  label: string,
): P0BasicLocationPresentationMetricViewModel {
  const result = displayable?.result;
  return {
    id,
    label,
    value: result?.value ?? null,
    unit: result?.unit ?? null,
    statusLabel: presentationMetricStatus(displayable),
    referencePeriod: result?.referencePeriod ?? result?.referenceDate ?? null,
    analysisUnitLabel: result?.analysisUnit.label ?? null,
    valueType: result?.valueType ?? null,
    basisResultIds: result ? [result.resultId] : [],
  };
}

function isPresentationValue(
  result: BasicLocationResult,
): boolean {
  return result.value !== null &&
    result.status !== "BLOCKED" &&
    result.status !== "NOT_AVAILABLE";
}

function officialAreas(
  results: readonly DisplayableBasicLocationResult[],
  excludedKeys: ReadonlySet<string> = new Set(),
): P0BasicLocationPresentationOfficialAreaViewModel[] {
  const areas: P0BasicLocationPresentationOfficialAreaViewModel[] = [];
  const seen = new Set<string>();
  for (const { result } of results) {
    const key = result.analysisUnit.id || result.analysisUnit.label;
    if (excludedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    areas.push({
      name: result.analysisUnit.label,
      basisResultIds: [result.resultId],
    });
  }
  return areas;
}

function buildPresentationEvidence(
  customerResults: readonly DisplayableBasicLocationResult[],
): P0BasicLocationPresentationEvidenceViewModel {
  const kakaoMetrics = KAKAO_PRESENTATION_METRICS.map(({ metricKey, label }) =>
    toPresentationMetric(
      findDisplayableResult(customerResults, metricKey),
      metricKey,
      label,
    ),
  );
  const confirmedKakaoCount = kakaoMetrics.filter(
    (metric) => metric.statusLabel === "확인",
  ).length;
  const kakaoStatus = confirmedKakaoCount === kakaoMetrics.length
    ? "확인"
    : kakaoMetrics.some((metric) => metric.basisResultIds.length > 0)
      ? "일부 자료 확인 필요"
      : "자료 확인 필요";

  const insideResults = relationResults(customerResults, "INSIDE");
  const overlapResults = relationResults(customerResults, "RADIUS_OVERLAP");
  const included = officialAreas(insideResults);
  const includedKeys = new Set(
    insideResults.map(({ result }) => result.analysisUnit.id || result.analysisUnit.label),
  );
  const overlapping = officialAreas(overlapResults, includedKeys);
  const relatedCount = findDisplayableResult(
    customerResults,
    "official_commercial_area.related_count",
  );
  const officialRelationAvailable = included.length > 0 ||
    overlapping.length > 0 ||
    (relatedCount?.result.status === "AVAILABLE" && relatedCount.result.value === 0);
  const officialRelationBasisIds = [
    ...included.flatMap((area) => area.basisResultIds),
    ...overlapping.flatMap((area) => area.basisResultIds),
    ...(relatedCount ? [relatedCount.result.resultId] : []),
  ];

  const salesResults = customerResults.filter(({ result }) =>
    result.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA" &&
    !result.metricKey.includes(".trend.") &&
    result.metricKey.includes(".sales.") &&
    isPresentationValue(result),
  );
  const storeResults = customerResults.filter(({ result }) =>
    result.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA" &&
    !result.metricKey.includes(".trend.") &&
    result.metricKey.includes(".stores.") &&
    isPresentationValue(result),
  );
  const trendResults = customerResults.filter(({ result }) =>
    result.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA" &&
    result.metricKey.includes(".trend.") &&
    isPresentationValue(result),
  );
  const officialStatsResults = [...salesResults, ...storeResults];
  const statsContextResult = officialStatsResults[0]?.result;
  const trendContextResult = trendResults[0]?.result;

  return {
    kakao: {
      statusLabel: kakaoStatus,
      metrics: kakaoMetrics,
    },
    officialRelation: {
      available: officialRelationAvailable,
      included,
      overlapping,
      basisResultIds: officialRelationBasisIds,
    },
    officialStats: statsContextResult ? {
      marketName: statsContextResult.analysisUnit.label,
      referencePeriod: officialStatsResults.find(({ result }) =>
        result.referencePeriod || result.referenceDate)?.result.referencePeriod ??
        officialStatsResults.find(({ result }) =>
          result.referencePeriod || result.referenceDate)?.result.referenceDate ?? null,
      sales: salesResults.map((displayable) => toPresentationMetric(
        displayable,
        displayable.result.metricKey,
        displayable.result.metricLabel,
      )),
      stores: storeResults.map((displayable) => toPresentationMetric(
        displayable,
        displayable.result.metricKey,
        displayable.result.metricLabel,
      )),
    } : null,
    trend: trendContextResult ? {
      marketName: trendContextResult.analysisUnit.label,
      referencePeriod: trendResults.find(({ result }) =>
        result.referencePeriod || result.referenceDate)?.result.referencePeriod ??
        trendResults.find(({ result }) =>
          result.referencePeriod || result.referenceDate)?.result.referenceDate ?? null,
      metrics: trendResults.map((displayable) => toPresentationMetric(
        displayable,
        displayable.result.metricKey,
        displayable.result.metricLabel,
      )),
    } : null,
  };
}

function buildPresentation(
  analysisContext: P0BasicLocationAnalysisContextViewModel,
  staffDisplayableResults: readonly DisplayableBasicLocationResult[],
): P0BasicLocationPresentationViewModel {
  const customerResults = applyBasicLocationDisplayPolicy(
    staffDisplayableResults.map(({ result }) => result),
    "CUSTOMER",
  );
  const evidence = buildPresentationEvidence(customerResults);
  const kakaoStatus = evidence.kakao.statusLabel === "확인"
    ? "Kakao 확인"
    : evidence.kakao.statusLabel;
  const officialStatus = evidence.officialRelation.available
    ? `포함 ${evidence.officialRelation.included.length} · 교차 ${evidence.officialRelation.overlapping.length}`
    : "자료 확인 필요";
  const analysisStage = kakaoStatus === "Kakao 확인" && evidence.officialRelation.available
    ? "P0 기초근거 확인"
    : "일부 자료 확인 필요";

  const confirmedFeatures: P0BasicLocationPresentationFeatureViewModel[] = [];
  const kakaoBasisResultIds = availableResultIds(
    customerResults,
    KAKAO_CATEGORY_METRIC_KEYS,
  );
  if (kakaoBasisResultIds.length > 0) {
    confirmedFeatures.push({
      id: "kakao-observation-confirmed",
      message: kakaoStatus === "Kakao 확인"
        ? "베이커리·제과점·카페 장소검색 결과를 확인했습니다."
        : "주변 업종 장소검색 결과 일부를 확인했습니다.",
      basisResultIds: kakaoBasisResultIds,
    });
  }
  if (evidence.officialRelation.included.length > 0) {
    confirmedFeatures.push({
      id: "official-market-inside-confirmed",
      message: `분석지점이 서울시 공식상권 ${evidence.officialRelation.included.length}개에 포함됩니다.`,
      basisResultIds: evidence.officialRelation.included.flatMap((area) => area.basisResultIds),
    });
  }
  if (evidence.officialRelation.overlapping.length > 0) {
    confirmedFeatures.push({
      id: "official-market-overlap-confirmed",
      message: `${analysisContext.target.radiusMeters ?? "분석"}m 반경이 서울시 공식상권 ${evidence.officialRelation.overlapping.length}개와 교차합니다.`,
      basisResultIds: evidence.officialRelation.overlapping.flatMap((area) => area.basisResultIds),
    });
  }

  return {
    header: {
      marketName: analysisContext.frameone.marketName,
      submarketName: analysisContext.frameone.submarketName,
      radiusMeters: analysisContext.target.radiusMeters,
      targetSourceLabel: presentationTargetSourceLabel(analysisContext.target.source),
      confirmedAddress: analysisContext.target.confirmedAddress,
    },
    statusCards: [
      {
        id: "radius",
        label: "분석 반경",
        value: analysisContext.target.radiusMeters
          ? `${analysisContext.target.radiusMeters}m`
          : "반경 확인 필요",
      },
      { id: "kakao", label: "주변 업종 관측", value: kakaoStatus },
      { id: "official-market", label: "서울시 공식상권", value: officialStatus },
      { id: "analysis-stage", label: "현재 분석 단계", value: analysisStage },
    ],
    summary: {
      confirmedFeatures,
      unavailableNow: PRESENTATION_UNAVAILABLE_ITEMS,
      nextAnalysis: PRESENTATION_NEXT_ANALYSIS,
    },
    evidence,
  };
}

function isAvailableEvidence(result: BasicLocationResult): boolean {
  return (
    result.status !== "BLOCKED" &&
    result.status !== "NOT_AVAILABLE" &&
    result.valueType !== "UNKNOWN" &&
    result.value !== null
  );
}

function isOfficialReference(result: BasicLocationResult): boolean {
  return result.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA";
}

function isLimitationResult(
  displayable: DisplayableBasicLocationResult,
): boolean {
  const { result } = displayable;
  return (
    result.status === "BLOCKED" ||
    result.status === "NOT_AVAILABLE" ||
    result.valueType === "UNKNOWN" ||
    result.value === null ||
    result.limitations.length > 0 ||
    displayable.requiresNote
  );
}

function validateInput(input: BuildP0BasicLocationViewModelInput): void {
  if (input.analysisRunId.trim().length === 0) {
    throw new P0BasicLocationViewModelValidationError(
      "analysisRunId must not be empty.",
    );
  }
  if (input.interpretation.analysisRunId !== input.analysisRunId) {
    throw new P0BasicLocationViewModelValidationError(
      "Interpretation analysisRunId does not match the requested analysis run.",
    );
  }

  const resultIds = new Set<string>();
  for (const { result } of input.displayableResults) {
    if (result.analysisRunId !== input.analysisRunId) {
      throw new P0BasicLocationViewModelValidationError(
        `Result ${result.resultId} belongs to a different analysis run.`,
      );
    }
    if (resultIds.has(result.resultId)) {
      throw new P0BasicLocationViewModelValidationError(
        `Duplicate resultId is not allowed: ${result.resultId}`,
      );
    }
    resultIds.add(result.resultId);
  }
}

export function buildP0BasicLocationViewModel(
  input: BuildP0BasicLocationViewModelInput,
): P0BasicLocationViewModel {
  validateInput(input);

  const visibleResultIds = new Set(
    input.displayableResults.map(({ result }) => result.resultId),
  );
  const resultViewModels = input.displayableResults.map(toResultViewModel);
  const marketIdentity = input.displayableResults
    .filter(({ result }) => result.analysisLayer === "MARKET_IDENTITY")
    .map(toResultViewModel);

  const targetEvidence: P0BasicLocationResultViewModel[] = [];
  const frameoneEvidence: P0BasicLocationResultViewModel[] = [];
  const kakaoObservedEvidence: P0BasicLocationResultViewModel[] = [];
  const otherEvidence: P0BasicLocationResultViewModel[] = [];
  const officialRelation: P0BasicLocationResultViewModel[] = [];
  const officialSales: P0BasicLocationResultViewModel[] = [];
  const officialStores: P0BasicLocationResultViewModel[] = [];
  const officialTrend: P0BasicLocationResultViewModel[] = [];
  const otherOfficialReference: P0BasicLocationResultViewModel[] = [];

  for (const displayable of input.displayableResults) {
    const { result } = displayable;
    const viewModel = toResultViewModel(displayable);

    if (isOfficialReference(result)) {
      if (result.metricKey.includes(".sales.")) {
        officialSales.push(viewModel);
      } else if (result.metricKey.includes(".stores.")) {
        officialStores.push(viewModel);
      } else if (result.metricKey.includes(".trend.")) {
        officialTrend.push(viewModel);
      } else if (result.metricKey.startsWith("official_commercial_area.")) {
        officialRelation.push(viewModel);
      } else {
        otherOfficialReference.push(viewModel);
      }
    }

    if (!isAvailableEvidence(result) || isOfficialReference(result)) {
      continue;
    }
    if (result.metricKey.startsWith("analysis.target.")) {
      targetEvidence.push(viewModel);
    } else if (result.analysisLayer === "MARKET_IDENTITY") {
      frameoneEvidence.push(viewModel);
    } else if (result.metricKey.startsWith("kakao.nearby.")) {
      kakaoObservedEvidence.push(viewModel);
    } else {
      otherEvidence.push(viewModel);
    }
  }

  const summary =
    input.interpretation.summary &&
    isVisibleSignal(input.interpretation.summary, visibleResultIds)
      ? cloneSignal(input.interpretation.summary)
      : null;

  const analysisContext = buildAnalysisContext(
    input.analysisRunId,
    input.displayableResults,
  );
  const model: P0BasicLocationViewModel = {
    schemaVersion: VIEW_MODEL_SCHEMA_VERSION,
    analysisRunId: input.analysisRunId,
    audience: input.audience,
    analysisContext,
    marketIdentity,
    availableEvidence: {
      target: targetEvidence,
      frameone: frameoneEvidence,
      kakaoObserved: kakaoObservedEvidence,
      other: otherEvidence,
    },
    officialMarketReference: {
      relation: officialRelation,
      sales: officialSales,
      stores: officialStores,
      trend: officialTrend,
      other: otherOfficialReference,
    },
    currentInterpretation: {
      summary,
      confirmedSignals: filterSignals(
        input.interpretation.confirmedSignals,
        visibleResultIds,
      ),
      referenceSignals: filterSignals(
        input.interpretation.referenceSignals,
        visibleResultIds,
      ),
      riskSignals: filterSignals(
        input.interpretation.riskSignals,
        visibleResultIds,
      ),
    },
    limitations: {
      results: input.displayableResults.filter(isLimitationResult).map((displayable) => {
        const { result } = displayable;
        return {
          resultId: result.resultId,
          metricKey: result.metricKey,
          metricLabel: result.metricLabel,
          status: result.status,
          valueType: result.valueType,
          missingReason: result.missingReason,
          limitations: result.limitations.map((limitation) => ({ ...limitation })),
          requiresNote: displayable.requiresNote,
        };
      }),
      unknowns: filterSignals(input.interpretation.unknowns, visibleResultIds),
    },
    fieldHandoff: {
      nextChecks: filterSignals(input.interpretation.nextChecks, visibleResultIds),
    },
    dataEvidence: resultViewModels,
    presentation: buildPresentation(analysisContext, input.displayableResults),
  };

  return deepFreeze(model);
}
