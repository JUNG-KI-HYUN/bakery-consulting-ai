import { isCandidatePhotoId } from "../candidate-photo/identifiers";
import { isCandidateStoreId, isSiteSurveyId } from "../field/identifiers";
import { isDerivedContentRevisionId } from "./identifiers";
import {
  DERIVED_CONTENT_KINDS,
  DERIVED_CONTENT_ORIGINS,
  DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
  DERIVED_CONTENT_REVISION_STATUSES,
  type DerivedContentContractFailureCode,
  type DerivedContentContractFailureV1,
  type DerivedContentKind,
  type DerivedContentOrigin,
  type DerivedContentRevisionStatus,
  type DerivedContentRevisionValidationResult,
  type FieldNoteStructuredContentV1,
  type FieldNoteStructuredRevisionV1,
  type PhotoCaptionContentV1,
  type PhotoCaptionRevisionV1,
} from "./types";

const REVISION_KEYS = new Set([
  "schemaVersion", "revisionId", "revisionSequence", "contentKind", "caseId",
  "candidateStoreId", "subjectRef", "rawSourceRef", "parentRevisionId",
  "supersedesApprovedRevisionId", "status", "origin", "promptContractVersion",
  "modelId", "createdAt", "createdBy", "reviewedAt", "reviewedBy", "approvedAt",
  "approvedBy", "payload",
]);
const FIELD_NOTE_KEYS = new Set([
  "locationSummary", "strengths", "checks", "competitionNotes", "vehicleAccessNotes",
  "fieldObservations", "reportSummary", "facilityNotes", "leaseNotes",
]);
const PHOTO_CAPTION_KEYS = new Set(["title", "caption", "needsConfirmation"]);
const SAFE_CASE_ID = /^[a-zA-Z0-9_-]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function isEmptyOrTrimmed(value: unknown): value is string {
  return typeof value === "string" && (value === "" || (value.trim() !== "" && value === value.trim()));
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T/u.test(value)
    && Number.isFinite(Date.parse(value));
}

function isKind(value: unknown): value is DerivedContentKind {
  return DERIVED_CONTENT_KINDS.some((kind) => kind === value);
}

function isStatus(value: unknown): value is DerivedContentRevisionStatus {
  return DERIVED_CONTENT_REVISION_STATUSES.some((status) => status === value);
}

function isOrigin(value: unknown): value is DerivedContentOrigin {
  return DERIVED_CONTENT_ORIGINS.some((origin) => origin === value);
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${path}.${key}는 허용되지 않습니다.`);
}

function failure(
  code: DerivedContentContractFailureCode,
  message: string,
  errors: readonly string[],
): DerivedContentContractFailureV1 {
  return Object.freeze({ ok: false, code, message, errors: Object.freeze([...errors]) });
}

/** 마침표·물음표·느낌표 또는 줄바꿈으로 구분되는 비어 있지 않은 문장 수. */
export function countDerivedContentSentencesV1(value: string): number {
  return value
    .split(/[.!?。！？]+|\r?\n+/u)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function parseTextList(
  value: unknown,
  path: string,
  maximum: number,
  errors: string[],
): readonly string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 배열이어야 합니다.`);
    return null;
  }
  if (value.length > maximum) errors.push(`${path}는 최대 ${maximum}개입니다.`);
  value.forEach((item, index) => {
    if (!isNonEmpty(item)) errors.push(`${path}[${index}]는 공백이 아닌 문자열이어야 합니다.`);
  });
  return value.every(isNonEmpty) ? Object.freeze([...value]) : null;
}

