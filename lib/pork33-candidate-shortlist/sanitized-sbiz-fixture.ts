import type { Pork33Sbiz365SnapshotV1 } from "./briefing-report";

export function createSanitizedPork33Sbiz365Snapshots(
  candidateIds: readonly string[],
): Pork33Sbiz365SnapshotV1[] {
  return candidateIds.map((candidateId) => ({
    schemaVersion: "frameone.pork33-sbiz365-candidate-snapshot.v1",
    candidateId,
    sourceFileName: `SANITIZED_FIXTURE_${candidateId}.pdf`,
    addressVerification: candidateId === "P33-022" ? "USER_CONFIRMED_OVERRIDE" : "REVIEW_REQUIRED",
    analysisRadiusMeters: 500,
    radiusSource: "USER_PROVIDED",
    analysisDate: null,
    peakFloatingTime: null,
    peakGenderAge: null,
    meatShopCount: null,
    householdCount: null,
    residentialPopulation: null,
    extractionStatus: "SANITIZED_FIXTURE",
  }));
}
