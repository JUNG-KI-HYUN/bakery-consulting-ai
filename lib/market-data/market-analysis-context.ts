import type {
  ExecutedSpatialAnalysis,
  OfficialMarketSpatialResult,
} from "./official-market-spatial-relation";
import type {
  BakeryOfficialMarketData,
  BakeryOfficialMarketDataStatus,
} from "./services/bakery-official-market";
import type { AnalysisRunSnapshot } from "./basic-location/run";

export type MarketAnalysisRequestStatus = "idle" | "loading" | "success" | "error";

/** Execution metadata only; never populate this from editable map/form state. */
export interface ExecutedMarketAnalysis extends ExecutedSpatialAnalysis {
  source: "address" | "map";
  confirmedAddress: string | null;
}

// Existing nearby-places UI response types, shared without changing the API.
export type NearbyCategoryId = "bakery" | "confectionery" | "cafe";

export interface NearbyPlace {
  id: string;
  name: string;
  categoryId: NearbyCategoryId;
  categoryLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceM: number;
  matchedCategoryIds?: NearbyCategoryId[];
  matchedCategoryLabels?: string[];
}

export interface NearbyCategoryResult {
  totalCount: number;
  places: NearbyPlace[];
  error?: string;
}

export interface NearbyPlacesResponse {
  categories?: Array<NearbyCategoryResult & { id: NearbyCategoryId }>;
  uniquePlaceCount?: number;
  uniquePlaces?: NearbyPlace[];
  message?: string;
}

export interface KakaoNearbySearchState {
  status: MarketAnalysisRequestStatus;
  response: NearbyPlacesResponse | null;
  error: string | null;
  analysisRunId: string | null;
  completedAt: string | null;
}

export interface RunBoundSourceUpdate {
  analysisRunId: string | null;
}

/** Reject a late Source update without mutating either the active or incoming state. */
export function acceptRunBoundSourceUpdate<T extends RunBoundSourceUpdate>(
  activeRunId: string | null,
  current: T,
  incoming: T,
): T {
  return incoming.analysisRunId === activeRunId ? incoming : current;
}

type DeepReadonly<T> = T extends object
  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T;

interface AnalysisNearbyCategory {
  status: "success" | "error";
  // Error responses use 0 as a transport placeholder, not a measured count.
  totalCount: number | null;
  places: NearbyPlace[];
  error: string | null;
}

type ManualOfficialMarket = Pick<OfficialMarketSpatialResult, "marketCode" | "marketName">;

/** Read-only in-memory snapshot, independent of candidate-market-analysis-v0.
 * FRAMEONE is a current staff selection, not a spatial or confirmed crosswalk.
 * Kakao categories are independent search results and can share place IDs.
 * Public observations belong only to their official market, never to the radius
 * or to the candidate store's projected sales. No totals or risk are calculated.
 */
export type MarketAnalysisContext = DeepReadonly<{
  schemaVersion: "market-analysis-context-v1";
  analysisRunId: string | null;
  analysisStartedAt: string | null;
  runSnapshot: AnalysisRunSnapshot | null;
  sourceCompletion: {
    kakaoCompletedAt: string | null;
    officialRelationCompletedAt: string | null;
    officialStatsCompletedAt: string | null;
  };
  target: {
    source: ExecutedMarketAnalysis["source"];
    confirmedAddress: string | null;
    analysisPoint: ExecutedSpatialAnalysis["analysisPoint"];
    executedRadiusMeters: ExecutedSpatialAnalysis["analysisRadiusMeters"];
  } | null;
  frameone: {
    selectedMarketId: string | null;
    selectedMarketName: string | null;
    selectedSubmarketId: string | null;
    selectedSubmarketName: string | null;
  };
  kakaoNearby: {
    status: MarketAnalysisRequestStatus;
    error: string | null;
    bakery: AnalysisNearbyCategory | null;
    confectionery: AnalysisNearbyCategory | null;
    cafe: AnalysisNearbyCategory | null;
  };
  officialMarkets: {
    status: MarketAnalysisRequestStatus;
    error: string | null;
    // null = not calculated; [] = calculated with no matching relation.
    relatedMarkets: OfficialMarketSpatialResult[] | null;
    unknownMarkets: OfficialMarketSpatialResult[] | null;
    manuallySelected: (ManualOfficialMarket & {
      spatialRelation: OfficialMarketSpatialResult | null;
    }) | null;
  };
  publicData: {
    requestStatus: MarketAnalysisRequestStatus;
    // null = no completed data response; "missing" is an actual API dataStatus.
    status: BakeryOfficialMarketDataStatus | null;
    selectedOfficialMarketData: BakeryOfficialMarketData | null;
    error: string | null;
  };
}>;

export interface MarketAnalysisContextInput {
  executedAnalysis: ExecutedMarketAnalysis | null;
  runSnapshot?: AnalysisRunSnapshot | null;
  selectedFrameoneMarket: { marketId: string; marketName: string } | null;
  selectedFrameoneSubmarket?: { submarketId: string; submarketName: string } | null;
  kakaoNearby: KakaoNearbySearchState;
  officialMarkets: {
    status: MarketAnalysisRequestStatus;
    error: string | null;
    analysisRunId: string | null;
    completedAt: string | null;
    // Already computed by STEP 2; the builder never reads geometry.
    results: readonly OfficialMarketSpatialResult[] | null;
    manuallySelected: ManualOfficialMarket | null;
  };
  publicData: {
    requestStatus: MarketAnalysisRequestStatus;
    requestedOfficialMarketCode: string | null;
    data: BakeryOfficialMarketData | null;
    error: string | null;
    analysisRunId: string | null;
    completedAt: string | null;
  };
}