function parseFieldNotePayload(value: unknown):
  | { readonly ok: true; readonly value: FieldNoteStructuredContentV1 }
  | DerivedContentContractFailureV1 {
  if (!isRecord(value)) {
    return failure("CONTENT_KIND_PAYLOAD_MISMATCH", "Field Note payload가 올바르지 않습니다.", ["payload는 객체여야 합니다."]);
  }
  const errors = unknownKeys(value, FIELD_NOTE_KEYS, "payload");
  if (!isEmptyOrTrimmed(value.locationSummary)) errors.push("payload.locationSummary가 올바르지 않습니다.");
  if (!isEmptyOrTrimmed(value.reportSummary)) errors.push("payload.reportSummary가 올바르지 않습니다.");
  if (typeof value.locationSummary === "string" && countDerivedContentSentencesV1(value.locationSummary) > 2) {
    errors.push("payload.locationSummary는 최대 2문장입니다.");
  }
  if (typeof value.reportSummary === "string" && countDerivedContentSentencesV1(value.reportSummary) > 3) {
    errors.push("payload.reportSummary는 최대 3문장입니다.");
  }
  const strengths = parseTextList(value.strengths, "payload.strengths", 2, errors);
  const checks = parseTextList(value.checks, "payload.checks", 2, errors);
  const competitionNotes = parseTextList(value.competitionNotes, "payload.competitionNotes", 2, errors);
  const vehicleAccessNotes = parseTextList(value.vehicleAccessNotes, "payload.vehicleAccessNotes", 2, errors);
  const fieldObservations = parseTextList(value.fieldObservations, "payload.fieldObservations", 2, errors);
  const facilityNotes = value.facilityNotes === undefined
    ? undefined
    : parseTextList(value.facilityNotes, "payload.facilityNotes", 2, errors);
  const leaseNotes = value.leaseNotes === undefined
    ? undefined
    : parseTextList(value.leaseNotes, "payload.leaseNotes", 2, errors);
  if (
    errors.length > 0 || !isEmptyOrTrimmed(value.locationSummary) || !isEmptyOrTrimmed(value.reportSummary)
    || !strengths || !checks || !competitionNotes || !vehicleAccessNotes || !fieldObservations
    || facilityNotes === null || leaseNotes === null
  ) return failure("INVALID_FIELD_NOTE_PAYLOAD", "Field Note payload가 올바르지 않습니다.", errors);

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      locationSummary: value.locationSummary,
      strengths,
      checks,
      competitionNotes,
      vehicleAccessNotes,
      fieldObservations,
      reportSummary: value.reportSummary,
      ...(facilityNotes ? { facilityNotes } : {}),
      ...(leaseNotes ? { leaseNotes } : {}),
    }),
  });
}

function parsePhotoCaptionPayload(value: unknown):
  | { readonly ok: true; readonly value: PhotoCaptionContentV1 }
  | DerivedContentContractFailureV1 {
  if (!isRecord(value)) {
    return failure("CONTENT_KIND_PAYLOAD_MISMATCH", "Photo Caption payload가 올바르지 않습니다.", ["payload는 객체여야 합니다."]);
  }
  const errors = unknownKeys(value, PHOTO_CAPTION_KEYS, "payload");
  if (!isNonEmpty(value.title)) errors.push("payload.title이 필요합니다.");
  if (typeof value.title === "string" && Array.from(value.title).length > 80) errors.push("payload.title은 최대 80자입니다.");
  if (!isNonEmpty(value.caption)) errors.push("payload.caption이 필요합니다.");
  if (typeof value.caption === "string") {
    const sentenceCount = countDerivedContentSentencesV1(value.caption);
    if (sentenceCount < 1 || sentenceCount > 2) errors.push("payload.caption은 1~2문장이어야 합니다.");
  }
  if (typeof value.needsConfirmation !== "boolean") errors.push("payload.needsConfirmation은 boolean이어야 합니다.");
  if (errors.length > 0 || !isNonEmpty(value.title) || !isNonEmpty(value.caption) || typeof value.needsConfirmation !== "boolean") {
    return failure("INVALID_PHOTO_CAPTION_PAYLOAD", "Photo Caption payload가 올바르지 않습니다.", errors);
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      title: value.title,
      caption: value.caption,
      needsConfirmation: value.needsConfirmation,
    }),
  });
}

function validateStatusMetadata(value: Record<string, unknown>): readonly string[] {
  const errors: string[] = [];
  const reviewedPair = value.reviewedAt === null && value.reviewedBy === null;
  const reviewedComplete = isIsoTimestamp(value.reviewedAt) && isNonEmpty(value.reviewedBy);
  const approvedPair = value.approvedAt === null && value.approvedBy === null;
  const approvedComplete = isIsoTimestamp(value.approvedAt) && isNonEmpty(value.approvedBy);
  if (!reviewedPair && !reviewedComplete) errors.push("reviewedAt/reviewedBy는 둘 다 null이거나 유효한 pair여야 합니다.");
  if (!approvedPair && !approvedComplete) errors.push("approvedAt/approvedBy는 둘 다 null이거나 유효한 pair여야 합니다.");
  if (value.status === "DRAFT" && (!reviewedPair || !approvedPair)) errors.push("DRAFT에는 review/approval metadata가 없어야 합니다.");
  if (value.status === "REVIEWED" && (!reviewedComplete || !approvedPair)) errors.push("REVIEWED에는 review metadata만 필요합니다.");
  if (value.status === "APPROVED" && !approvedComplete) errors.push("APPROVED에는 approval metadata가 필요합니다.");
  return errors;
}

function hasMeaningfulFieldNoteContent(payload: FieldNoteStructuredContentV1): boolean {
  return payload.locationSummary !== ""
    || payload.reportSummary !== ""
    || payload.strengths.length > 0
    || payload.checks.length > 0
    || payload.competitionNotes.length > 0
    || payload.vehicleAccessNotes.length > 0
    || payload.fieldObservations.length > 0
    || (payload.facilityNotes?.length ?? 0) > 0
    || (payload.leaseNotes?.length ?? 0) > 0;
}

