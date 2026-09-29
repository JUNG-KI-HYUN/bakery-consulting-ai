import {
  findRelatedOfficialMarkets,
  type ExecutedSpatialAnalysis,
  type OfficialMarketSpatialInput,
  type OfficialMarketSpatialResult,
} from "./official-market-spatial-relation";
import type { ActiveAnalysisTarget } from "./basic-location/run";

export type { ActiveAnalysisTarget } from "./basic-location/run";

export interface CompetitionInitialLocation {
  latitude: number;
  longitude: number;
  radiusM: 300 | 500;
  label: string | null;
}

export function competitionExecutionMatchesTarget(
  target: ActiveAnalysisTarget | null,
  execution: {
    analysisPoint: { latitude: number; longitude: number };
    analysisRadiusMeters: 300 | 500;
  },
) {
  return Boolean(
    target &&
    target.latitude === execution.analysisPoint.latitude &&
    target.longitude === execution.analysisPoint.longitude &&
    target.radiusM === execution.analysisRadiusMeters,
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCompetitionLocationQuery(query: {
  lat?: string | string[];
  lng?: string | string[];
  radius?: string | string[];
  label?: string | string[];
}): CompetitionInitialLocation | null {
  const rawLatitude = firstQueryValue(query.lat)?.trim();
  const rawLongitude = firstQueryValue(query.lng)?.trim();
  if (!rawLatitude || !rawLongitude) return null;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  const rawRadius = Number(firstQueryValue(query.radius));
  const radiusM = rawRadius === 300 ? 300 : 500;
  const rawLabel = firstQueryValue(query.label)?.trim();
  return {
    latitude,
    longitude,
    radiusM,
    label: rawLabel || null,
  };
}

type AnalysisTargetQuery = {
  lat?: string | string[];
  lng?: string | string[];
  radius?: string | string[];
  label?: string | string[];
  address?: string | string[];
  frameoneMarketId?: string | string[];
  frameoneMarketName?: string | string[];
  frameoneSubmarketId?: string | string[];
  frameoneSubmarketName?: string | string[];
  officialMarketCode?: string | string[];
  officialMarketName?: string | string[];
  officialRelation?: string | string[];
  officialSelectionMethod?: string | string[];
  officialSelectedAt?: string | string[];
  analysisRunId?: string | string[];
  source?: string | string[];
  createdAt?: string | string[];
  updatedAt?: string | string[];
  frameoneNodeId?: string | string[];
  frameoneNodeName?: string | string[];
};

function optionalQueryText(value: string | string[] | undefined) {
  return firstQueryValue(value)?.trim() || null;
}

export function parseActiveAnalysisTarget(
  query: AnalysisTargetQuery,
): ActiveAnalysisTarget | null {
  const location = parseCompetitionLocationQuery(query);
  if (!location) return null;
  const officialMarketCode = optionalQueryText(query.officialMarketCode);
  const officialMarketName = optionalQueryText(query.officialMarketName);
  const officialRelation = optionalQueryText(query.officialRelation);
  const normalizedOfficialRelation: "INSIDE" | "RADIUS_OVERLAP" | null =
    officialRelation === "INSIDE" || officialRelation === "RADIUS_OVERLAP"
      ? officialRelation
      : null;
  const rawSelectionMethod = optionalQueryText(query.officialSelectionMethod);
  const selectionMethod = rawSelectionMethod === "AUTO_SINGLE_CANDIDATE"
    ? "AUTO_SINGLE_CANDIDATE" as const
    : "MANUAL" as const;
  const createdAt = optionalQueryText(query.createdAt) ?? "";
  const updatedAt = optionalQueryText(query.updatedAt) ?? createdAt;
  const requestedRunId = optionalQueryText(query.analysisRunId);
  const legacyRunId = `legacy-analysis-run:${location.latitude}:${location.longitude}:${location.radiusM}`;
  const analysisRunId = requestedRunId?.startsWith("basic-location-run:")
    ? requestedRunId
    : legacyRunId;
  const officialMarketReference =
    officialMarketCode &&
    /^\d+$/.test(officialMarketCode) &&
    officialMarketName &&
    normalizedOfficialRelation
      ? {
          marketCode: officialMarketCode,
          marketName: officialMarketName,
          spatialRelation: normalizedOfficialRelation,
          selectionMethod,
          selectedAt: optionalQueryText(query.officialSelectedAt) ?? updatedAt,
        }
      : null;
  const sourceValue = optionalQueryText(query.source);
  const source: ActiveAnalysisTarget["source"] = sourceValue === "address" ||
    sourceValue === "candidate_store" ? sourceValue : "map";

  return {
    schemaVersion: "active-analysis-target-v2",
    analysisRunId,
    targetKey: analysisRunId,
    label: location.label,
    address: optionalQueryText(query.address),
    latitude: location.latitude,
    longitude: location.longitude,
    radiusM: location.radiusM,
    source,
    explorationSnapshot: {
      marketId: optionalQueryText(query.frameoneMarketId),
      marketName: optionalQueryText(query.frameoneMarketName),
      submarketId: optionalQueryText(query.frameoneSubmarketId),
      submarketName: optionalQueryText(query.frameoneSubmarketName),
      nodeId: optionalQueryText(query.frameoneNodeId),
      nodeName: optionalQueryText(query.frameoneNodeName),
    },
    officialReference: officialMarketReference,
    createdAt,
    updatedAt,
  };
}

export function activeAnalysisTargetSearchParams(target: ActiveAnalysisTarget) {
  return new URLSearchParams({
    lat: String(target.latitude),
    lng: String(target.longitude),
    radius: String(target.radiusM),
    analysisRunId: target.analysisRunId,
    source: target.source,
    ...(target.createdAt ? { createdAt: target.createdAt } : {}),
    ...(target.updatedAt ? { updatedAt: target.updatedAt } : {}),
    ...(target.label ? { label: target.label } : {}),
    ...(target.address ? { address: target.address } : {}),
    ...(target.explorationSnapshot.marketId
      ? { frameoneMarketId: target.explorationSnapshot.marketId }
      : {}),
    ...(target.explorationSnapshot.marketName
      ? { frameoneMarketName: target.explorationSnapshot.marketName }
      : {}),
    ...(target.explorationSnapshot.submarketId
      ? { frameoneSubmarketId: target.explorationSnapshot.submarketId }
      : {}),
    ...(target.explorationSnapshot.submarketName
      ? { frameoneSubmarketName: target.explorationSnapshot.submarketName }
      : {}),
    ...(target.explorationSnapshot.nodeId
      ? { frameoneNodeId: target.explorationSnapshot.nodeId }
      : {}),
    ...(target.explorationSnapshot.nodeName
      ? { frameoneNodeName: target.explorationSnapshot.nodeName }
      : {}),
    ...(target.officialReference
      ? {
          officialMarketCode: target.officialReference.marketCode,
          officialMarketName: target.officialReference.marketName,
          officialRelation: target.officialReference.spatialRelation,
          officialSelectionMethod: target.officialReference.selectionMethod,
          officialSelectedAt: target.officialReference.selectedAt,
        }
      : {}),
  });
}

export function activeAnalysisTargetHref(
  pathname: string,
  target: ActiveAnalysisTarget | null,
) {
  return target
    ? `${pathname}${pathname.includes("?") ? "&" : "?"}${activeAnalysisTargetSearchParams(target)}`
    : pathname;
}

export function competitionLocationFromSearchResult(result: {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}): Omit<CompetitionInitialLocation, "radiusM"> {
  if (
    !Number.isFinite(result.latitude) ||
    result.latitude < -90 ||
    result.latitude > 90 ||
    !Number.isFinite(result.longitude) ||
    result.longitude < -180 ||
    result.longitude > 180
  ) {
    throw new Error("검색 결과 좌표가 올바르지 않습니다.");
  }
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    label: result.name.trim() || result.address.trim() || null,
  };
}

export function competitionOfficialMarketChoices(
  analysis: ExecutedSpatialAnalysis | null,
  markets: readonly OfficialMarketSpatialInput[],
): OfficialMarketSpatialResult[] {
  const relations = findRelatedOfficialMarkets(analysis, markets);
  if (!relations) return [];
  return [...relations.insideMarkets, ...relations.radiusOverlapMarkets].sort(
    (left, right) => {
      if (left.relation !== right.relation) {
        return left.relation === "INSIDE" ? -1 : 1;
      }
      return (
        left.marketName.localeCompare(right.marketName, "ko-KR") ||
        left.marketCode.localeCompare(right.marketCode)
      );
    },
  );
}

export function initialOfficialMarketCode(
  choices: readonly OfficialMarketSpatialResult[],
) {
  return choices.length === 1 ? choices[0].marketCode : null;
}

export function officialMarketSelectionAfterLocationChange(
  previous: CompetitionInitialLocation | null,
  next: CompetitionInitialLocation | null,
  currentOfficialMarketCode: string | null,
) {
  const changed =
    previous?.latitude !== next?.latitude ||
    previous?.longitude !== next?.longitude ||
    previous?.radiusM !== next?.radiusM;
  return changed ? null : currentOfficialMarketCode;
}
