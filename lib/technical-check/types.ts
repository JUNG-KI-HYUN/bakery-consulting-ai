/**
 * Equipment × FIELD Technical Compatibility Check — 파생 Domain.
 *
 * Layout/Survey에 영구 저장하지 않는다.
 * Risk / Verdict / 설치가능 / 충분 판정을 만들지 않는다.
 */

import type { EquipmentDataStatus } from "../equipment/types";
import type { FieldEvidenceMeta } from "../field/field-evidence-meta";

export const TECHNICAL_CHECK_SCHEMA_VERSION = "technical-check-v1" as const;

/**
 * PASS/FAIL을 쓰지 않는다.
 * NO_CONFLICT_OBSERVED ≠ 설치 가능
 * CONSTRAINT_OBSERVED ≠ 설치 불가능
 */
export type TechnicalCheckStatus =
  | "NO_CONFLICT_OBSERVED"
  | "CONSTRAINT_OBSERVED"
  | "INSUFFICIENT_DATA"
  | "EXPERT_REVIEW_REQUIRED"
  | "NOT_APPLICABLE";

export const TECHNICAL_CHECK_STATUSES: readonly TechnicalCheckStatus[] = Object.freeze([
  "NO_CONFLICT_OBSERVED",
  "CONSTRAINT_OBSERVED",
  "INSUFFICIENT_DATA",
  "EXPERT_REVIEW_REQUIRED",
  "NOT_APPLICABLE",
]);

export type TechnicalCheckAspectKind =
  | "electrical"
  | "water"
  | "drainage"
  | "exhaust"
  | "delivery";

export interface TechnicalCheckAspect {
  readonly kind: TechnicalCheckAspectKind;
  readonly status: TechnicalCheckStatus;
  readonly message: string;
  readonly notes?: readonly string[];
  readonly fieldEvidence?: FieldEvidenceMeta;
  readonly observedBottleneckWidthMm?: number;
  readonly equipmentMinimumWidthMm?: number;
  readonly equipmentHeightMm?: number;
  readonly entranceHeightMm?: number;
}

export interface EquipmentTechnicalCheck {
  readonly equipmentInstanceId: string;
  readonly equipmentDefinitionId: string;
  readonly equipmentName: string;
  readonly dataStatus: EquipmentDataStatus;
  readonly dataStatusNote: string;
  readonly electrical: TechnicalCheckAspect;
  readonly water: TechnicalCheckAspect;
  readonly drainage: TechnicalCheckAspect;
  readonly exhaust: TechnicalCheckAspect;
  readonly delivery: TechnicalCheckAspect;
  /** Definition 누락 등 장비 단위 차단 사유 */
  readonly blockingNote?: string;
}

export interface KnownEquipmentPowerSummary {
  readonly knownEquipmentPowerKw: number;
  readonly unknownPowerEquipmentCount: number;
  readonly knownPowerEquipmentCount: number;
  readonly fieldContractPowerKw: number | null;
  /**
   * 합계 > 계약전력일 때만 CONSTRAINT.
   * 합계 ≤ 계약전력이어도 "충분" status를 만들지 않는다.
   */
  readonly arithmeticStatus: TechnicalCheckStatus | null;
  readonly arithmeticMessage: string | null;
  readonly expertDisclaimer: string;
}

export interface TechnicalCheckStatusCounts {
  readonly noConflictObserved: number;
  readonly constraintObserved: number;
  readonly insufficientData: number;
  readonly expertReviewRequired: number;
  readonly notApplicable: number;
}

export interface TechnicalCheckReport {
  readonly schemaVersion: typeof TECHNICAL_CHECK_SCHEMA_VERSION;
  readonly layoutId: string;
  readonly surveyId: string;
  readonly candidateStoreId: string;
  readonly generatedAt: string;
  readonly equipmentChecks: readonly EquipmentTechnicalCheck[];
  readonly powerSummary: KnownEquipmentPowerSummary;
  readonly statusCounts: TechnicalCheckStatusCounts;
  readonly disclaimer: string;
  readonly geometrySeparated: true;
  readonly createsRiskOrVerdict: false;
}

export const TECHNICAL_CHECK_DISCLAIMER =
  "본 결과는 FIELD 현장 입력값과 장비 요구조건을 기계적으로 대조한 참고자료입니다. 전기·급배수·배기·소방·위생·건축·인허가 및 실제 시공 가능 여부는 관련 전문가와 현장 확인이 필요합니다.";

export const ELECTRICAL_CAPACITY_EXPERT_DISCLAIMER =
  "전체 전기용량·회로·동시사용량은 전기 전문가 확인 필요.";
