/**
 * Water / Drainage / Exhaust Technical Check.
 * 관찰점 존재 ≠ 연결/공사/영업 가능.
 */

import type { EquipmentDefinition } from "../equipment/types";
import type {
  DrainageFacility,
  ExhaustFacility,
  WaterSupplyFacility,
} from "../field/facility";
import type { UtilityRequirement } from "../equipment/types";
import {
  aspect,
  canObserveConstraintFromField,
  sampleAspect,
  sampleBlocksDefinitiveCheck,
} from "./helpers";
import type { TechnicalCheckAspect, TechnicalCheckAspectKind } from "./types";

function requiredState(
  req: UtilityRequirement | undefined,
): "no" | "yes" | "unknown" | "missing" {
  if (!req || req.required === false) return "no";
  if (req.required === "UNKNOWN") return "unknown";
  if (req.required === true) return "yes";
  // required undefined — 요구조건 객체만 있으면 불명확
  return "missing";
}

function utilityCheck(input: {
  kind: TechnicalCheckAspectKind;
  definition: EquipmentDefinition;
  requirement: UtilityRequirement | undefined;
  fieldMissingMessage: string;
  observedYesMessage: string;
  observedNoMessage: string;
  observedUnknownMessage: string;
  getObserved: () =>
    | { value: "YES" | "NO" | "UNKNOWN"; evidence: import("../field/field-evidence-meta").FieldEvidenceMeta }
    | null;
  furtherExpert?: boolean;
}): TechnicalCheckAspect {
  if (sampleBlocksDefinitiveCheck(input.definition)) {
    return sampleAspect(input.kind);
  }

  const state = requiredState(input.requirement);
  if (state === "no") {
    return aspect(input.kind, "NOT_APPLICABLE", "이 장비에 해당 요구조건이 없음");
  }
  if (state === "unknown" || state === "missing") {
    return aspect(input.kind, "INSUFFICIENT_DATA", "장비 요구조건이 확인되지 않음");
  }

  const observed = input.getObserved();
  if (!observed) {
    return aspect(input.kind, "INSUFFICIENT_DATA", input.fieldMissingMessage);
  }

  const notes: string[] = [];
  if (input.definition.dataStatus === "REFERENCE") {
    notes.push("REFERENCE 장비 사양 — 참고 자료");
  }
  if (input.definition.dataStatus === "NEEDS_REVIEW") {
    notes.push("장비 규격 확인 필요");
  }
  notes.push("배관/공사 전문가 확인 필요");

  if (observed.value === "UNKNOWN") {
    return aspect(input.kind, "INSUFFICIENT_DATA", input.observedUnknownMessage, {
      notes,
      fieldEvidence: observed.evidence,
    });
  }

  if (observed.value === "NO") {
    if (!canObserveConstraintFromField(observed.evidence)) {
      return aspect(
        input.kind,
        "EXPERT_REVIEW_REQUIRED",
        `${input.observedNoMessage} (현장 출처 추가 확인 필요)`,
        { notes, fieldEvidence: observed.evidence },
      );
    }
    return aspect(input.kind, "CONSTRAINT_OBSERVED", input.observedNoMessage, {
      notes,
      fieldEvidence: observed.evidence,
    });
  }

  // YES observed — 연결 가능 판정 금지
  if (input.furtherExpert) {
    return aspect(input.kind, "EXPERT_REVIEW_REQUIRED", input.observedYesMessage, {
      notes,
      fieldEvidence: observed.evidence,
    });
  }
  return aspect(input.kind, "NO_CONFLICT_OBSERVED", input.observedYesMessage, {
    notes,
    fieldEvidence: observed.evidence,
  });
}

export function checkEquipmentWater(input: {
  definition: EquipmentDefinition;
  waterSupply: WaterSupplyFacility | null | undefined;
}): TechnicalCheckAspect {
  return utilityCheck({
    kind: "water",
    definition: input.definition,
    requirement: input.definition.waterRequirement,
    fieldMissingMessage: "FIELD 급수 관찰값이 없음",
    observedYesMessage:
      "현재 급수 관련 직접 충돌이 확인되지 않음 — 연결 가능 판정이 아님. 배관/공사 전문가 확인 필요",
    observedNoMessage: "장비가 급수를 필요로 하나 현장 급수점 관찰값이 NO",
    observedUnknownMessage: "FIELD 급수 확인값이 UNKNOWN",
    getObserved: () => {
      if (!input.waterSupply) return null;
      return {
        value: input.waterSupply.supplyPointObserved.value,
        evidence: input.waterSupply.supplyPointObserved.evidence,
      };
    },
    furtherExpert: input.waterSupply?.furtherCheckNeeded.value === "YES",
  });
}

