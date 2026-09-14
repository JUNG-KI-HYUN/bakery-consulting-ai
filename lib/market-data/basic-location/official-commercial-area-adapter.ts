import type { MarketAnalysisRequestStatus } from "../market-analysis-context";
import type { OfficialMarketSpatialResult } from "../official-market-spatial-relation";
import type { AnalysisRunSnapshot } from "./run";
import {
  createAvailableResult,
  createUnavailableResult,
  type BasicLocationAnalysisUnit,
  type BasicLocationResult,
} from "./results";

const OFFICIAL_SOURCE = {
  sourceId: "SRC-SEOUL-OA-15560",
  sourceName: "서울시 상권분석서비스 영역-상권",
  sourceType: "PUBLIC_DATA_OFFICIAL",
} as const;

const CALCULATION_SOURCE = {
  sourceId: null,
  sourceName: "FRAMEONE 공식상권 공간관계 계산",
  sourceType: "SYSTEM_CALCULATION",
} as const;

const RELATION_LIMITATION = {
  code: "UNIT_SCOPE_MISMATCH_RISK",
  message: "서울시 공식상권은 분석지점의 300m/500m 반경 및 FRAMEONE Market과 서로 다른 공간단위입니다.",
  severity: "CAUTION",
} as const;

export interface OfficialCommercialAreaRelationAdapterInput {
  snapshot: AnalysisRunSnapshot;
  status: MarketAnalysisRequestStatus;
  results: readonly OfficialMarketSpatialResult[] | null;
  error: string | null;
  geometryVersion: string;
  sourceDate: string | null;
  evaluatedAt: string;
  relationMethodologyVersion: string;
}

function requireNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path}가 비어 있습니다.`);
}

function requireTimestamp(value: string, path: string) {
  requireNonEmpty(value, path);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${path}가 유효한 시각이 아닙니다.`);
}

function radiusUnit(snapshot: AnalysisRunSnapshot): BasicLocationAnalysisUnit {
  return {
    type: snapshot.target.radiusMeters === 300 ? "RADIUS_300M" : "RADIUS_500M",
    id: `${snapshot.analysisRunId}:target`,
    label: `분석 반경 ${snapshot.target.radiusMeters}m`,
  };
}

function sourceReferences(input: OfficialCommercialAreaRelationAdapterInput) {
  return [{
    sourceId: OFFICIAL_SOURCE.sourceId,
    locator: "data/seoul-market/v1.1-final/09_GEO/OFFICIAL_SEOUL_MARKETS.geojson",
    sourceVersion: input.geometryVersion,
  }];
}

function notAvailable(input: OfficialCommercialAreaRelationAdapterInput, missingReason: "SOURCE_ERROR" | "NOT_CALCULATED") {
  return createUnavailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: "DATA_EVIDENCE",
    analysisUnit: radiusUnit(input.snapshot),
    metricKey: "official_commercial_area.related_count",
    metricLabel: "연결된 서울시 공식상권 수",
    unit: "areas",
    primarySource: OFFICIAL_SOURCE,
    sourceReferences: sourceReferences(input),
    referenceDate: input.sourceDate,
    referencePeriod: null,
    limitations: [RELATION_LIMITATION],
    missingReason,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "HIDDEN",
    methodologyNote: input.error,
    updatedAt: input.evaluatedAt,
  });
}

function officialValueResult(
  input: OfficialCommercialAreaRelationAdapterInput,
  analysisUnit: BasicLocationAnalysisUnit,
  metricKey: string,
  metricLabel: string,
  value: string,
) {
  return createAvailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: "DATA_EVIDENCE",
    analysisUnit,
    metricKey,
    metricLabel,
    value,
    unit: null,
    valueType: "OFFICIAL_VALUE",
    primarySource: OFFICIAL_SOURCE,
    sourceReferences: sourceReferences(input),
    referenceDate: input.sourceDate,
    referencePeriod: null,
    confidence: "HIGH",
    confidenceReasons: [{ code: "DIRECT_OFFICIAL_SOURCE", message: "공식 Polygon Source의 상권 식별값을 그대로 사용했습니다." }],
    limitations: [RELATION_LIMITATION],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "CUSTOMER_READY",
    methodologyNote: "서울시 공식상권 식별값이며 FRAMEONE Market 식별값이 아닙니다.",
    updatedAt: input.evaluatedAt,
  });
}

