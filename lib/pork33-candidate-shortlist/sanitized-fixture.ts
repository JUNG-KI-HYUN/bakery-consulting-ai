import type { Pork33SeedCandidate } from "./types";
import {
  PORK33_SANITIZED_FIXTURE_DATASET_ID,
  type Pork33SeedPackage,
} from "./seed-types";

const REGION_ROWS = [
  ["region_p33_daejeon", "SANITIZED FIXTURE REGION 01"],
  ["region_p33_hwaseong_namyang", "SANITIZED FIXTURE REGION 02"],
  ["region_p33_seoul_eunpyeong", "SANITIZED FIXTURE REGION 03"],
  ["region_p33_seoul_seodaemun", "SANITIZED FIXTURE REGION 04"],
  ["region_p33_yongin_yeokbuk", "SANITIZED FIXTURE REGION 05"],
] as const;

const AREA_ROWS = [
  ["area_p33_gwanjeo_daejayeon", REGION_ROWS[0][0]],
  ["area_p33_gwanjeo_neuriul", REGION_ROWS[0][0]],
  ["area_p33_beopdong_boram", REGION_ROWS[0][0]],
  ["area_p33_beopdong_epyeon", REGION_ROWS[0][0]],
  ["area_p33_beopdong_greentown", REGION_ROWS[0][0]],
  ["area_p33_doan_linfull18", REGION_ROWS[0][0]],
  ["area_p33_doan_ipark", REGION_ROWS[0][0]],
  ["area_p33_doan_lakeforet", REGION_ROWS[0][0]],
  ["area_p33_daejeon_iparkcity", REGION_ROWS[0][0]],
  ["area_p33_namyang_yangwoo", REGION_ROWS[1][0]],
  ["area_p33_namyang_starhills", REGION_ROWS[1][0]],
  ["area_p33_eunpyeong_gupabal", REGION_ROWS[2][0]],
  ["area_p33_dmc_parkview", REGION_ROWS[3][0]],
  ["area_p33_eunpyeong_nokbeon", REGION_ROWS[2][0]],
  ["area_p33_dmc_ipark_centreville", REGION_ROWS[3][0]],
  ["area_p33_yeokbuk_seohee", REGION_ROWS[4][0]],
  ["area_p33_yeokbuk_prugio_gold", REGION_ROWS[4][0]],
] as const;

const CANDIDATE_AREAS = [
  0, 0, 1, 2, 3, 3, 4, 5, 5, 6, 7, 8, 8, 8, 8,
  9, 9, 10, 11, 11, 11, 12, 13, 14, 15, 16, 16,
] as const;

function fixtureUuid(index: number, suffix: string) {
  return `${String(index).padStart(8, "0")}-0000-4000-8000-${suffix.padStart(12, "0")}`;
}