export function checkEquipmentDrainage(input: {
  definition: EquipmentDefinition;
  drainage: DrainageFacility | null | undefined;
}): TechnicalCheckAspect {
  return utilityCheck({
    kind: "drainage",
    definition: input.definition,
    requirement: input.definition.drainRequirement,
    fieldMissingMessage: "FIELD 배수 관찰값이 없음",
    observedYesMessage:
      "현재 배수 관련 직접 충돌이 확인되지 않음 — 배수 공사 가능/용량 충분 판정이 아님",
    observedNoMessage: "장비가 배수를 필요로 하나 현장 배수 관찰값이 NO",
    observedUnknownMessage: "FIELD 배수 확인값이 UNKNOWN",
    getObserved: () => {
      if (!input.drainage) return null;
      return {
        value: input.drainage.floorDrainObserved.value,
        evidence: input.drainage.floorDrainObserved.evidence,
      };
    },
    furtherExpert: input.drainage?.furtherCheckNeeded.value === "YES",
  });
}

export function checkEquipmentExhaust(input: {
  definition: EquipmentDefinition;
  exhaust: ExhaustFacility | null | undefined;
}): TechnicalCheckAspect {
  if (sampleBlocksDefinitiveCheck(input.definition)) {
    return sampleAspect("exhaust");
  }

  const state = requiredState(input.definition.exhaustRequirement);
  if (state === "no") {
    return aspect("exhaust", "NOT_APPLICABLE", "이 장비에 배기 요구조건이 없음");
  }
  if (state === "unknown" || state === "missing") {
    return aspect("exhaust", "INSUFFICIENT_DATA", "장비 배기 요구조건이 확인되지 않음");
  }

  const field = input.exhaust;
  if (!field) {
    return aspect("exhaust", "INSUFFICIENT_DATA", "FIELD 배기 관찰값이 없음");
  }

  const notes = Object.freeze([
    "기존 배기설비 관찰 ≠ 베이커리 배기 가능",
    "전문업체 / 건축 / 소방 / 임대인 확인 필요",
  ]);

  if (field.externalPathChecked.value === "UNKNOWN") {
    return aspect("exhaust", "INSUFFICIENT_DATA", "배기 필요 장비이나 외부 배출경로가 UNKNOWN", {
      notes,
      fieldEvidence: field.externalPathChecked.evidence,
    });
  }

  if (field.externalPathChecked.value === "NO") {
    if (!canObserveConstraintFromField(field.externalPathChecked.evidence)) {
      return aspect(
        "exhaust",
        "EXPERT_REVIEW_REQUIRED",
        "외부 배출경로 관찰값이 NO이나 출처 추가 확인 필요",
        { notes, fieldEvidence: field.externalPathChecked.evidence },
      );
    }
    return aspect("exhaust", "CONSTRAINT_OBSERVED", "외부 배출경로 관찰값이 NO로 기록됨", {
      notes,
      fieldEvidence: field.externalPathChecked.evidence,
    });
  }

  if (
    field.expertReviewNeeded.value === "YES" ||
    field.landlordConfirmation.value !== "YES"
  ) {
    return aspect(
      "exhaust",
      "EXPERT_REVIEW_REQUIRED",
      "배기 관련 전문가·임대인 확인이 필요함 — 베이커리 배기 가능 확정 아님",
      { notes, fieldEvidence: field.expertReviewNeeded.evidence },
    );
  }

  return aspect(
    "exhaust",
    "NO_CONFLICT_OBSERVED",
    "현재 배기 관련 직접 충돌이 확인되지 않음 — 배기 가능 확정 아님",
    { notes, fieldEvidence: field.externalPathChecked.evidence },
  );
}
