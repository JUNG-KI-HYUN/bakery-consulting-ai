/**
 * Technical Check 공통 helpers.
 * SAMPLE/NEEDS_REVIEW 수치를 확정 CONSTRAINT 근거로 쓰지 않는다.
 */

import type { EquipmentDataStatus, EquipmentDefinition } from "../equipment/types";
import type { FieldEvidenceMeta } from "../field/field-evidence-meta";
import type { TechnicalCheckAspect, TechnicalCheckAspectKind, TechnicalCheckStatus } from "./types";

export function equipmentDataStatusNote(status: EquipmentDataStatus): string {
  switch (status) {
    case "SAMPLE":
      return "예시 장비 · 실제 기술검토 대상 아님";
    case "NEEDS_REVIEW":
      return "장비 규격 확인 필요";
    case "REFERENCE":
      return "REFERENCE · 참고 자료 (VERIFIED 아님)";
    case "VERIFIED":
      return "VERIFIED · 장비 데이터 검증됨 (점포 적합 아님)";
  }
}

/** SAMPLE은 확정 technical result를 만들지 않는다. */
export function sampleBlocksDefinitiveCheck(definition: EquipmentDefinition): boolean {
  return definition.dataStatus === "SAMPLE";
}

/** NEEDS_REVIEW 수치로 CONSTRAINT를 확정하지 않는다. */
export function needsReviewBlocksNumericConstraint(
  definition: EquipmentDefinition,
): boolean {
  return definition.dataStatus === "NEEDS_REVIEW";
}

export function aspect(
  kind: TechnicalCheckAspectKind,
  status: TechnicalCheckStatus,
  message: string,
  extras: {
    notes?: readonly string[];
    fieldEvidence?: FieldEvidenceMeta;
    observedBottleneckWidthMm?: number;
    equipmentMinimumWidthMm?: number;
    equipmentHeightMm?: number;
    entranceHeightMm?: number;
  } = {},
): TechnicalCheckAspect {
  return Object.freeze({
    kind,
    status,
    message,
    ...(extras.notes && extras.notes.length > 0 ? { notes: Object.freeze([...extras.notes]) } : {}),
    ...(extras.fieldEvidence ? { fieldEvidence: extras.fieldEvidence } : {}),
    ...(extras.observedBottleneckWidthMm !== undefined
      ? { observedBottleneckWidthMm: extras.observedBottleneckWidthMm }
      : {}),
    ...(extras.equipmentMinimumWidthMm !== undefined
      ? { equipmentMinimumWidthMm: extras.equipmentMinimumWidthMm }
      : {}),
    ...(extras.equipmentHeightMm !== undefined
      ? { equipmentHeightMm: extras.equipmentHeightMm }
      : {}),
    ...(extras.entranceHeightMm !== undefined
      ? { entranceHeightMm: extras.entranceHeightMm }
      : {}),
  });
}

export function sampleAspect(kind: TechnicalCheckAspectKind): TechnicalCheckAspect {
  return aspect(
    kind,
    "INSUFFICIENT_DATA",
    "예시 장비 데이터이므로 실제 기술검토에 사용할 수 없음",
    { notes: Object.freeze([equipmentDataStatusNote("SAMPLE")]) },
  );
}

/**
 * 검증되지 않은 FIELD 출처는 값만으로 확정 비교에 쓰지 않는다.
 */
export function isUnverifiedFieldSource(evidence: FieldEvidenceMeta | undefined): boolean {
  if (!evidence) return true;
  if (
    evidence.sourceType === "CUSTOMER_INPUT" ||
    evidence.sourceType === "OWNER_STATEMENT" ||
    evidence.sourceType === "TENANT_STATEMENT"
  ) {
    return true;
  }
  if (evidence.verificationStatus === "UNKNOWN" || evidence.verificationStatus === "ESTIMATED") {
    return true;
  }
  return false;
}

/**
 * 진술/고객입력 출처는 확정 CONSTRAINT 근거로 쓰지 않는다.
 * FIELD_CHECK 등에서 명시값 불일치는 관찰(CONSTRAINT_OBSERVED) 가능.
 */
export function isStatementLikeFieldSource(evidence: FieldEvidenceMeta | undefined): boolean {
  if (!evidence) return false;
  return (
    evidence.sourceType === "CUSTOMER_INPUT" ||
    evidence.sourceType === "OWNER_STATEMENT" ||
    evidence.sourceType === "TENANT_STATEMENT"
  );
}

/**
 * 명시적 불일치 관찰에 사용. 진술 출처면 false.
 */
export function canObserveConstraintFromField(evidence: FieldEvidenceMeta | undefined): boolean {
  if (!evidence) return true; // 값만 있고 evidence 없는 테스트 fixture
  if (isStatementLikeFieldSource(evidence)) return false;
  return true;
}

/**
 * "충돌 없음"을 강하게 말할 때만 VERIFIED 필요.
 */
export function canUseFieldValueForConstraint(evidence: FieldEvidenceMeta | undefined): boolean {
  if (!evidence) return false;
  if (evidence.verificationStatus !== "VERIFIED") return false;
  if (isStatementLikeFieldSource(evidence)) return false;
  if (evidence.confirmationRequirement !== "NONE") return false;
  return true;
}

export function technicalCheckStatusLabel(status: TechnicalCheckStatus): string {
  switch (status) {
    case "NO_CONFLICT_OBSERVED":
      return "직접 충돌 미확인";
    case "CONSTRAINT_OBSERVED":
      return "제약사항 관찰";
    case "INSUFFICIENT_DATA":
      return "자료 부족";
    case "EXPERT_REVIEW_REQUIRED":
      return "전문가 확인 필요";
    case "NOT_APPLICABLE":
      return "해당 없음";
  }
}