function fixtureCandidate(index: number): Pork33SeedCandidate {
  const displayCode = `P33-${String(index).padStart(3, "0")}`;
  const area = AREA_ROWS[CANDIDATE_AREAS[index - 1]];
  const candidateStoreId = `store_${fixtureUuid(index, String(index))}`;
  const fixtureLabel = `SANITIZED FIXTURE CANDIDATE ${String(index).padStart(2, "0")}`;
  return {
    source: {
      sourceDatasetId: PORK33_SANITIZED_FIXTURE_DATASET_ID,
      sourceRowOrder: index,
      printedNumber: String(index),
      sourcePage: 0,
    },
    identity: { candidateStoreId, displayNumber: index, displayCode },
    linkage: {
      regionId: area[1],
      apartmentAreaId: area[0],
      analysisClusterId: `fixture_cluster_${String(CANDIDATE_AREAS[index - 1] + 1).padStart(2, "0")}`,
      groupingSource: "SANITIZED_FIXTURE",
      groupingReason: "SANITIZED FIXTURE grouping for build and contract verification only",
      groupingConfidence: "UNKNOWN",
      manualReviewRequired: true,
    },
    raw: {
      address: fixtureLabel,
      exclusiveArea: "",
      deposit: "",
      rent: "",
      maintenance: "",
      mainApartment: "SANITIZED FIXTURE AREA",
      existingHouseholdReference: "",
      fieldFlowRating: "",
      fieldVisibilityRating: "",
      fieldNote: "SANITIZED FIXTURE — NOT CUSTOMER DATA",
    },
    normalized: {
      addressFull: fixtureLabel,
      addressForGeocode: null,
      displayLocation: fixtureLabel,
      latitude: null,
      longitude: null,
      geocodeStatus: index === 5 ? "GEOCODE_REVIEW_REQUIRED" : "PENDING",
      coordinateSource: null,
      floor: null,
      exclusiveArea: null,
      deposit: null,
      rent: null,
      maintenance: null,
      maintenanceStatus: "UNKNOWN",
      premium: null,
      currentOccupancyStatus: null,
      mainApartmentRaw: "SANITIZED FIXTURE AREA",
      existingHouseholdReference: null,
      householdReferenceStatus: "UNKNOWN",
      fieldFlowRating: "UNKNOWN",
      fieldVisibilityRating: "UNKNOWN",
      fieldNoteRaw: "SANITIZED FIXTURE — NOT CUSTOMER DATA",
      siteGrade: null,
      hardRisk: "UNAVAILABLE",
      evidenceConfidence: null,
      reviewStatus: "REVIEW",
      sourceType: "SANITIZED_FIXTURE",
      sourceDate: null,
    },
    draft: {
      schemaVersion: "frameone.derived-content-revision.v1",
      revisionId: `derived_rev_${fixtureUuid(index, String(index + 100))}`,
      revisionSequence: 1,
      contentKind: "FIELD_NOTE_STRUCTURE",
      caseId: "case_pork33_field_2026_10",
      candidateStoreId,
      subjectRef: `survey_${fixtureUuid(index, String(index + 200))}`,
      rawSourceRef: `${PORK33_SANITIZED_FIXTURE_DATASET_ID}:row:${index}:fixture`,
      parentRevisionId: null,
      supersedesApprovedRevisionId: null,
      status: "DRAFT",
      origin: "HUMAN_EDIT",
      promptContractVersion: null,
      modelId: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      createdBy: "sanitized-fixture",
      reviewedAt: null,
      reviewedBy: null,
      approvedAt: null,
      approvedBy: null,
      payload: {
        locationSummary: "",
        strengths: [],
        checks: ["SANITIZED FIXTURE — local private source required"],
        competitionNotes: [],
        vehicleAccessNotes: [],
        fieldObservations: [],
        reportSummary: "",
      },
    },
    validation: { status: "FIXTURE", issues: ["SANITIZED_FIXTURE_NOT_FOR_CUSTOMER_REPORT"] },
  };
}

export const PORK33_SANITIZED_SEED: Pork33SeedPackage = {
  sourceDatasetId: PORK33_SANITIZED_FIXTURE_DATASET_ID,
  sourceAudit: {
    physicalCandidateRowCount: 27,
    duplicatePrintedNumbers: [],
    missingPrintedNumbers: [],
    blankPrintedRows: [],
    addressReviewRequiredCount: 27,
    maintenanceUnknownCount: 27,
    regionCount: REGION_ROWS.length,
    proposedApartmentAreaCount: AREA_ROWS.length,
    fieldNoteRawPresentCount: 27,
    validationInvalidCount: 0,
  },
  regions: REGION_ROWS.map(([regionId, label], index) => ({
    regionId,
    label,
    caseId: "case_pork33_field_2026_10",
    source: `SANITIZED_FIXTURE_${index + 1}`,
  })),
  apartmentAreas: AREA_ROWS.map(([apartmentAreaId, regionId], index) => ({
    apartmentAreaId,
    regionId,
    analysisClusterId: `fixture_cluster_${String(index + 1).padStart(2, "0")}`,
    label: `SANITIZED FIXTURE AREA ${String(index + 1).padStart(2, "0")}`,
    groupingSource: "SANITIZED_FIXTURE",
    manualReviewRequired: true,
  })),
  candidates: Array.from({ length: 27 }, (_, index) => fixtureCandidate(index + 1)),
};
