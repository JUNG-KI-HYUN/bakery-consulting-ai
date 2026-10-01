/**
 * CandidateLeaseEvidenceSnapshot pure validation. I/O 없음, 시간·ID 생성 없음, Risk 평가 없음.
 * 통과 시 입력을 복제·freeze한 값을 돌려주며 입력 객체는 mutation/freeze하지 않는다.
 */

import { sourceRefContainsNoPii } from "../decision-evidence/helpers";
import {
  isConfirmationRequirement,
  isEvidenceSourceType,
  isVerificationStatus,
} from "../field/field-evidence-meta";
import type { EvidenceSourceType } from "../evidence/types";
import {
  CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION,
  type CandidateLeaseEvidenceSnapshot,
  type CandidateLeaseEvidenceValidationResult,
  type LandlordConsentStatus,
  type LeaseClauseStatus,
  type LeaseConsentAuthority,
  type LeaseEvidenceSourceRef,
  type LeasePremiumStatus,
  type LeaseRestrictionStatus,
  type LeaseValueStatus,
  type LeaseVatTreatment,
} from "./types";

const VALUE_STATUSES: readonly LeaseValueStatus[] = ["KNOWN", "UNKNOWN", "NOT_APPLICABLE"];
const VAT_TREATMENTS: readonly LeaseVatTreatment[] = [
  "INCLUDED",
  "EXCLUDED",
  "NOT_CONFIRMED",
  "NOT_APPLICABLE",
];
const PREMIUM_STATUSES: readonly LeasePremiumStatus[] = ["PREMIUM_PRESENT", "NO_PREMIUM", "NOT_CONFIRMED"];
const RESTRICTION_STATUSES: readonly LeaseRestrictionStatus[] = [
  "RESTRICTION_PRESENT",
  "NO_RESTRICTION_STATED",
  "NOT_CONFIRMED",
  "NOT_APPLICABLE",
];
const CLAUSE_STATUSES: readonly LeaseClauseStatus[] = [
  "INCLUDED",
  "NOT_INCLUDED",
  "NOT_CONFIRMED",
  "NOT_APPLICABLE",
];
const CONSENT_STATUSES: readonly LandlordConsentStatus[] = [
  "GRANTED",
  "REFUSED",
  "NOT_CONFIRMED",
  "NOT_APPLICABLE",
];
const CONSENT_AUTHORITIES: readonly LeaseConsentAuthority[] = [
  "DIRECT_AUTHORITY",
  "DOCUMENTED_AUTHORITY",
  "RELAYED",
  "CUSTOMER_REPORTED",
  "UNKNOWN",
];
/** 권한 있는 의사표시 authority와 일치해야 하는 공통 sourceType. 그 외 authority로는 GRANTED/REFUSED를 둘 수 없다. */
const AUTHORITY_SOURCE_TYPES: Partial<Record<LeaseConsentAuthority, EvidenceSourceType>> = {
  DIRECT_AUTHORITY: "OWNER_STATEMENT",
  DOCUMENTED_AUTHORITY: "DOCUMENT",
};

/** Risk·Verdict·Score·법적 효력 판단용 이름. Evidence contract 어디에도 두지 않는다. */
const FORBIDDEN_KEYS = new Set([
  "risk",
  "riskscore",
  "riskclass",
  "riskseverity",
  "riskfinding",
  "severity",
  "hardblocker",
  "conditionalblocker",
  "verdict",
  "recommendation",
  "finalstatus",
  "approved",
  "approval",
  "contractallowed",
  "safe",
  "contractsafe",
  "score",
  "totalscore",
  "grade",
  "legalvalidity",
  "legallyallowed",
  "permitapproved",
  "enforceable",
  "validclause",
  "legallyrenewable",
  "renewalright",
  "renewalrightavailable",
  "statutoryrenewal",
  "renewalguaranteed",
]);

const SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "snapshotId",
  "candidateStoreId",
  "capturedAt",
  "leaseTerms",
  "contractConditions",
  "landlordConsents",
  "createsRisk",
  "createsVerdict",
  "createsScore",
]);
const VALUE_KEYS = new Set(["status", "value", "evidence"]);
const STATUS_KEYS = new Set(["status", "evidence"]);
const CONDITION_KEYS = new Set(["status", "evidence", "summary"]);
const CONSENT_KEYS = new Set(["status", "evidence", "summary", "consentAuthority"]);
const EVIDENCE_KEYS = new Set([
  "verificationStatus",
  "sourceType",
  "confirmationRequirement",
  "sourceRef",
  "observedAt",
]);
const SOURCE_REF_KEYS = new Set(["documentId", "opaqueSourceId", "fieldKey", "stageId"]);

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Errors = string[];
type ValueCheck = (value: unknown) => string | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function checkKeys(errors: Errors, path: string, value: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      errors.push(`${path}.${key}: risk/verdict/score/법적판단 필드는 lease evidence contract에 둘 수 없습니다.`);
    } else if (!allowed.has(key)) {
      errors.push(`${path}.${key}: 정의되지 않은 필드입니다.`);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const amountCheck: ValueCheck = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? null
    : "0 이상의 유한한 숫자여야 합니다.";

const nonNegativeNumberCheck = amountCheck;

const nonNegativeIntegerCheck: ValueCheck = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? null : "0 이상의 정수여야 합니다.";

const positiveIntegerCheck: ValueCheck = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 ? null : "1 이상의 정수여야 합니다.";

const dateOnlyCheck: ValueCheck = (value) => {
  if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) return "YYYY-MM-DD 형식이어야 합니다.";
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    return "실제 달력 날짜여야 합니다.";
  }
  return null;
};

