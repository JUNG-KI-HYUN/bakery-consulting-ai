/**
 * Pointer → Domain mm 변환 및 요소 이동 (순수함수).
 * React/DOM을 import하지 않는다.
 *
 * 흐름: client → SVG local → viewport inverse → room mm → 100mm snap → Domain
 */

import { pointSvgToMm, type ViewTransform } from "./coords";
import { snapToGridMm } from "./geometry";
import type { RoomElement, RoomElementType } from "./types";

const DEFAULT_GRID_MM = 100;

export function isFreelyDraggableType(type: RoomElementType): boolean {
  return (
    type === "PILLAR" ||
    type === "RESTROOM" ||
    type === "ELECTRICAL_POINT" ||
    type === "WATER_POINT" ||
    type === "DRAIN_POINT" ||
    type === "EXHAUST_POINT"
  );
}

/**
 * SVG element.getBoundingClientRect()와 viewBox(0,0,w,h) 기준
 * client 좌표 → SVG local px.
 */
export function clientToSvgLocal(input: {
  clientX: number;
  clientY: number;
  svgRect: { left: number; top: number; width: number; height: number };
  viewBoxWidth: number;
  viewBoxHeight: number;
}): { xPx: number; yPx: number } {
  const { svgRect, viewBoxWidth, viewBoxHeight } = input;
  if (svgRect.width <= 0 || svgRect.height <= 0) {
    throw new RangeError("svgRect must have positive size");
  }
  return {
    xPx: ((input.clientX - svgRect.left) / svgRect.width) * viewBoxWidth,
    yPx: ((input.clientY - svgRect.top) / svgRect.height) * viewBoxHeight,
  };
}

/** SVG local → Domain mm (snap 전). */
export function svgLocalToDomainMm(
  local: { xPx: number; yPx: number },
  transform: ViewTransform,
): { xMm: number; yMm: number } {
  return pointSvgToMm(local, transform);
}

/** SVG local → snapped Domain mm. */
export function svgLocalToSnappedMm(
  local: { xPx: number; yPx: number },
  transform: ViewTransform,
  gridMm: number = DEFAULT_GRID_MM,
): { xMm: number; yMm: number } {
  const raw = svgLocalToDomainMm(local, transform);
  return {
    xMm: snapToGridMm(Math.max(0, raw.xMm), gridMm),
    yMm: snapToGridMm(Math.max(0, raw.yMm), gridMm),
  };
}

/**
 * client → snapped Domain mm (한 번에).
 * Zoom 2x / pan 후에도 같은 물리 위치는 동일 mm가 나와야 한다.
 */
export function clientPointerToSnappedMm(input: {
  clientX: number;
  clientY: number;
  svgRect: { left: number; top: number; width: number; height: number };
  viewBoxWidth: number;
  viewBoxHeight: number;
  transform: ViewTransform;
  gridMm?: number;
}): { xMm: number; yMm: number } {
  const local = clientToSvgLocal(input);
  return svgLocalToSnappedMm(local, input.transform, input.gridMm ?? DEFAULT_GRID_MM);
}

export function clientPointerToDomainMm(input: {
  clientX: number;
  clientY: number;
  svgRect: { left: number; top: number; width: number; height: number };
  viewBoxWidth: number;
  viewBoxHeight: number;
  transform: ViewTransform;
}): { xMm: number; yMm: number } {
  const local = clientToSvgLocal(input);
  return svgLocalToDomainMm(local, input.transform);
}

/** Drag 시작 시 요소 origin 대비 pointer 오프셋 (mm). */
export function dragGrabOffsetMm(
  element: RoomElement,
  pointerMm: { xMm: number; yMm: number },
): { offsetXMm: number; offsetYMm: number } | null {
  if (!isFreelyDraggableType(element.type)) return null;
  if (
    element.type === "PILLAR" ||
    element.type === "RESTROOM" ||
    element.type === "ELECTRICAL_POINT" ||
    element.type === "WATER_POINT" ||
    element.type === "DRAIN_POINT" ||
    element.type === "EXHAUST_POINT"
  ) {
    return {
      offsetXMm: pointerMm.xMm - element.xMm,
      offsetYMm: pointerMm.yMm - element.yMm,
    };
  }
  return null;
}

/**
 * pointer Domain mm + grab offset → 새 요소 위치 (snap 적용).
 * ENTRANCE는 null (wall 계약 유지).
 */
export function moveElementByPointerMm(
  element: RoomElement,
  pointerMm: { xMm: number; yMm: number },
  grab: { offsetXMm: number; offsetYMm: number },
  gridMm: number = DEFAULT_GRID_MM,
): RoomElement | null {
  if (!isFreelyDraggableType(element.type)) return null;
  const xMm = snapToGridMm(Math.max(0, pointerMm.xMm - grab.offsetXMm), gridMm);
  const yMm = snapToGridMm(Math.max(0, pointerMm.yMm - grab.offsetYMm), gridMm);
  if (
    element.type === "PILLAR" ||
    element.type === "RESTROOM" ||
    element.type === "ELECTRICAL_POINT" ||
    element.type === "WATER_POINT" ||
    element.type === "DRAIN_POINT" ||
    element.type === "EXHAUST_POINT"
  ) {
    return Object.freeze({ ...element, xMm, yMm });
  }
  return null;
}

export function snapPositionMm(
  xMm: number,
  yMm: number,
  gridMm: number = DEFAULT_GRID_MM,
): { xMm: number; yMm: number } {
  return {
    xMm: snapToGridMm(Math.max(0, xMm), gridMm),
    yMm: snapToGridMm(Math.max(0, yMm), gridMm),
  };
}
