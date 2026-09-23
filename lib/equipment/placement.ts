/**
 * Equipment placement helpers — Space Fit Editor용 순수함수.
 * Definition 사양을 Instance에 복사하지 않는다.
 */

import { getEquipmentFootprint } from "./footprint";
import {
  createEquipmentInstance,
  type EquipmentDefinition,
  type EquipmentInstance,
  type EquipmentRotationDeg,
} from "./types";
import { validateEquipmentInstanceForDefinition } from "./validation";
import { snapToGridMm } from "../space-fit/geometry";
import type { RectMm } from "../space-fit/geometry";

export function canPlaceEquipmentOnLayout(definition: EquipmentDefinition): {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly code: "DIMENSION_UNKNOWN" | "DIMENSION_MISSING";
  readonly message: string;
} {
  const footprint = getEquipmentFootprint(definition, 0);
  if (!footprint.ok) {
    return {
      ok: false,
      code: footprint.code,
      message:
        "장비 외형 치수가 확인되지 않아 공간 배치를 할 수 없습니다.",
    };
  }
  return { ok: true };
}

export function equipmentFootprintRect(
  definition: EquipmentDefinition,
  instance: Pick<EquipmentInstance, "xMm" | "yMm" | "rotationDeg">,
): RectMm | null {
  const footprint = getEquipmentFootprint(definition, instance.rotationDeg);
  if (!footprint.ok) return null;
  return {
    xMm: instance.xMm,
    yMm: instance.yMm,
    widthMm: footprint.widthMm,
    heightMm: footprint.depthMm,
  };
}

export function createPlacedEquipmentInstance(input: {
  definition: EquipmentDefinition;
  layoutId: string;
  xMm: number;
  yMm: number;
  rotationDeg?: EquipmentRotationDeg;
  createdAt: string;
}):
  | { readonly ok: true; readonly instance: EquipmentInstance }
  | { readonly ok: false; readonly message: string } {
  const placeable = canPlaceEquipmentOnLayout(input.definition);
  if (!placeable.ok) {
    return { ok: false, message: placeable.message };
  }
  const rotationDeg = input.rotationDeg ?? 0;
  const instance = createEquipmentInstance({
    equipmentDefinitionId: input.definition.equipmentDefinitionId,
    layoutId: input.layoutId,
    xMm: snapToGridMm(Math.max(0, input.xMm)),
    yMm: snapToGridMm(Math.max(0, input.yMm)),
    rotationDeg,
    createdAt: input.createdAt,
  });
  const validated = validateEquipmentInstanceForDefinition(instance, input.definition);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }
  return { ok: true, instance: validated.value };
}

export function moveEquipmentInstance(
  instance: EquipmentInstance,
  xMm: number,
  yMm: number,
): EquipmentInstance {
  return Object.freeze({
    ...instance,
    xMm: snapToGridMm(Math.max(0, xMm)),
    yMm: snapToGridMm(Math.max(0, yMm)),
    updatedAt: instance.updatedAt,
  });
}

export function rotateEquipmentInstance(
  instance: EquipmentInstance,
  definition: EquipmentDefinition,
):
  | { readonly ok: true; readonly instance: EquipmentInstance }
  | { readonly ok: false; readonly message: string } {
  const nextRotation: EquipmentRotationDeg = instance.rotationDeg === 0 ? 90 : 0;
  const next = Object.freeze({
    ...instance,
    rotationDeg: nextRotation,
  });
  const validated = validateEquipmentInstanceForDefinition(next, definition);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }
  return { ok: true, instance: validated.value };
}

export function equipmentDataStatusLabel(
  status: EquipmentDefinition["dataStatus"],
): string {
  switch (status) {
    case "SAMPLE":
      return "SAMPLE · 예시 데이터 · 실제 검토용 아님";
    case "NEEDS_REVIEW":
      return "NEEDS_REVIEW · 규격 확인 필요";
    case "REFERENCE":
      return "REFERENCE · 참고 자료";
    case "VERIFIED":
      return "VERIFIED · 데이터 검증됨";
  }
}
