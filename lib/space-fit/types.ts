import { isCandidateStoreId, isMeasurementId, isSiteSurveyId } from "../field/identifiers";
import { createElementId, createLayoutId, isElementId, isLayoutId } from "./identifiers";

export const SPACE_FIT_LAYOUT_SCHEMA_VERSION = "space-fit-layout-v1" as const;

export type RoomShape = "RECTANGLE";

export type RoomWall = "TOP" | "RIGHT" | "BOTTOM" | "LEFT";

export type RoomElementType =
  | "ENTRANCE"
  | "PILLAR"
  | "ELECTRICAL_POINT"
  | "WATER_POINT"
  | "DRAIN_POINT"
  | "EXHAUST_POINT"
  | "RESTROOM";

export interface SpaceFitRoom {
  readonly shape: RoomShape;
  /** MeasurementSet.roomWidthMm snapshot (KNOWN만). */
  readonly widthMm: number;
  /** MeasurementSet.roomDepthMm snapshot (KNOWN만). */
  readonly depthMm: number;
  /** 생성 시점 ceilingHeightMm (KNOWN일 때만). Domain 필수 아님. */
  readonly ceilingHeightMm?: number;
}

interface RoomElementBase {
  readonly elementId: string;
  readonly type: RoomElementType;
  readonly note?: string;
}

/** 벽면 출입구. 임의 위치 자동생성하지 않음 — 직원이 wall/offset을 지정. */
export interface EntranceElement extends RoomElementBase {
  readonly type: "ENTRANCE";
  readonly wall: RoomWall;
  readonly offsetMm: number;
  readonly widthMm: number;
}

export interface PillarElement extends RoomElementBase {
  readonly type: "PILLAR";
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface RestroomElement extends RoomElementBase {
  readonly type: "RESTROOM";
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface FacilityPointElement extends RoomElementBase {
  readonly type: "ELECTRICAL_POINT" | "WATER_POINT" | "DRAIN_POINT" | "EXHAUST_POINT";
  readonly xMm: number;
  readonly yMm: number;
}

export type RoomElement =
  | EntranceElement
  | PillarElement
  | RestroomElement
  | FacilityPointElement;

/**
 * SpaceFitLayout Domain.
 * Measurement/SpaceObservation을 복제하지 않고 ID로 연결한다.
 * room width/depth는 Layout 생성에 필요한 snapshot만 담는다.
 */
export interface SpaceFitLayout {
  readonly schemaVersion: typeof SPACE_FIT_LAYOUT_SCHEMA_VERSION;
  readonly layoutId: string;
  readonly candidateStoreId: string;
  readonly surveyId: string;
  readonly measurementId: string;
  readonly consultationId?: string;
  readonly layoutVersion: number;
  readonly room: SpaceFitRoom;
  readonly elements: readonly RoomElement[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function createEmptyLayout(input: {
  candidateStoreId: string;
  surveyId: string;
  measurementId: string;
  consultationId?: string;
  room: SpaceFitRoom;
  createdAt: string;
  layoutId?: string;
}): SpaceFitLayout {
  if (!isCandidateStoreId(input.candidateStoreId)) {
    throw new RangeError("SpaceFitLayout requires candidateStoreId");
  }
  if (!isSiteSurveyId(input.surveyId)) {
    throw new RangeError("SpaceFitLayout requires surveyId");
  }
  if (!isMeasurementId(input.measurementId)) {
    throw new RangeError("SpaceFitLayout requires measurementId");
  }
  if (
    !Number.isInteger(input.room.widthMm) ||
    !Number.isInteger(input.room.depthMm) ||
    input.room.widthMm <= 0 ||
    input.room.depthMm <= 0
  ) {
    throw new RangeError("SpaceFitRoom requires positive integer widthMm and depthMm");
  }
  const layoutId = input.layoutId ?? createLayoutId();
  if (!isLayoutId(layoutId)) {
    throw new RangeError("layoutId must use layout_<uuid>");
  }
  return Object.freeze({
    schemaVersion: SPACE_FIT_LAYOUT_SCHEMA_VERSION,
    layoutId,
    candidateStoreId: input.candidateStoreId,
    surveyId: input.surveyId,
    measurementId: input.measurementId,
    ...(input.consultationId ? { consultationId: input.consultationId } : {}),
    layoutVersion: 1,
    room: Object.freeze({ ...input.room }),
    elements: Object.freeze([]),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function createPillarElement(input: {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  note?: string;
}): PillarElement {
  return Object.freeze({
    elementId: createElementId(),
    type: "PILLAR" as const,
    xMm: input.xMm,
    yMm: input.yMm,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
}

export function createRestroomElement(input: {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  note?: string;
}): RestroomElement {
  return Object.freeze({
    elementId: createElementId(),
    type: "RESTROOM" as const,
    xMm: input.xMm,
    yMm: input.yMm,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
}

export function createFacilityPointElement(input: {
  type: FacilityPointElement["type"];
  xMm: number;
  yMm: number;
  note?: string;
}): FacilityPointElement {
  return Object.freeze({
    elementId: createElementId(),
    type: input.type,
    xMm: input.xMm,
    yMm: input.yMm,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
}

export function createEntranceElement(input: {
  wall: RoomWall;
  offsetMm: number;
  widthMm: number;
  note?: string;
}): EntranceElement {
  return Object.freeze({
    elementId: createElementId(),
    type: "ENTRANCE" as const,
    wall: input.wall,
    offsetMm: input.offsetMm,
    widthMm: input.widthMm,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
}

export function isElementIdValue(value: unknown): value is string {
  return isElementId(value);
}
