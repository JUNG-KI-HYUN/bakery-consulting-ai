import type {
  ConfirmationRequirement,
  EvidenceSourceType,
  VerificationStatus,
} from "../evidence/types";

/**
 * FIELD 관찰값의 Evidence 3축 메타데이터.
 * VerificationStatus / EvidenceSourceType / ConfirmationRequirement를 합치지 않는다.
 * 숫자 입력만으로 VERIFIED로 승격하지 않는다.
 */
export interface FieldEvidenceMeta {
  readonly verificationStatus: VerificationStatus;
  readonly sourceType: EvidenceSourceType;
  readonly confirmationRequirement: ConfirmationRequirement;
  readonly note?: string;
}

export const DEFAULT_FIELD_EVIDENCE_META: FieldEvidenceMeta = Object.freeze({
  verificationStatus: "UNKNOWN",
  sourceType: "FIELD_CHECK",
  confirmationRequirement: "NONE",
});

/** 값을 입력했다고 VERIFIED로 바꾸지 않는다. OWNER_STATEMENT도 VERIFIED가 아니다. */
export function createFieldEvidenceMeta(
  partial: Partial<FieldEvidenceMeta> = {},
): FieldEvidenceMeta {
  const note = partial.note?.trim();
  return Object.freeze({
    verificationStatus: partial.verificationStatus ?? DEFAULT_FIELD_EVIDENCE_META.verificationStatus,
    sourceType: partial.sourceType ?? DEFAULT_FIELD_EVIDENCE_META.sourceType,
    confirmationRequirement:
      partial.confirmationRequirement ?? DEFAULT_FIELD_EVIDENCE_META.confirmationRequirement,
    ...(note ? { note } : {}),
  });
}

const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "VERIFIED",
  "ESTIMATED",
  "UNKNOWN",
  "CONFLICTED",
  "STALE",
];

const SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "DOCUMENT",
  "FIELD_CHECK",
  "PHOTO",
  "OWNER_STATEMENT",
  "TENANT_STATEMENT",
  "EXPERT_STATEMENT",
  "PUBLIC_DATA",
  "SYSTEM_CALCULATION",
  "CUSTOMER_INPUT",
];

const CONFIRMATION_REQUIREMENTS: readonly ConfirmationRequirement[] = [
  "NONE",
  "FIELD_CHECK_REQUIRED",
  "OWNER_CONFIRMATION_REQUIRED",
  "AGENT_CONFIRMATION_REQUIRED",
  "EXPERT_CONFIRMATION_REQUIRED",
  "AUTHORITY_CONFIRMATION_REQUIRED",
  "DOCUMENT_REQUIRED",
  "NO_SOURCE_AVAILABLE",
];

export function isVerificationStatus(value: unknown): value is VerificationStatus {
  return typeof value === "string" && VERIFICATION_STATUSES.some((item) => item === value);
}

export function isEvidenceSourceType(value: unknown): value is EvidenceSourceType {
  return typeof value === "string" && SOURCE_TYPES.some((item) => item === value);
}

export function isConfirmationRequirement(value: unknown): value is ConfirmationRequirement {
  return typeof value === "string" && CONFIRMATION_REQUIREMENTS.some((item) => item === value);
}

export function parseFieldEvidenceMeta(value: unknown): FieldEvidenceMeta | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isVerificationStatus(record.verificationStatus)) return null;
  if (!isEvidenceSourceType(record.sourceType)) return null;
  if (!isConfirmationRequirement(record.confirmationRequirement)) return null;
  if (record.note !== undefined && typeof record.note !== "string") return null;
  return createFieldEvidenceMeta({
    verificationStatus: record.verificationStatus,
    sourceType: record.sourceType,
    confirmationRequirement: record.confirmationRequirement,
    note: typeof record.note === "string" ? record.note : undefined,
  });
}
