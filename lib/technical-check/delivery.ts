/**
 * Delivery Technical Check — width bottleneck / height / turning.
 * 폭이 충분해도 반입 가능 판정 금지. 폭이 좁아도 반입 불가 확정 금지.
 */

import type { EquipmentDefinition } from "../equipment/types";
import type { MeasurementSet, MeasuredDimension } from "../field/measurement";
import type { DeliveryPathObservation, DeliveryPrimaryMethod } from "../field/space-equipment";
import {
  aspect,
  canUseFieldValueForConstraint,
  needsReviewBlocksNumericConstraint,
  sampleAspect,
  sampleBlocksDefinitiveCheck,
} from "./helpers";
import type { TechnicalCheckAspect } from "./types";

function knownMm(dimension: MeasuredDimension | undefined): number | null {
  if (!dimension) return null;
  if (dimension.status === "UNKNOWN") return null;
  return dimension.mm;
}

export function selectDeliveryRouteWidths(input: {
  method: DeliveryPrimaryMethod;
  measurement: MeasurementSet | null | undefined;
}): {
  readonly widthsMm: readonly number[];
  readonly missingExpected: boolean;
  readonly method: DeliveryPrimaryMethod;
} {
  const values = input.measurement?.values;
  const entrance = knownMm(values?.entranceWidthMm);
  const corridor = knownMm(values?.corridorWidthMm);
  const stair = knownMm(values?.stairWidthMm);
  const elevator = knownMm(values?.elevatorDoorWidthMm);

  switch (input.method) {
    case "GROUND_DIRECT": {
      const widths = entrance !== null ? [entrance] : [];
      return Object.freeze({
        widthsMm: Object.freeze(widths),
        missingExpected: entrance === null,
        method: input.method,
      });
    }
    case "STAIRS": {
      const widths: number[] = [];
      if (entrance !== null) widths.push(entrance);
      if (corridor !== null) widths.push(corridor);
      if (stair !== null) widths.push(stair);
      return Object.freeze({
        widthsMm: Object.freeze(widths),
        missingExpected: entrance === null || stair === null,
        method: input.method,
      });
    }
    case "ELEVATOR": {
      const widths: number[] = [];
      if (entrance !== null) widths.push(entrance);
      if (corridor !== null) widths.push(corridor);
      if (elevator !== null) widths.push(elevator);
      return Object.freeze({
        widthsMm: Object.freeze(widths),
        missingExpected: entrance === null || elevator === null,
        method: input.method,
      });
    }
    case "OTHER":
    case "UNKNOWN":
    default:
      return Object.freeze({
        widthsMm: Object.freeze([] as number[]),
        missingExpected: true,
        method: input.method,
      });
  }
}

export function computeObservedBottleneckWidthMm(
  widthsMm: readonly number[],
): number | null {
  if (widthsMm.length === 0) return null;
  return Math.min(...widthsMm);
}

