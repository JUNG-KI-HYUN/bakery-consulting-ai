import type { MeasurementSet } from "../field/measurement";
import type { EquipmentDefinition } from "../equipment/types";
import type { RoomElement, SpaceFitLayout } from "./types";
import { validateEquipmentGeometry } from "./equipment-geometry";
import {
  type GeometryWarning,
  type PlacementElement,
  type RectMm,
  validateElementPlacement,
} from "./geometry";

/** Entrance wall placement → thin rectangle for bounds/overlap checks. */
export function entranceToRect(
  entrance: {
    wall: "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
    offsetMm: number;
    widthMm: number;
  },
  room: { widthMm: number; depthMm: number },
): RectMm {
  const thickness = 100; // 시각·충돌용 얇은 띠. Domain에 별도 저장하지 않음.
  switch (entrance.wall) {
    case "TOP":
      return {
        xMm: entrance.offsetMm,
        yMm: 0,
        widthMm: entrance.widthMm,
        heightMm: thickness,
      };
    case "BOTTOM":
      return {
        xMm: entrance.offsetMm,
        yMm: Math.max(0, room.depthMm - thickness),
        widthMm: entrance.widthMm,
        heightMm: thickness,
      };
    case "LEFT":
      return {
        xMm: 0,
        yMm: entrance.offsetMm,
        widthMm: thickness,
        heightMm: entrance.widthMm,
      };
    case "RIGHT":
      return {
        xMm: Math.max(0, room.widthMm - thickness),
        yMm: entrance.offsetMm,
        widthMm: thickness,
        heightMm: entrance.widthMm,
      };
  }
}

export function roomElementToPlacement(element: RoomElement, room: SpaceFitLayout["room"]): PlacementElement {
  switch (element.type) {
    case "PILLAR":
    case "RESTROOM":
      return {
        elementId: element.elementId,
        kind: "RECT",
        collideAsRect: true,
        rect: {
          xMm: element.xMm,
          yMm: element.yMm,
          widthMm: element.widthMm,
          heightMm: element.heightMm,
        },
      };
    case "ENTRANCE":
      return {
        elementId: element.elementId,
        kind: "RECT",
        collideAsRect: true,
        rect: entranceToRect(element, room),
      };
    case "ELECTRICAL_POINT":
    case "WATER_POINT":
    case "DRAIN_POINT":
    case "EXHAUST_POINT":
      return {
        elementId: element.elementId,
        kind: "POINT",
        collideAsRect: false,
        point: { xMm: element.xMm, yMm: element.yMm },
      };
  }
}

export function validateLayoutGeometry(
  layout: SpaceFitLayout,
  definitions:
    | ReadonlyMap<string, EquipmentDefinition>
    | ReadonlyArray<EquipmentDefinition> = [],
): readonly GeometryWarning[] {
  const placements = layout.elements.map((element) => roomElementToPlacement(element, layout.room));
  const warnings: GeometryWarning[] = [
    ...validateElementPlacement(
      { widthMm: layout.room.widthMm, depthMm: layout.room.depthMm },
      placements,
    ),
  ];

  // Entrance: offset + width가 wall 길이를 넘으면 OUT_OF_BOUNDS (Risk 아님).
  for (const element of layout.elements) {
    if (element.type !== "ENTRANCE") continue;
    const wallLengthMm =
      element.wall === "TOP" || element.wall === "BOTTOM"
        ? layout.room.widthMm
        : layout.room.depthMm;
    if (element.offsetMm + element.widthMm > wallLengthMm) {
      warnings.push({
        code: "OUT_OF_BOUNDS",
        message: "Entrance offset+width exceeds wall length",
        elementId: element.elementId,
      });
    }
  }

  warnings.push(...validateEquipmentGeometry(layout, definitions));

  return Object.freeze(warnings);
}

export function formatMeasurementDisplay(
  dimension: MeasurementSet["values"][keyof MeasurementSet["values"]],
): string {
  if (!dimension) return "확인되지 않음";
  if (dimension.status === "UNKNOWN") return "확인되지 않음";
  return `${dimension.mm.toLocaleString("ko-KR")} mm`;
}
