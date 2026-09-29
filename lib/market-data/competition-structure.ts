import {
  dedupeKakaoPlaces,
  normalizeKakaoAddress,
  normalizeKakaoPhone,
  normalizeKakaoPlaceName,
} from "./kakao-place-dedupe";
import type { BakeryOfficialMarketData } from "./services/bakery-official-market";

export const COMPETITION_STRUCTURE_SCHEMA_VERSION =
  "competition-structure-v1" as const;

export type CompetitionObservedChannel =
  | "bakery"
  | "confectionery"
  | "cafe";
export type CompetitionDistanceBand =
  | "0-100m"
  | "100-200m"
  | "200-300m"
  | "300-400m"
  | "400-500m";
export type CompetitionDirection =
  | "CENTER"
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";
export type CompetitionProvenance =
  | "KAKAO_SEARCH_OBSERVATION"
  | "SEOUL_OFFICIAL_STORES"
  | "SEOUL_OFFICIAL_TREND"
  | "DERIVED_DISTANCE"
  | "DERIVED_DIRECTION"
  | "DERIVED_DEDUPE"
  | "FIELD_VERIFICATION";

export interface CompetitionPlaceObservation {
  kakaoPlaceId: string | null;
  name: string;
  phone: string | null;
  roadAddress: string | null;
  addressName: string | null;
  latitude: number;
  longitude: number;
  distanceM: number | null;
  sourceCategoryId: CompetitionObservedChannel;
  sourceCategoryLabel: string;
}

export interface CompetitionSearchCategory {
  id: CompetitionObservedChannel;
  label: string;
  totalCount: number;
  places: readonly CompetitionPlaceObservation[];
  error: string | null;
}

export interface CompetitionCandidate {
  competitionCandidateId: string;
  source: "KAKAO";
  kakaoPlaceId: string | null;
  name: string;
  phone: string | null;
  roadAddress: string | null;
  addressName: string | null;
  latitude: number;
  longitude: number;
  distanceM: number | null;
  distanceBand: CompetitionDistanceBand | null;
  direction: CompetitionDirection;
  observedChannels: CompetitionObservedChannel[];
  channelOverlapCount: number;
  classification: "UNKNOWN";
  franchiseClassification: "UNKNOWN";
  fieldVerificationStatus: "NOT_CHECKED";
  provenance: CompetitionProvenance[];
}

export interface CompetitionStructureResult {
  schemaVersion: typeof COMPETITION_STRUCTURE_SCHEMA_VERSION;
  analysisRunId: string;
  generatedAt: string;
  binding: {
    analysisRunId: string;
    officialBenchmarkIdentity: {
      officialMarketCode: string;
      quarterCode: string;
      industryCode: "CS100005";
    } | null;
  };
  center: { latitude: number; longitude: number };
  radiusM: 300 | 500;
  kakaoObservation: {
    categories: Array<{
      id: CompetitionObservedChannel;
      label: string;
      totalCount: number;
      observedDetailCount: number;
      status: "AVAILABLE" | "ERROR";
    }>;
    observedRawDetailCount: number;
    uniqueObservedCandidateCount: number;
    scope: "SEARCH_OBSERVATION_NOT_CENSUS";
  };
  candidates: CompetitionCandidate[];
  distanceBands: Array<{
    band: CompetitionDistanceBand;
    minimumExclusiveM: number | null;
    maximumInclusiveM: number;
    candidateCount: number;
  }>;
  directionDistribution: Array<{
    direction: CompetitionDirection;
    candidateCount: number;
  }>;
  nearestCandidates: CompetitionCandidate[];
  officialAreaReference: {
    status: "NOT_REQUESTED" | "AVAILABLE" | "PARTIAL" | "MISSING";
    officialMarketCode: string | null;
    officialMarketName: string | null;
    industryCode: "CS100005";
    industryName: "제과점";
    quarterCode: string | null;
    referencePeriod: string | null;
    storeCount: number | null;
    trend: {
      latestQuarterCode: string;
      latestReferencePeriod: string;
      periods: Array<{
        quarterCode: string;
        referencePeriod: string;
        storeCount: number | null;
        storeCountDelta: number | null;
        dataStatus: "available" | "partial" | "missing";
      }>;
    } | null;
    countCombinationPolicy: "KEEP_SEPARATE_FROM_KAKAO";
  };
  franchiseShare: null;
  fieldHandoff: Array<{
    competitionCandidateId: string;
    name: string;
    address: string | null;
    distanceM: number | null;
    direction: CompetitionDirection;
    observedChannels: CompetitionObservedChannel[];
    fieldVerificationStatus: "NOT_CHECKED";
    classification: "UNKNOWN";
    confirmationRequired: true;
  }>;
  provenance: Array<{
    type: CompetitionProvenance;
    scope: string;
  }>;
  warnings: string[];
}

