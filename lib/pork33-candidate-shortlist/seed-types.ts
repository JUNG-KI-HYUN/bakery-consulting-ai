import type { Pork33SeedCandidate, Pork33ShortlistStateV1 } from "./types";

export const PORK33_PRIVATE_SOURCE_DATASET_ID = "PORK33_FIELD_SOURCE_2026_10" as const;
export const PORK33_SANITIZED_FIXTURE_DATASET_ID = "PORK33_SANITIZED_FIXTURE_V1" as const;

export type Pork33SeedDatasetId =
  | typeof PORK33_PRIVATE_SOURCE_DATASET_ID
  | typeof PORK33_SANITIZED_FIXTURE_DATASET_ID;

export type Pork33SeedMode = "LOCAL_PRIVATE" | "SANITIZED_FIXTURE";

export type Pork33SeedPackage = {
  sourceDatasetId: Pork33SeedDatasetId;
  sourceAudit: Pork33ShortlistStateV1["sourceAudit"];
  regions: Pork33ShortlistStateV1["regions"];
  apartmentAreas: Pork33ShortlistStateV1["apartmentAreas"];
  candidates: Pork33SeedCandidate[];
};

export type Pork33SeedResolution = {
  mode: Pork33SeedMode;
  sourcePath: string | null;
  seed: Pork33SeedPackage;
};

export function isPork33PrivateState(state: Pick<Pork33ShortlistStateV1, "sourceDatasetId">) {
  return state.sourceDatasetId === PORK33_PRIVATE_SOURCE_DATASET_ID;
}

export function assertPork33CustomerReportSource(
  state: Pick<Pork33ShortlistStateV1, "sourceDatasetId">,
) {
  if (!isPork33PrivateState(state)) {
    throw new Error("SANITIZED_FIXTURE 상태에서는 고객용 PORK33 보고서를 생성할 수 없습니다. local private source를 provisioning해 주세요.");
  }
}
