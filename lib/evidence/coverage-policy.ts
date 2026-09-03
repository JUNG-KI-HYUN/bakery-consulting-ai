import type { FacilityCheckInput } from "../diagnosis/types";
import type { VerificationStatus } from "./types";

/** 계산 단위는 근거 건수가 아니라 필요한 업무 field다. 호출 시 정의도 입력 snapshot에 포함한다. */
export interface EvidenceCoverageFieldDefinition {
  readonly fieldPath: string;
  readonly label: string;
  readonly critical: boolean;
  /** 양의 유한수. 상대 중요도이며 0으로 핵심 field를 분모에서 숨길 수 없다. */
  readonly weight: number;
}

const facilityFields = [
  // 시설 화면의 전기·배기·급배수 우선 확인과 기존 calculateRisk의 배기 판단을 따른다.
  { fieldPath: "facilityCheck.electricCapacity", label: "전기 용량", critical: true, weight: 1 },
  // 증설 필요 여부는 이 계산에서 판단하지 않는다. 조건부 gate는 후속 Risk 단계에서 다룬다.
  { fieldPath: "facilityCheck.electricExpansionPossible", label: "전기 증설 가능 여부", critical: false, weight: 1 },
  { fieldPath: "facilityCheck.exhaustPossible", label: "배기 가능 여부", critical: true, weight: 1 },
  { fieldPath: "facilityCheck.plumbingPossible", label: "급배수 가능 여부", critical: true, weight: 1 },
  // 소방 확인과 오븐 반입도 계약 전 시설·장비 판단자료다. 기존 Risk의 위험등급을 새로 부여하지 않는다.
  { fieldPath: "facilityCheck.fireSafetyChecked", label: "소방 확인 여부", critical: true, weight: 1 },
  { fieldPath: "facilityCheck.ovenMovePossible", label: "오븐 반입 가능성", critical: true, weight: 1 },
] as const satisfies readonly (EvidenceCoverageFieldDefinition & {
  fieldPath: `facilityCheck.${keyof FacilityCheckInput}`;
})[];

/**
 * V1은 Evidence Foundation에서 연결한 6개 시설 field를 모두 계산하되 전기 증설만 기본 critical에서 제외한다.
 * 현재 전기용량이 충분할 수도 있으므로 증설 미확인 자체로 핵심 blocker를 만들지 않는다.
 * 증설 필요 여부나 적용 제외를 추론하지 않으며, 차등 중요도의 근거가 없어 모두 weight 1이다.
 * 이 값들은 업무 정책이다. 외부 통계나 시설 가능 여부를 뜻하지 않는다.
 * 재현을 위해 발행한 정책을 수정하지 않고 변경 시 새 policyVersion을 추가한다.
 */
export const EVIDENCE_COVERAGE_POLICY_V1 = Object.freeze({
  policyVersion: "evidence-coverage-v1" as const,
  fields: Object.freeze(facilityFields.map((field) => Object.freeze(field))),
  statusWeights: Object.freeze({
    VERIFIED: 1,
    // 추정 상태는 일부 자료가 있으나 완전 확인 전이므로 절반만 인정하는 명시적 V1 선택이다.
    ESTIMATED: 0.5,
    UNKNOWN: 0,
    CONFLICTED: 0,
    // 유효성이 지난 근거는 현재 자료확인에 기여하지 않는다. 집계상태가 STALE이면 재확인이 필요하다.
    STALE: 0,
  } satisfies Record<VerificationStatus, number>),
  /**
   * 명시적 충돌이 최우선이다. 충돌이 없으면 VERIFIED > ESTIMATED > STALE > UNKNOWN으로 집계한다.
   * 보존된 과거 STALE 근거가 VERIFIED/ESTIMATED 근거의 기여를 막지 않도록 한다.
   * 이는 field 집계 정책이며 원본 근거를 삭제하거나 자동 supersede하지 않는다.
   * 날짜·값·출처·배열 순서로 최신 근거나 충돌을 추론하지 않는다.
   */
  statusPriority: Object.freeze([
    "CONFLICTED", "VERIFIED", "ESTIMATED", "STALE", "UNKNOWN",
  ] as const satisfies readonly VerificationStatus[]),
  resolvedStatuses: Object.freeze(["VERIFIED"] as const),
});

export type EvidenceCoveragePolicyVersion = typeof EVIDENCE_COVERAGE_POLICY_V1.policyVersion;

/** 미지원 버전을 현재 정책으로 조용히 대체하지 않는다. */
export function getEvidenceCoveragePolicy(policyVersion: EvidenceCoveragePolicyVersion) {
  if (policyVersion !== EVIDENCE_COVERAGE_POLICY_V1.policyVersion) {
    throw new RangeError("Unsupported evidence coverage policy version");
  }
  return EVIDENCE_COVERAGE_POLICY_V1;
}
