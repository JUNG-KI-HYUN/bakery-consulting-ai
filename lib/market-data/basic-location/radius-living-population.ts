import type { MarketDataObservation, MarketDataStatus } from "../types";
import type { BasicLocationRadiusMeters } from "./run";

export const RADIUS_LIVING_POPULATION_CONTRACT_VERSION =
  "FRAMEONE_RADIUS_LIVING_POPULATION_V1" as const;
export const RADIUS_LIVING_POPULATION_METHODOLOGY_VERSION =
  "RADIUS_LIVING_POPULATION_CENTROID_V1" as const;
export const RADIUS_LIVING_POPULATION_INCLUSION_METHOD =
  "CELL_CENTROID_WITHIN_RADIUS" as const;
export const RADIUS_LIVING_POPULATION_ROW_SEMANTICS =
  "SUM_H_DNG_ROWS_PER_CELL_HOUR" as const;

const EARTH_RADIUS_METERS = 6_371_000;
const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);

export type RadiusLivingPopulationStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "NOT_AVAILABLE";

export interface Wgs84Point {
  latitude: number;
  longitude: number;
}

export interface LivingPopulationGridFeature {
  id?: string | number;
  properties: {
    grid_id: string;
    source_id: string;
    geometry_version: string;
    output_crs: string;
    status: string;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
}

export interface RadiusLivingPopulationSourceContext {
  sourceId: "SRC-SEOUL-LIVING";
  sourceName: string;
  snapshotId: string;
  referenceDate: string;
  locator: string;
}

export interface RadiusLivingPopulationGeometryContext {
  sourceId: string;
  geometryVersion: string;
  outputCrs: "EPSG:4326";
  locator: string;
}

export interface BuildRadiusLivingPopulationIndexInput {
  observations: Iterable<MarketDataObservation>;
  gridFeatures: Iterable<LivingPopulationGridFeature>;
  source: RadiusLivingPopulationSourceContext;
  geometry: RadiusLivingPopulationGeometryContext;
}

export interface RadiusLivingPopulationIndex {
  readonly source: Readonly<RadiusLivingPopulationSourceContext>;
  readonly geometry: Readonly<RadiusLivingPopulationGeometryContext>;
  readonly geometryCellCount: number;
  readonly metricCellCount: number;
  readonly matchedCellCount: number;
  readonly metricOnlyCellIds: readonly string[];
  readonly geometryOnlyCellIds: readonly string[];
  readonly duplicateCellHourCombinationCount: number;
  readonly maxAdministrativeDongRowsPerCellHour: number;
  readonly rowSemantics: typeof RADIUS_LIVING_POPULATION_ROW_SEMANTICS;
}

export interface RadiusLivingPopulationLimitation {
  code: string;
  message: string;
}

export interface RadiusLivingPopulationHour {
  hour: string;
  population: number | null;
  status: RadiusLivingPopulationStatus;
  includedCellCount: number;
  contributingCellCount: number;
  completeCellCount: number;
  partiallyKnownCellCount: number;
  unavailableCellCount: number;
  noObservationCellCount: number;
  suppressedObservationCount: number;
  missingObservationCount: number;
  invalidObservationCount: number;
  excludedMetricOnlyCellCount: number;
}

export interface RadiusLivingPopulationSummary {
  status: RadiusLivingPopulationStatus;
  observedPeakHour: string | null;
  observedPeakPopulation: number | null;
  observedMinimumHour: string | null;
  observedMinimumPopulation: number | null;
  dailyMeanPopulation: number | null;
  meaning: "REFERENCE_DATE_24_HOUR_PROFILE";
}

export interface RadiusLivingPopulationAnalysis {
  contractVersion: typeof RADIUS_LIVING_POPULATION_CONTRACT_VERSION;
  analysisRunId: string;
  generatedAt: string;
  sourceId: "SRC-SEOUL-LIVING";
  sourceSnapshotId: string;
  referenceDate: string;
  radiusMeters: BasicLocationRadiusMeters;
  analysisUnit: "RADIUS_300M" | "RADIUS_500M";
  inclusionMethod: typeof RADIUS_LIVING_POPULATION_INCLUSION_METHOD;
  rowSemantics: typeof RADIUS_LIVING_POPULATION_ROW_SEMANTICS;
  includedCellCount: number;
  includedCellIds: readonly string[];
  includedMetricCellCount: number;
  geometryOnlyIncludedCellCount: number;
  excludedMetricOnlyCellCount: number;
  excludedMetricOnlyCellIds: readonly string[];
  hourly: readonly RadiusLivingPopulationHour[];
  summary: Readonly<RadiusLivingPopulationSummary>;
  limitations: readonly RadiusLivingPopulationLimitation[];
  lineage: Readonly<{
    livingPopulation: Readonly<RadiusLivingPopulationSourceContext>;
    gridGeometry: Readonly<RadiusLivingPopulationGeometryContext>;
    methodology: Readonly<{
      version: typeof RADIUS_LIVING_POPULATION_METHODOLOGY_VERSION;
      inclusionMethod: typeof RADIUS_LIVING_POPULATION_INCLUSION_METHOD;
      rowSemantics: typeof RADIUS_LIVING_POPULATION_ROW_SEMANTICS;
    }>;
  }>;
}

export interface RadiusLivingPopulationRunInput {
  analysisRunId: string;
  createdAt: string;
  target: Readonly<{
    latitude: number;
    longitude: number;
    radiusMeters: BasicLocationRadiusMeters;
  }>;
}

interface MutableCellHour {
  rows: Array<{
    administrativeDongCode: string;
    status: MarketDataStatus;
    value: number | null;
  }>;
}

interface CellHourAggregate {
  knownPopulation: number | null;
  observationCount: number;
  suppressedObservationCount: number;
  missingObservationCount: number;
  invalidObservationCount: number;
  isComplete: boolean;
}

interface InternalIndexData {
  centroidsByCellId: ReadonlyMap<string, Wgs84Point>;
  observationsByCellHour: ReadonlyMap<string, CellHourAggregate>;
  metricCellIds: ReadonlySet<string>;
  metricOnlyCellsByHour: ReadonlyMap<string, ReadonlySet<string>>;
}

const INDEX_DATA = new WeakMap<RadiusLivingPopulationIndex, InternalIndexData>();

export class RadiusLivingPopulationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadiusLivingPopulationValidationError";
  }
}

function requireNonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new RadiusLivingPopulationValidationError(`${path}가 비어 있습니다.`);
  }
}

function normalizedReferenceDate(value: string): string {
  const compact = value.replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) {
    throw new RadiusLivingPopulationValidationError(
      "referenceDate는 YYYY-MM-DD 또는 YYYYMMDD 형식이어야 합니다.",
    );
  }
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RadiusLivingPopulationValidationError(
      "referenceDate가 유효한 날짜가 아닙니다.",
    );
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function requirePoint(point: Wgs84Point, path: string): void {
  if (
    !Number.isFinite(point.latitude) ||
    point.latitude < -90 ||
    point.latitude > 90
  ) {
    throw new RadiusLivingPopulationValidationError(
      `${path}.latitude가 유효하지 않습니다.`,
    );
  }
  if (
    !Number.isFinite(point.longitude) ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    throw new RadiusLivingPopulationValidationError(
      `${path}.longitude가 유효하지 않습니다.`,
    );
  }
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(
  first: Wgs84Point,
  second: Wgs84Point,
): number {
  requirePoint(first, "first");
  requirePoint(second, "second");
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function isPointWithinRadius(
  center: Wgs84Point,
  point: Wgs84Point,
  radiusMeters: BasicLocationRadiusMeters,
): boolean {
  if (radiusMeters !== 300 && radiusMeters !== 500) {
    throw new RadiusLivingPopulationValidationError(
      "radiusMeters는 300 또는 500이어야 합니다.",
    );
  }
  return haversineDistanceMeters(center, point) <= radiusMeters;
}

type Position = readonly [number, number];

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function pointInRing(point: Position, ring: readonly Position[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = point;
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses =
      (currentY > y) !== (previousY > y) &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function bboxCenter(feature: LivingPopulationGridFeature): Wgs84Point {
  const { geometry } = feature;
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
    throw new RadiusLivingPopulationValidationError(
      `Grid ${feature.properties.grid_id} geometry는 Polygon이어야 합니다.`,
    );
  }
  if (geometry.coordinates.length !== 1) {
    throw new RadiusLivingPopulationValidationError(
      `Grid ${feature.properties.grid_id}는 hole 없는 단일 ring Polygon이어야 합니다.`,
    );
  }
  const rawRing = geometry.coordinates[0];
  if (!Array.isArray(rawRing) || rawRing.length !== 5 || !rawRing.every(isPosition)) {
    throw new RadiusLivingPopulationValidationError(
      `Grid ${feature.properties.grid_id}는 닫힌 250m 사각 Polygon이어야 합니다.`,
    );
  }
  const ring = rawRing as Position[];
  const [firstLongitude, firstLatitude] = ring[0];
  const [lastLongitude, lastLatitude] = ring[ring.length - 1];
  if (
    firstLongitude !== lastLongitude ||
    firstLatitude !== lastLatitude
  ) {
    throw new RadiusLivingPopulationValidationError(
      `Grid ${feature.properties.grid_id} Polygon이 닫혀 있지 않습니다.`,
    );
  }
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  const center: Wgs84Point = {
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
  };
  if (!pointInRing([center.longitude, center.latitude], ring)) {
    throw new RadiusLivingPopulationValidationError(
      `Grid ${feature.properties.grid_id} bbox 중심점이 Polygon 내부가 아닙니다.`,
    );
  }
  return Object.freeze(center);
}

function stableSum(values: readonly number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = next - sum - adjusted;
    sum = next;
  }
  return sum;
}

function cellHourKey(cellId: string, hour: string): string {
  return `${cellId}\u0000${hour}`;
}

function validateObservation(
  observation: MarketDataObservation,
  referenceDate: string,
): { cellId: string; hour: string; administrativeDongCode: string } {
  if (
    observation.sourceId !== "SRC-SEOUL-LIVING" ||
    observation.geographyType !== "living_grid" ||
    observation.metric !== "living_population_total"
  ) {
    throw new RadiusLivingPopulationValidationError(
      "생활인구 250m total observation만 사용할 수 있습니다.",
    );
  }
  const cellId = observation.geographyId;
  const hour = observation.metadata?.rawHour ?? null;
  const rawDate = observation.metadata?.rawDate ?? null;
  const administrativeDongCode =
    observation.metadata?.administrativeDongCode ?? null;
  if (!cellId) {
    throw new RadiusLivingPopulationValidationError("observation CELL_ID가 없습니다.");
  }
  if (!hour || !/^(?:[01]\d|2[0-3])$/.test(hour)) {
    throw new RadiusLivingPopulationValidationError(
      `CELL_ID ${cellId}의 TT가 유효하지 않습니다.`,
    );
  }
  if (!rawDate || normalizedReferenceDate(rawDate) !== referenceDate) {
    throw new RadiusLivingPopulationValidationError(
      `CELL_ID ${cellId}의 YMD가 source referenceDate와 다릅니다.`,
    );
  }
  if (!administrativeDongCode || !/^\d{8}$/.test(administrativeDongCode)) {
    throw new RadiusLivingPopulationValidationError(
      `CELL_ID ${cellId}의 H_DNG_CD가 유효하지 않습니다.`,
    );
  }
  if (
    observation.dataStatus === "available" &&
    (observation.value === null ||
      !Number.isFinite(observation.value) ||
      observation.value < 0)
  ) {
    throw new RadiusLivingPopulationValidationError(
      `CELL_ID ${cellId}의 available population 값이 유효하지 않습니다.`,
    );
  }
  if (observation.dataStatus !== "available" && observation.value !== null) {
    throw new RadiusLivingPopulationValidationError(
      `CELL_ID ${cellId}의 미확인 population은 null이어야 합니다.`,
    );
  }
  return { cellId, hour, administrativeDongCode };
}

function aggregateCellHour(group: MutableCellHour): CellHourAggregate {
  const rows = [...group.rows].sort((first, second) =>
    first.administrativeDongCode.localeCompare(second.administrativeDongCode),
  );
  const knownValues = rows.flatMap((row) =>
    row.status === "available" && row.value !== null ? [row.value] : [],
  );
  const count = (status: MarketDataStatus) =>
    rows.filter((row) => row.status === status).length;
  return Object.freeze({
    knownPopulation:
      knownValues.length > 0 ? stableSum(knownValues) : null,
    observationCount: rows.length,
    suppressedObservationCount: count("suppressed"),
    missingObservationCount: count("missing"),
    invalidObservationCount: count("invalid"),
    isComplete: knownValues.length === rows.length,
  });
}

export function buildRadiusLivingPopulationIndex(
  input: BuildRadiusLivingPopulationIndexInput,
): RadiusLivingPopulationIndex {
  requireNonEmpty(input.source.sourceName, "source.sourceName");
  requireNonEmpty(input.source.snapshotId, "source.snapshotId");
  requireNonEmpty(input.source.locator, "source.locator");
  requireNonEmpty(input.geometry.sourceId, "geometry.sourceId");
  requireNonEmpty(input.geometry.geometryVersion, "geometry.geometryVersion");
  requireNonEmpty(input.geometry.locator, "geometry.locator");
  if (input.geometry.outputCrs !== "EPSG:4326") {
    throw new RadiusLivingPopulationValidationError(
      "Grid geometry는 EPSG:4326이어야 합니다.",
    );
  }
  const referenceDate = normalizedReferenceDate(input.source.referenceDate);
  const source = Object.freeze({ ...input.source, referenceDate });
  const geometry = Object.freeze({ ...input.geometry });

  const centroidsByCellId = new Map<string, Wgs84Point>();
  for (const feature of input.gridFeatures) {
    const cellId = feature.properties.grid_id;
    requireNonEmpty(cellId, "grid.properties.grid_id");
    if (centroidsByCellId.has(cellId)) {
      throw new RadiusLivingPopulationValidationError(
        `Grid CELL_ID가 중복되었습니다: ${cellId}`,
      );
    }
    if (
      feature.properties.source_id !== geometry.sourceId ||
      feature.properties.geometry_version !== geometry.geometryVersion ||
      feature.properties.output_crs !== geometry.outputCrs ||
      feature.properties.status !== "validated"
    ) {
      throw new RadiusLivingPopulationValidationError(
        `Grid ${cellId}의 source/version/CRS/status가 geometry contract와 다릅니다.`,
      );
    }
    centroidsByCellId.set(cellId, bboxCenter(feature));
  }

  const mutableGroups = new Map<string, MutableCellHour>();
  const candidateKeys = new Set<string>();
  const metricCellIds = new Set<string>();
  const metricOnlyCellsByHour = new Map<string, Set<string>>();
  for (const observation of input.observations) {
    const { cellId, hour, administrativeDongCode } = validateObservation(
      observation,
      referenceDate,
    );
    const candidateKey = `${cellId}\u0000${hour}\u0000${administrativeDongCode}`;
    if (candidateKeys.has(candidateKey)) {
      throw new RadiusLivingPopulationValidationError(
        `YMD+TT+H_DNG_CD+CELL_ID 중복 observation입니다: ${cellId}/${hour}/${administrativeDongCode}`,
      );
    }
    candidateKeys.add(candidateKey);
    metricCellIds.add(cellId);
    const key = cellHourKey(cellId, hour);
    const group = mutableGroups.get(key) ?? { rows: [] };
    group.rows.push({
      administrativeDongCode,
      status: observation.dataStatus,
      value: observation.value,
    });
    mutableGroups.set(key, group);
    if (!centroidsByCellId.has(cellId)) {
      const hourCells = metricOnlyCellsByHour.get(hour) ?? new Set<string>();
      hourCells.add(cellId);
      metricOnlyCellsByHour.set(hour, hourCells);
    }
  }

  const observationsByCellHour = new Map<string, CellHourAggregate>();
  let duplicateCellHourCombinationCount = 0;
  let maxAdministrativeDongRowsPerCellHour = 0;
  for (const [key, group] of mutableGroups) {
    if (group.rows.length > 1) duplicateCellHourCombinationCount += 1;
    maxAdministrativeDongRowsPerCellHour = Math.max(
      maxAdministrativeDongRowsPerCellHour,
      group.rows.length,
    );
    observationsByCellHour.set(key, aggregateCellHour(group));
  }

  const geometryCellIds = new Set(centroidsByCellId.keys());
  const metricOnlyCellIds = [...metricCellIds]
    .filter((cellId) => !geometryCellIds.has(cellId))
    .sort();
  const geometryOnlyCellIds = [...geometryCellIds]
    .filter((cellId) => !metricCellIds.has(cellId))
    .sort();
  const matchedCellCount = [...metricCellIds].filter((cellId) =>
    geometryCellIds.has(cellId),
  ).length;

  const index: RadiusLivingPopulationIndex = Object.freeze({
    source,
    geometry,
    geometryCellCount: geometryCellIds.size,
    metricCellCount: metricCellIds.size,
    matchedCellCount,
    metricOnlyCellIds: Object.freeze(metricOnlyCellIds),
    geometryOnlyCellIds: Object.freeze(geometryOnlyCellIds),
    duplicateCellHourCombinationCount,
    maxAdministrativeDongRowsPerCellHour,
    rowSemantics: RADIUS_LIVING_POPULATION_ROW_SEMANTICS,
  });
  INDEX_DATA.set(index, {
    centroidsByCellId,
    observationsByCellHour,
    metricCellIds,
    metricOnlyCellsByHour,
  });
  return index;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function buildSummary(
  hourly: readonly RadiusLivingPopulationHour[],
): RadiusLivingPopulationSummary {
  const knownHours = hourly.filter((hour) => hour.population !== null);
  const allAvailable = hourly.every((hour) => hour.status === "AVAILABLE");
  const status: RadiusLivingPopulationStatus =
    knownHours.length === 0
      ? "NOT_AVAILABLE"
      : allAvailable
        ? "AVAILABLE"
        : "PARTIAL";
  if (!allAvailable) {
    return Object.freeze({
      status,
      observedPeakHour: null,
      observedPeakPopulation: null,
      observedMinimumHour: null,
      observedMinimumPopulation: null,
      dailyMeanPopulation: null,
      meaning: "REFERENCE_DATE_24_HOUR_PROFILE",
    });
  }
  const sortedAscending = [...hourly].sort((first, second) =>
    (first.population ?? 0) - (second.population ?? 0) ||
    first.hour.localeCompare(second.hour),
  );
  const minimum = sortedAscending[0];
  const peak = sortedAscending[sortedAscending.length - 1];
  return Object.freeze({
    status,
    observedPeakHour: peak.hour,
    observedPeakPopulation: peak.population,
    observedMinimumHour: minimum.hour,
    observedMinimumPopulation: minimum.population,
    dailyMeanPopulation: stableSum(
      hourly.map((hour) => hour.population as number),
    ) / 24,
    meaning: "REFERENCE_DATE_24_HOUR_PROFILE",
  });
}

export function aggregateRadiusLivingPopulation(
  snapshot: RadiusLivingPopulationRunInput,
  index: RadiusLivingPopulationIndex,
): RadiusLivingPopulationAnalysis {
  const internal = INDEX_DATA.get(index);
  if (!internal) {
    throw new RadiusLivingPopulationValidationError(
      "buildRadiusLivingPopulationIndex로 생성한 index가 필요합니다.",
    );
  }
  if (snapshot.target.radiusMeters !== 300 && snapshot.target.radiusMeters !== 500) {
    throw new RadiusLivingPopulationValidationError(
      "radiusMeters는 300 또는 500이어야 합니다.",
    );
  }
  const center = {
    latitude: snapshot.target.latitude,
    longitude: snapshot.target.longitude,
  };
  requirePoint(center, "snapshot.target");
  const includedCellIds = [...internal.centroidsByCellId.entries()]
    .filter(([, centroid]) =>
      isPointWithinRadius(center, centroid, snapshot.target.radiusMeters),
    )
    .map(([cellId]) => cellId)
    .sort();
  const geometryOnlyIncludedCellCount = includedCellIds.filter(
    (cellId) => !internal.metricCellIds.has(cellId),
  ).length;

  const hourly = HOURS.map((hour): RadiusLivingPopulationHour => {
    const populations: number[] = [];
    let contributingCellCount = 0;
    let completeCellCount = 0;
    let partiallyKnownCellCount = 0;
    let unavailableCellCount = 0;
    let noObservationCellCount = 0;
    let suppressedObservationCount = 0;
    let missingObservationCount = 0;
    let invalidObservationCount = 0;
    for (const cellId of includedCellIds) {
      const observation = internal.observationsByCellHour.get(
        cellHourKey(cellId, hour),
      );
      if (!observation) {
        noObservationCellCount += 1;
        unavailableCellCount += 1;
        continue;
      }
      suppressedObservationCount += observation.suppressedObservationCount;
      missingObservationCount += observation.missingObservationCount;
      invalidObservationCount += observation.invalidObservationCount;
      if (observation.knownPopulation === null) {
        unavailableCellCount += 1;
      } else {
        contributingCellCount += 1;
        populations.push(observation.knownPopulation);
        if (observation.isComplete) completeCellCount += 1;
        else partiallyKnownCellCount += 1;
      }
    }
    const population =
      populations.length > 0 ? stableSum(populations) : null;
    const hasIncompleteCoverage =
      unavailableCellCount > 0 ||
      partiallyKnownCellCount > 0 ||
      suppressedObservationCount > 0 ||
      missingObservationCount > 0 ||
      invalidObservationCount > 0;
    const status: RadiusLivingPopulationStatus =
      population === null
        ? "NOT_AVAILABLE"
        : hasIncompleteCoverage
          ? "PARTIAL"
          : "AVAILABLE";
    return Object.freeze({
      hour,
      population,
      status,
      includedCellCount: includedCellIds.length,
      contributingCellCount,
      completeCellCount,
      partiallyKnownCellCount,
      unavailableCellCount,
      noObservationCellCount,
      suppressedObservationCount,
      missingObservationCount,
      invalidObservationCount,
      excludedMetricOnlyCellCount:
        internal.metricOnlyCellsByHour.get(hour)?.size ?? 0,
    });
  });

  const limitations: RadiusLivingPopulationLimitation[] = [
    {
      code: "STATISTICAL_ESTIMATE_NOT_ACTUAL",
      message:
        "생활인구는 통신·공공데이터 기반 통계적 추정치이며 실제 방문객, 실제 유동인구 또는 실제 고객 수가 아닙니다.",
    },
    {
      code: "SINGLE_DATE_SNAPSHOT",
      message: `${index.source.referenceDate} 단일 날짜 기준이며 평일·주말·주간·월간 또는 일반적인 상권 평균으로 해석할 수 없습니다.`,
    },
    {
      code: "CENTROID_RADIUS_INCLUSION",
      message:
        "경계 셀은 중심점 기준으로 포함/제외되므로 정확한 면적가중 반경 인구와 차이가 있을 수 있습니다.",
    },
  ];
  if (index.metricOnlyCellIds.length > 0) {
    limitations.push({
      code: "METRIC_ONLY_CELL_EXCLUDED",
      message: `geometry가 없는 metric CELL ${index.metricOnlyCellIds.join(", ")}은 반경 집계에서 제외했습니다.`,
    });
  }
  if (geometryOnlyIncludedCellCount > 0) {
    limitations.push({
      code: "GEOMETRY_ONLY_CELL_NO_OBSERVATION",
      message: `반경에 포함된 geometry-only CELL ${geometryOnlyIncludedCellCount}개는 생활인구 0이 아니라 관측 없음으로 처리했습니다.`,
    });
  }
  if (hourly.some((hour) => hour.status !== "AVAILABLE")) {
    limitations.push({
      code: "PARTIAL_OR_MISSING_HOURLY_COVERAGE",
      message:
        "억제·누락·invalid 또는 관측 없는 CELL이 있는 시간대는 알려진 값만 부분합으로 제공하며 완전한 총합으로 표시하지 않습니다.",
    });
  }

  return deepFreeze({
    contractVersion: RADIUS_LIVING_POPULATION_CONTRACT_VERSION,
    analysisRunId: snapshot.analysisRunId,
    generatedAt: snapshot.createdAt,
    sourceId: index.source.sourceId,
    sourceSnapshotId: index.source.snapshotId,
    referenceDate: index.source.referenceDate,
    radiusMeters: snapshot.target.radiusMeters,
    analysisUnit:
      snapshot.target.radiusMeters === 300 ? "RADIUS_300M" : "RADIUS_500M",
    inclusionMethod: RADIUS_LIVING_POPULATION_INCLUSION_METHOD,
    rowSemantics: RADIUS_LIVING_POPULATION_ROW_SEMANTICS,
    includedCellCount: includedCellIds.length,
    includedCellIds,
    includedMetricCellCount:
      includedCellIds.length - geometryOnlyIncludedCellCount,
    geometryOnlyIncludedCellCount,
    excludedMetricOnlyCellCount: index.metricOnlyCellIds.length,
    excludedMetricOnlyCellIds: [...index.metricOnlyCellIds],
    hourly,
    summary: buildSummary(hourly),
    limitations,
    lineage: {
      livingPopulation: index.source,
      gridGeometry: index.geometry,
      methodology: {
        version: RADIUS_LIVING_POPULATION_METHODOLOGY_VERSION,
        inclusionMethod: RADIUS_LIVING_POPULATION_INCLUSION_METHOD,
        rowSemantics: RADIUS_LIVING_POPULATION_ROW_SEMANTICS,
      },
    },
  });
}
