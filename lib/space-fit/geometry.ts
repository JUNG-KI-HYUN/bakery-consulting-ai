/**
 * SPACE FIT Geometry — 순수함수.
 * React/DOM을 import하지 않는다.
 *
 * 좌표계 (Phase 5A):
 * - 원점 (0,0) = room 좌측 상단
 * - X 오른쪽 증가, Y 아래쪽 증가
 * - 단위 mm 정수
 *
 * Rectangle overlap:
 * - 면적이 실제로 겹칠 때만 OVERLAP
 * - edge touch만 있으면 overlap 아님 (strict inequality)
 */

export interface PointMm {
  readonly xMm: number;
  readonly yMm: number;
}

export interface RectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface RoomBoundsMm {
  readonly widthMm: number;
  readonly depthMm: number;
}

export type GeometryWarningCode = "OUT_OF_BOUNDS" | "OVERLAP" | "INVALID_GEOMETRY";

export interface GeometryWarning {
  readonly code: GeometryWarningCode;
  readonly message: string;
  readonly elementId?: string;
  readonly otherElementId?: string;
}

const DEFAULT_GRID_MM = 100;

/** 가장 가까운 grid 배수로 반올림. 양의 유한 수만 허용. */
export function snapToGridMm(valueMm: number, gridMm: number = DEFAULT_GRID_MM): number {
  if (!Number.isFinite(valueMm) || !Number.isFinite(gridMm) || gridMm <= 0) {
    throw new RangeError("snapToGridMm requires finite value and positive grid");
  }
  return Math.round(valueMm / gridMm) * gridMm;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

export function isValidRect(rect: RectMm): boolean {
  return (
    isNonNegInt(rect.xMm) &&
    isNonNegInt(rect.yMm) &&
    isPositiveInt(rect.widthMm) &&
    isPositiveInt(rect.heightMm)
  );
}

export function isPointInsideRoom(point: PointMm, room: RoomBoundsMm): boolean {
  if (!isNonNegInt(point.xMm) || !isNonNegInt(point.yMm)) return false;
  if (!isPositiveInt(room.widthMm) || !isPositiveInt(room.depthMm)) return false;
  return point.xMm <= room.widthMm && point.yMm <= room.depthMm;
}

/**
 * Rectangle이 room 경계 안에 완전히 포함되는지.
 * 경계선에 맞닿은 경우는 내부로 인정한다.
 */
export function isRectInsideRoom(rect: RectMm, room: RoomBoundsMm): boolean {
  if (!isValidRect(rect)) return false;
  if (!isPositiveInt(room.widthMm) || !isPositiveInt(room.depthMm)) return false;
  return (
    rect.xMm >= 0 &&
    rect.yMm >= 0 &&
    rect.xMm + rect.widthMm <= room.widthMm &&
    rect.yMm + rect.heightMm <= room.depthMm
  );
}

/**
 * AABB overlap. 면적이 겹칠 때만 true.
 * edge touch (공유 변만 있는 경우)는 false.
 * 예: A.right === B.left → 겹치지 않음.
 */
export function rectsOverlap(a: RectMm, b: RectMm): boolean {
  if (!isValidRect(a) || !isValidRect(b)) return false;
  return (
    a.xMm < b.xMm + b.widthMm &&
    a.xMm + a.widthMm > b.xMm &&
    a.yMm < b.yMm + b.heightMm &&
    a.yMm + a.heightMm > b.yMm
  );
}

export function pointInRect(point: PointMm, rect: RectMm): boolean {
  if (!isValidRect(rect) || !isNonNegInt(point.xMm) || !isNonNegInt(point.yMm)) return false;
  return (
    point.xMm >= rect.xMm &&
    point.xMm <= rect.xMm + rect.widthMm &&
    point.yMm >= rect.yMm &&
    point.yMm <= rect.yMm + rect.heightMm
  );
}

export interface PlacementElement {
  readonly elementId: string;
  readonly kind: "RECT" | "POINT";
  readonly rect?: RectMm;
  readonly point?: PointMm;
  /** RECT끼리만 overlap 검사. POINT는 bounds만. */
  readonly collideAsRect: boolean;
}

/**
 * 요소 배치 검증. Risk/Verdict를 만들지 않는다.
 */
export function validateElementPlacement(
  room: RoomBoundsMm,
  elements: readonly PlacementElement[],
): readonly GeometryWarning[] {
  const warnings: GeometryWarning[] = [];

  for (const element of elements) {
    if (element.kind === "POINT") {
      if (!element.point) {
        warnings.push({
          code: "INVALID_GEOMETRY",
          message: "Point element requires coordinates",
          elementId: element.elementId,
        });
        continue;
      }
      if (!isPointInsideRoom(element.point, room)) {
        warnings.push({
          code: "OUT_OF_BOUNDS",
          message: "Point is outside the room",
          elementId: element.elementId,
        });
      }
      continue;
    }

    if (!element.rect || !isValidRect(element.rect)) {
      warnings.push({
        code: "INVALID_GEOMETRY",
        message: "Rectangle element has invalid geometry",
        elementId: element.elementId,
      });
      continue;
    }
    if (!isRectInsideRoom(element.rect, room)) {
      warnings.push({
        code: "OUT_OF_BOUNDS",
        message: "Rectangle is outside the room",
        elementId: element.elementId,
      });
    }
  }

  const rectElements = elements.filter(
    (item) => item.collideAsRect && item.rect && isValidRect(item.rect),
  );
  for (let i = 0; i < rectElements.length; i += 1) {
    for (let j = i + 1; j < rectElements.length; j += 1) {
      const left = rectElements[i];
      const right = rectElements[j];
      if (!left?.rect || !right?.rect) continue;
      if (rectsOverlap(left.rect, right.rect)) {
        warnings.push({
          code: "OVERLAP",
          message: "Rectangles overlap",
          elementId: left.elementId,
          otherElementId: right.elementId,
        });
      }
    }
  }

  // Point inside a colliding rect (e.g. pillar) — soft geometry warning only.
  const solidRects = rectElements;
  for (const element of elements) {
    if (element.kind !== "POINT" || !element.point) continue;
    for (const solid of solidRects) {
      if (!solid.rect) continue;
      if (pointInRect(element.point, solid.rect)) {
        warnings.push({
          code: "OVERLAP",
          message: "Point lies inside a rectangular element",
          elementId: element.elementId,
          otherElementId: solid.elementId,
        });
      }
    }
  }

  return Object.freeze(warnings);
}
