import { createMeasurementId, isMeasurementId, isCandidateStoreId, isSiteSurveyId } from "./identifiers";
import { isValidKnownMm } from "./measurement-units";

export const MEASUREMENT_SET_SCHEMA_VERSION = "measurement-v1" as const;

/**
 * 실측값 상태.
 * - KNOWN: 양의 정수 mm
 * - UNKNOWN: 직원이 명시적으로 "모름"을 기록 (0으로 저장하지 않음)
 * - 필드 생략(undefined): 아직 미응답(공란)
 */
export type MeasuredDimension =
  | { readonly status: "KNOWN"; readonly mm: number }
  | { readonly status: "UNKNOWN" };

export type PresenceAnswer = "YES" | "NO" | "UNKNOWN";

export interface MeasurementStructureNotes {
  /** 미응답이면 생략. UNKNOWN은 직원이 명시적으로 모름을 선택한 상태. */
  readonly pillarPresence?: PresenceAnswer;
  readonly pillarCount?: number;
  readonly levelStepPresence?: PresenceAnswer;
  readonly structuralNote?: string;
}

export interface MeasurementValues {
  readonly frontageMm?: MeasuredDimension;
  readonly roomWidthMm?: MeasuredDimension;
  readonly roomDepthMm?: MeasuredDimension;
  readonly ceilingHeightMm?: MeasuredDimension;
  readonly entranceWidthMm?: MeasuredDimension;
  readonly entranceHeightMm?: MeasuredDimension;
  readonly corridorWidthMm?: MeasuredDimension;
  readonly stairWidthMm?: MeasuredDimension;
  readonly elevatorDoorWidthMm?: MeasuredDimension;
}

/** SiteSurvey에 연결되는 활성 실측 세트. MVP는 Survey당 1개. */
export interface MeasurementSet {
  readonly schemaVersion: typeof MEASUREMENT_SET_SCHEMA_VERSION;
  readonly measurementId: string;
  readonly surveyId: string;
  readonly candidateStoreId: string;
  readonly measuredAt: string;
  readonly measuredBy: string;
  readonly values: MeasurementValues;
  readonly structure: MeasurementStructureNotes;
}

export const REQUIRED_MEASUREMENT_KEYS = [
  "frontageMm",
  "roomWidthMm",
  "roomDepthMm",
  "ceilingHeightMm",
  "entranceWidthMm",
  "entranceHeightMm",
] as const;

export type RequiredMeasurementKey = (typeof REQUIRED_MEASUREMENT_KEYS)[number];

export const OPTIONAL_MEASUREMENT_KEYS = [
  "corridorWidthMm",
  "stairWidthMm",
  "elevatorDoorWidthMm",
] as const;

export type OptionalMeasurementKey = (typeof OPTIONAL_MEASUREMENT_KEYS)[number];

export type MeasurementValueKey = RequiredMeasurementKey | OptionalMeasurementKey;

export function createKnownMm(mm: number): MeasuredDimension {
  if (!isValidKnownMm(mm)) {
    throw new RangeError("KNOWN measurement must be a positive finite integer mm");
  }
  return Object.freeze({ status: "KNOWN", mm });
}

export function createUnknownDimension(): MeasuredDimension {
  return Object.freeze({ status: "UNKNOWN" });
}

export function createEmptyMeasurementSet(input: {
  surveyId: string;
  candidateStoreId: string;
  measuredAt: string;
  measuredBy: string;
  measurementId?: string;
}): MeasurementSet {
  if (!isSiteSurveyId(input.surveyId)) {
    throw new RangeError("MeasurementSet.surveyId must be a SiteSurvey id");
  }
  if (!isCandidateStoreId(input.candidateStoreId)) {
    throw new RangeError("MeasurementSet.candidateStoreId must be a CandidateStore id");
  }
  const measurementId = input.measurementId ?? createMeasurementId();
  if (!isMeasurementId(measurementId)) {
    throw new RangeError("MeasurementSet.measurementId must use measurement_<uuid>");
  }
  return Object.freeze({
    schemaVersion: MEASUREMENT_SET_SCHEMA_VERSION,
    measurementId,
    surveyId: input.surveyId,
    candidateStoreId: input.candidateStoreId,
    measuredAt: input.measuredAt,
    measuredBy: input.measuredBy,
    values: Object.freeze({}),
    structure: Object.freeze({}),
  });
}

