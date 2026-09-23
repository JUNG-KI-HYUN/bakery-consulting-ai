/**
 * Editor Domain helpers — dirty / warning summary / element patch.
 * Risk/Verdict를 만들지 않는다.
 */

import type { GeometryWarning, GeometryWarningCode } from "./geometry";
import type { RoomElement, SpaceFitLayout } from "./types";
import { withLayoutElements } from "./history";

export type SpaceFitSaveUiStatus =
  | "saved"
  | "dirty"
  | "saving"
  | "save_ok"
  | "save_failed"
  | "conflict";

export function saveStatusLabel(status: SpaceFitSaveUiStatus): string {
  switch (status) {
    case "saved":
      return "저장됨";
    case "dirty":
      return "저장하지 않은 변경 있음";
    case "saving":
      return "저장 중";
    case "save_ok":
      return "저장 완료";
    case "save_failed":
      return "저장 실패";
    case "conflict":
      return "다른 기기에서 먼저 저장됨. 다시 열어 확인하세요.";
  }
}

export function summarizeGeometryWarnings(warnings: readonly GeometryWarning[]): {
  readonly outOfBounds: number;
  readonly overlap: number;
  readonly invalid: number;
} {
  let outOfBounds = 0;
  let overlap = 0;
  let invalid = 0;
  for (const warning of warnings) {
    if (warning.code === "OUT_OF_BOUNDS") outOfBounds += 1;
    else if (warning.code === "OVERLAP") overlap += 1;
    else if (warning.code === "INVALID_GEOMETRY") invalid += 1;
  }
  return Object.freeze({ outOfBounds, overlap, invalid });
}

export function hasInvalidGeometry(warnings: readonly GeometryWarning[]): boolean {
  return warnings.some((item) => item.code === "INVALID_GEOMETRY");
}

/** OUT_OF_BOUNDS / OVERLAP은 저장 허용. INVALID만 차단. */
export function canPersistLayout(warnings: readonly GeometryWarning[]): boolean {
  return !hasInvalidGeometry(warnings);
}

export function patchElement(
  layout: SpaceFitLayout,
  elementId: string,
  patch: Partial<RoomElement>,
): SpaceFitLayout {
  const elements = layout.elements.map((item) => {
    if (item.elementId !== elementId) return item;
    return Object.freeze({ ...item, ...patch }) as RoomElement;
  });
  return withLayoutElements(layout, elements);
}

export function replaceElement(
  layout: SpaceFitLayout,
  next: RoomElement,
): SpaceFitLayout {
  const elements = layout.elements.map((item) =>
    item.elementId === next.elementId ? next : item,
  );
  return withLayoutElements(layout, elements);
}

export function removeElement(layout: SpaceFitLayout, elementId: string): SpaceFitLayout {
  return withLayoutElements(
    layout,
    layout.elements.filter((item) => item.elementId !== elementId),
  );
}

export function warningCodesAreGeometryOnly(
  warnings: readonly GeometryWarning[],
): boolean {
  const allowed: GeometryWarningCode[] = ["OUT_OF_BOUNDS", "OVERLAP", "INVALID_GEOMETRY"];
  return warnings.every((item) => allowed.includes(item.code));
}

export function elementWarningCodes(
  warnings: readonly GeometryWarning[],
  elementId: string,
): readonly GeometryWarningCode[] {
  return Object.freeze(
    warnings
      .filter(
        (item) => item.elementId === elementId || item.otherElementId === elementId,
      )
      .map((item) => item.code),
  );
}
