/**
 * Domain mm ↔ SVG 좌표 변환.
 * React Component에 scale 로직을 흩뿌리지 않는다.
 * Viewport 크기 변화는 Domain mm를 바꾸지 않는다.
 */

export interface ViewTransform {
  /** pixel per mm */
  readonly scale: number;
  readonly offsetXPx: number;
  readonly offsetYPx: number;
}

export function mmToSvg(valueMm: number, scale: number): number {
  if (!Number.isFinite(valueMm) || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("mmToSvg requires finite value and positive scale");
  }
  return valueMm * scale;
}

export function svgToMm(valuePx: number, scale: number): number {
  if (!Number.isFinite(valuePx) || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("svgToMm requires finite value and positive scale");
  }
  return valuePx / scale;
}

/**
 * Room을 viewport에 fit. Domain 좌표는 변경하지 않고 scale/offset만 계산한다.
 * Phase 5A: Domain Y가 아래로 증가하므로 SVG와 방향이 같아 Y flip 없음.
 */
export function fitRoomToViewport(
  roomWidthMm: number,
  roomDepthMm: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  paddingPx: number = 24,
): ViewTransform {
  if (
    !Number.isFinite(roomWidthMm) ||
    !Number.isFinite(roomDepthMm) ||
    roomWidthMm <= 0 ||
    roomDepthMm <= 0 ||
    viewportWidthPx <= 0 ||
    viewportHeightPx <= 0
  ) {
    throw new RangeError("fitRoomToViewport requires positive room and viewport sizes");
  }
  const usableW = Math.max(1, viewportWidthPx - paddingPx * 2);
  const usableH = Math.max(1, viewportHeightPx - paddingPx * 2);
  const scale = Math.min(usableW / roomWidthMm, usableH / roomDepthMm);
  const drawnW = roomWidthMm * scale;
  const drawnH = roomDepthMm * scale;
  return Object.freeze({
    scale,
    offsetXPx: paddingPx + (usableW - drawnW) / 2,
    offsetYPx: paddingPx + (usableH - drawnH) / 2,
  });
}

export function pointMmToSvg(
  point: { xMm: number; yMm: number },
  transform: ViewTransform,
): { xPx: number; yPx: number } {
  return {
    xPx: transform.offsetXPx + mmToSvg(point.xMm, transform.scale),
    yPx: transform.offsetYPx + mmToSvg(point.yMm, transform.scale),
  };
}

export function pointSvgToMm(
  point: { xPx: number; yPx: number },
  transform: ViewTransform,
): { xMm: number; yMm: number } {
  return {
    xMm: svgToMm(point.xPx - transform.offsetXPx, transform.scale),
    yMm: svgToMm(point.yPx - transform.offsetYPx, transform.scale),
  };
}
