/**
 * CandidateStore 단위 공간평가 snapshot contract.
 *
 * FIELD 현장 관찰이나 SPACE FIT geometry를 대체하지 않으며, 이들 원천을 자동 변환하지 않는다.
 * 공간평가의 상태·근거·평가기반을 기록할 뿐 Risk·Verdict·Score·시공/법적 가능성을 만들지 않는다.
 */

import type {
  ConfirmationRequirement,
  EvidenceSourceType,
  VerificationStatus,
} from "../evidence/types";

export const CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION =
  "candidate-space-evidence-v1" as const;

/**
 * 향후 별도 adapter의 FIELD mapping 정책:
 * PLANNABLE → PLANNABLE, LIMITED → LIMITED, NOT_ASSESSED → NOT_ASSESSED.
 * FIELD 관찰만으로 NOT_FEASIBLE을 자동 생성하지 않는다. 이번 contract에는 mapping 코드가 없다.
 */
/**
 * PLANNABLE: 현재 확인 근거에서 계획 검토 가능. 최종 설계·시공 가능을 뜻하지 않는다.
 * LIMITED: 명확한 공간 제약이 관찰됨. NOT_FEASIBLE이나 계약 불가가 아니다.
 * NOT_FEASIBLE: 현재 운영요건과 평가기반에서 공간계획이 성립하지 않는다는 명시적 평가.
 *                 법적 사용 불가나 HARD_BLOCKER를 뜻하지 않는다.
 * NOT_ASSESSED: 평가하지 않음. NOT_FEASIBLE과 다르다.
 * NOT_APPLICABLE: 해당 공간평가 항목이 적용되지 않음.
 */
export type SpaceAssessmentStatus =
  | "PLANNABLE"
  | "LIMITED"
  | "NOT_FEASIBLE"
  | "NOT_ASSESSED"
  | "NOT_APPLICABLE";

/**
 * 현재 정의된 required equipment set에 대한 공간배치 평가다.
 * Geometry warning 하나를 FIT/NOT_FIT으로 자동 변환하지 않는다.
 */
export type RequiredEquipmentFitStatus =
  | "FIT"
  | "CONSTRAINED"
  | "NOT_FIT"
  | "NOT_ASSESSED"
  | "NOT_APPLICABLE";

export type LayoutAssessmentStatus = "ASSESSED" | "NOT_ASSESSED";
export type SpaceMeasurementStatus = "CONFIRMED" | "PARTIAL" | "NOT_CONFIRMED";
export type RequiredEquipmentSetStatus = "DEFINED" | "NOT_DEFINED";
export type ManufacturingRequirement = "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";

/**
 * 원본 근거를 찾기 위한 opaque 참조. 이름·전화번호·이메일·주소를 넣지 않는다.
 * Geometry warning 배열은 복제하지 않고 필요한 원천 record만 참조한다.
 */
export interface SpaceEvidenceSourceRef {
  readonly documentId?: string;
  readonly opaqueSourceId?: string;
  readonly fieldKey?: string;
  readonly stageId?: string;
  readonly layoutId?: string;
  readonly measurementId?: string;
}

/** 상태와 provenance를 분리한다. 입력됐다는 이유로 VERIFIED를 자동 부여하지 않는다. */
export interface SpaceEvidence {
  readonly verificationStatus: VerificationStatus;
  readonly sourceType: EvidenceSourceType;
  readonly confirmationRequirement: ConfirmationRequirement;
  readonly sourceRef: SpaceEvidenceSourceRef;
  /** caller가 제공한 관찰·평가 시점. Snapshot capturedAt과 다를 수 있다. */
  readonly observedAt: string;
}

/** summary는 참고 설명이며 향후 Risk predicate의 source-of-truth가 아니다. */
export interface SpaceEvidenceEntry<S extends string> {
  readonly status: S;
  readonly evidence: SpaceEvidence | null;
  readonly summary?: string;
}

export interface CandidateSpaceAssessment {
  readonly manufacturingSpace: SpaceEvidenceEntry<SpaceAssessmentStatus>;
  readonly salesSpace: SpaceEvidenceEntry<SpaceAssessmentStatus>;
  readonly staffFlow: SpaceEvidenceEntry<SpaceAssessmentStatus>;
  readonly customerFlow: SpaceEvidenceEntry<SpaceAssessmentStatus>;
  readonly packingPickupSpace: SpaceEvidenceEntry<SpaceAssessmentStatus>;
  readonly storageSpace: SpaceEvidenceEntry<SpaceAssessmentStatus>;
}

/**
 * requiredEquipmentDefinitionIds는 기존 EquipmentDefinition opaque ID만 보존한다.
 * Equipment Set 엔진이나 장비 사양을 이 contract에 복제하지 않는다.
 */
export interface CandidateSpaceAssessmentBasis {
  readonly layoutAssessmentStatus: LayoutAssessmentStatus;
  readonly measurementStatus: SpaceMeasurementStatus;
  readonly requiredEquipmentSetStatus: RequiredEquipmentSetStatus;
  readonly requiredEquipmentDefinitionIds: readonly string[];
}

export interface CandidateSpaceEvidenceSnapshot {
  readonly schemaVersion: typeof CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION;
  /** caller 제공. 자동 생성하지 않는다. */
  readonly snapshotId: string;
  readonly candidateStoreId: string;
  /** ISO 8601 timestamp, timezone 포함. caller 제공. */
  readonly capturedAt: string;
  readonly manufacturingRequirement: ManufacturingRequirement;
  readonly spaceAssessment: CandidateSpaceAssessment;
  readonly equipmentFitAssessment: SpaceEvidenceEntry<RequiredEquipmentFitStatus>;
  readonly assessmentBasis: CandidateSpaceAssessmentBasis;
  readonly createsRisk: false;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

export interface CandidateSpaceEvidenceFailure {
  readonly ok: false;
  readonly code: "INVALID_CANDIDATE_SPACE_EVIDENCE";
  readonly message: string;
  readonly errors: readonly string[];
}

export type CandidateSpaceEvidenceValidationResult =
  | { readonly ok: true; readonly value: CandidateSpaceEvidenceSnapshot }
  | CandidateSpaceEvidenceFailure;
