/**
 * CandidateLeaseEvidenceSnapshot → LEASE Decision Evidence (candidate-specific).
 * RentalMarketResult 기반 market reference adapter(decision-evidence/lease-adapter)와 별개이며 서로 대체하지 않는다.
 * 사실·상태만 정규화한다. Risk·Verdict·Score·법적 해석을 만들지 않는다.
 * free-text summary는 description이나 typedState로 옮기지 않는다.
 */

import { createDecisionEvidenceItem, sortDecisionEvidenceItems, sourceRefContainsNoPii } from "../decision-evidence/helpers";
import type {
  DecisionEvidenceBucket,
  DecisionEvidenceImportance,
  DecisionEvidenceItem,
  DecisionEvidenceSourceRef,
} from "../decision-evidence/types";
import type { ConfirmationRequirement, EvidenceSourceType, VerificationStatus } from "../evidence/types";
import type {
  CandidateLeaseContractConditions,
  CandidateLeaseEvidenceSnapshot,
  CandidateLeaseTerms,
  CandidateLandlordConsents,
  LandlordConsentStatus,
  LeaseClauseStatus,
  LeaseConsentAuthority,
  LeaseEvidence,
  LeasePremiumStatus,
  LeaseRestrictionStatus,
  LeaseValueStatus,
  LeaseVatTreatment,
} from "./types";
import { validateCandidateLeaseEvidenceSnapshot } from "./validation";

export const CANDIDATE_LEASE_DECISION_EVIDENCE_SCHEMA_VERSION = "candidate-lease-decision-evidence-v1" as const;

const STAGE_ID = "candidate-lease";

/** LeaseEvidence 중 Decision에 필요한 typed metadata. evidence sourceRef·summary는 포함하지 않는다. */
export interface CandidateLeaseEvidenceMetaState {
  readonly verificationStatus: VerificationStatus;
  readonly sourceType: EvidenceSourceType;
  readonly confirmationRequirement: ConfirmationRequirement;
  readonly observedAt: string;
}

export interface CandidateLeaseValueState<T> {
  readonly status: LeaseValueStatus;
  readonly value: T | null;
  readonly evidence: CandidateLeaseEvidenceMetaState | null;
}

export interface CandidateLeaseStatusState<S extends string> {
  readonly status: S;
  readonly evidence: CandidateLeaseEvidenceMetaState | null;
}

export interface CandidateLeaseConsentState extends CandidateLeaseStatusState<LandlordConsentStatus> {
  readonly consentAuthority: LeaseConsentAuthority;
}

export interface CandidateLeaseTypedState {
  readonly leaseTerms: {
    readonly depositAmount: CandidateLeaseValueState<number>;
    readonly monthlyRentAmount: CandidateLeaseValueState<number>;
    readonly managementFeeAmount: CandidateLeaseValueState<number>;
    readonly vatTreatment: CandidateLeaseStatusState<LeaseVatTreatment>;
    readonly premiumAmount: CandidateLeaseValueState<number>;
    readonly premiumStatus: CandidateLeaseStatusState<LeasePremiumStatus>;
    readonly leaseTermMonths: CandidateLeaseValueState<number>;
    readonly rentFreeMonths: CandidateLeaseValueState<number>;
    readonly constructionPeriodDays: CandidateLeaseValueState<number>;
    readonly handoverDate: CandidateLeaseValueState<string>;
  };
  readonly contractConditions: {
    readonly businessUseRestriction: CandidateLeaseStatusState<LeaseRestrictionStatus>;
    readonly subleaseRestriction: CandidateLeaseStatusState<LeaseRestrictionStatus>;
    readonly managementRegulation: CandidateLeaseStatusState<LeaseRestrictionStatus>;
    readonly restorationScope: CandidateLeaseStatusState<LeaseClauseStatus>;
    readonly repairResponsibility: CandidateLeaseStatusState<LeaseClauseStatus>;
    readonly permitFailureCondition: CandidateLeaseStatusState<LeaseClauseStatus>;
    readonly conditionPrecedent: CandidateLeaseStatusState<LeaseClauseStatus>;
    readonly specialClauseStatus: CandidateLeaseStatusState<LeaseClauseStatus>;
    readonly writtenConfirmationStatus: CandidateLeaseStatusState<LeaseClauseStatus>;
    readonly renewalCondition: CandidateLeaseStatusState<LeaseClauseStatus>;
  };
  readonly landlordConsents: {
    readonly bakeryManufacturingUse: CandidateLeaseConsentState;
    readonly exhaust: CandidateLeaseConsentState;
    readonly electricalUpgrade: CandidateLeaseConsentState;
    readonly signage: CandidateLeaseConsentState;
    readonly construction: CandidateLeaseConsentState;
  };
}