/** Discriminated payload, provenance, status actor/time을 한 경계에서 strict 검증한다. */
export function validateDerivedContentRevisionV1(value: unknown): DerivedContentRevisionValidationResult {
  if (!isRecord(value)) {
    return failure("INVALID_REVISION", "Derived Content Revision이 올바르지 않습니다.", ["revision은 객체여야 합니다."]);
  }
  const errors = unknownKeys(value, REVISION_KEYS, "revision");
  if (value.schemaVersion !== DERIVED_CONTENT_REVISION_SCHEMA_VERSION) errors.push("revision.schemaVersion이 올바르지 않습니다.");
  if (!isDerivedContentRevisionId(value.revisionId)) errors.push("revision.revisionId가 올바르지 않습니다.");
  if (!Number.isInteger(value.revisionSequence) || (value.revisionSequence as number) < 1) errors.push("revision.revisionSequence은 1 이상의 정수여야 합니다.");
  if (!isKind(value.contentKind)) errors.push("revision.contentKind가 올바르지 않습니다.");
  if (typeof value.caseId !== "string" || !SAFE_CASE_ID.test(value.caseId)) errors.push("revision.caseId가 올바르지 않습니다.");
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("revision.candidateStoreId가 올바르지 않습니다.");
  if (!isNonEmpty(value.rawSourceRef)) errors.push("revision.rawSourceRef가 필요합니다.");
  if (!isStatus(value.status)) errors.push("revision.status가 올바르지 않습니다.");
  if (!isOrigin(value.origin)) errors.push("revision.origin이 올바르지 않습니다.");
  if (!isIsoTimestamp(value.createdAt)) errors.push("revision.createdAt이 올바른 ISO timestamp가 아닙니다.");
  if (!isNonEmpty(value.createdBy)) errors.push("revision.createdBy가 필요합니다.");
  if (value.parentRevisionId !== null && !isDerivedContentRevisionId(value.parentRevisionId)) errors.push("revision.parentRevisionId가 올바르지 않습니다.");
  if (value.supersedesApprovedRevisionId !== null && !isDerivedContentRevisionId(value.supersedesApprovedRevisionId)) errors.push("revision.supersedesApprovedRevisionId가 올바르지 않습니다.");
  if (isDerivedContentRevisionId(value.revisionId) && value.parentRevisionId === value.revisionId) errors.push("revision은 자기 자신을 parent로 참조할 수 없습니다.");
  if (isDerivedContentRevisionId(value.revisionId) && value.supersedesApprovedRevisionId === value.revisionId) errors.push("revision은 자기 자신을 supersede할 수 없습니다.");
  if (value.supersedesApprovedRevisionId !== null && value.status !== "APPROVED") errors.push("supersedesApprovedRevisionId는 APPROVED Revision에만 허용됩니다.");

  if (value.contentKind === "FIELD_NOTE_STRUCTURE") {
    if (!isSiteSurveyId(value.subjectRef)) errors.push("Field Note subjectRef는 survey_<uuid>여야 합니다.");
  } else if (value.contentKind === "PHOTO_CAPTION") {
    if (!isCandidatePhotoId(value.subjectRef)) errors.push("Photo Caption subjectRef는 photo_<uuid>여야 합니다.");
  } else if (!isNonEmpty(value.subjectRef)) {
    errors.push("revision.subjectRef가 필요합니다.");
  }

  if (value.origin === "AI") {
    if (!isNonEmpty(value.promptContractVersion)) errors.push("AI origin에는 promptContractVersion이 필요합니다.");
    if (value.modelId !== null && !isNonEmpty(value.modelId)) errors.push("revision.modelId가 올바르지 않습니다.");
  } else if (value.origin === "HUMAN_EDIT") {
    if (value.promptContractVersion !== null || value.modelId !== null) errors.push("HUMAN_EDIT origin에는 AI provenance를 지정할 수 없습니다.");
  }
  errors.push(...validateStatusMetadata(value));

  let payload: FieldNoteStructuredContentV1 | PhotoCaptionContentV1 | null = null;
  if (value.contentKind === "FIELD_NOTE_STRUCTURE") {
    const parsed = parseFieldNotePayload(value.payload);
    if (!parsed.ok) return parsed;
    payload = parsed.value;
    if (value.status === "APPROVED" && !hasMeaningfulFieldNoteContent(parsed.value)) {
      return failure("EMPTY_APPROVED_CONTENT", "비어 있는 Field Note payload는 승인할 수 없습니다.", ["approved payload is empty"]);
    }
  } else if (value.contentKind === "PHOTO_CAPTION") {
    const parsed = parsePhotoCaptionPayload(value.payload);
    if (!parsed.ok) return parsed;
    payload = parsed.value;
  }

  if (errors.length > 0 || !payload || !isDerivedContentRevisionId(value.revisionId)) {
    let code: DerivedContentContractFailureCode = "INVALID_REVISION";
    if (!isDerivedContentRevisionId(value.revisionId)) code = "INVALID_REVISION_ID";
    else if (!Number.isInteger(value.revisionSequence) || (value.revisionSequence as number) < 1) code = "INVALID_REVISION_SEQUENCE";
    else if (!isStatus(value.status)) code = "INVALID_STATUS";
    else if (!isOrigin(value.origin)) code = "INVALID_ORIGIN";
    else if (errors.some((error) => error.includes("subjectRef"))) code = "INVALID_SUBJECT_REFERENCE";
    else if (!isNonEmpty(value.rawSourceRef)) code = "INVALID_RAW_SOURCE_REFERENCE";
    else if (errors.some((error) => error.includes("review") || error.includes("approval") || error.includes("APPROVED") || error.includes("DRAFT"))) code = "INVALID_STATUS_METADATA";
    else if (errors.some((error) => error.includes("origin") || error.includes("promptContractVersion") || error.includes("modelId"))) code = "INVALID_PROVENANCE";
    else if (errors.some((error) => error.includes("parent") || error.includes("supersede"))) code = "INVALID_REVISION_LINK";
    else if (errors.some((error) => error.includes("caseId") || error.includes("candidateStoreId"))) code = "INVALID_CONTEXT";
    return failure(code, "Derived Content Revision이 올바르지 않습니다.", errors);
  }

  const base = {
    schemaVersion: DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
    revisionId: value.revisionId,
    revisionSequence: value.revisionSequence as number,
    contentKind: value.contentKind,
    caseId: value.caseId as string,
    candidateStoreId: value.candidateStoreId as string,
    subjectRef: value.subjectRef as string,
    rawSourceRef: value.rawSourceRef,
    parentRevisionId: value.parentRevisionId as string | null,
    supersedesApprovedRevisionId: value.supersedesApprovedRevisionId as string | null,
    status: value.status as DerivedContentRevisionStatus,
    origin: value.origin as DerivedContentOrigin,
    promptContractVersion: value.promptContractVersion as string | null,
    modelId: value.modelId as string | null,
    createdAt: value.createdAt as string,
    createdBy: value.createdBy as string,
    reviewedAt: value.reviewedAt as string | null,
    reviewedBy: value.reviewedBy as string | null,
    approvedAt: value.approvedAt as string | null,
    approvedBy: value.approvedBy as string | null,
  };
  if (value.contentKind === "FIELD_NOTE_STRUCTURE") {
    return Object.freeze({ ok: true, value: Object.freeze({ ...base, contentKind: "FIELD_NOTE_STRUCTURE", payload }) as FieldNoteStructuredRevisionV1 });
  }
  return Object.freeze({ ok: true, value: Object.freeze({ ...base, contentKind: "PHOTO_CAPTION", payload }) as PhotoCaptionRevisionV1 });
}