export function adaptOfficialCommercialAreaRelationResults(
  input: OfficialCommercialAreaRelationAdapterInput,
): readonly BasicLocationResult[] {
  requireTimestamp(input.evaluatedAt, "evaluatedAt");
  requireNonEmpty(input.geometryVersion, "geometryVersion");
  requireNonEmpty(input.relationMethodologyVersion, "relationMethodologyVersion");
  if (input.sourceDate !== null && !Number.isFinite(Date.parse(input.sourceDate))) {
    throw new Error("sourceDate가 유효한 날짜가 아닙니다.");
  }
  if (input.status === "error") return Object.freeze([notAvailable(input, "SOURCE_ERROR")]);
  if (input.status !== "success" || input.results === null) {
    return Object.freeze([notAvailable(input, "NOT_CALCULATED")]);
  }

  const seenCodes = new Set<string>();
  for (const relation of input.results) {
    requireNonEmpty(relation.marketCode, "officialMarket.marketCode");
    requireNonEmpty(relation.marketName, "officialMarket.marketName");
    if (seenCodes.has(relation.marketCode)) throw new Error("공식상권 코드가 중복되었습니다.");
    seenCodes.add(relation.marketCode);
    if (!["INSIDE", "RADIUS_OVERLAP", "OUTSIDE", "UNKNOWN"].includes(relation.relation)) {
      throw new Error("공식상권 relation이 올바르지 않습니다.");
    }
    if (relation.analysisRadiusMeters !== input.snapshot.target.radiusMeters) {
      throw new Error("공식상권 관계 반경과 analysis snapshot 반경이 일치하지 않습니다.");
    }
  }

  const related = input.results.filter((result) => result.relation === "INSIDE" || result.relation === "RADIUS_OVERLAP");
  const hasUnknown = input.results.some((result) => result.relation === "UNKNOWN");
  const output: BasicLocationResult[] = [hasUnknown
    ? notAvailable(input, "NOT_CALCULATED")
    : createAvailableResult({
      analysisRunId: input.snapshot.analysisRunId,
      analysisLayer: "DATA_EVIDENCE",
      analysisUnit: radiusUnit(input.snapshot),
      metricKey: "official_commercial_area.related_count",
      metricLabel: "연결된 서울시 공식상권 수",
      value: related.length,
      unit: "areas",
      valueType: "CALCULATED_VALUE",
      primarySource: CALCULATION_SOURCE,
      sourceReferences: sourceReferences(input),
      referenceDate: input.sourceDate,
      referencePeriod: null,
      confidence: "HIGH",
      confidenceReasons: [{ code: "UNIT_MATCHED", message: "실행 좌표·반경과 검증된 공식상권 Polygon의 계산 결과입니다." }],
      limitations: [RELATION_LIMITATION],
      fieldCheckRequired: false,
      fieldCheckKeys: [],
      customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
      methodologyNote: `${input.relationMethodologyVersion}; 정상 계산 결과 0은 연결 공식상권 없음이며 Source 오류가 아닙니다.`,
      updatedAt: input.evaluatedAt,
    })];

  for (const relation of related) {
    if (relation.relation !== "INSIDE" && relation.relation !== "RADIUS_OVERLAP") continue;

    const analysisUnit: BasicLocationAnalysisUnit = {
      type: "OFFICIAL_COMMERCIAL_AREA",
      id: relation.marketCode,
      label: relation.marketName,
    };
    output.push(
      officialValueResult(input, analysisUnit, "official_commercial_area.id", "서울시 공식상권 ID", relation.marketCode),
      officialValueResult(input, analysisUnit, "official_commercial_area.name", "서울시 공식상권명", relation.marketName),
      createAvailableResult({
        analysisRunId: input.snapshot.analysisRunId,
        analysisLayer: "DATA_EVIDENCE",
        analysisUnit,
        metricKey: "official_commercial_area.spatial_relation",
        metricLabel: "분석지점·반경과 공식상권 공간관계",
        value: relation.relation,
        unit: null,
        valueType: "CALCULATED_VALUE",
        primarySource: CALCULATION_SOURCE,
        sourceReferences: sourceReferences(input),
        referenceDate: input.sourceDate,
        referencePeriod: null,
        confidence: "HIGH",
        confidenceReasons: [{ code: "UNIT_MATCHED", message: "실행 좌표·반경과 공식상권 Polygon을 동일 계산 입력으로 사용했습니다." }],
        limitations: [RELATION_LIMITATION],
        fieldCheckRequired: false,
        fieldCheckKeys: [],
        customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
        methodologyNote: `${input.relationMethodologyVersion}; RADIUS_OVERLAP은 분석지점이 공식상권 내부라는 의미가 아닙니다.`,
        updatedAt: input.evaluatedAt,
      }),
    );
  }

  return Object.freeze(output);
}