export interface CandidateLeaseDecisionEvidence {
  readonly schemaVersion: typeof CANDIDATE_LEASE_DECISION_EVIDENCE_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly observedFacts: readonly DecisionEvidenceItem[];
  /** 확인된 제약 기록일 뿐 Risk·Hard Blocker가 아니다. */
  readonly observedConstraints: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  /** Candidate Lease contract에는 전문가 검토 전용 상태가 없으므로 항상 비어 있다. */
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  readonly typedState: CandidateLeaseTypedState;
  readonly createsRisk: false;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

export interface CandidateLeaseDecisionEvidenceFailure {
  readonly ok: false;
  readonly code: "INVALID_CANDIDATE_LEASE_DECISION_EVIDENCE";
  readonly message: string;
  readonly errors: readonly string[];
}

export type CandidateLeaseDecisionEvidenceResult =
  | { readonly ok: true; readonly value: CandidateLeaseDecisionEvidence }
  | CandidateLeaseDecisionEvidenceFailure;

type Field<K extends string> = { readonly field: K; readonly key: string; readonly importance: DecisionEvidenceImportance };

const VALUE_BUCKETS: Record<LeaseValueStatus, DecisionEvidenceBucket> = {
  KNOWN: "OBSERVED_FACT",
  UNKNOWN: "MISSING_INFORMATION",
  NOT_APPLICABLE: "OBSERVED_FACT",
};
const VAT_BUCKETS: Record<LeaseVatTreatment, DecisionEvidenceBucket> = {
  INCLUDED: "OBSERVED_FACT",
  EXCLUDED: "OBSERVED_FACT",
  NOT_CONFIRMED: "MISSING_INFORMATION",
  NOT_APPLICABLE: "OBSERVED_FACT",
};
const PREMIUM_BUCKETS: Record<LeasePremiumStatus, DecisionEvidenceBucket> = {
  PREMIUM_PRESENT: "OBSERVED_FACT",
  NO_PREMIUM: "OBSERVED_FACT",
  NOT_CONFIRMED: "MISSING_INFORMATION",
};
/** NO_RESTRICTION_STATED는 베이커리 영업 가능을 뜻하지 않는다. */
const RESTRICTION_BUCKETS: Record<LeaseRestrictionStatus, DecisionEvidenceBucket> = {
  RESTRICTION_PRESENT: "OBSERVED_CONSTRAINT",
  NO_RESTRICTION_STATED: "OBSERVED_FACT",
  NOT_CONFIRMED: "MISSING_INFORMATION",
  NOT_APPLICABLE: "OBSERVED_FACT",
};
/** NOT_INCLUDED는 사실 기록이며 constraint로 해석하지 않는다. */
const CLAUSE_BUCKETS: Record<LeaseClauseStatus, DecisionEvidenceBucket> = {
  INCLUDED: "OBSERVED_FACT",
  NOT_INCLUDED: "OBSERVED_FACT",
  NOT_CONFIRMED: "MISSING_INFORMATION",
  NOT_APPLICABLE: "OBSERVED_FACT",
};
/** REFUSED는 확인된 constraint일 뿐 Hard Blocker가 아니다. */
const CONSENT_BUCKETS: Record<LandlordConsentStatus, DecisionEvidenceBucket> = {
  GRANTED: "OBSERVED_FACT",
  REFUSED: "OBSERVED_CONSTRAINT",
  NOT_CONFIRMED: "MISSING_INFORMATION",
  NOT_APPLICABLE: "OBSERVED_FACT",
};

const VALUE_TERMS: readonly Field<
  | "depositAmount"
  | "monthlyRentAmount"
  | "managementFeeAmount"
  | "premiumAmount"
  | "leaseTermMonths"
  | "rentFreeMonths"
  | "constructionPeriodDays"
  | "handoverDate"
>[] = [
  { field: "depositAmount", key: "candidate-term-deposit", importance: "SUPPORTING" },
  { field: "monthlyRentAmount", key: "candidate-term-monthly-rent", importance: "CORE" },
  { field: "managementFeeAmount", key: "candidate-term-management-fee", importance: "SUPPORTING" },
  { field: "premiumAmount", key: "candidate-term-premium-amount", importance: "SUPPORTING" },
  { field: "leaseTermMonths", key: "candidate-term-lease-term-months", importance: "CORE" },
  { field: "rentFreeMonths", key: "candidate-term-rent-free-months", importance: "SUPPORTING" },
  { field: "constructionPeriodDays", key: "candidate-term-construction-period-days", importance: "SUPPORTING" },
  { field: "handoverDate", key: "candidate-term-handover-date", importance: "SUPPORTING" },
];
const VAT_TERM: Field<"vatTreatment"> = { field: "vatTreatment", key: "candidate-term-vat-treatment", importance: "SUPPORTING" };
const PREMIUM_TERM: Field<"premiumStatus"> = { field: "premiumStatus", key: "candidate-term-premium-status", importance: "SUPPORTING" };

const RESTRICTIONS: readonly Field<"businessUseRestriction" | "subleaseRestriction" | "managementRegulation">[] = [
  { field: "businessUseRestriction", key: "candidate-condition-business-use-restriction", importance: "CORE" },
  { field: "subleaseRestriction", key: "candidate-condition-sublease-restriction", importance: "SUPPORTING" },
  { field: "managementRegulation", key: "candidate-condition-management-regulation", importance: "SUPPORTING" },
];
const CLAUSES: readonly Field<
  | "restorationScope"
  | "repairResponsibility"
  | "permitFailureCondition"
  | "conditionPrecedent"
  | "specialClauseStatus"
  | "writtenConfirmationStatus"
  | "renewalCondition"
>[] = [
  { field: "restorationScope", key: "candidate-condition-restoration-scope", importance: "CORE" },
  { field: "repairResponsibility", key: "candidate-condition-repair-responsibility", importance: "SUPPORTING" },
  { field: "permitFailureCondition", key: "candidate-condition-permit-failure", importance: "CORE" },
  { field: "conditionPrecedent", key: "candidate-condition-condition-precedent", importance: "CORE" },
  { field: "specialClauseStatus", key: "candidate-condition-special-clause", importance: "CORE" },
  { field: "writtenConfirmationStatus", key: "candidate-condition-written-confirmation", importance: "CORE" },
  { field: "renewalCondition", key: "candidate-condition-renewal", importance: "SUPPORTING" },
];
const CONSENTS: readonly Field<keyof CandidateLandlordConsents>[] = [
  { field: "bakeryManufacturingUse", key: "candidate-consent-bakery-manufacturing-use", importance: "CORE" },
  { field: "exhaust", key: "candidate-consent-exhaust", importance: "CORE" },
  { field: "electricalUpgrade", key: "candidate-consent-electrical-upgrade", importance: "CORE" },
  { field: "signage", key: "candidate-consent-signage", importance: "SUPPORTING" },
  { field: "construction", key: "candidate-consent-construction", importance: "CORE" },
];

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function failure(errors: readonly string[]): CandidateLeaseDecisionEvidenceFailure {
  return Object.freeze({
    ok: false as const,
    code: "INVALID_CANDIDATE_LEASE_DECISION_EVIDENCE" as const,
    message: errors.join(" "),
    errors: Object.freeze([...errors]),
  });
}

function metaState(evidence: LeaseEvidence | null): CandidateLeaseEvidenceMetaState | null {
  if (!evidence) return null;
  return {
    verificationStatus: evidence.verificationStatus,
    sourceType: evidence.sourceType,
    confirmationRequirement: evidence.confirmationRequirement,
    observedAt: evidence.observedAt,
  };
}

function item(input: {
  snapshotId: string;
  fieldPath: string;
  key: string;
  bucket: DecisionEvidenceBucket;
  importance: DecisionEvidenceImportance;
  title: string;
  description: string;
  evidence: LeaseEvidence | null;
}): DecisionEvidenceItem {
  const sourceRef: DecisionEvidenceSourceRef = {
    stageId: STAGE_ID,
    fieldKey: input.fieldPath,
    opaqueKey: input.snapshotId,
  };
  return createDecisionEvidenceItem({
    sourceDomain: "LEASE",
    category: "LEASE",
    bucket: input.bucket,
    key: input.key,
    title: input.title,
    description: input.description,
    sourceRef,
    importance: input.importance,
    nature: "OBSERVATION",
    ...(input.evidence
      ? {
          fieldEvidence: {
            verificationStatus: input.evidence.verificationStatus,
            sourceType: input.evidence.sourceType,
            confirmationRequirement: input.evidence.confirmationRequirement,
          },
        }
      : {}),
  });
}

function buildItems(snapshot: CandidateLeaseEvidenceSnapshot): DecisionEvidenceItem[] {
  const items: DecisionEvidenceItem[] = [];
  const terms: CandidateLeaseTerms = snapshot.leaseTerms;
  const conditions: CandidateLeaseContractConditions = snapshot.contractConditions;
  const consents: CandidateLandlordConsents = snapshot.landlordConsents;
  const push = (
    section: "leaseTerms" | "contractConditions" | "landlordConsents",
    spec: Field<string>,
    entry: { status: string; evidence: LeaseEvidence | null },
    bucket: DecisionEvidenceBucket,
  ) => {
    const label =
      section === "leaseTerms"
        ? { title: "후보점포 임대조건", description: `candidate lease ${spec.field}` }
        : section === "contractConditions"
          ? { title: "후보점포 계약조건", description: `candidate ${spec.field}` }
          : { title: "후보점포 임대인 확인", description: `candidate landlord ${spec.field} consent` };
    items.push(
      item({
        snapshotId: snapshot.snapshotId,
        fieldPath: `${section}.${spec.field}`,
        key: spec.key,
        bucket,
        importance: spec.importance,
        title: `${label.title} ${spec.field}`,
        description: `${label.description} = ${entry.status}`,
        evidence: entry.evidence,
      }),
    );
  };

  for (const spec of VALUE_TERMS) push("leaseTerms", spec, terms[spec.field], VALUE_BUCKETS[terms[spec.field].status]);
  push("leaseTerms", VAT_TERM, terms.vatTreatment, VAT_BUCKETS[terms.vatTreatment.status]);
  push("leaseTerms", PREMIUM_TERM, terms.premiumStatus, PREMIUM_BUCKETS[terms.premiumStatus.status]);
  for (const spec of RESTRICTIONS) {
    push("contractConditions", spec, conditions[spec.field], RESTRICTION_BUCKETS[conditions[spec.field].status]);
  }
  for (const spec of CLAUSES) {
    push("contractConditions", spec, conditions[spec.field], CLAUSE_BUCKETS[conditions[spec.field].status]);
  }
  for (const spec of CONSENTS) {
    push("landlordConsents", spec, consents[spec.field], CONSENT_BUCKETS[consents[spec.field].status]);
  }
  return items;
}

function valueState<T>(entry: { status: LeaseValueStatus; value: T | null; evidence: LeaseEvidence | null }): CandidateLeaseValueState<T> {
  return { status: entry.status, value: entry.value, evidence: metaState(entry.evidence) };
}

function statusState<S extends string>(entry: { status: S; evidence: LeaseEvidence | null }): CandidateLeaseStatusState<S> {
  return { status: entry.status, evidence: metaState(entry.evidence) };
}

function consentState(entry: CandidateLandlordConsents[keyof CandidateLandlordConsents]): CandidateLeaseConsentState {
  return { status: entry.status, consentAuthority: entry.consentAuthority, evidence: metaState(entry.evidence) };
}

function buildTypedState(snapshot: CandidateLeaseEvidenceSnapshot): CandidateLeaseTypedState {
  const terms = snapshot.leaseTerms;
  const conditions = snapshot.contractConditions;
  const consents = snapshot.landlordConsents;
  return {
    leaseTerms: {
      depositAmount: valueState(terms.depositAmount),
      monthlyRentAmount: valueState(terms.monthlyRentAmount),
      managementFeeAmount: valueState(terms.managementFeeAmount),
      vatTreatment: statusState(terms.vatTreatment),
      premiumAmount: valueState(terms.premiumAmount),
      premiumStatus: statusState(terms.premiumStatus),
      leaseTermMonths: valueState(terms.leaseTermMonths),
      rentFreeMonths: valueState(terms.rentFreeMonths),
      constructionPeriodDays: valueState(terms.constructionPeriodDays),
      handoverDate: valueState(terms.handoverDate),
    },
    contractConditions: {
      businessUseRestriction: statusState(conditions.businessUseRestriction),
      subleaseRestriction: statusState(conditions.subleaseRestriction),
      managementRegulation: statusState(conditions.managementRegulation),
      restorationScope: statusState(conditions.restorationScope),
      repairResponsibility: statusState(conditions.repairResponsibility),
      permitFailureCondition: statusState(conditions.permitFailureCondition),
      conditionPrecedent: statusState(conditions.conditionPrecedent),
      specialClauseStatus: statusState(conditions.specialClauseStatus),
      writtenConfirmationStatus: statusState(conditions.writtenConfirmationStatus),
      renewalCondition: statusState(conditions.renewalCondition),
    },
    landlordConsents: {
      bakeryManufacturingUse: consentState(consents.bakeryManufacturingUse),
      exhaust: consentState(consents.exhaust),
      electricalUpgrade: consentState(consents.electricalUpgrade),
      signage: consentState(consents.signage),
      construction: consentState(consents.construction),
    },
  };
}

export function buildCandidateLeaseDecisionEvidence(input: unknown): CandidateLeaseDecisionEvidenceResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failure(["input은 { snapshot } 객체여야 합니다."]);
  }
  const unknownKeys = Object.keys(input).filter((key) => key !== "snapshot");
  if (unknownKeys.length > 0) {
    return failure(unknownKeys.map((key) => `input.${key}: 정의되지 않은 입력입니다.`));
  }

  const validation = validateCandidateLeaseEvidenceSnapshot((input as { snapshot?: unknown }).snapshot);
  if (!validation.ok) return failure(validation.errors);
  const snapshot = validation.value;
  if (!sourceRefContainsNoPii({ opaqueKey: snapshot.snapshotId })) {
    return failure(["snapshot.snapshotId는 sourceRef opaqueKey로 쓸 수 없는 값입니다."]);
  }

  const items = buildItems(snapshot);
  const inBucket = (bucket: DecisionEvidenceBucket) =>
    sortDecisionEvidenceItems(items.filter((entry) => entry.bucket === bucket));

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      schemaVersion: CANDIDATE_LEASE_DECISION_EVIDENCE_SCHEMA_VERSION,
      candidateStoreId: snapshot.candidateStoreId,
      snapshotId: snapshot.snapshotId,
      capturedAt: snapshot.capturedAt,
      observedFacts: inBucket("OBSERVED_FACT"),
      observedConstraints: inBucket("OBSERVED_CONSTRAINT"),
      missingInformation: inBucket("MISSING_INFORMATION"),
      expertReviewItems: Object.freeze([] as DecisionEvidenceItem[]),
      typedState: deepFreeze(buildTypedState(snapshot)),
      createsRisk: false as const,
      createsVerdict: false as const,
      createsScore: false as const,
    }),
  });
}