function nearbyCategory(
  state: KakaoNearbySearchState,
  id: NearbyCategoryId,
): AnalysisNearbyCategory | null {
  if (state.status !== "success" && state.status !== "error") return null;
  const result = state.response?.categories?.find((category) => category.id === id);
  if (!result) return null;
  return {
    status: result.error ? "error" : "success",
    totalCount: result.error ? null : result.totalCount,
    places: result.places,
    error: result.error ?? null,
  };
}

function freezeSnapshot<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Deterministic normalization of existing execution/query state. No I/O,
 * geometry calculation, clock, matching inference, or changes to source objects.
 * Clone before freezing so later state updates cannot rewrite earlier snapshots.
 */
export function buildMarketAnalysisContext(input: MarketAnalysisContextInput): MarketAnalysisContext {
  const runSnapshot = input.runSnapshot ?? null;
  const activeRunId = runSnapshot?.analysisRunId ?? null;
  const sourceBelongsToRun = (sourceRunId: string | null | undefined) =>
    runSnapshot === null ? sourceRunId == null : sourceRunId === activeRunId;
  const execution = runSnapshot ? {
    source: runSnapshot.target.source,
    confirmedAddress: runSnapshot.target.confirmedAddress,
    analysisPoint: {
      latitude: runSnapshot.target.latitude,
      longitude: runSnapshot.target.longitude,
    },
    analysisRadiusMeters: runSnapshot.target.radiusMeters,
  } satisfies ExecutedMarketAnalysis : input.executedAnalysis;
  const kakaoNearby = sourceBelongsToRun(input.kakaoNearby.analysisRunId)
    ? input.kakaoNearby
    : {
        status: "idle" as const,
        response: null,
        error: null,
        analysisRunId: activeRunId,
        completedAt: null,
      };
  const officialMarkets = sourceBelongsToRun(input.officialMarkets.analysisRunId)
    ? input.officialMarkets
    : { status: "idle" as const, error: null, results: null, manuallySelected: input.officialMarkets.manuallySelected };
  const publicDataInput = sourceBelongsToRun(input.publicData.analysisRunId)
    ? input.publicData
    : { requestStatus: "idle" as const, requestedOfficialMarketCode: null, data: null, error: null };
  const manual = input.officialMarkets.manuallySelected;
  const spatialResults = execution && officialMarkets.status === "success"
    ? officialMarkets.results
    : null;
  const requestMatchesSelection = manual !== null &&
    publicDataInput.requestedOfficialMarketCode === manual.marketCode;
  const publicData = requestMatchesSelection && publicDataInput.requestStatus === "success" &&
    publicDataInput.data?.officialMarketCode === manual.marketCode
    ? publicDataInput.data
    : null;

  return freezeSnapshot(structuredClone({
    schemaVersion: "market-analysis-context-v1" as const,
    analysisRunId: activeRunId,
    analysisStartedAt: runSnapshot?.createdAt ?? null,
    runSnapshot,
    sourceCompletion: {
      kakaoCompletedAt: sourceBelongsToRun(input.kakaoNearby.analysisRunId)
        ? input.kakaoNearby.completedAt ?? null
        : null,
      officialRelationCompletedAt: sourceBelongsToRun(input.officialMarkets.analysisRunId)
        ? input.officialMarkets.completedAt ?? null
        : null,
      officialStatsCompletedAt: sourceBelongsToRun(input.publicData.analysisRunId)
        ? input.publicData.completedAt ?? null
        : null,
    },
    target: execution ? {
      source: execution.source,
      confirmedAddress: execution.confirmedAddress,
      analysisPoint: execution.analysisPoint,
      executedRadiusMeters: execution.analysisRadiusMeters,
    } : null,
    frameone: {
      selectedMarketId: runSnapshot?.frameone.marketId ?? input.selectedFrameoneMarket?.marketId ?? null,
      selectedMarketName: runSnapshot?.frameone.marketName ?? input.selectedFrameoneMarket?.marketName ?? null,
      selectedSubmarketId: runSnapshot?.frameone.submarketId ?? input.selectedFrameoneSubmarket?.submarketId ?? null,
      selectedSubmarketName: runSnapshot?.frameone.submarketName ?? input.selectedFrameoneSubmarket?.submarketName ?? null,
    },
    kakaoNearby: {
      status: execution ? kakaoNearby.status : "idle",
      error: execution ? kakaoNearby.error : null,
      bakery: execution ? nearbyCategory(kakaoNearby, "bakery") : null,
      confectionery: execution ? nearbyCategory(kakaoNearby, "confectionery") : null,
      cafe: execution ? nearbyCategory(kakaoNearby, "cafe") : null,
    },
    officialMarkets: {
      status: execution ? officialMarkets.status : "idle",
      error: execution ? officialMarkets.error : null,
      relatedMarkets: spatialResults?.filter((result) =>
        result.relation === "INSIDE" || result.relation === "RADIUS_OVERLAP") ?? null,
      unknownMarkets: spatialResults?.filter((result) => result.relation === "UNKNOWN") ?? null,
      manuallySelected: manual ? {
        ...manual,
        spatialRelation: spatialResults?.find((result) => result.marketCode === manual.marketCode) ?? null,
      } : null,
    },
    publicData: {
      requestStatus: requestMatchesSelection ? publicDataInput.requestStatus : "idle",
      status: publicData?.dataStatus ?? null,
      selectedOfficialMarketData: publicData,
      error: requestMatchesSelection ? publicDataInput.error : null,
    },
  } satisfies MarketAnalysisContext));
}
