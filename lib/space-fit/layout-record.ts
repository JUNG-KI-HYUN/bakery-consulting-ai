import { isCandidateStoreId, isMeasurementId, isSiteSurveyId } from "../field/identifiers";
import { parseEquipmentInstance } from "../equipment/validation";
import type { EquipmentInstance } from "../equipment/types";
import { isElementId, isLayoutId } from "./identifiers";
import {
  SPACE_FIT_LAYOUT_SCHEMA_VERSION,
  type EntranceElement,
  type FacilityPointElement,
  type PillarElement,
  type RestroomElement,
  type RoomElement,
  type RoomWall,
  type SpaceFitLayout,
  type SpaceFitRoom,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function parseRoom(value: unknown): SpaceFitRoom | null {
  if (!isRecord(value)) return null;
  if (value.shape !== "RECTANGLE") return null;
  if (!isPositiveInt(value.widthMm) || !isPositiveInt(value.depthMm)) return null;
  const room: SpaceFitRoom = {
    shape: "RECTANGLE",
    widthMm: value.widthMm,
    depthMm: value.depthMm,
  };
  if (value.ceilingHeightMm !== undefined) {
    if (!isPositiveInt(value.ceilingHeightMm)) return null;
    return Object.freeze({ ...room, ceilingHeightMm: value.ceilingHeightMm });
  }
  return Object.freeze(room);
}

function parseWall(value: unknown): RoomWall | null {
  return value === "TOP" || value === "RIGHT" || value === "BOTTOM" || value === "LEFT"
    ? value
    : null;
}

function parseEntrance(record: Record<string, unknown>): EntranceElement | null {
  const wall = parseWall(record.wall);
  if (!wall) return null;
  if (!isNonNegInt(record.offsetMm) || !isPositiveInt(record.widthMm)) return null;
  if (!isElementId(record.elementId)) return null;
  return Object.freeze({
    elementId: record.elementId,
    type: "ENTRANCE" as const,
    wall,
    offsetMm: record.offsetMm,
    widthMm: record.widthMm,
    ...(typeof record.note === "string" && record.note.trim()
      ? { note: record.note.trim() }
      : {}),
  });
}

function parsePillar(record: Record<string, unknown>): PillarElement | null {
  if (!isElementId(record.elementId)) return null;
  if (
    !isNonNegInt(record.xMm) ||
    !isNonNegInt(record.yMm) ||
    !isPositiveInt(record.widthMm) ||
    !isPositiveInt(record.heightMm)
  ) {
    return null;
  }
  return Object.freeze({
    elementId: record.elementId,
    type: "PILLAR" as const,
    xMm: record.xMm,
    yMm: record.yMm,
    widthMm: record.widthMm,
    heightMm: record.heightMm,
    ...(typeof record.note === "string" && record.note.trim()
      ? { note: record.note.trim() }
      : {}),
  });
}

function parseRestroom(record: Record<string, unknown>): RestroomElement | null {
  if (!isElementId(record.elementId)) return null;
  if (
    !isNonNegInt(record.xMm) ||
    !isNonNegInt(record.yMm) ||
    !isPositiveInt(record.widthMm) ||
    !isPositiveInt(record.heightMm)
  ) {
    return null;
  }
  return Object.freeze({
    elementId: record.elementId,
    type: "RESTROOM" as const,
    xMm: record.xMm,
    yMm: record.yMm,
    widthMm: record.widthMm,
    heightMm: record.heightMm,
    ...(typeof record.note === "string" && record.note.trim()
      ? { note: record.note.trim() }
      : {}),
  });
}

function parseFacilityPoint(record: Record<string, unknown>): FacilityPointElement | null {
  const type = record.type;
  if (
    type !== "ELECTRICAL_POINT" &&
    type !== "WATER_POINT" &&
    type !== "DRAIN_POINT" &&
    type !== "EXHAUST_POINT"
  ) {
    return null;
  }
  if (!isElementId(record.elementId)) return null;
  if (!isNonNegInt(record.xMm) || !isNonNegInt(record.yMm)) return null;
  return Object.freeze({
    elementId: record.elementId,
    type,
    xMm: record.xMm,
    yMm: record.yMm,
    ...(typeof record.note === "string" && record.note.trim()
      ? { note: record.note.trim() }
      : {}),
  });
}

export function parseRoomElement(value: unknown): RoomElement | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "ENTRANCE":
      return parseEntrance(value);
    case "PILLAR":
      return parsePillar(value);
    case "RESTROOM":
      return parseRestroom(value);
    case "ELECTRICAL_POINT":
    case "WATER_POINT":
    case "DRAIN_POINT":
    case "EXHAUST_POINT":
      return parseFacilityPoint(value);
    default:
      return null;
  }
}

/**
 * Layout JSON 파싱.
 * productionSalesSpace / deliveryPath 필드는 허용하지 않는다 (중복저장 방지).
 */
export function parseSpaceFitLayout(value: unknown): SpaceFitLayout | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== SPACE_FIT_LAYOUT_SCHEMA_VERSION) return null;
  if (!isLayoutId(value.layoutId)) return null;
  if (!isCandidateStoreId(value.candidateStoreId)) return null;
  if (!isSiteSurveyId(value.surveyId)) return null;
  if (!isMeasurementId(value.measurementId)) return null;
  if (
    typeof value.layoutVersion !== "number" ||
    !Number.isInteger(value.layoutVersion) ||
    value.layoutVersion < 1
  ) {
    return null;
  }
  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") return null;
  if (typeof value.updatedAt !== "string" || value.updatedAt.trim() === "") return null;
  if ("productionSalesSpace" in value || "deliveryPath" in value) return null;
  // Definition 카탈로그를 Layout에 넣지 않는다
  if ("equipmentDefinitions" in value || "equipmentDefinition" in value) return null;

  const room = parseRoom(value.room);
  if (!room) return null;
  if (!Array.isArray(value.elements)) return null;
  const elements: RoomElement[] = [];
  for (const item of value.elements) {
    const parsed = parseRoomElement(item);
    if (!parsed) return null;
    elements.push(parsed);
  }

  let equipmentInstances: readonly EquipmentInstance[] | undefined;
  if (value.equipmentInstances !== undefined) {
    if (!Array.isArray(value.equipmentInstances)) return null;
    const instances: EquipmentInstance[] = [];
    for (const item of value.equipmentInstances) {
      const parsed = parseEquipmentInstance(item);
      if (!parsed) return null;
      if (parsed.layoutId !== value.layoutId) return null;
      instances.push(parsed);
    }
    equipmentInstances = Object.freeze(instances);
  }

  return Object.freeze({
    schemaVersion: SPACE_FIT_LAYOUT_SCHEMA_VERSION,
    layoutId: value.layoutId,
    candidateStoreId: value.candidateStoreId,
    surveyId: value.surveyId,
    measurementId: value.measurementId,
    ...(typeof value.consultationId === "string" && value.consultationId.trim()
      ? { consultationId: value.consultationId.trim() }
      : {}),
    layoutVersion: value.layoutVersion,
    room,
    elements: Object.freeze(elements),
    ...(equipmentInstances ? { equipmentInstances } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}
