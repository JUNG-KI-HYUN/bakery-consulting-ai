/**
 * Equipment geometry warnings for Space Fit.
 * Facility point와 Equipment 겹침은 Phase 5D에서 collision으로 보지 않는다.
 * Risk/Verdict를 만들지 않는다.
 */

import type { EquipmentDefinition, EquipmentInstance } from "../equipment/types";
import { equipmentFootprintRect } from "../equipment/placement";
import {
  isRectInsideRoom,
  rectsOverlap,
  type GeometryWarning,
  type RectMm,
} from "./geometry";
import type { SpaceFitLayout } from "./types";

function definitionMap(
  definitions: ReadonlyMap<string, EquipmentDefinition> | ReadonlyArray<EquipmentDefinition>,
): ReadonlyMap<string, EquipmentDefinition> {
  if (definitions instanceof Map) {
    return definitions;
  }
  const list = definitions as ReadonlyArray<EquipmentDefinition>;
  return new Map(list.map((item) => [item.equipmentDefinitionId, item]));
}

function structuralRects(layout: SpaceFitLayout): { id: string; rect: RectMm }[] {
  const rects: { id: string; rect: RectMm }[] = [];
  for (const element of layout.elements) {
    if (element.type === "PILLAR" || element.type === "RESTROOM") {
      rects.push({
        id: element.elementId,
        rect: {
          xMm: element.xMm,
          yMm: element.yMm,
          widthMm: element.widthMm,
          heightMm: element.heightMm,
        },
      });
    }
  }
  return rects;
}

/**
 * EquipmentInstance footprint 검증.
 * - Room OUT_OF_BOUNDS
 * - PILLAR / RESTROOM OVERLAP
 * - Equipment ↔ Equipment OVERLAP
 * - edge touch ≠ overlap
 * - facility point 겹침은 검사하지 않음
 */
export function validateEquipmentGeometry(
  layout: SpaceFitLayout,
  definitions: ReadonlyMap<string, EquipmentDefinition> | ReadonlyArray<EquipmentDefinition>,
): readonly GeometryWarning[] {
  const map = definitionMap(definitions);
  const instances = layout.equipmentInstances ?? [];
  const warnings: GeometryWarning[] = [];
  const footprints: { id: string; rect: RectMm }[] = [];
  const structural = structuralRects(layout);

  for (const instance of instances) {
    const definition = map.get(instance.equipmentDefinitionId);
    if (!definition) {
      warnings.push({
        code: "INVALID_GEOMETRY",
        message: "장비정보를 찾을 수 없음 — footprint 계산 불가",
        elementId: instance.equipmentInstanceId,
      });
      continue;
    }
    const rect = equipmentFootprintRect(definition, instance);
    if (!rect) {
      warnings.push({
        code: "INVALID_GEOMETRY",
        message: "장비 외형 치수가 확인되지 않아 footprint를 만들 수 없습니다",
        elementId: instance.equipmentInstanceId,
      });
      continue;
    }
    footprints.push({ id: instance.equipmentInstanceId, rect });
    if (
      !isRectInsideRoom(rect, {
        widthMm: layout.room.widthMm,
        depthMm: layout.room.depthMm,
      })
    ) {
      warnings.push({
        code: "OUT_OF_BOUNDS",
        message: "Equipment is outside the room",
        elementId: instance.equipmentInstanceId,
      });
    }
    for (const solid of structural) {
      if (rectsOverlap(rect, solid.rect)) {
        warnings.push({
          code: "OVERLAP",
          message: "Equipment overlaps a structural element",
          elementId: instance.equipmentInstanceId,
          otherElementId: solid.id,
        });
      }
    }
  }

  for (let i = 0; i < footprints.length; i += 1) {
    for (let j = i + 1; j < footprints.length; j += 1) {
      const left = footprints[i];
      const right = footprints[j];
      if (!left || !right) continue;
      if (rectsOverlap(left.rect, right.rect)) {
        warnings.push({
          code: "OVERLAP",
          message: "Equipment instances overlap",
          elementId: left.id,
          otherElementId: right.id,
        });
      }
    }
  }

  return Object.freeze(warnings);
}

export function findEquipmentInstance(
  layout: SpaceFitLayout,
  equipmentInstanceId: string,
): EquipmentInstance | null {
  return (
    layout.equipmentInstances?.find((item) => item.equipmentInstanceId === equipmentInstanceId) ??
    null
  );
}
