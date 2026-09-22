import type { MeasurementSet } from "../field/measurement";
import type { RoomElement, SpaceFitLayout } from "./types";
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

export function validateLayoutGeometry(layout: SpaceFitLayout): readonly GeometryWarning[] {
  const placements = layout.elements.map((element) => roomElementToPlacement(element, layout.room));
  return validateElementPlacement(
    { widthMm: layout.room.widthMm, depthMm: layout.room.depthMm },
    placements,
  );
}

export function formatMeasurementDisplay(
  dimension: MeasurementSet["values"][keyof MeasurementSet["values"]],
): string {
  if (!dimension) return "확인되지 않음";
  if (dimension.status === "UNKNOWN") return "확인되지 않음";
  return `${dimension.mm.toLocaleString("ko-KR")} mm`;
}
