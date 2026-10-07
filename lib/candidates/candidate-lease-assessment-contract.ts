export const CANDIDATE_LEASE_CHECK_KEYS = [
  "businessUseRestriction",
  "restorationScope",
  "requiredWorksConsent",
  "permitFailureCondition",
  "specialClauseStatus",
  "writtenConfirmationStatus",
  "repairResponsibility",
  "handoverCondition",
  "premiumComposition",
  "premiumPaymentTiming",
  "premiumLeaseCondition",
] as const;

export type CandidateLeaseCheckKey = (typeof CANDIDATE_LEASE_CHECK_KEYS)[number];
export type CandidateLeaseCheckState = "ACCEPTABLE" | "CONDITIONAL" | "UNACCEPTABLE" | "UNKNOWN";
export type CandidateLeaseVerificationStatus =
  | "VERIFIED"
  | "NOT_CHECKED"
  | "LANDLORD_CONFIRM_REQUIRED"
  | "DOCUMENT_CONFIRM_REQUIRED"
  | "EXPERT_CONFIRM_REQUIRED"
  | "AUTHORITY_CONFIRM_REQUIRED"
  | "NO_DATA";
export type CandidateLeaseSourceType = "USER_INPUT" | "BROKER" | "LANDLORD" | "DOCUMENT" | "EXPERT" | "AUTHORITY" | "DERIVED";
export type CandidateLeaseVatTreatment = "INCLUDED" | "SEPARATE" | "EXEMPT" | "UNKNOWN";

export interface CandidateLeaseReviewedTerms {
  depositWon?: number;
  monthlyRentWon?: number;
  maintenanceFeeWon?: number;
  premiumWon?: number;
  leaseTermMonths?: number;
  rentFreeMonths?: number;
  vatTreatment?: CandidateLeaseVatTreatment;
  handoverDate?: string;
}

export interface CandidateLeaseCheck {
  state: CandidateLeaseCheckState;
  verificationStatus: CandidateLeaseVerificationStatus;
  sourceType?: CandidateLeaseSourceType;
  note?: string;
  observedAt?: string;
}

export interface CandidateLeaseAssessmentRevision {
  revisionId: string;
  reviewedTerms: CandidateLeaseReviewedTerms;
  checks: Partial<Record<CandidateLeaseCheckKey, CandidateLeaseCheck>>;
  recordedAt: string;
}

export interface CandidateLeaseAssessment {
  assessmentId: string;
  candidateId: string;
  caseId: string;
  reviewedTerms: CandidateLeaseReviewedTerms;
  checks: Partial<Record<CandidateLeaseCheckKey, CandidateLeaseCheck>>;
  revisions: CandidateLeaseAssessmentRevision[];
  createdAt: string;
  updatedAt: string;
}

export const CANDIDATE_LEASE_CHECK_LABELS: Record<CandidateLeaseCheckKey, string> = {
  businessUseRestriction: "업종제한",
  restorationScope: "원상복구 범위",
  requiredWorksConsent: "필수공사 동의",
  permitFailureCondition: "영업·인허가 실패조건",
  specialClauseStatus: "특약",
  writtenConfirmationStatus: "서면확인",
  repairResponsibility: "수선책임",
  handoverCondition: "인도조건",
  premiumComposition: "권리금 구성",
  premiumPaymentTiming: "권리금 지급시점",
  premiumLeaseCondition: "권리금·신규 임대차 조건관계",
};

export class CandidateLeaseAssessmentValidationError extends Error {}

