/**
 * Viewport zoom/pan — Domain mm는 변경하지 않는다.
 * Phase 5A ViewTransform을 확장한다. 두 번째 coordinate engine을 만들지 않는다.
 */

import { fitRoomToViewport, type ViewTransform } from "./coords";

/** 제한형 zoom 배수 (50% … 200%). */
export const SPACE_FIT_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type SpaceFitZoomFactor = (typeof SPACE_FIT_ZOOM_STEPS)[number];

export const SPACE_FIT_DEFAULT_ZOOM_INDEX = SPACE_FIT_ZOOM_STEPS.indexOf(1);

export interface SpaceFitViewportControls {
  /** fitRoomToViewport 결과 (zoom 100% 기준). */
  readonly fit: ViewTransform;
  readonly zoomIndex: number;
  /** 추가 pan (SVG px). zoom/pan만 영향. */
  readonly panXPx: number;
  readonly panYPx: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
}

export function zoomFactorAt(zoomIndex: number): SpaceFitZoomFactor {
  const clamped = Math.max(0, Math.min(SPACE_FIT_ZOOM_STEPS.length - 1, zoomIndex));
  return SPACE_FIT_ZOOM_STEPS[clamped] ?? 1;
}

/**
 * fit + zoom(viewport center) + pan → 최종 ViewTransform.
 * Domain mm는 입력/출력에 포함되지 않는다.
 */
export function composeViewportTransform(controls: SpaceFitViewportControls): ViewTransform {
  const zoom = zoomFactorAt(controls.zoomIndex);
  const scale = controls.fit.scale * zoom;
  const cx = controls.viewportWidthPx / 2;
  const cy = controls.viewportHeightPx / 2;
  const ratio = scale / controls.fit.scale;
  return Object.freeze({
    scale,
    offsetXPx: cx - (cx - controls.fit.offsetXPx) * ratio + controls.panXPx,
    offsetYPx: cy - (cy - controls.fit.offsetYPx) * ratio + controls.panYPx,
  });
}

export function createFitViewportControls(input: {
  roomWidthMm: number;
  roomDepthMm: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  paddingPx?: number;
  zoomIndex?: number;
  panXPx?: number;
  panYPx?: number;
}): SpaceFitViewportControls {
  const fit = fitRoomToViewport(
    input.roomWidthMm,
    input.roomDepthMm,
    input.viewportWidthPx,
    input.viewportHeightPx,
    input.paddingPx ?? 28,
  );
  return Object.freeze({
    fit,
    zoomIndex: input.zoomIndex ?? SPACE_FIT_DEFAULT_ZOOM_INDEX,
    panXPx: input.panXPx ?? 0,
    panYPx: input.panYPx ?? 0,
    viewportWidthPx: input.viewportWidthPx,
    viewportHeightPx: input.viewportHeightPx,
  });
}

/** [전체 보기] — zoom/pan만 초기화. Domain Layout 불변. */
export function resetViewportToFit(
  controls: SpaceFitViewportControls,
): SpaceFitViewportControls {
  return Object.freeze({
    ...controls,
    zoomIndex: SPACE_FIT_DEFAULT_ZOOM_INDEX,
    panXPx: 0,
    panYPx: 0,
  });
}

export function stepZoomIn(zoomIndex: number): number {
  return Math.min(SPACE_FIT_ZOOM_STEPS.length - 1, zoomIndex + 1);
}

export function stepZoomOut(zoomIndex: number): number {
  return Math.max(0, zoomIndex - 1);
}

export function applyPanDelta(
  controls: SpaceFitViewportControls,
  deltaXPx: number,
  deltaYPx: number,
): SpaceFitViewportControls {
  return Object.freeze({
    ...controls,
    panXPx: controls.panXPx + deltaXPx,
    panYPx: controls.panYPx + deltaYPx,
  });
}
