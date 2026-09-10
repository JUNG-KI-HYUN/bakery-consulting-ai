import type {
  ExecutedSpatialAnalysis,
  OfficialMarketSpatialResult,
} from "./official-market-spatial-relation";
import type {
  BakeryOfficialMarketData,
  BakeryOfficialMarketDataStatus,
} from "./services/bakery-official-market";

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
  target: {
    source: ExecutedMarketAnalysis["source"];
    confirmedAddress: string | null;
    analysisPoint: ExecutedSpatialAnalysis["analysisPoint"];
    executedRadiusMeters: ExecutedSpatialAnalysis["analysisRadiusMeters"];
  } | null;
  frameone: {
    selectedMarketId: string | null;
    selectedMarketName: string | null;
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
  selectedFrameoneMarket: { marketId: string; marketName: string } | null;
  kakaoNearby: KakaoNearbySearchState;
  officialMarkets: {
    status: MarketAnalysisRequestStatus;
    error: string | null;
    // Already computed by STEP 2; the builder never reads geometry.
    results: readonly OfficialMarketSpatialResult[] | null;
    manuallySelected: ManualOfficialMarket | null;
  };
  publicData: {
    requestStatus: MarketAnalysisRequestStatus;
    requestedOfficialMarketCode: string | null;
    data: BakeryOfficialMarketData | null;
    error: string | null;
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
  const execution = input.executedAnalysis;
  const manual = input.officialMarkets.manuallySelected;
  const spatialResults = execution && input.officialMarkets.status === "success"
    ? input.officialMarkets.results
    : null;
  const requestMatchesSelection = manual !== null &&
    input.publicData.requestedOfficialMarketCode === manual.marketCode;
  const publicData = requestMatchesSelection && input.publicData.requestStatus === "success" &&
    input.publicData.data?.officialMarketCode === manual.marketCode
    ? input.publicData.data
    : null;

  return freezeSnapshot(structuredClone({
    schemaVersion: "market-analysis-context-v1" as const,
    target: execution ? {
      source: execution.source,
      confirmedAddress: execution.confirmedAddress,
      analysisPoint: execution.analysisPoint,
      executedRadiusMeters: execution.analysisRadiusMeters,
    } : null,
    frameone: {
      selectedMarketId: input.selectedFrameoneMarket?.marketId ?? null,
      selectedMarketName: input.selectedFrameoneMarket?.marketName ?? null,
    },
    kakaoNearby: {
      status: execution ? input.kakaoNearby.status : "idle",
      error: execution ? input.kakaoNearby.error : null,
      bakery: execution ? nearbyCategory(input.kakaoNearby, "bakery") : null,
      confectionery: execution ? nearbyCategory(input.kakaoNearby, "confectionery") : null,
      cafe: execution ? nearbyCategory(input.kakaoNearby, "cafe") : null,
    },
    officialMarkets: {
      status: execution ? input.officialMarkets.status : "idle",
      error: execution ? input.officialMarkets.error : null,
      relatedMarkets: spatialResults?.filter((result) =>
        result.relation === "INSIDE" || result.relation === "RADIUS_OVERLAP") ?? null,
      unknownMarkets: spatialResults?.filter((result) => result.relation === "UNKNOWN") ?? null,
      manuallySelected: manual ? {
        ...manual,
        spatialRelation: spatialResults?.find((result) => result.marketCode === manual.marketCode) ?? null,
      } : null,
    },
    publicData: {
      requestStatus: requestMatchesSelection ? input.publicData.requestStatus : "idle",
      status: publicData?.dataStatus ?? null,
      selectedOfficialMarketData: publicData,
      error: requestMatchesSelection ? input.publicData.error : null,
    },
  } satisfies MarketAnalysisContext));
}
