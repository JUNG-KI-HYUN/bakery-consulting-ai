import type { CandidateLifecycleStatus } from "../candidate-screening/types";
import type { FieldNoteStructuredRevisionV1 } from "../derived-content/types";
import type { Pork33SeedDatasetId } from "./seed-types";

export const PORK33_SHORTLIST_STATE_SCHEMA_VERSION =
  "frameone.pork33-candidate-shortlist-state.v1" as const;

export type Pork33UnknownNumberStatus = "CONFIRMED" | "UNKNOWN";
export type Pork33GeocodeStatus = "PENDING" | "RESOLVED" | "GEOCODE_REVIEW_REQUIRED" | "FAILED";

export interface Pork33SeedCandidate {
  source: {
    sourceDatasetId: string;
    sourceRowOrder: number;
    printedNumber: string;
    sourcePage: number;
  };
  identity: {
    candidateStoreId: string;
    displayNumber: number;
    displayCode: string;
  };
  linkage: {
    regionId: string;
    apartmentAreaId: string;
    analysisClusterId: string;
    groupingSource: string;
    groupingReason: string;
    groupingConfidence: string;
    manualReviewRequired: boolean;
  };
  raw: Record<string, string>;
  normalized: {
    addressFull: string;
    addressForGeocode: string | null;
    displayLocation: string;
    addressProvenance?: "USER_CONFIRMED";
    latitude: number | null;
    longitude: number | null;
    geocodeStatus: Pork33GeocodeStatus;
    coordinateSource: "KAKAO_GEOCODE" | "MANUAL" | null;
    floor: string | null;
    exclusiveArea: number | null;
    deposit: number | null;
    rent: number | null;
    maintenance: number | null;
    maintenanceStatus: Pork33UnknownNumberStatus;
    premium: number | null;
    currentOccupancyStatus: string | null;
    mainApartmentRaw: string;
    existingHouseholdReference: number | null;
    householdReferenceStatus: string;
    fieldFlowRating: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    fieldVisibilityRating: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
    fieldNoteRaw: string;
    siteGrade: string | null;
    hardRisk: string;
    evidenceConfidence: string | null;
    reviewStatus: CandidateLifecycleStatus;
    sourceType: string;
    sourceDate: string | null;
  };
  draft: FieldNoteStructuredRevisionV1;
  validation: { status: string; issues: string[] };
}

export interface Pork33CandidateState extends Pork33SeedCandidate {
  contentRevisions: FieldNoteStructuredRevisionV1[];
  /** PORK33 업무 화면 전용 Human lifecycle 사유. Domain 평가나 Grade와 독립적이다. */
  reviewReason?: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Pork33Region {
  regionId: string;
  label: string;
  caseId: string;
  source: string;
}

export interface Pork33ApartmentArea {
  apartmentAreaId: string;
  regionId: string;
  analysisClusterId: string;
  label: string;
  groupingSource: string;
  manualReviewRequired: boolean;
}

export interface Pork33SourceAudit {
  physicalCandidateRowCount: number;
  duplicatePrintedNumbers: string[];
  missingPrintedNumbers: string[];
  blankPrintedRows: string[];
  addressReviewRequiredCount: number;
  maintenanceUnknownCount: number;
  regionCount: number;
  proposedApartmentAreaCount: number;
  fieldNoteRawPresentCount: number;
  validationInvalidCount: number;
}

export interface Pork33ShortlistStateV1 {
  schemaVersion: typeof PORK33_SHORTLIST_STATE_SCHEMA_VERSION;
  snapshotId: string;
  parentSnapshotId: string | null;
  sourceDatasetId: Pork33SeedDatasetId;
  revision: number;
  createdAt: string;
  createdBy: string;
  sourceAudit: Pork33SourceAudit;
  regions: Pork33Region[];
  apartmentAreas: Pork33ApartmentArea[];
  candidates: Pork33CandidateState[];
}

export type Pork33CandidateFilter = {
  query?: string;
  regionId?: string;
  apartmentAreaId?: string;
  lifecycleStatus?: CandidateLifecycleStatus;
};

export type Pork33ShortlistCommand =
  | {
      type: "UPDATE_CANDIDATE";
      candidateStoreId: string;
      actor: string;
      patch: {
        reviewStatus?: CandidateLifecycleStatus;
        reviewReason?: string | null;
        addressFull?: string;
        addressForGeocode?: string | null;
        displayLocation?: string;
        addressProvenance?: "USER_CONFIRMED";
        latitude?: number | null;
        longitude?: number | null;
        exclusiveArea?: number | null;
        deposit?: number | null;
        rent?: number | null;
        maintenance?: number | null;
        maintenanceStatus?: Pork33UnknownNumberStatus;
        premium?: number | null;
        currentOccupancyStatus?: string | null;
        floor?: string | null;
        mainApartmentRaw?: string;
        existingHouseholdReference?: number | null;
        fieldFlowRating?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
        fieldVisibilityRating?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
      };
    }
  | {
      type: "SAVE_DRAFT";
      candidateStoreId: string;
      actor: string;
      payload: FieldNoteStructuredRevisionV1["payload"];
    }
  | {
      type: "TRANSITION_DRAFT";
      candidateStoreId: string;
      actor: string;
      targetStatus: "REVIEWED" | "APPROVED";
    }
  | { type: "GEOCODE_ONE"; candidateStoreId: string; actor: string }
  | { type: "GEOCODE_ALL_PENDING"; actor: string };
