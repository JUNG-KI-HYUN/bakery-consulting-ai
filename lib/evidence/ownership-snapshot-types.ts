import type { CandidateStoreId } from "../analysis-cluster/types";

export const EVIDENCE_OWNERSHIP_SCHEMA_VERSION =
  "frameone.evidence-ownership.v1" as const;
export const EVIDENCE_SNAPSHOT_SCHEMA_VERSION =
  "frameone.evidence-snapshot.v1" as const;

export const EVIDENCE_SCOPE_TYPES = Object.freeze([
  "CASE",
  "ANALYSIS_CLUSTER",
  "CANDIDATE",
] as const);
export type EvidenceScopeType = (typeof EVIDENCE_SCOPE_TYPES)[number];

/**
 * 기존 Evidence 객체를 변경하지 않는 sidecar ownership contract.
 * scope promotion은 이 contract의 생성/검증만으로 발생하지 않는다.
 */
export interface EvidenceOwnershipV1 {
  readonly schemaVersion: typeof EVIDENCE_OWNERSHIP_SCHEMA_VERSION;
  readonly scopeType: EvidenceScopeType;
  readonly caseId: string;
  /** ANALYSIS_CLUSTER에는 필수, CANDIDATE에는 당시 Cluster context가 있을 때만 명시한다. */
  readonly analysisClusterId?: string;
  /** CANDIDATE에만 필수다. */
  readonly candidateStoreId?: CandidateStoreId;
}

/** Evidence ID와 sidecar ownership의 명시적 연결. Evidence 값이나 객체를 포함하지 않는다. */
export interface EvidenceOwnershipBindingV1 {
  readonly evidenceRef: string;
  readonly ownership: EvidenceOwnershipV1;
}

/**
 * 평가 시 사용한 reference set만 pinning한다.
 * 기존 Evidence 객체, 값, verification/source metadata는 복제하지 않는다.
 */
export interface EvidenceSnapshotV1 {
  readonly schemaVersion: typeof EVIDENCE_SNAPSHOT_SCHEMA_VERSION;
  /** 기존 EvidenceSnapshotReferenceV1.snapshotId와 구조적으로 호환된다. */
  readonly snapshotId: string;
  readonly caseId: string;
  readonly ownershipContext: EvidenceOwnershipV1;
  readonly evidenceRefs: readonly string[];
  readonly capturedAt: string;
  readonly snapshotVersion: string;
  readonly createdBy?: string;
  readonly sourceManifestVersion?: string;
}

/** Phase 4G/4H resolver가 요구하는 최소 reference shape. */
export interface EvidenceSnapshotReferenceCompatibleV1 {
  readonly snapshotId: string;
  readonly snapshotVersion: string;
  readonly capturedAt: string;
  readonly evidenceRefs: readonly string[];
}

export interface EvidenceOwnershipSnapshotFailureV1 {
  readonly ok: false;
  readonly code:
    | "INVALID_EVIDENCE_OWNERSHIP"
    | "INVALID_EVIDENCE_OWNERSHIP_BINDING"
    | "INVALID_EVIDENCE_SNAPSHOT"
    | "EVIDENCE_OWNERSHIP_NOT_FOUND"
    | "FOREIGN_CASE_EVIDENCE"
    | "FOREIGN_CLUSTER_EVIDENCE"
    | "FOREIGN_CANDIDATE_EVIDENCE";
  readonly message: string;
  readonly errors: readonly string[];
}

export type EvidenceOwnershipValidationResult =
  | { readonly ok: true; readonly value: EvidenceOwnershipV1 }
  | EvidenceOwnershipSnapshotFailureV1;

export type EvidenceOwnershipBindingsValidationResult =
  | { readonly ok: true; readonly value: readonly EvidenceOwnershipBindingV1[] }
  | EvidenceOwnershipSnapshotFailureV1;

export type EvidenceSnapshotValidationResult =
  | { readonly ok: true; readonly value: EvidenceSnapshotV1 }
  | EvidenceOwnershipSnapshotFailureV1;
