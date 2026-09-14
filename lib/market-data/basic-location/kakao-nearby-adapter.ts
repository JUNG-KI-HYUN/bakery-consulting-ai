import type {
  KakaoNearbySearchState,
  NearbyCategoryId,
  NearbyCategoryResult,
  NearbyPlace,
} from "../market-analysis-context";
import type { AnalysisRunSnapshot } from "./run";
import {
  createAvailableResult,
  createUnavailableResult,
  type BasicLocationAnalysisUnit,
  type BasicLocationMissingReason,
  type BasicLocationResult,
} from "./results";

const KAKAO_SOURCE = {
  sourceId: "SRC-KAKAO-LOCAL-MAP",
  sourceName: "Kakao Local 장소검색",
  sourceType: "EXTERNAL_PLATFORM",
} as const;

const KAKAO_LIMITATIONS = [
  {
    code: "SEARCH_NOT_CENSUS",
    message: "Kakao 장소검색 결과이며 전체 사업체 또는 실제 경쟁점 전수조사가 아닙니다.",
    severity: "CAUTION",
  },
  {
    code: "OPERATING_STATUS_UNVERIFIED",
    message: "검색된 장소의 실제 영업 여부, 업종 실체와 직접경쟁 여부는 현장에서 확인해야 합니다.",
    severity: "CAUTION",
  },
] as const;

const FIELD_CHECK_KEYS = [
  "COMPETITOR_OPEN_CHECK",
  "COMPETITOR_CATEGORY_CHECK",
  "COMPETITOR_DIRECTNESS_CHECK",
  "COMPETITOR_SCALE_CHECK",
  "COMPETITOR_CUSTOMER_COUNT_CHECK",
  "COMPETITOR_ACCESS_CHECK",
] as const;

const CATEGORY_LABELS: Record<NearbyCategoryId, string> = {
  bakery: "베이커리",
  confectionery: "제과점",
  cafe: "카페",
};

export interface KakaoNearbyResponseForAdapter {
  center?: { latitude?: number; longitude?: number };
  radiusM?: number;
  categories?: Array<NearbyCategoryResult & { id: NearbyCategoryId }>;
  uniquePlaceCount?: number;
  uniquePlaces?: NearbyPlace[];
  message?: string;
}

export interface KakaoNearbyAdapterInput {
  snapshot: AnalysisRunSnapshot;
  searchState: Omit<KakaoNearbySearchState, "response"> & {
    response: KakaoNearbyResponseForAdapter | null;
  };
  fetchedAt: string;
}

export interface KakaoNearbyPlaceEvidence {
  evidenceType: "KAKAO_NORMALIZED_PLACE";
  analysisRunId: string;
  sourceId: "SRC-KAKAO-LOCAL-MAP";
  provider: "Kakao Local 장소검색";
  fetchedAt: string;
  radiusMeters: 300 | 500;
  normalizedPlaceId: string;
  name: string;
  categoryId: NearbyCategoryId;
  categoryLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  matchedCategoryIds: readonly NearbyCategoryId[];
  matchedCategoryLabels: readonly string[];
  fieldCheckRequired: true;
}

export interface KakaoNearbyAdapterOutput {
  results: readonly BasicLocationResult[];
  placeEvidence: readonly KakaoNearbyPlaceEvidence[];
}

function requireNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}가 비어 있습니다.`);
  }
}

function requireTimestamp(value: string, path: string) {
  requireNonEmpty(value, path);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${path}가 유효한 시각이 아닙니다.`);
}

function requireFiniteCoordinate(value: unknown, minimum: number, maximum: number, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path}가 유효한 좌표가 아닙니다.`);
  }
}

function requireCount(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${path}는 0 이상의 정수여야 합니다.`);
  }
}

function radiusUnit(snapshot: AnalysisRunSnapshot): BasicLocationAnalysisUnit {
  return {
    type: snapshot.target.radiusMeters === 300 ? "RADIUS_300M" : "RADIUS_500M",
    id: `${snapshot.analysisRunId}:target`,
    label: `분석 반경 ${snapshot.target.radiusMeters}m`,
  };
}

function sourceLocator(radiusMeters: number, categoryId: NearbyCategoryId | "unique") {
  return `/api/markets/nearby-places?radius=${radiusMeters}#${categoryId}`;
}

