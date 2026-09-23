/**
 * Electrical Technical Check — factual comparison only.
 * power 합계 ≤ 계약전력이어도 "충분" 판정 금지.
 */

import type { EquipmentDefinition, EquipmentInstance, EquipmentPhase } from "../equipment/types";
import type { ElectricalFacility, PowerPhaseType } from "../field/facility";
import {
  aspect,
  canObserveConstraintFromField,
  needsReviewBlocksNumericConstraint,
  sampleAspect,
  sampleBlocksDefinitiveCheck,
} from "./helpers";
import {
  ELECTRICAL_CAPACITY_EXPERT_DISCLAIMER,
  type KnownEquipmentPowerSummary,
  type TechnicalCheckAspect,
} from "./types";

function mapEquipmentPhaseToField(phase: EquipmentPhase): PowerPhaseType | null {
  if (phase === "SINGLE") return "SINGLE_PHASE";
  if (phase === "THREE") return "THREE_PHASE";
  if (phase === "UNKNOWN") return "UNKNOWN";
  return null;
}

export function checkEquipmentElectrical(input: {
  definition: EquipmentDefinition;
  electrical: ElectricalFacility | null | undefined;
}): TechnicalCheckAspect {
  if (sampleBlocksDefinitiveCheck(input.definition)) {
    return sampleAspect("electrical");
  }

  const req = input.definition.electricalRequirement;
  if (!req || req.required === false) {
    return aspect("electrical", "NOT_APPLICABLE", "이 장비는 전기 요구조건이 없거나 불필요로 기록됨");
  }

  if (req.required === "UNKNOWN") {
    return aspect("electrical", "INSUFFICIENT_DATA", "장비 전기 필요 여부가 UNKNOWN");
  }

  // required === true 또는 required undefined with power/phase present
  const field = input.electrical;
  if (!field) {
    return aspect("electrical", "INSUFFICIENT_DATA", "FIELD 전기 관찰값이 없음");
  }

  const notes: string[] = [ELECTRICAL_CAPACITY_EXPERT_DISCLAIMER];
  if (input.definition.dataStatus === "REFERENCE") {
    notes.push("REFERENCE 장비 사양 — 참고 자료");
  }
  if (input.definition.dataStatus === "NEEDS_REVIEW") {
    notes.push("장비 규격 확인 필요 — 수치를 확정 근거로 사용하지 않음");
  }

  const fieldPhase = field.phaseType.value;
  const fieldPhaseEvidence = field.phaseType.evidence;
  const equipmentPhase = req.phase;

  if (equipmentPhase && equipmentPhase !== "UNKNOWN") {
    if (fieldPhase === "UNKNOWN") {
      return aspect("electrical", "INSUFFICIENT_DATA", "FIELD 전원 유형(phase)이 UNKNOWN", {
        notes,
        fieldEvidence: fieldPhaseEvidence,
      });
    }
    const expected = mapEquipmentPhaseToField(equipmentPhase);
    if (expected && expected !== fieldPhase) {
      if (needsReviewBlocksNumericConstraint(input.definition)) {
        return aspect(
          "electrical",
          "INSUFFICIENT_DATA",
          "전원 유형 차이가 보이나 NEEDS_REVIEW 사양이라 확정 비교에 사용할 수 없음",
          { notes, fieldEvidence: fieldPhaseEvidence },
        );
      }
      if (!canObserveConstraintFromField(fieldPhaseEvidence)) {
        return aspect(
          "electrical",
          "EXPERT_REVIEW_REQUIRED",
          "장비 요구 전원과 현장 전원 유형 차이가 관찰되나, 출처가 확정 비교에 부족함",
          { notes, fieldEvidence: fieldPhaseEvidence },
        );
      }
      return aspect(
        "electrical",
        "CONSTRAINT_OBSERVED",
        "장비 요구 전원과 현장 확인 전원 유형이 다름",
        { notes, fieldEvidence: fieldPhaseEvidence },
      );
    }
  } else if (!equipmentPhase || equipmentPhase === "UNKNOWN") {
    if (req.required === true && fieldPhase === "UNKNOWN" && req.powerKw == null) {
      return aspect("electrical", "INSUFFICIENT_DATA", "장비·현장 전원 비교 자료 부족", {
        notes,
        fieldEvidence: fieldPhaseEvidence,
      });
    }
  }

  if (field.expansionStatus.value === "EXPERT_REVIEW_REQUIRED") {
    return aspect("electrical", "EXPERT_REVIEW_REQUIRED", "FIELD에 전기 전문가 확인 필요 상태가 기록됨", {
      notes,
      fieldEvidence: field.expansionStatus.evidence,
    });
  }

  // phase 일치 또는 phase 비교 불필요 — 적합 확정 금지
  return aspect(
    "electrical",
    "EXPERT_REVIEW_REQUIRED",
    "현재 확보된 전원 유형에서 직접적인 충돌은 확인되지 않았으나, 전기 용량·회로·동시사용량은 전문가 확인 필요",
    { notes, fieldEvidence: fieldPhaseEvidence },
  );
}

