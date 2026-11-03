import type { CandidatePhotoCategory } from "./category";

export const CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION =
  "frameone.candidate-photo-metadata.v1" as const;
export const CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION =
  "frameone.candidate-photo-profile.v1" as const;

export interface CandidatePhotoMetadataV1 {
  readonly schemaVersion: typeof CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION;
  readonly metadataVersion: string;
  readonly photoId: string;
  readonly caseId: string;
  readonly candidateStoreId: string;
  readonly assetRef: string;
  readonly evidenceRef: string | null;
  readonly category: CandidatePhotoCategory;
  readonly sortOrder: number;
  readonly includeInBriefing: boolean | null;
  readonly includeInReport: boolean | null;
  readonly fieldMemoRaw: string | null;
  readonly uploadedAt: string;
  readonly takenAt: string | null;
  readonly deletedAt: string | null;
}

export interface CandidatePhotoProfileV1 {
  readonly schemaVersion: typeof CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION;
  readonly profileVersion: string;
  readonly caseId: string;
  readonly candidateStoreId: string;
  /** Primary는 photo metadata에 중복 저장하지 않고 profile의 단일 reference로만 보존한다. */
  readonly primaryPhotoId: string | null;
  readonly photoIds: readonly string[];
  readonly updatedAt: string;
}

export type CandidatePhotoContractFailureCode =
  | "INVALID_PHOTO_METADATA"
  | "INVALID_PHOTO_PROFILE"
  | "DUPLICATE_PHOTO_ID"
  | "FOREIGN_CASE_PHOTO"
  | "FOREIGN_CANDIDATE_PHOTO"
  | "ASSET_REFERENCE_MISMATCH"
  | "PHOTO_SET_MISMATCH"
  | "PRIMARY_PHOTO_NOT_FOUND"
  | "PRIMARY_PHOTO_DELETED"
  | "INVALID_EVIDENCE_OWNERSHIP"
  | "EVIDENCE_OWNERSHIP_NOT_FOUND"
  | "FOREIGN_EVIDENCE";

export interface CandidatePhotoContractFailureV1 {
  readonly ok: false;
  readonly code: CandidatePhotoContractFailureCode;
  readonly message: string;
  readonly errors: readonly string[];
}

export type CandidatePhotoMetadataValidationResult =
  | { readonly ok: true; readonly value: CandidatePhotoMetadataV1 }
  | CandidatePhotoContractFailureV1;

export type CandidatePhotoProfileValidationResult =
  | { readonly ok: true; readonly value: CandidatePhotoProfileV1 }
  | CandidatePhotoContractFailureV1;

export interface CandidatePhotoCollectionV1 {
  readonly profile: CandidatePhotoProfileV1;
  readonly photos: readonly CandidatePhotoMetadataV1[];
}

export type CandidatePhotoCollectionValidationResult =
  | { readonly ok: true; readonly value: CandidatePhotoCollectionV1 }
  | CandidatePhotoContractFailureV1;