function unavailableKakaoResult(
  input: KakaoNearbyAdapterInput,
  analysisUnit: BasicLocationAnalysisUnit,
  metricKey: string,
  metricLabel: string,
  missingReason: BasicLocationMissingReason,
) {
  if (missingReason === "BLOCKED_BY_GEOMETRY") throw new Error("Kakao 결측은 geometry blocker가 아닙니다.");
  return createUnavailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: "SURROUNDING_POI",
    analysisUnit,
    metricKey,
    metricLabel,
    unit: "places",
    primarySource: KAKAO_SOURCE,
    sourceReferences: [{ sourceId: KAKAO_SOURCE.sourceId, locator: sourceLocator(input.snapshot.target.radiusMeters, "unique"), sourceVersion: null }],
    referenceDate: input.fetchedAt,
    referencePeriod: null,
    limitations: [...KAKAO_LIMITATIONS],
    missingReason,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "HIDDEN",
    methodologyNote: input.searchState.error,
    updatedAt: input.fetchedAt,
  });
}

function validatePlace(place: NearbyPlace, index: number) {
  requireNonEmpty(place.id, `uniquePlaces[${index}].id`);
  requireNonEmpty(place.name, `uniquePlaces[${index}].name`);
  if (!(place.categoryId in CATEGORY_LABELS)) throw new Error(`uniquePlaces[${index}].categoryId가 올바르지 않습니다.`);
  requireNonEmpty(place.categoryLabel, `uniquePlaces[${index}].categoryLabel`);
  requireNonEmpty(place.address, `uniquePlaces[${index}].address`);
  requireFiniteCoordinate(place.latitude, -90, 90, `uniquePlaces[${index}].latitude`);
  requireFiniteCoordinate(place.longitude, -180, 180, `uniquePlaces[${index}].longitude`);
  if (!Number.isFinite(place.distanceM) || place.distanceM < 0) {
    throw new Error(`uniquePlaces[${index}].distanceM가 올바르지 않습니다.`);
  }
  for (const categoryId of place.matchedCategoryIds ?? [place.categoryId]) {
    if (!(categoryId in CATEGORY_LABELS)) throw new Error(`uniquePlaces[${index}].matchedCategoryIds가 올바르지 않습니다.`);
  }
  for (const label of place.matchedCategoryLabels ?? [place.categoryLabel]) {
    requireNonEmpty(label, `uniquePlaces[${index}].matchedCategoryLabels`);
  }
}