function collectEvidenceErrors(errors: Errors, path: string, value: unknown): void {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, EVIDENCE_KEYS);
  if (!isVerificationStatus(value.verificationStatus)) errors.push(`${path}.verificationStatus 값이 지원되지 않습니다.`);
  if (!isEvidenceSourceType(value.sourceType)) errors.push(`${path}.sourceType 값이 지원되지 않습니다.`);
  if (!isConfirmationRequirement(value.confirmationRequirement)) {
    errors.push(`${path}.confirmationRequirement 값이 지원되지 않습니다.`);
  }
  if (!isIsoTimestamp(value.observedAt)) {
    errors.push(`${path}.observedAt은 시간대를 포함한 ISO 8601 timestamp여야 합니다.`);
  }

  const sourceRef = value.sourceRef;
  if (!isRecord(sourceRef)) {
    errors.push(`${path}.sourceRef는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, `${path}.sourceRef`, sourceRef, SOURCE_REF_KEYS);
  const entries = Object.entries(sourceRef).filter(([key]) => SOURCE_REF_KEYS.has(key));
  if (entries.length === 0) errors.push(`${path}.sourceRef에는 최소 하나의 참조 key가 필요합니다.`);
  for (const [key, entry] of entries) {
    if (!isNonEmptyString(entry)) errors.push(`${path}.sourceRef.${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (!sourceRefContainsNoPii(sourceRef as LeaseEvidenceSourceRef)) {
    errors.push(`${path}.sourceRef에 개인정보로 보이는 값이 있습니다.`);
  }
}

function collectValueErrors(errors: Errors, path: string, raw: unknown, check: ValueCheck): void {
  if (!isRecord(raw)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, raw, VALUE_KEYS);
  if (typeof raw.status !== "string" || !(VALUE_STATUSES as readonly string[]).includes(raw.status)) {
    errors.push(`${path}.status 값이 지원되지 않습니다.`);
    return;
  }
  if (raw.status === "KNOWN") {
    const problem = raw.value === null || raw.value === undefined ? "KNOWN이면 값이 필요합니다." : check(raw.value);
    if (problem) errors.push(`${path}.value: ${problem}`);
    if (raw.evidence === null || raw.evidence === undefined) {
      errors.push(`${path}: KNOWN 값은 evidence가 필요합니다.`);
    } else {
      collectEvidenceErrors(errors, `${path}.evidence`, raw.evidence);
    }
    return;
  }
  if (raw.value !== null) errors.push(`${path}.value: ${raw.status}이면 null이어야 합니다.`);
  if (raw.status === "NOT_APPLICABLE") {
    if (raw.evidence === null || raw.evidence === undefined) {
      errors.push(`${path}: NOT_APPLICABLE은 evidence가 필요합니다.`);
    } else {
      collectEvidenceErrors(errors, `${path}.evidence`, raw.evidence);
    }
    return;
  }
  if (raw.evidence === undefined) {
    errors.push(`${path}.evidence는 null 또는 evidence 객체여야 합니다.`);
  } else if (raw.evidence !== null) {
    collectEvidenceErrors(errors, `${path}.evidence`, raw.evidence);
  }
}

function collectStatusErrors(
  errors: Errors,
  path: string,
  raw: unknown,
  allowed: readonly string[],
  keys: Set<string>,
): void {
  if (!isRecord(raw)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, raw, keys);
  if (typeof raw.status !== "string" || !allowed.includes(raw.status)) {
    errors.push(`${path}.status 값이 지원되지 않습니다.`);
    return;
  }
  if (raw.status === "NOT_CONFIRMED") {
    if (raw.evidence === undefined) {
      errors.push(`${path}.evidence는 null 또는 evidence 객체여야 합니다.`);
    } else if (raw.evidence !== null) {
      collectEvidenceErrors(errors, `${path}.evidence`, raw.evidence);
    }
  } else if (raw.evidence === null || raw.evidence === undefined) {
    errors.push(`${path}: ${raw.status} 상태는 evidence가 필요합니다.`);
  } else {
    collectEvidenceErrors(errors, `${path}.evidence`, raw.evidence);
  }
  if (keys.has("summary") && "summary" in raw && !isNonEmptyString(raw.summary)) {
    errors.push(`${path}.summary는 비어 있지 않은 문자열이어야 합니다.`);
  }
}

function collectConsentErrors(errors: Errors, path: string, raw: unknown): void {
  collectStatusErrors(errors, path, raw, CONSENT_STATUSES, CONSENT_KEYS);
  if (!isRecord(raw)) return;
  const authority = raw.consentAuthority;
  if (typeof authority !== "string" || !(CONSENT_AUTHORITIES as readonly string[]).includes(authority)) {
    errors.push(`${path}.consentAuthority 값이 지원되지 않습니다.`);
    return;
  }
  const requiredSource = AUTHORITY_SOURCE_TYPES[authority as LeaseConsentAuthority];
  if ((raw.status === "GRANTED" || raw.status === "REFUSED") && !requiredSource) {
    errors.push(
      `${path}: ${raw.status}는 consentAuthority가 DIRECT_AUTHORITY 또는 DOCUMENTED_AUTHORITY여야 합니다. ${authority}이면 NOT_CONFIRMED로 둡니다.`,
    );
  }
  if (requiredSource) {
    if (!isRecord(raw.evidence)) {
      errors.push(`${path}: consentAuthority=${authority}는 evidence가 필요합니다.`);
    } else if (raw.evidence.sourceType !== requiredSource) {
      errors.push(`${path}: consentAuthority=${authority}는 evidence.sourceType=${requiredSource}여야 합니다.`);
    }
  }
}

function section(errors: Errors, path: string, raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return null;
  }
  checkKeys(errors, path, raw, new Set(keys));
  return raw;
}

function collectLeaseTermsErrors(errors: Errors, raw: unknown): void {
  const path = "leaseTerms";
  const terms = section(errors, path, raw, [
    "depositAmount",
    "monthlyRentAmount",
    "managementFeeAmount",
    "vatTreatment",
    "premiumAmount",
    "premiumStatus",
    "leaseTermMonths",
    "rentFreeMonths",
    "constructionPeriodDays",
    "handoverDate",
  ]);
  if (!terms) return;
  collectValueErrors(errors, `${path}.depositAmount`, terms.depositAmount, amountCheck);
  collectValueErrors(errors, `${path}.monthlyRentAmount`, terms.monthlyRentAmount, amountCheck);
  collectValueErrors(errors, `${path}.managementFeeAmount`, terms.managementFeeAmount, amountCheck);
  collectStatusErrors(errors, `${path}.vatTreatment`, terms.vatTreatment, VAT_TREATMENTS, STATUS_KEYS);
  collectValueErrors(errors, `${path}.premiumAmount`, terms.premiumAmount, amountCheck);
  collectStatusErrors(errors, `${path}.premiumStatus`, terms.premiumStatus, PREMIUM_STATUSES, STATUS_KEYS);
  collectValueErrors(errors, `${path}.leaseTermMonths`, terms.leaseTermMonths, positiveIntegerCheck);
  collectValueErrors(errors, `${path}.rentFreeMonths`, terms.rentFreeMonths, nonNegativeNumberCheck);
  collectValueErrors(errors, `${path}.constructionPeriodDays`, terms.constructionPeriodDays, nonNegativeIntegerCheck);
  collectValueErrors(errors, `${path}.handoverDate`, terms.handoverDate, dateOnlyCheck);

  const amount = isRecord(terms.premiumAmount) ? terms.premiumAmount : null;
  const status = isRecord(terms.premiumStatus) ? terms.premiumStatus.status : null;
  if (amount?.status === "KNOWN" && typeof amount.value === "number") {
    if (status === "NO_PREMIUM" && amount.value > 0) {
      errors.push(`${path}: premiumStatus=NO_PREMIUM과 0보다 큰 premiumAmount는 함께 둘 수 없습니다.`);
    }
    if (status === "PREMIUM_PRESENT" && amount.value === 0) {
      errors.push(`${path}: premiumStatus=PREMIUM_PRESENT와 premiumAmount=0은 함께 둘 수 없습니다.`);
    }
  }
}

function collectContractConditionErrors(errors: Errors, raw: unknown): void {
  const path = "contractConditions";
  const restrictionKeys = ["businessUseRestriction", "subleaseRestriction", "managementRegulation"] as const;
  const clauseKeys = [
    "restorationScope",
    "repairResponsibility",
    "permitFailureCondition",
    "conditionPrecedent",
    "specialClauseStatus",
    "writtenConfirmationStatus",
    "renewalCondition",
  ] as const;
  const conditions = section(errors, path, raw, [...restrictionKeys, ...clauseKeys]);
  if (!conditions) return;
  for (const key of restrictionKeys) {
    collectStatusErrors(errors, `${path}.${key}`, conditions[key], RESTRICTION_STATUSES, CONDITION_KEYS);
  }
  for (const key of clauseKeys) {
    collectStatusErrors(errors, `${path}.${key}`, conditions[key], CLAUSE_STATUSES, CONDITION_KEYS);
  }
}

function collectLandlordConsentErrors(errors: Errors, raw: unknown): void {
  const path = "landlordConsents";
  const keys = ["bakeryManufacturingUse", "exhaust", "electricalUpgrade", "signage", "construction"] as const;
  const consents = section(errors, path, raw, keys);
  if (!consents) return;
  for (const key of keys) {
    collectConsentErrors(errors, `${path}.${key}`, consents[key]);
  }
}

export function validateCandidateLeaseEvidenceSnapshot(value: unknown): CandidateLeaseEvidenceValidationResult {
  const errors: Errors = [];
  if (!isRecord(value)) {
    errors.push("snapshot은 객체여야 합니다.");
  } else {
    checkKeys(errors, "snapshot", value, SNAPSHOT_KEYS);
    if (value.schemaVersion !== CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION) {
      errors.push(`snapshot.schemaVersion은 ${CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION}이어야 합니다.`);
    }
    if (!isNonEmptyString(value.snapshotId)) errors.push("snapshot.snapshotId는 비어 있지 않은 문자열이어야 합니다.");
    if (!isNonEmptyString(value.candidateStoreId)) {
      errors.push("snapshot.candidateStoreId는 비어 있지 않은 문자열이어야 합니다.");
    }
    if (!isIsoTimestamp(value.capturedAt)) {
      errors.push("snapshot.capturedAt은 시간대를 포함한 ISO 8601 timestamp여야 합니다.");
    }
    if (value.createsRisk !== false) errors.push("snapshot.createsRisk는 false여야 합니다.");
    if (value.createsVerdict !== false) errors.push("snapshot.createsVerdict는 false여야 합니다.");
    if (value.createsScore !== false) errors.push("snapshot.createsScore는 false여야 합니다.");
    collectLeaseTermsErrors(errors, value.leaseTerms);
    collectContractConditionErrors(errors, value.contractConditions);
    collectLandlordConsentErrors(errors, value.landlordConsents);
  }

  if (errors.length > 0) {
    return Object.freeze({
      ok: false as const,
      code: "INVALID_CANDIDATE_LEASE_EVIDENCE" as const,
      message: errors.join(" "),
      errors: Object.freeze([...errors]),
    });
  }
  return Object.freeze({
    ok: true as const,
    value: deepFreeze(structuredClone(value) as CandidateLeaseEvidenceSnapshot),
  });
}
