/**
 * 현재 검토 중인 CandidateStore 고유의 임대 제안조건·계약조건·임대인 확인사항 기록 contract.
 * 주변 매물 참고자료(RentalMarketResult)나 사업계획 임대료와는 별개의 객체이며 서로 대체하지 않는다.
 * 사실·제안·확인상태를 기록할 뿐 Risk·Verdict·Score·법적 효력 판단을 만들지 않는다.
 */

import type {
  ConfirmationRequirement,
  EvidenceSourceType,
  VerificationStatus,
} from "../evidence/types";

export const CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION = "candidate-lease-evidence-v1" as const;

/**
 * 원본 근거를 찾기 위한 참조. 임대인 이름·전화번호·이메일·주소 등 PII를 넣지 않는다.
 * 최소 하나의 key가 필요하다.
 */
export interface LeaseEvidenceSourceRef {
  readonly documentId?: string;
  readonly opaqueSourceId?: string;
  readonly fieldKey?: string;
  readonly stageId?: string;
}

/**
 * 값의 근거. 검증상태·출처·확인주체는 서로 독립된 축이다.
 * 값이 입력되었거나 OWNER_STATEMENT·DOCUMENT 출처라는 이유로 VERIFIED가 되지 않는다.
 */
export interface LeaseEvidence {
  readonly verificationStatus: VerificationStatus;
  readonly sourceType: EvidenceSourceType;
  readonly confirmationRequirement: ConfirmationRequirement;
  readonly sourceRef: LeaseEvidenceSourceRef;
  /**
   * 해당 진술·문서·확인이 관측된 시점(ISO 8601, 시간대 포함). caller 제공.
   * Snapshot 기록 시점(capturedAt)과 다를 수 있다. freshness/STALE을 자동 판정하지 않는다.
   */
  readonly observedAt: string;
}

/**
 * KNOWN: value·evidence 필수.
 * UNKNOWN: value=null. evidence는 null 또는 현재 확인 기록. 0/false/빈 문자열/NOT_APPLICABLE로 바꾸지 않는다.
 * NOT_APPLICABLE: value=null. 해당 후보에 적용되지 않는다는 주장이므로 evidence 필수.
 */
export type LeaseValueStatus = "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE";

export interface LeaseEvidenceValue<T> {
  readonly status: LeaseValueStatus;
  readonly value: T | null;
  readonly evidence: LeaseEvidence | null;
}

/** 현재 제안조건에 VAT가 어떻게 표시되었는지만 기록한다. 세법상 결론이 아니다. */
export type LeaseVatTreatment = "INCLUDED" | "EXCLUDED" | "NOT_CONFIRMED" | "NOT_APPLICABLE";

/** 권리금 존재 여부의 확인상태. 적정성·적법성·회수 가능성을 뜻하지 않는다. */
export type LeasePremiumStatus = "PREMIUM_PRESENT" | "NO_PREMIUM" | "NOT_CONFIRMED";

/**
 * NO_RESTRICTION_STATED: 계약서·자료상 제한이 발견되지 않았다는 뜻일 뿐,
 * 법적으로 베이커리 영업이 가능하다는 의미가 아니다.
 */
export type LeaseRestrictionStatus =
  | "RESTRICTION_PRESENT"
  | "NO_RESTRICTION_STATED"
  | "NOT_CONFIRMED"
  | "NOT_APPLICABLE";

/** NOT_INCLUDED는 확인 결과 조항이 없다는 기록이며 NOT_CONFIRMED(미확인)와 다르다. */
export type LeaseClauseStatus = "INCLUDED" | "NOT_INCLUDED" | "NOT_CONFIRMED" | "NOT_APPLICABLE";

/**
 * GRANTED: 임대인/권한 있는 주체의 동의 근거가 존재.
 * REFUSED: 명시적 거절 근거가 존재.
 * NOT_CONFIRMED: 아직 확인되지 않음. 거절로 해석하지 않는다.
 * NOT_APPLICABLE: 해당 후보에서 적용되지 않음.
 */
export type LandlordConsentStatus = "GRANTED" | "REFUSED" | "NOT_CONFIRMED" | "NOT_APPLICABLE";

/**
 * 동의/거절 의사표시가 누구로부터 어떻게 기록되었는가. 공통 EvidenceSourceType은
 * 전달(중개사·제3자) 여부와 문서 작성 권한을 구분하지 못하므로 lease 전용 축으로 둔다.
 * DIRECT_AUTHORITY: 임대인/권한 있는 주체의 직접 진술 (sourceType=OWNER_STATEMENT).
 * DOCUMENTED_AUTHORITY: 임대인/권한 있는 주체 명의의 문서 (sourceType=DOCUMENT).
 * RELAYED: 중개사·제3자가 전달한 내용. 임대인 직접 확인이 필요하다.
 * CUSTOMER_REPORTED: 고객이 전한 내용.
 * UNKNOWN: 권한 주체 미기록.
 * GRANTED/REFUSED는 DIRECT_AUTHORITY·DOCUMENTED_AUTHORITY에서만 허용한다. 법적 효력을 뜻하지 않는다.
 */