const CHANNEL_ORDER: CompetitionObservedChannel[] = [
  "bakery",
  "confectionery",
  "cafe",
];
const DIRECTION_ORDER: CompetitionDirection[] = [
  "CENTER",
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];
const DISTANCE_BANDS: Array<{
  band: CompetitionDistanceBand;
  minimumExclusiveM: number | null;
  maximumInclusiveM: number;
}> = [
  { band: "0-100m", minimumExclusiveM: null, maximumInclusiveM: 100 },
  { band: "100-200m", minimumExclusiveM: 100, maximumInclusiveM: 200 },
  { band: "200-300m", minimumExclusiveM: 200, maximumInclusiveM: 300 },
  { band: "300-400m", minimumExclusiveM: 300, maximumInclusiveM: 400 },
  { band: "400-500m", minimumExclusiveM: 400, maximumInclusiveM: 500 },
];

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validCoordinate(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function competitionDistanceBand(
  distanceM: number | null,
): CompetitionDistanceBand | null {
  if (
    distanceM === null ||
    !Number.isFinite(distanceM) ||
    distanceM < 0 ||
    distanceM > 500
  ) {
    return null;
  }
  return (
    DISTANCE_BANDS.find(
      ({ minimumExclusiveM, maximumInclusiveM }) =>
        (minimumExclusiveM === null || distanceM > minimumExclusiveM) &&
        distanceM <= maximumInclusiveM,
    )?.band ?? null
  );
}

export function competitionDirection(
  center: { latitude: number; longitude: number },
  place: { latitude: number; longitude: number },
): CompetitionDirection {
  if (
    !validCoordinate(center.latitude, -90, 90) ||
    !validCoordinate(center.longitude, -180, 180) ||
    !validCoordinate(place.latitude, -90, 90) ||
    !validCoordinate(place.longitude, -180, 180)
  ) {
    return "CENTER";
  }

  const latitudeDelta = place.latitude - center.latitude;
  const longitudeDelta = place.longitude - center.longitude;
  if (Math.hypot(latitudeDelta, longitudeDelta) < 1e-10) return "CENTER";

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const centerLatitude = toRadians(center.latitude);
  const placeLatitude = toRadians(place.latitude);
  const longitudeRadians = toRadians(longitudeDelta);
  const y = Math.sin(longitudeRadians) * Math.cos(placeLatitude);
  const x =
    Math.cos(centerLatitude) * Math.sin(placeLatitude) -
    Math.sin(centerLatitude) *
      Math.cos(placeLatitude) *
      Math.cos(longitudeRadians);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  if (!Number.isFinite(bearing)) return "CENTER";
  const normalized = (bearing + 360) % 360;
  const directions: CompetitionDirection[] = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
  ];
  return directions[Math.floor((normalized + 22.5) / 45) % 8];
}

export function createCompetitionCandidateId(
  place: Pick<
    CompetitionPlaceObservation,
    "kakaoPlaceId" | "name" | "phone" | "roadAddress" | "addressName"
  >,
) {
  const kakaoPlaceId = place.kakaoPlaceId?.trim();
  if (kakaoPlaceId) return `kakao:${kakaoPlaceId}`;

  const address =
    normalizeKakaoAddress(place.roadAddress) ??
    normalizeKakaoAddress(place.addressName) ??
    "address-missing";
  const phone = normalizeKakaoPhone(place.phone);
  const name = normalizeKakaoPlaceName(place.name) || "name-missing";
  return `kakao-fallback:${encodeURIComponent(
    `${address}|${phone ? `phone:${phone}` : `name:${name}`}`,
  )}`;
}

function officialStoreCount(data: BakeryOfficialMarketData | null) {
  if (!data) return null;
  const observation = data.stores.find(
    (item) => item.metric === "store_count" && item.dataStatus === "available",
  );
  return finiteOrNull(observation?.value);
}