export function checkEquipmentDelivery(input: {
  definition: EquipmentDefinition;
  measurement: MeasurementSet | null | undefined;
  deliveryPath: DeliveryPathObservation | null | undefined;
}): TechnicalCheckAspect {
  if (sampleBlocksDefinitiveCheck(input.definition)) {
    return sampleAspect("delivery");
  }

  const notes: string[] = [
    "회전·높이·포장·계단·장비 분해·현장 장애물 등 추가 확인 필요",
    "폭·높이 비교만으로 반입 여부를 확정하지 않음",
  ];
  if (input.definition.dataStatus === "REFERENCE") {
    notes.push("REFERENCE 장비 사양 — 참고 자료");
  }

  const method = input.deliveryPath?.primaryDeliveryMethod.value ?? "UNKNOWN";
  if (method === "UNKNOWN" || method === "OTHER") {
    return aspect(
      "delivery",
      "INSUFFICIENT_DATA",
      "반입 경로 방식(primaryDeliveryMethod)이 확인되지 않아 폭 비교를 할 수 없음",
      { notes },
    );
  }

  const minWidth = input.definition.minimumDeliveryWidthMm;
  if (!minWidth) {
    return aspect("delivery", "INSUFFICIENT_DATA", "장비 최소 반입폭이 미입력", { notes });
  }
  if (minWidth.status === "UNKNOWN") {
    return aspect("delivery", "INSUFFICIENT_DATA", "장비 최소 반입폭이 UNKNOWN", { notes });
  }

  if (!input.measurement) {
    return aspect("delivery", "INSUFFICIENT_DATA", "FIELD MeasurementSet이 없음", { notes });
  }

  const entranceWidth = input.measurement.values.entranceWidthMm;
  if (!entranceWidth) {
    return aspect("delivery", "INSUFFICIENT_DATA", "출입구 폭이 미입력", { notes });
  }
  if (entranceWidth.status === "UNKNOWN") {
    return aspect("delivery", "INSUFFICIENT_DATA", "출입구 폭이 UNKNOWN", { notes });
  }

  const route = selectDeliveryRouteWidths({ method, measurement: input.measurement });
  const bottleneck = computeObservedBottleneckWidthMm(route.widthsMm);
  if (bottleneck === null) {
    return aspect("delivery", "INSUFFICIENT_DATA", "반입경로 KNOWN 폭이 없어 bottleneck 계산 불가", {
      notes,
    });
  }

  if (route.missingExpected) {
    return aspect(
      "delivery",
      "INSUFFICIENT_DATA",
      `반입 경로(${method})에 필요한 폭 자료가 부족함 (부분 KNOWN bottleneck ${bottleneck}mm)`,
      {
        notes,
        observedBottleneckWidthMm: bottleneck,
        equipmentMinimumWidthMm: minWidth.mm,
      },
    );
  }

  const turning = input.deliveryPath?.stairTurning.value;
  const intermediate = input.deliveryPath?.intermediateDoorCorridor.value;
  const elevatorAccess = input.deliveryPath?.elevatorAccess.value;

  if (turning === "CONSTRAINT_OBSERVED" || intermediate === "CONSTRAINT_OBSERVED") {
    return aspect(
      "delivery",
      "CONSTRAINT_OBSERVED",
      "FIELD에 회전/중간문·복도 제약사항이 관찰됨 — 폭 수치와 별개로 추가 확인 필요",
      {
        notes,
        observedBottleneckWidthMm: bottleneck,
        equipmentMinimumWidthMm: minWidth.mm,
        fieldEvidence: input.deliveryPath?.stairTurning.evidence,
      },
    );
  }

  if (method === "ELEVATOR" && elevatorAccess === "CONSTRAINED") {
    return aspect(
      "delivery",
      "CONSTRAINT_OBSERVED",
      "FIELD에 엘리베이터 반입 제약이 관찰됨",
      {
        notes,
        observedBottleneckWidthMm: bottleneck,
        equipmentMinimumWidthMm: minWidth.mm,
        fieldEvidence: input.deliveryPath?.elevatorAccess.evidence,
      },
    );
  }

  if (minWidth.mm > bottleneck) {
    if (needsReviewBlocksNumericConstraint(input.definition)) {
      return aspect(
        "delivery",
        "INSUFFICIENT_DATA",
        "장비 최소 반입폭이 bottleneck보다 큰 값이 보이나, NEEDS_REVIEW 사양이라 확정 비교에 사용할 수 없음",
        {
          notes,
          observedBottleneckWidthMm: bottleneck,
          equipmentMinimumWidthMm: minWidth.mm,
        },
      );
    }
    return aspect(
      "delivery",
      "CONSTRAINT_OBSERVED",
      "현재 확인된 반입경로 최소폭이 장비 기준 최소 반입폭보다 좁습니다",
      {
        notes,
        observedBottleneckWidthMm: bottleneck,
        equipmentMinimumWidthMm: minWidth.mm,
      },
    );
  }

  // height comparison
  const eqHeight = input.definition.dimensions.heightMm;
  const entranceHeight = input.measurement.values.entranceHeightMm;
  if (eqHeight?.status === "KNOWN" && entranceHeight?.status === "KNOWN") {
    if (eqHeight.mm > entranceHeight.mm) {
      if (needsReviewBlocksNumericConstraint(input.definition)) {
        return aspect(
          "delivery",
          "INSUFFICIENT_DATA",
          "장비 높이가 출입구 높이보다 큰 값이 보이나, NEEDS_REVIEW 사양이라 확정 비교에 사용할 수 없음",
          {
            notes,
            observedBottleneckWidthMm: bottleneck,
            equipmentMinimumWidthMm: minWidth.mm,
            equipmentHeightMm: eqHeight.mm,
            entranceHeightMm: entranceHeight.mm,
          },
        );
      }
      return aspect(
        "delivery",
        "CONSTRAINT_OBSERVED",
        "장비 높이가 출입구 높이보다 큼 — 자세·포장·분해 가능성은 미확인",
        {
          notes,
          observedBottleneckWidthMm: bottleneck,
          equipmentMinimumWidthMm: minWidth.mm,
          equipmentHeightMm: eqHeight.mm,
          entranceHeightMm: entranceHeight.mm,
        },
      );
    }
  }

  if (turning === "UNKNOWN" || intermediate === "UNKNOWN") {
    return aspect(
      "delivery",
      "EXPERT_REVIEW_REQUIRED",
      "폭 수치상 직접 충돌은 확인되지 않았으나 회전/중간 구간 관찰이 UNKNOWN — 추가 현장 확인 필요",
      {
        notes,
        observedBottleneckWidthMm: bottleneck,
        equipmentMinimumWidthMm: minWidth.mm,
      },
    );
  }

  // width ok — never claim delivery is possible
  const widthEvidenceOk = canUseFieldValueForConstraint(
    input.deliveryPath?.primaryDeliveryMethod.evidence,
  );
  return aspect(
    "delivery",
    widthEvidenceOk ? "NO_CONFLICT_OBSERVED" : "EXPERT_REVIEW_REQUIRED",
    "현재 확인된 반입경로 폭에서 직접적인 폭 충돌이 확인되지 않음 — 추가 확인 필요",
    {
      notes,
      observedBottleneckWidthMm: bottleneck,
      equipmentMinimumWidthMm: minWidth.mm,
    },
  );
}
