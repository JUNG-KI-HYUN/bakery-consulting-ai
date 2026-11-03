import type { CandidateStoreId } from "../analysis-cluster/types";

export const CANDIDATE_SCREENING_SCHEMA_VERSION =
  "frameone.candidate-screening.v1" as const;

/**
 * Candidate 검토 진행상태다. Risk, Site Grade, 계약판정과 독립적이며 자동 전이되지 않는다.
 * DISCOVERED: 후보 등록만 됨
 * FIELD_REVIEWED: 현장확인이 수행됨
 * KEEP: 현재 검토를 유지함
 * REVIEW: 추가 확인이 필요함
 * SHORTLIST: 심층 Due Diligence 대상으로 선택됨
 * HOLD: 조건 해소 전 진행을 보류함
 * DROP: 현재 기준에서 제외함
 */
export const CANDIDATE_LIFECYCLE_STATUSES = Object.freeze([
  "DISCOVERED",
  "FIELD_REVIEWED",
  "KEEP",
  "REVIEW",
  "SHORTLIST",
  "HOLD",
  "DROP",
] as const);

export type CandidateLifecycleStatus =
  (typeof CANDIDATE_LIFECYCLE_STATUSES)[number];

export interface SiteCriteriaProfileReference {
  readonly profileId: string;
  readonly profileVersion: string;
}

/** Candidate와 Analysis Cluster 원본을 복제하지 않는 screening reference record. */
export interface CandidateScreeningRecordV1 {
  readonly schemaVersion: typeof CANDIDATE_SCREENING_SCHEMA_VERSION;
  readonly candidateStoreId: CandidateStoreId;
  readonly analysisClusterId: string;
  readonly lifecycleStatus: CandidateLifecycleStatus;
  readonly criteriaProfileRef?: SiteCriteriaProfileReference;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
  readonly note?: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface CandidateScreeningValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_CANDIDATE_SCREENING";
  readonly message: string;
  readonly errors: readonly string[];
}

export type CandidateScreeningValidationResult =
  | { readonly ok: true; readonly value: CandidateScreeningRecordV1 }
  | CandidateScreeningValidationFailure;