const CHECK_STATES = ["ACCEPTABLE", "CONDITIONAL", "UNACCEPTABLE", "UNKNOWN"] as const;
const VERIFICATION_STATUSES = ["VERIFIED", "NOT_CHECKED", "LANDLORD_CONFIRM_REQUIRED", "DOCUMENT_CONFIRM_REQUIRED", "EXPERT_CONFIRM_REQUIRED", "AUTHORITY_CONFIRM_REQUIRED", "NO_DATA"] as const;
const SOURCE_TYPES = ["USER_INPUT", "BROKER", "LANDLORD", "DOCUMENT", "EXPERT", "AUTHORITY", "DERIVED"] as const;
const VAT_TREATMENTS = ["INCLUDED", "SEPARATE", "EXEMPT", "UNKNOWN"] as const;

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CandidateLeaseAssessmentValidationError(`${label}은(는) 객체여야 합니다.`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new CandidateLeaseAssessmentValidationError(`${label}은(는) 필수입니다.`);
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength = 1000) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new CandidateLeaseAssessmentValidationError(`${label} 형식이 올바르지 않습니다.`);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new CandidateLeaseAssessmentValidationError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  return normalized;
}

function optionalNumber(value: unknown, label: string, integer = false) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new CandidateLeaseAssessmentValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function optionalDate(value: unknown, label: string) {
  const normalized = optionalText(value, label, 40);
  if (normalized !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new CandidateLeaseAssessmentValidationError(`${label} 형식이 올바르지 않습니다.`);
  return normalized;
}

function optionalTimestamp(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new CandidateLeaseAssessmentValidationError("확인일 형식이 올바르지 않습니다.");
  return value;
}

function parseReviewedTerms(value: unknown, preserveExplicitClears = false) {
  const input = objectValue(value, "검토 임대조건");
  const vatTreatment = input.vatTreatment === undefined || input.vatTreatment === null || input.vatTreatment === ""
    ? undefined
    : VAT_TREATMENTS.includes(input.vatTreatment as CandidateLeaseVatTreatment)
      ? input.vatTreatment as CandidateLeaseVatTreatment
      : null;
  if (vatTreatment === null) throw new CandidateLeaseAssessmentValidationError("부가세 처리 상태가 올바르지 않습니다.");
  const result: CandidateLeaseReviewedTerms = {};
  const depositWon = optionalNumber(input.depositWon, "보증금", true);
  const monthlyRentWon = optionalNumber(input.monthlyRentWon, "월세", true);
  const maintenanceFeeWon = optionalNumber(input.maintenanceFeeWon, "관리비", true);
  const premiumWon = optionalNumber(input.premiumWon, "권리금", true);
  const leaseTermMonths = optionalNumber(input.leaseTermMonths, "계약기간", true);
  const rentFreeMonths = optionalNumber(input.rentFreeMonths, "렌트프리", true);
  const handoverDate = optionalDate(input.handoverDate, "인도일");
  const keep = (key: keyof CandidateLeaseReviewedTerms, parsed: unknown) => parsed !== undefined || (preserveExplicitClears && Object.hasOwn(input, key));

  if (keep("depositWon", depositWon)) result.depositWon = depositWon;
  if (keep("monthlyRentWon", monthlyRentWon)) result.monthlyRentWon = monthlyRentWon;
  if (keep("maintenanceFeeWon", maintenanceFeeWon)) result.maintenanceFeeWon = maintenanceFeeWon;
  if (keep("premiumWon", premiumWon)) result.premiumWon = premiumWon;
  if (keep("leaseTermMonths", leaseTermMonths)) result.leaseTermMonths = leaseTermMonths;
  if (keep("rentFreeMonths", rentFreeMonths)) result.rentFreeMonths = rentFreeMonths;
  if (keep("vatTreatment", vatTreatment)) result.vatTreatment = vatTreatment;
  if (keep("handoverDate", handoverDate)) result.handoverDate = handoverDate;
  return result;
}

function parseCheck(value: unknown, label: string): CandidateLeaseCheck {
  const input = objectValue(value, label);
  if (!CHECK_STATES.includes(input.state as CandidateLeaseCheckState)) throw new CandidateLeaseAssessmentValidationError(`${label} 상태가 올바르지 않습니다.`);
  if (!VERIFICATION_STATUSES.includes(input.verificationStatus as CandidateLeaseVerificationStatus)) throw new CandidateLeaseAssessmentValidationError(`${label} 확인상태가 올바르지 않습니다.`);
  if (input.sourceType !== undefined && input.sourceType !== null && input.sourceType !== "" && !SOURCE_TYPES.includes(input.sourceType as CandidateLeaseSourceType)) {
    throw new CandidateLeaseAssessmentValidationError(`${label} 출처가 올바르지 않습니다.`);
  }
  const note = optionalText(input.note, `${label} 메모`);
  const observedAt = optionalTimestamp(input.observedAt);
  return {
    state: input.state as CandidateLeaseCheckState,
    verificationStatus: input.verificationStatus as CandidateLeaseVerificationStatus,
    ...(input.sourceType ? { sourceType: input.sourceType as CandidateLeaseSourceType } : {}),
    ...(note ? { note } : {}),
    ...(observedAt ? { observedAt } : {}),
  };
}

function parseChecks(value: unknown) {
  const input = objectValue(value, "임대차 확인항목");
  const result: Partial<Record<CandidateLeaseCheckKey, CandidateLeaseCheck>> = {};
  for (const key of Object.keys(input)) {
    if (!CANDIDATE_LEASE_CHECK_KEYS.includes(key as CandidateLeaseCheckKey)) throw new CandidateLeaseAssessmentValidationError(`알 수 없는 임대차 확인항목입니다: ${key}`);
    result[key as CandidateLeaseCheckKey] = parseCheck(input[key], CANDIDATE_LEASE_CHECK_LABELS[key as CandidateLeaseCheckKey]);
  }
  return result;
}

export function parseCandidateLeaseAssessmentCreateInput(value: unknown) {
  const input = objectValue(value, "요청 본문");
  return {
    candidateId: requiredText(input.candidateId, "candidateId"),
    caseId: requiredText(input.caseId, "caseId"),
    reviewedTerms: input.reviewedTerms === undefined ? {} : parseReviewedTerms(input.reviewedTerms),
    checks: input.checks === undefined ? {} : parseChecks(input.checks),
  };
}

export function parseCandidateLeaseAssessmentUpdateInput(value: unknown) {
  const input = objectValue(value, "요청 본문");
  const hasTerms = Object.hasOwn(input, "reviewedTerms");
  const hasChecks = Object.hasOwn(input, "checks");
  if (!hasTerms && !hasChecks) throw new CandidateLeaseAssessmentValidationError("수정할 임대차 검토 항목이 없습니다.");
  return {
    caseId: requiredText(input.caseId, "caseId"),
    ...(hasTerms ? { reviewedTerms: parseReviewedTerms(input.reviewedTerms, true) } : {}),
    ...(hasChecks ? { checks: parseChecks(input.checks) } : {}),
  };
}

export function assertStoredCandidateLeaseAssessment(value: unknown): asserts value is CandidateLeaseAssessment {
  const input = objectValue(value, "저장된 임대차 검토");
  requiredText(input.assessmentId, "assessmentId");
  requiredText(input.candidateId, "candidateId");
  requiredText(input.caseId, "caseId");
  parseReviewedTerms(input.reviewedTerms);
  parseChecks(input.checks);
  if (!Array.isArray(input.revisions) || input.revisions.length === 0) throw new CandidateLeaseAssessmentValidationError("저장된 임대차 변경이력이 올바르지 않습니다.");
  for (const rawRevision of input.revisions) {
    const revision = objectValue(rawRevision, "임대차 변경이력");
    requiredText(revision.revisionId, "revisionId");
    parseReviewedTerms(revision.reviewedTerms);
    parseChecks(revision.checks);
    if (typeof revision.recordedAt !== "string" || !Number.isFinite(Date.parse(revision.recordedAt))) throw new CandidateLeaseAssessmentValidationError("임대차 변경이력 시각이 올바르지 않습니다.");
  }
  for (const key of ["createdAt", "updatedAt"] as const) {
    if (typeof input[key] !== "string" || !Number.isFinite(Date.parse(input[key]))) throw new CandidateLeaseAssessmentValidationError(`저장된 ${key}가 올바르지 않습니다.`);
  }
}