export function summarizeKnownEquipmentPower(input: {
  instances: readonly EquipmentInstance[];
  definitions: ReadonlyMap<string, EquipmentDefinition>;
  electrical: ElectricalFacility | null | undefined;
}): KnownEquipmentPowerSummary {
  let knownEquipmentPowerKw = 0;
  let knownPowerEquipmentCount = 0;
  let unknownPowerEquipmentCount = 0;

  for (const instance of input.instances) {
    const def = input.definitions.get(instance.equipmentDefinitionId);
    if (!def) {
      unknownPowerEquipmentCount += 1;
      continue;
    }
    // SAMPLE은 확정 합산에 넣지 않음
    if (def.dataStatus === "SAMPLE") {
      unknownPowerEquipmentCount += 1;
      continue;
    }
    const power = def.electricalRequirement?.powerKw;
    if (typeof power === "number" && Number.isFinite(power) && power > 0) {
      if (def.dataStatus === "NEEDS_REVIEW") {
        // 미검증 수치는 합산에 넣되 unknown으로도 카운트? Spec: known sum 계산 + unknown count.
        // NEEDS_REVIEW는 "확정근거로 사용 금지" — 합산 표시용 known에는 넣되 arithmetic CONSTRAINT는 expert로.
        knownEquipmentPowerKw += power;
        knownPowerEquipmentCount += 1;
      } else {
        knownEquipmentPowerKw += power;
        knownPowerEquipmentCount += 1;
      }
    } else {
      unknownPowerEquipmentCount += 1;
    }
  }

  // float 안정화
  knownEquipmentPowerKw = Math.round(knownEquipmentPowerKw * 1000) / 1000;

  const contract = input.electrical?.contractPowerKw.value ?? null;
  const fieldContractPowerKw =
    typeof contract === "number" && Number.isFinite(contract) ? contract : null;

  let arithmeticStatus: KnownEquipmentPowerSummary["arithmeticStatus"] = null;
  let arithmeticMessage: string | null = null;

  if (fieldContractPowerKw !== null && knownPowerEquipmentCount > 0) {
    const hasNeedsReviewPower = [...input.instances].some((instance) => {
      const def = input.definitions.get(instance.equipmentDefinitionId);
      const power = def?.electricalRequirement?.powerKw;
      return (
        def?.dataStatus === "NEEDS_REVIEW" &&
        typeof power === "number" &&
        Number.isFinite(power) &&
        power > 0
      );
    });

    if (knownEquipmentPowerKw > fieldContractPowerKw) {
      if (hasNeedsReviewPower) {
        arithmeticStatus = "EXPERT_REVIEW_REQUIRED";
        arithmeticMessage =
          "확인된 요구전력 합계가 계약전력을 초과하는 것으로 보이나, NEEDS_REVIEW 사양이 포함되어 확정 비교에 사용할 수 없음";
      } else if (
        !canObserveConstraintFromField(input.electrical?.contractPowerKw.evidence)
      ) {
        arithmeticStatus = "EXPERT_REVIEW_REQUIRED";
        arithmeticMessage =
          "확인된 요구전력 합계가 계약전력보다 큰 값이 관찰되나, 현장 계약전력 출처가 확정 비교에 부족함";
      } else {
        arithmeticStatus = "CONSTRAINT_OBSERVED";
        arithmeticMessage = `현재 입력값 기준 확인된 요구전력 합계(${knownEquipmentPowerKw}kW)가 계약전력(${fieldContractPowerKw}kW)을 초과함. 이 결과는 전기 용량·증설에 대한 최종 판단이 아닙니다.`;
      }
    }
    // sum <= contract: arithmeticStatus stays null — "전기 충분" 생성 안 함
  }

  return Object.freeze({
    knownEquipmentPowerKw,
    unknownPowerEquipmentCount,
    knownPowerEquipmentCount,
    fieldContractPowerKw,
    arithmeticStatus,
    arithmeticMessage,
    expertDisclaimer: ELECTRICAL_CAPACITY_EXPERT_DISCLAIMER,
  });
}