function officialReference(
  data: BakeryOfficialMarketData | null,
  requestedMarketCode: string | null,
) {
  if (!data) {
    return {
      status: requestedMarketCode ? ("MISSING" as const) : ("NOT_REQUESTED" as const),
      officialMarketCode: requestedMarketCode,
      officialMarketName: null,
      industryCode: "CS100005" as const,
      industryName: "제과점" as const,
      quarterCode: null,
      referencePeriod: null,
      storeCount: null,
      trend: null,
      countCombinationPolicy: "KEEP_SEPARATE_FROM_KAKAO" as const,
    };
  }

  return {
    status:
      data.dataStatus === "available"
        ? ("AVAILABLE" as const)
        : data.dataStatus === "partial"
          ? ("PARTIAL" as const)
          : ("MISSING" as const),
    officialMarketCode: data.officialMarketCode,
    officialMarketName: data.officialMarketName ?? null,
    industryCode: "CS100005" as const,
    industryName: "제과점" as const,
    quarterCode: data.quarterCode,
    referencePeriod: data.referencePeriod,
    storeCount: officialStoreCount(data),
    trend: data.officialTrend
      ? {
          latestQuarterCode: data.officialTrend.latestQuarterCode,
          latestReferencePeriod: data.officialTrend.latestReferencePeriod,
          periods: data.officialTrend.periods.map((period) => ({
            quarterCode: period.quarterCode,
            referencePeriod: period.referencePeriod,
            storeCount: finiteOrNull(period.storeCount),
            storeCountDelta: finiteOrNull(period.storeCountDelta),
            dataStatus: period.dataStatus,
          })),
        }
      : null,
    countCombinationPolicy: "KEEP_SEPARATE_FROM_KAKAO" as const,
  };
}

