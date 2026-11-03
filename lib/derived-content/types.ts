export const DERIVED_CONTENT_REVISION_SCHEMA_VERSION =
  "frameone.derived-content-revision.v1" as const;

export const DERIVED_CONTENT_KINDS = Object.freeze([
  "FIELD_NOTE_STRUCTURE",
  "PHOTO_CAPTION",
] as const);
export type DerivedContentKind = (typeof DERIVED_CONTENT_KINDS)[number];

export const DERIVED_CONTENT_REVISION_STATUSES = Object.freeze([
  "DRAFT",
  "REVIEWED",
  "APPROVED",
] as const);
export type DerivedContentRevisionStatus = (typeof DERIVED_CONTENT_REVISION_STATUSES)[number];

export const DERIVED_CONTENT_ORIGINS = Object.freeze(["AI", "HUMAN_EDIT"] as const);
export type DerivedContentOrigin = (typeof DERIVED_CONTENT_ORIGINS)[number];

export interface FieldNoteStructuredContentV1 {
  readonly locationSummary: string;
  readonly strengths: readonly string[];
  readonly checks: readonly string[];
  readonly competitionNotes: readonly string[];
  readonly vehicleAccessNotes: readonly string[];
  readonly fieldObservations: readonly string[];
  readonly reportSummary: string;
  readonly facilityNotes?: readonly string[];
  readonly leaseNotes?: readonly string[];
}

export interface PhotoCaptionContentV1 {
  readonly title: string;
  readonly caption: string;
  readonly needsConfirmation: boolean;
}

export interface DerivedContentRevisionBaseV1 {
  readonly schemaVersion: typeof DERIVED_CONTENT_REVISION_SCHEMA_VERSION;
  readonly revisionId: string;
  /** 동일 subject 안에서 1부터 증가한다. Repository uniqueness는 후속 persistence 경계가 담당한다. */
  readonly revisionSequence: number;
  readonly contentKind: DerivedContentKind;
  readonly caseId: string;
  readonly candidateStoreId: string;
  readonly subjectRef: string;
  readonly rawSourceRef: string;
  /** 바로 앞 편집·생성 계보. */
  readonly parentRevisionId: string | null;
  /** Report용 이전 승인본 대체 관계. parent와 별개다. */
  readonly supersedesApprovedRevisionId: string | null;
  readonly status: DerivedContentRevisionStatus;
  readonly origin: DerivedContentOrigin;
  readonly promptContractVersion: string | null;
  readonly modelId: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
}

export interface FieldNoteStructuredRevisionV1 extends DerivedContentRevisionBaseV1 {
  readonly contentKind: "FIELD_NOTE_STRUCTURE";
  readonly payload: FieldNoteStructuredContentV1;
}

export interface PhotoCaptionRevisionV1 extends DerivedContentRevisionBaseV1 {
  readonly contentKind: "PHOTO_CAPTION";
  readonly payload: PhotoCaptionContentV1;
}

export type DerivedContentRevisionV1 = FieldNoteStructuredRevisionV1 | PhotoCaptionRevisionV1;

export type DerivedContentContractFailureCode =
  | "INVALID_REVISION"
  | "INVALID_REVISION_ID"
  | "INVALID_REVISION_SEQUENCE"
  | "INVALID_CONTEXT"
  | "INVALID_SUBJECT_REFERENCE"
  | "INVALID_RAW_SOURCE_REFERENCE"
  | "INVALID_STATUS"
  | "INVALID_ORIGIN"
  | "INVALID_STATUS_METADATA"
  | "INVALID_PROVENANCE"
  | "INVALID_REVISION_LINK"
  | "CONTENT_KIND_PAYLOAD_MISMATCH"
  | "INVALID_FIELD_NOTE_PAYLOAD"
  | "INVALID_PHOTO_CAPTION_PAYLOAD"
  | "EMPTY_APPROVED_CONTENT"
  | "INVALID_STATUS_TRANSITION";

export interface DerivedContentContractFailureV1 {
  readonly ok: false;
  readonly code: DerivedContentContractFailureCode;
  readonly message: string;
  readonly errors: readonly string[];
}

export type DerivedContentRevisionValidationResult =
  | { readonly ok: true; readonly value: DerivedContentRevisionV1 }
  | DerivedContentContractFailureV1;

export interface DerivedContentTransitionInputV1 {
  readonly revisionId: string;
  readonly revisionSequence: number;
  readonly actor: string;
  readonly transitionedAt: string;
  /** APPROVED로 전이할 때만 이전 승인본을 명시할 수 있다. */
  readonly supersedesApprovedRevisionId?: string | null;
}