export function isDerivedContentRevisionReportEligibleV1(value: unknown): boolean {
  const result = validateDerivedContentRevisionV1(value);
  if (!result.ok) throw new TypeError(`${result.message} ${result.errors.join(" ")}`);
  return result.value.status === "APPROVED";
}

type FieldNoteRevisionInput = Omit<FieldNoteStructuredRevisionV1, "schemaVersion" | "contentKind">;
type PhotoCaptionRevisionInput = Omit<PhotoCaptionRevisionV1, "schemaVersion" | "contentKind">;

export function createFieldNoteStructuredRevisionV1(input: FieldNoteRevisionInput): FieldNoteStructuredRevisionV1 {
  const result = validateDerivedContentRevisionV1({
    ...input,
    schemaVersion: DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
    contentKind: "FIELD_NOTE_STRUCTURE",
  });
  if (!result.ok) throw new TypeError(`${result.message} ${result.errors.join(" ")}`);
  return result.value as FieldNoteStructuredRevisionV1;
}

export function createPhotoCaptionRevisionV1(input: PhotoCaptionRevisionInput): PhotoCaptionRevisionV1 {
  const result = validateDerivedContentRevisionV1({
    ...input,
    schemaVersion: DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
    contentKind: "PHOTO_CAPTION",
  });
  if (!result.ok) throw new TypeError(`${result.message} ${result.errors.join(" ")}`);
  return result.value as PhotoCaptionRevisionV1;
}
