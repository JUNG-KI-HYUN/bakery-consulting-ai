import type { RadiusLivingPopulationAnalysis } from "./radius-living-population";
import type { AnalysisRunSnapshot, BasicLocationRadiusMeters } from "./run";

export const LIVING_POPULATION_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type LivingPopulationDayOfWeek =
  (typeof LIVING_POPULATION_DAYS)[number];

export interface RadiusLivingPopulationApiRequest {
  analysisRunId: string;
  lat: number;
  lng: number;
  radiusMeters: BasicLocationRadiusMeters;
}

export type RadiusLivingPopulationRuntimeAnalysis = Omit<
  RadiusLivingPopulationAnalysis,
  "includedCellIds" | "excludedMetricOnlyCellIds"
>;

export interface RadiusLivingPopulationApiResponse {
  analysis: Readonly<RadiusLivingPopulationRuntimeAnalysis>;
  referenceDate: string;
  dayOfWeek: LivingPopulationDayOfWeek;
}

export function toRadiusLivingPopulationApiResponse(value: {
  analysis: Readonly<RadiusLivingPopulationAnalysis>;
  referenceDate: string;
  dayOfWeek: LivingPopulationDayOfWeek;
}): RadiusLivingPopulationApiResponse {
  const analysisRecord = { ...value.analysis } as unknown as Record<string, unknown>;
  delete analysisRecord.includedCellIds;
  delete analysisRecord.excludedMetricOnlyCellIds;
  const analysis = analysisRecord as unknown as RadiusLivingPopulationRuntimeAnalysis;
  return {
    analysis,
    referenceDate: value.referenceDate,
    dayOfWeek: value.dayOfWeek,
  };
}

export interface LivingPopulationSourceState {
  status: "idle" | "loading" | "success" | "error";
  response: RadiusLivingPopulationApiResponse | null;
  error: string | null;
  analysisRunId: string | null;
  completedAt: string | null;
}

export class RadiusLivingPopulationRuntimeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadiusLivingPopulationRuntimeValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RadiusLivingPopulationRuntimeValidationError(`${path} must be a finite number.`);
  }
  return value;
}

export function createRadiusLivingPopulationApiRequest(
  snapshot: AnalysisRunSnapshot,
): RadiusLivingPopulationApiRequest {
  return {
    analysisRunId: snapshot.analysisRunId,
    lat: snapshot.target.latitude,
    lng: snapshot.target.longitude,
    radiusMeters: snapshot.target.radiusMeters,
  };
}

export function parseRadiusLivingPopulationApiRequest(
  value: unknown,
): RadiusLivingPopulationApiRequest {
  if (!isRecord(value)) {
    throw new RadiusLivingPopulationRuntimeValidationError("Request body must be an object.");
  }
  const allowedKeys = new Set(["analysisRunId", "lat", "lng", "radiusMeters"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new RadiusLivingPopulationRuntimeValidationError("Request body contains unsupported fields.");
  }
  if (typeof value.analysisRunId !== "string" || value.analysisRunId.trim().length === 0) {
    throw new RadiusLivingPopulationRuntimeValidationError("analysisRunId must not be empty.");
  }
  const lat = requireFiniteNumber(value.lat, "lat");
  const lng = requireFiniteNumber(value.lng, "lng");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new RadiusLivingPopulationRuntimeValidationError("Coordinates are outside WGS84 bounds.");
  }
  if (value.radiusMeters !== 300 && value.radiusMeters !== 500) {
    throw new RadiusLivingPopulationRuntimeValidationError("radiusMeters must be 300 or 500.");
  }
  return {
    analysisRunId: value.analysisRunId,
    lat,
    lng,
    radiusMeters: value.radiusMeters,
  };
}

export function parseRadiusLivingPopulationApiResponse(
  value: unknown,
  expected: RadiusLivingPopulationApiRequest,
): RadiusLivingPopulationApiResponse {
  if (!isRecord(value) || !isRecord(value.analysis)) {
    throw new RadiusLivingPopulationRuntimeValidationError("Response analysis is missing.");
  }
  const analysis = value.analysis as unknown as RadiusLivingPopulationRuntimeAnalysis;
  if ("includedCellIds" in value.analysis || "excludedMetricOnlyCellIds" in value.analysis) {
    throw new RadiusLivingPopulationRuntimeValidationError("Response contains server-only cell identifiers.");
  }
  if (
    analysis.analysisRunId !== expected.analysisRunId ||
    analysis.radiusMeters !== expected.radiusMeters
  ) {
    throw new RadiusLivingPopulationRuntimeValidationError("Response belongs to a different analysis run.");
  }
  if (
    analysis.contractVersion !== "FRAMEONE_RADIUS_LIVING_POPULATION_V1" ||
    !Array.isArray(analysis.hourly) ||
    analysis.hourly.length !== 24 ||
    analysis.hourly.some((hour, index) => hour?.hour !== String(index).padStart(2, "0"))
  ) {
    throw new RadiusLivingPopulationRuntimeValidationError("Response does not satisfy the V1 24-hour contract.");
  }
  if (
    typeof value.referenceDate !== "string" ||
    value.referenceDate !== analysis.referenceDate ||
    !LIVING_POPULATION_DAYS.includes(value.dayOfWeek as LivingPopulationDayOfWeek)
  ) {
    throw new RadiusLivingPopulationRuntimeValidationError("Response reference date metadata is invalid.");
  }
  return value as unknown as RadiusLivingPopulationApiResponse;
}