export function parseMeasuredDimension(value: unknown): MeasuredDimension | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.status === "UNKNOWN") {
    // 0으로 저장하지 않는다. mm 필드는 있으면 안 된다.
    if ("mm" in record) return null;
    return createUnknownDimension();
  }
  if (record.status === "KNOWN") {
    if (!isValidKnownMm(record.mm)) return null;
    return createKnownMm(record.mm);
  }
  return null;
}

function parsePresence(value: unknown): PresenceAnswer | null {
  return value === "YES" || value === "NO" || value === "UNKNOWN" ? value : null;
}

export function parseMeasurementSet(value: unknown): MeasurementSet | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== MEASUREMENT_SET_SCHEMA_VERSION) return null;
  if (!isMeasurementId(record.measurementId)) return null;
  if (!isSiteSurveyId(record.surveyId)) return null;
  if (!isCandidateStoreId(record.candidateStoreId)) return null;
  if (typeof record.measuredAt !== "string" || record.measuredAt.trim() === "") return null;
  if (typeof record.measuredBy !== "string" || record.measuredBy.trim() === "") return null;
  if (typeof record.values !== "object" || record.values === null || Array.isArray(record.values)) {
    return null;
  }
  if (typeof record.structure !== "object" || record.structure === null || Array.isArray(record.structure)) {
    return null;
  }

  const rawValues = record.values as Record<string, unknown>;
  const values: Record<string, MeasuredDimension> = {};
  for (const key of [...REQUIRED_MEASUREMENT_KEYS, ...OPTIONAL_MEASUREMENT_KEYS]) {
    if (!(key in rawValues) || rawValues[key] === undefined) continue;
    const parsed = parseMeasuredDimension(rawValues[key]);
    if (!parsed) return null;
    values[key] = parsed;
  }

  const structureRecord = record.structure as Record<string, unknown>;
  const pillarPresence =
    structureRecord.pillarPresence === undefined
      ? undefined
      : parsePresence(structureRecord.pillarPresence);
  if (structureRecord.pillarPresence !== undefined && !pillarPresence) return null;
  const levelStepPresence =
    structureRecord.levelStepPresence === undefined
      ? undefined
      : parsePresence(structureRecord.levelStepPresence);
  if (structureRecord.levelStepPresence !== undefined && !levelStepPresence) return null;
  if (
    structureRecord.pillarCount !== undefined &&
    (typeof structureRecord.pillarCount !== "number" ||
      !Number.isInteger(structureRecord.pillarCount) ||
      structureRecord.pillarCount < 0)
  ) {
    return null;
  }
  if (structureRecord.structuralNote !== undefined && typeof structureRecord.structuralNote !== "string") {
    return null;
  }
  const structuralNote = structureRecord.structuralNote?.trim();

  return Object.freeze({
    schemaVersion: MEASUREMENT_SET_SCHEMA_VERSION,
    measurementId: record.measurementId,
    surveyId: record.surveyId,
    candidateStoreId: record.candidateStoreId,
    measuredAt: record.measuredAt,
    measuredBy: record.measuredBy.trim(),
    values: Object.freeze(values) as MeasurementValues,
    structure: Object.freeze({
      ...(pillarPresence ? { pillarPresence } : {}),
      ...(typeof structureRecord.pillarCount === "number"
        ? { pillarCount: structureRecord.pillarCount }
        : {}),
      ...(levelStepPresence ? { levelStepPresence } : {}),
      ...(structuralNote ? { structuralNote } : {}),
    }),
  });
}