export type LeaseConsentAuthority =
  | "DIRECT_AUTHORITY"
  | "DOCUMENTED_AUTHORITY"
  | "RELAYED"
  | "CUSTOMER_REPORTED"
  | "UNKNOWN";

/** 확정적 상태(NOT_CONFIRMED 외)는 evidence 필수. NOT_CONFIRMED의 evidence는 null 또는 현재 확인 기록. */
export interface LeaseStatusEvidence<S extends string> {
  readonly status: S;
  readonly evidence: LeaseEvidence | null;
}

/** summary는 기록 요약일 뿐 법률문구 해석이 아니다. */
export interface LeaseConditionEntry<S extends string> extends LeaseStatusEvidence<S> {
  readonly summary?: string;
}

/** 금액은 원 단위. 0은 실제 known value일 수 있으며 null·UNKNOWN과 다르다. */
export interface CandidateLeaseTerms {
  readonly depositAmount: LeaseEvidenceValue<number>;
  readonly monthlyRentAmount: LeaseEvidenceValue<number>;
  readonly managementFeeAmount: LeaseEvidenceValue<number>;
  readonly vatTreatment: LeaseStatusEvidence<LeaseVatTreatment>;
  readonly premiumAmount: LeaseEvidenceValue<number>;
  readonly premiumStatus: LeaseStatusEvidence<LeasePremiumStatus>;
  readonly leaseTermMonths: LeaseEvidenceValue<number>;
  readonly rentFreeMonths: LeaseEvidenceValue<number>;
  readonly constructionPeriodDays: LeaseEvidenceValue<number>;
  /** YYYY-MM-DD */
  readonly handoverDate: LeaseEvidenceValue<string>;
}

/** 동의 항목. consentAuthority는 status와 무관하게 항상 명시한다(미기록이면 UNKNOWN). */
export interface LandlordConsentEntry extends LeaseConditionEntry<LandlordConsentStatus> {
  readonly consentAuthority: LeaseConsentAuthority;
}

export interface CandidateLeaseContractConditions {
  readonly businessUseRestriction: LeaseConditionEntry<LeaseRestrictionStatus>;
  readonly subleaseRestriction: LeaseConditionEntry<LeaseRestrictionStatus>;
  readonly managementRegulation: LeaseConditionEntry<LeaseRestrictionStatus>;
  readonly restorationScope: LeaseConditionEntry<LeaseClauseStatus>;
  readonly repairResponsibility: LeaseConditionEntry<LeaseClauseStatus>;
  readonly permitFailureCondition: LeaseConditionEntry<LeaseClauseStatus>;
  readonly conditionPrecedent: LeaseConditionEntry<LeaseClauseStatus>;
  readonly specialClauseStatus: LeaseConditionEntry<LeaseClauseStatus>;
  /** INCLUDED: 해당 조건이 서면(계약서·제안서·확인서)에 포함됨. 법적 효력을 뜻하지 않는다. */
  readonly writtenConfirmationStatus: LeaseConditionEntry<LeaseClauseStatus>;
  /**
   * 자료·협의에 갱신 관련 조건이 기재되었는지만 기록한다.
   * 법정갱신·계약갱신요구권 행사 가능·임대인 갱신 의무·법적 유효성을 뜻하지 않는다.
   */
  readonly renewalCondition: LeaseConditionEntry<LeaseClauseStatus>;
}

/** FIELD exhaust.landlordConfirmation 값은 의미가 확정되지 않아 이 contract로 자동 변환하지 않는다. */
export interface CandidateLandlordConsents {
  readonly bakeryManufacturingUse: LandlordConsentEntry;
  readonly exhaust: LandlordConsentEntry;
  readonly electricalUpgrade: LandlordConsentEntry;
  readonly signage: LandlordConsentEntry;
  readonly construction: LandlordConsentEntry;
}

export interface CandidateLeaseEvidenceSnapshot {
  readonly schemaVersion: typeof CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION;
  /** caller 제공. 자동 생성하지 않는다. */
  readonly snapshotId: string;
  /** CandidateStore aggregate identity. 주소·임대인 이름을 identity로 쓰지 않는다. */
  readonly candidateStoreId: string;
  /** ISO 8601 timestamp (시간대 포함). */
  readonly capturedAt: string;
  readonly leaseTerms: CandidateLeaseTerms;
  readonly contractConditions: CandidateLeaseContractConditions;
  readonly landlordConsents: CandidateLandlordConsents;
  readonly createsRisk: false;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

export interface CandidateLeaseEvidenceFailure {
  readonly ok: false;
  readonly code: "INVALID_CANDIDATE_LEASE_EVIDENCE";
  readonly message: string;
  readonly errors: readonly string[];
}

export type CandidateLeaseEvidenceValidationResult =
  | { readonly ok: true; readonly value: CandidateLeaseEvidenceSnapshot }
  | CandidateLeaseEvidenceFailure;
