import type { CandidateStoreInput } from "../diagnosis/types";
import type { MarketDataObservation } from "./types";

export type CandidateSpatialResolutionStatus =
  | "not_started"
  | "needs_review"
  | "confirmed"
  | "unavailable";

export interface CandidateMarketAnalysisRequest {
  consultationId: string;
  candidateStore: Pick<CandidateStoreInput, "address">;
}

export interface CandidateNormalizedAddress {
  rawAddress: string;
  normalizedAddress: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
  status: CandidateSpatialResolutionStatus;
  sourceId: string | null;
  checkedAt: string | null;
}

export interface CandidateCoordinates {
  longitude: number | null;
  latitude: number | null;
  crs: "EPSG:4326" | null;
  status: CandidateSpatialResolutionStatus;
  sourceId: string | null;
  checkedAt: string | null;
}

export interface CandidateOfficialMarketReference {
  officialMarketCode: string | null;
  officialMarketName: string | null;
  linkMethod: "manual_selection" | "verified_spatial_join" | null;
  status: CandidateSpatialResolutionStatus;
  sourceId: string | null;
  sourceVersion: string | null;
  checkedAt: string | null;
}

export interface CandidateAdministrativeDongReference {
  administrativeDongCode: string | null;
  administrativeDongName: string | null;
  linkMethod: "manual_selection" | "verified_spatial_join" | null;
  status: CandidateSpatialResolutionStatus;
  sourceId: string | null;
  sourceVersion: string | null;
  checkedAt: string | null;
}

export interface CandidateLivingGridReference {
  livingGridId: string | null;
  linkMethod: "verified_spatial_join" | null;
  status: CandidateSpatialResolutionStatus;
  sourceId: string | null;
  sourceVersion: string | null;
  checkedAt: string | null;
}

export interface CandidateFrameoneMarketContext {
  frameoneMarketId: string | null;
  officialMarketCode: string | null;
  relationStatus: "not_evaluated" | "manual_review_candidate";
}

export interface CandidateMarketAnalysisDraft {
  schemaVersion: "candidate-market-analysis-v0";
  consultationId: string;
  candidateStoreAddress: string;
  normalizedAddress: CandidateNormalizedAddress;
  coordinates: CandidateCoordinates;
  officialMarket: CandidateOfficialMarketReference;
  administrativeDong: CandidateAdministrativeDongReference;
  livingGrid: CandidateLivingGridReference;
  marketObservations: MarketDataObservation[];
  frameoneContext: CandidateFrameoneMarketContext;
  status: CandidateSpatialResolutionStatus;
}
