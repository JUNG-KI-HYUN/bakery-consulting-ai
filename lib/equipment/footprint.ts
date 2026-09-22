/**
 * Equipment footprint — Definition dimensions + Instance rotation.
 * UNKNOWN dimension → unavailable. 가짜 footprint 금지.
 */

import type {
  EquipmentDefinition,
  EquipmentDimensionMm,
  EquipmentRotationDeg,
} from "./types";

export type EquipmentFootprintResult =
  | {
      readonly ok: true;
      readonly widthMm: number;
      readonly depthMm: number;
      readonly rotationDeg: EquipmentRotationDeg;
    }
  | {
      readonly ok: false;
      readonly code: "DIMENSION_UNKNOWN" | "DIMENSION_MISSING";
      readonly message: string;
    };

function knownMm(dimension: EquipmentDimensionMm | undefined): number | null {
  if (!dimension) return null;
  if (dimension.status === "UNKNOWN") return null;
  return dimension.mm;
}

/**
 * 0°: width×depth 유지
 * 90°: width↔depth swap
 * height는 footprint에 사용하지 않음
 */
export function getEquipmentFootprint(
  definition: EquipmentDefinition,
  rotationDeg: EquipmentRotationDeg,
): EquipmentFootprintResult {
  const width = definition.dimensions.widthMm;
  const depth = definition.dimensions.depthMm;
  if (!width || !depth) {
    return {
      ok: false,
      code: "DIMENSION_MISSING",
      message: "widthMm and depthMm are required for footprint",
    };
  }
  if (width.status === "UNKNOWN" || depth.status === "UNKNOWN") {
    return {
      ok: false,
      code: "DIMENSION_UNKNOWN",
      message: "footprint unavailable when width or depth is UNKNOWN",
    };
  }
  const widthMm = knownMm(width);
  const depthMm = knownMm(depth);
  if (widthMm === null || depthMm === null) {
    return {
      ok: false,
      code: "DIMENSION_UNKNOWN",
      message: "footprint unavailable when width or depth is UNKNOWN",
    };
  }
  if (rotationDeg === 90) {
    return Object.freeze({
      ok: true as const,
      widthMm: depthMm,
      depthMm: widthMm,
      rotationDeg,
    });
  }
  return Object.freeze({
    ok: true as const,
    widthMm,
    depthMm,
    rotationDeg: 0 as const,
  });
}
