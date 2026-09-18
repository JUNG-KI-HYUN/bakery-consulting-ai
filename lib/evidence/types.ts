/** 검증상태. 출처나 값의 actual/estimated 구분을 대신하지 않는다. */
export type VerificationStatus =
  | "VERIFIED"
  | "ESTIMATED"
  | "UNKNOWN"
  | "CONFLICTED"
  | "STALE";

/** 근거의 출처. 진술이나 공식 출처만으로 VERIFIED를 부여하지 않는다. */
export type EvidenceSourceType =
  | "DOCUMENT"
  | "FIELD_CHECK"
  | "PHOTO"
  | "OWNER_STATEMENT"
  | "TENANT_STATEMENT"
  | "EXPERT_STATEMENT"
  | "PUBLIC_DATA"
  | "SYSTEM_CALCULATION"
  | "CUSTOMER_INPUT";

/**
 * 이 값을 확정하려면 누구의 확인이 필요한가. 검증상태·출처와 독립된 세 번째 축이다.
 * "무엇이 부족한가"만 나타내며 값의 진위나 시설 가능 여부를 뜻하지 않는다.
 * VerificationStatus·EvidenceSourceType과 하나의 enum으로 합치지 않는다.
 * 예: OWNER_STATEMENT는 출처이고, 같은 값이 DOCUMENT_REQUIRED일 수 있다.
 */
export type ConfirmationRequirement =
  | "NONE"
  | "FIELD_CHECK_REQUIRED"
  | "OWNER_CONFIRMATION_REQUIRED"
  | "AGENT_CONFIRMATION_REQUIRED"
  | "EXPERT_CONFIRMATION_REQUIRED"
  | "AUTHORITY_CONFIRMATION_REQUIRED"
  | "DOCUMENT_REQUIRED"
  | "NO_SOURCE_AVAILABLE";

/** JSON snapshot 값. 유한수·순환참조 등 런타임 검증은 후속 저장 단계에서 다룬다. */
export type EvidenceValue =
  | string
  | number
  | boolean
  | null
  | EvidenceValue[]
  | { [key: string]: EvidenceValue };

/**
 * 근거 메타데이터의 타입 기반. 기존 입력값으로부터 근거나 상태를 자동 생성하지 않는다.
 * 선택적 정보가 없으면 미확인으로 남기며, 확인자·시점·출처를 추정하지 않는다.
 */
export interface Evidence {
  id: string;
  sourceType: EvidenceSourceType;
  verificationStatus: VerificationStatus;
  /** 관련 record 내 필드 경로. 필드별 연결과 검증은 후속 단계에서 다룬다. */
  fieldPath?: string;
  /** 당시 주장/확인한 값의 snapshot. 현재 record 값으로 대체하거나 누락을 0/false로 채우지 않는다. */
  assertedValue?: EvidenceValue;
  /** 당시 값의 단위. */
  unit?: string;
  /** 값의 의미. VERIFIED인 공식 추정값도 estimated를 유지한다. 누락은 actual이 아니다. */
  valueType?: "actual" | "estimated";
  /** 근거 설명과 메모. */
  description?: string;
  /** 원본 문서·사진·조사·공공데이터 record 등을 찾기 위한 식별자. */
  sourceRef?: string;
  sourceUrl?: string;
  /** 실제 관찰·측정 시점(ISO 8601). 정보의 유효시점·확인시점·저장시점과 구분한다. */
  observedAt?: string;
  /** 확인행위 시점(ISO 8601). 기록되었다고 VERIFIED를 뜻하지 않는다. */
  checkedAt?: string;
  /** 확인자 식별자. UNKNOWN·CONFLICTED 등에서도 기록할 수 있다. */
  checkedBy?: string;
  /** 정보가 유효한 기준 시점(ISO 8601). */
  effectiveAt?: string;
  /** 유효기간 만료·재확인 필요 시점(ISO 8601). 상태를 자동 변경하지 않는다. */
  expiresAt?: string;
  /** 근거 기록 생성 시점(ISO 8601). 자동 부여 규칙은 후속 저장 단계에서 다룬다. */
  createdAt?: string;
  limitation?: string;
  /**
   * 확정에 필요한 확인주체. 누락은 확인주체가 아직 기록되지 않았다는 뜻이며
   * NONE(추가 확인 불필요)과 다르다. verificationStatus를 이 값으로 추론하지 않는다.
   */
  confirmationRequirement?: ConfirmationRequirement;
}