export function adaptKakaoNearbyResults(input: KakaoNearbyAdapterInput): KakaoNearbyAdapterOutput {
  requireTimestamp(input.fetchedAt, "fetchedAt");
  const analysisUnit = radiusUnit(input.snapshot);
  const completed = input.searchState.status === "success" || input.searchState.status === "error";
  if (!completed || !input.searchState.response) {
    const missingReason = input.searchState.status === "error" ? "SOURCE_ERROR" : "NOT_CALCULATED";
    return Object.freeze({
      results: Object.freeze([
        unavailableKakaoResult(input, analysisUnit, "kakao.nearby.unique_returned_count", "Kakao 중복정규화 검색 반환건수", missingReason),
      ]),
      placeEvidence: Object.freeze([]),
    });
  }

  const response = input.searchState.response;
  if (response.radiusM !== input.snapshot.target.radiusMeters) {
    throw new Error("Kakao 응답 반경과 analysis snapshot 반경이 일치하지 않습니다.");
  }
  requireFiniteCoordinate(response.center?.latitude, -90, 90, "response.center.latitude");
  requireFiniteCoordinate(response.center?.longitude, -180, 180, "response.center.longitude");
  if (
    response.center?.latitude !== input.snapshot.target.latitude ||
    response.center.longitude !== input.snapshot.target.longitude
  ) {
    throw new Error("Kakao 응답 중심점과 analysis snapshot 중심점이 일치하지 않습니다.");
  }
  if (!Array.isArray(response.categories)) throw new Error("Kakao categories 결과 배열이 필요합니다.");
  if (!Array.isArray(response.uniquePlaces)) throw new Error("Kakao uniquePlaces 결과 배열이 필요합니다.");
  requireCount(response.uniquePlaceCount, "uniquePlaceCount");
  if (response.uniquePlaceCount !== response.uniquePlaces.length) {
    throw new Error("uniquePlaceCount와 uniquePlaces 길이가 일치하지 않습니다.");
  }

  const seenCategories = new Set<NearbyCategoryId>();
  const results: BasicLocationResult[] = [];
  for (const category of response.categories) {
    if (!(category.id in CATEGORY_LABELS) || seenCategories.has(category.id)) {
      throw new Error("Kakao category ID가 올바르지 않거나 중복되었습니다.");
    }
    seenCategories.add(category.id);
    requireCount(category.totalCount, `${category.id}.totalCount`);
    if (!Array.isArray(category.places)) throw new Error(`${category.id}.places 결과 배열이 필요합니다.`);
    category.places.forEach(validatePlace);
    const metricKey = `kakao.nearby.${category.id}.returned_count`;
    const metricLabel = `Kakao ${CATEGORY_LABELS[category.id]} 검색 반환건수`;
    if (category.error) {
      requireNonEmpty(category.error, `${category.id}.error`);
      results.push(unavailableKakaoResult(input, analysisUnit, metricKey, metricLabel, "SOURCE_ERROR"));
      continue;
    }
    results.push(createAvailableResult({
      analysisRunId: input.snapshot.analysisRunId,
      analysisLayer: "SURROUNDING_POI",
      analysisUnit,
      metricKey,
      metricLabel,
      value: category.totalCount,
      unit: "places",
      valueType: "OBSERVED_SOURCE_VALUE",
      primarySource: KAKAO_SOURCE,
      sourceReferences: [{ sourceId: KAKAO_SOURCE.sourceId, locator: sourceLocator(input.snapshot.target.radiusMeters, category.id), sourceVersion: null }],
      referenceDate: input.fetchedAt,
      referencePeriod: null,
      confidence: "MEDIUM",
      confidenceReasons: [{ code: "PROXY_SOURCE", message: "지정 검색조건의 Kakao 응답은 확인했지만 전체 경쟁환경을 대표하지 않습니다." }],
      limitations: [...KAKAO_LIMITATIONS],
      fieldCheckRequired: true,
      fieldCheckKeys: [...FIELD_CHECK_KEYS],
      customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
      methodologyNote: `${input.snapshot.target.radiusMeters}m 반경에서 ${CATEGORY_LABELS[category.id]} 카테고리로 조회한 Source 반환건수입니다.`,
      updatedAt: input.fetchedAt,
    }));
  }
  if (seenCategories.size !== Object.keys(CATEGORY_LABELS).length) {
    throw new Error("Kakao categories에 bakery, confectionery, cafe 결과가 모두 필요합니다.");
  }

  const hasCategoryError = response.categories.some((category) => Boolean(category.error));
  if (hasCategoryError) {
    results.push(unavailableKakaoResult(
      input,
      analysisUnit,
      "kakao.nearby.unique_returned_count",
      "Kakao 중복정규화 검색 반환건수",
      "SOURCE_ERROR",
    ));
  } else {
    results.push(createAvailableResult({
      analysisRunId: input.snapshot.analysisRunId,
      analysisLayer: "SURROUNDING_POI",
      analysisUnit,
      metricKey: "kakao.nearby.unique_returned_count",
      metricLabel: "Kakao 중복정규화 검색 반환건수",
      value: response.uniquePlaceCount,
      unit: "places",
      valueType: "OBSERVED_SOURCE_VALUE",
      primarySource: KAKAO_SOURCE,
      sourceReferences: [{ sourceId: KAKAO_SOURCE.sourceId, locator: sourceLocator(input.snapshot.target.radiusMeters, "unique"), sourceVersion: null }],
      referenceDate: input.fetchedAt,
      referencePeriod: null,
      confidence: "MEDIUM",
      confidenceReasons: [{ code: "PROXY_SOURCE", message: "세 카테고리 응답의 중복정규화 결과이며 전체 경쟁환경을 대표하지 않습니다." }],
      limitations: [...KAKAO_LIMITATIONS],
      fieldCheckRequired: true,
      fieldCheckKeys: [...FIELD_CHECK_KEYS],
      customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
      methodologyNote: "현재 nearby-places Route가 반환한 uniquePlaces 길이이며 전체 사업체 수가 아닙니다.",
      updatedAt: input.fetchedAt,
    }));
  }

  const evidence = response.uniquePlaces.map((place, index): KakaoNearbyPlaceEvidence => {
    validatePlace(place, index);
    return {
      evidenceType: "KAKAO_NORMALIZED_PLACE",
      analysisRunId: input.snapshot.analysisRunId,
      sourceId: KAKAO_SOURCE.sourceId,
      provider: KAKAO_SOURCE.sourceName,
      fetchedAt: input.fetchedAt,
      radiusMeters: input.snapshot.target.radiusMeters,
      normalizedPlaceId: place.id,
      name: place.name,
      categoryId: place.categoryId,
      categoryLabel: place.categoryLabel,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      distanceMeters: place.distanceM,
      matchedCategoryIds: [...(place.matchedCategoryIds ?? [place.categoryId])],
      matchedCategoryLabels: [...(place.matchedCategoryLabels ?? [place.categoryLabel])],
      fieldCheckRequired: true,
    };
  });

  for (const item of evidence) {
    Object.freeze(item.matchedCategoryIds);
    Object.freeze(item.matchedCategoryLabels);
    Object.freeze(item);
  }
  return Object.freeze({ results: Object.freeze(results), placeEvidence: Object.freeze(evidence) });
}