export function buildCompetitionStructure(input: {
  analysisRunId: string;
  generatedAt: string;
  center: { latitude: number; longitude: number };
  radiusM: 300 | 500;
  categories: readonly CompetitionSearchCategory[];
  officialMarketData: BakeryOfficialMarketData | null;
  officialMarketCode?: string | null;
}): CompetitionStructureResult {
  if (!input.analysisRunId.trim()) {
    throw new Error("analysisRunId는 비어 있을 수 없습니다.");
  }
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("generatedAt은 유효한 ISO 시각이어야 합니다.");
  }
  if (
    !validCoordinate(input.center.latitude, -90, 90) ||
    !validCoordinate(input.center.longitude, -180, 180)
  ) {
    throw new Error("분석 기준 좌표가 올바르지 않습니다.");
  }

  const observations = input.categories.flatMap((category) =>
    category.places.map((place) => ({ ...place })),
  );
  let invalidDistanceCount = 0;
  let outsideRadiusCount = 0;
  const candidates = dedupeKakaoPlaces(observations)
    .flatMap((place): CompetitionCandidate[] => {
      if (
        !validCoordinate(place.latitude, -90, 90) ||
        !validCoordinate(place.longitude, -180, 180)
      ) {
        return [];
      }
      const distanceM = finiteOrNull(place.distanceM);
      if (distanceM !== null && (distanceM < 0 || distanceM > input.radiusM)) {
        outsideRadiusCount += 1;
        return [];
      }
      if (distanceM === null) invalidDistanceCount += 1;
      const observedChannels = CHANNEL_ORDER.filter((channel) =>
        place.matchedCategoryIds.includes(channel),
      );
      return [
        {
          competitionCandidateId: createCompetitionCandidateId(place),
          source: "KAKAO",
          kakaoPlaceId: place.kakaoPlaceId?.trim() || null,
          name: place.name.trim(),
          phone: place.phone?.trim() || null,
          roadAddress: place.roadAddress?.trim() || null,
          addressName: place.addressName?.trim() || null,
          latitude: place.latitude,
          longitude: place.longitude,
          distanceM,
          distanceBand: competitionDistanceBand(distanceM),
          direction: competitionDirection(input.center, place),
          observedChannels,
          channelOverlapCount: observedChannels.length,
          classification: "UNKNOWN",
          franchiseClassification: "UNKNOWN",
          fieldVerificationStatus: "NOT_CHECKED",
          provenance: [
            "KAKAO_SEARCH_OBSERVATION",
            "DERIVED_DISTANCE",
            "DERIVED_DIRECTION",
            "DERIVED_DEDUPE",
            "FIELD_VERIFICATION",
          ],
        },
      ];
    })
    .sort((left, right) => {
      if (left.distanceM !== null && right.distanceM !== null) {
        if (left.distanceM !== right.distanceM) return left.distanceM - right.distanceM;
      } else if (left.distanceM !== null) return -1;
      else if (right.distanceM !== null) return 1;
      return left.competitionCandidateId.localeCompare(
        right.competitionCandidateId,
        "ko-KR",
      );
    });

  const warnings = [
    "Kakao 검색 관측은 전체 사업체 전수조사가 아니며 실제 영업 여부와 직접 경쟁 여부는 현장 확인이 필요합니다.",
    "Kakao 관측 후보 수와 서울 공식상권 점포 수는 범위와 출처가 달라 합산하지 않습니다.",
    "프랜차이즈 여부와 직접·간접 경쟁 분류는 확인되지 않아 UNKNOWN으로 유지합니다.",
  ];
  if (input.categories.some((category) => category.error)) {
    warnings.push("일부 Kakao 검색채널 조회가 실패해 관측 결과가 불완전할 수 있습니다.");
  }
  if (invalidDistanceCount > 0) {
    warnings.push(
      `거리값이 유효하지 않은 후보 ${invalidDistanceCount}개는 최근접·거리구간 집계에서 제외했습니다.`,
    );
  }
  if (outsideRadiusCount > 0) {
    warnings.push(
      `분석 반경을 초과한 후보 ${outsideRadiusCount}개는 결과에서 제외했습니다.`,
    );
  }

  const areaReference = officialReference(
    input.officialMarketData,
    input.officialMarketCode?.trim() || null,
  );
  const officialBenchmarkIdentity = areaReference.officialMarketCode &&
    areaReference.quarterCode
    ? {
        officialMarketCode: areaReference.officialMarketCode,
        quarterCode: areaReference.quarterCode,
        industryCode: "CS100005" as const,
      }
    : null;
  const result: CompetitionStructureResult = {
    schemaVersion: COMPETITION_STRUCTURE_SCHEMA_VERSION,
    analysisRunId: input.analysisRunId,
    generatedAt: new Date(input.generatedAt).toISOString(),
    binding: {
      analysisRunId: input.analysisRunId,
      officialBenchmarkIdentity,
    },
    center: { ...input.center },
    radiusM: input.radiusM,
    kakaoObservation: {
      categories: input.categories.map((category) => ({
        id: category.id,
        label: category.label,
        totalCount:
          Number.isInteger(category.totalCount) && category.totalCount >= 0
            ? category.totalCount
            : 0,
        observedDetailCount: category.places.length,
        status: category.error ? "ERROR" : "AVAILABLE",
      })),
      observedRawDetailCount: observations.length,
      uniqueObservedCandidateCount: candidates.length,
      scope: "SEARCH_OBSERVATION_NOT_CENSUS",
    },
    candidates,
    distanceBands: DISTANCE_BANDS.map((definition) => ({
      ...definition,
      candidateCount: candidates.filter(
        (candidate) => candidate.distanceBand === definition.band,
      ).length,
    })),
    directionDistribution: DIRECTION_ORDER.map((direction) => ({
      direction,
      candidateCount: candidates.filter(
        (candidate) => candidate.direction === direction,
      ).length,
    })),
    nearestCandidates: candidates
      .filter((candidate) => candidate.distanceM !== null)
      .slice(0, 5),
    officialAreaReference: areaReference,
    franchiseShare: null,
    fieldHandoff: candidates.map((candidate) => ({
      competitionCandidateId: candidate.competitionCandidateId,
      name: candidate.name,
      address: candidate.roadAddress ?? candidate.addressName,
      distanceM: candidate.distanceM,
      direction: candidate.direction,
      observedChannels: [...candidate.observedChannels],
      fieldVerificationStatus: "NOT_CHECKED",
      classification: "UNKNOWN",
      confirmationRequired: true,
    })),
    provenance: [
      {
        type: "KAKAO_SEARCH_OBSERVATION",
        scope: "지정 중심점·반경·검색채널의 Kakao 상세 반환 관측",
      },
      {
        type: "DERIVED_DEDUPE",
        scope: "Kakao placeId 우선, ID가 없을 때 주소와 전화/이름 기반 정규화",
      },
      {
        type: "DERIVED_DISTANCE",
        scope: "Kakao 반환 거리와 고정된 거리구간 경계",
      },
      {
        type: "DERIVED_DIRECTION",
        scope: "분석 기준점에서 장소 좌표까지의 bearing 기반 8방향",
      },
      ...(input.officialMarketData
        ? [
            {
              type: "SEOUL_OFFICIAL_STORES" as const,
              scope: "선택한 서울 공식상권·기준분기·CS100005 제과점",
            },
            {
              type: "SEOUL_OFFICIAL_TREND" as const,
              scope: "기존 공식상권 STORES 분기별 점포 수와 증감 참고",
            },
          ]
        : []),
      {
        type: "FIELD_VERIFICATION",
        scope: "영업 여부·직접 경쟁·프랜차이즈 분류 미확인",
      },
    ],
    warnings,
  };

  JSON.stringify(result);
  return result;
}
