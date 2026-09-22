import type { MeasurementSet } from "../field/measurement";
import { createEmptyLayout, type SpaceFitLayout, type SpaceFitRoom } from "./types";

export type CreateLayoutFromMeasurementResult =
  | { readonly ok: true; readonly layout: SpaceFitLayout }
  | { readonly ok: false; readonly code: "MISSING_ROOM_DIMENSIONS"; readonly message: string };

/**
 * FIELD MeasurementSet에서 Layout을 만든다.
 * roomWidthMm / roomDepthMm가 KNOWN이 아니면 생성하지 않는다.
 * 가짜 기본 치수를 쓰지 않는다.
 * 기둥 좌표는 FIELD에 없으므로 자동 생성하지 않는다.
 * 출입구 위치도 자동 생성하지 않는다 (width만 나중에 직원이 지정 시 사용).
 */
export function createLayoutFromMeasurement(input: {
  measurement: MeasurementSet;
  consultationId?: string;
  createdAt: string;
}): CreateLayoutFromMeasurementResult {
  const width = input.measurement.values.roomWidthMm;
  const depth = input.measurement.values.roomDepthMm;
  if (!width || width.status !== "KNOWN" || !depth || depth.status !== "KNOWN") {
    return {
      ok: false,
      code: "MISSING_ROOM_DIMENSIONS",
      message:
        "공간 실측정보가 필요합니다. FIELD 실측·구조에서 내부 가로와 깊이를 먼저 확인해 주세요.",
    };
  }

  const ceiling = input.measurement.values.ceilingHeightMm;
  const room: SpaceFitRoom = Object.freeze({
    shape: "RECTANGLE" as const,
    widthMm: width.mm,
    depthMm: depth.mm,
    ...(ceiling?.status === "KNOWN" ? { ceilingHeightMm: ceiling.mm } : {}),
  });

  const layout = createEmptyLayout({
    candidateStoreId: input.measurement.candidateStoreId,
    surveyId: input.measurement.surveyId,
    measurementId: input.measurement.measurementId,
    consultationId: input.consultationId,
    room,
    createdAt: input.createdAt,
  });

  return { ok: true, layout };
}
