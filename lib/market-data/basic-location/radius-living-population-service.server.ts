import "server-only";

import type { BasicLocationRadiusMeters } from "./run";
import {
  RADIUS_LIVING_POPULATION_METHODOLOGY_VERSION,
  aggregateRadiusLivingPopulation,
  buildRadiusLivingPopulationIndex,
  type RadiusLivingPopulationAnalysis,
  type RadiusLivingPopulationIndex,
} from "./radius-living-population";
import {
  loadLivingPopulationCurrentSnapshot,
  loadLivingPopulationGeometry,
  loadLivingPopulationMetricSnapshot,
  validateLivingPopulationCompatibility,
  type LivingPopulationCurrentSnapshot,
  type LoadedLivingPopulationGeometry,
  type LoadedLivingPopulationMetricSnapshot,
} from "./living-population-current.server";
import type { LivingPopulationDayOfWeek } from "./radius-living-population-runtime";
export type { LivingPopulationDayOfWeek } from "./radius-living-population-runtime";

export interface RadiusLivingPopulationServerInput {
  analysisRunId: string;
  lat: number;
  lng: number;
  radiusMeters: BasicLocationRadiusMeters;
}

export interface RadiusLivingPopulationServerResponse {
  analysis: Readonly<RadiusLivingPopulationAnalysis>;
  referenceDate: string;
  dayOfWeek: LivingPopulationDayOfWeek;
}

export interface RadiusLivingPopulationServerDependencies {
  loadCurrent: () => Promise<LivingPopulationCurrentSnapshot>;
  loadMetric: (
    current: LivingPopulationCurrentSnapshot,
  ) => Promise<LoadedLivingPopulationMetricSnapshot>;
  loadGeometry: (
    current: LivingPopulationCurrentSnapshot,
  ) => Promise<LoadedLivingPopulationGeometry>;
  buildIndex: typeof buildRadiusLivingPopulationIndex;
  validateCompatibility: typeof validateLivingPopulationCompatibility;
  now: () => Date;
}

export interface RadiusLivingPopulationServerServiceOptions {
  repositoryRoot?: string;
  dependencies?: Partial<RadiusLivingPopulationServerDependencies>;
}

interface CachedIndex {
  key: string;
  index: RadiusLivingPopulationIndex;
}

const DAY_OF_WEEK: readonly LivingPopulationDayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export class RadiusLivingPopulationServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadiusLivingPopulationServerError";
  }
}

function dayOfWeek(referenceDate: string): LivingPopulationDayOfWeek {
  const [year, month, day] = referenceDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return DAY_OF_WEEK[date.getUTCDay()];
}

export function livingPopulationRadiusCacheKey(
  current: LivingPopulationCurrentSnapshot,
): string {
  return [
    current.snapshotId,
    current.normalizedLocator,
    current.normalizedChecksum,
    current.geometry.geometryVersion,
    RADIUS_LIVING_POPULATION_METHODOLOGY_VERSION,
  ].join("|");
}

function validateInput(input: RadiusLivingPopulationServerInput): void {
  if (typeof input.analysisRunId !== "string" || input.analysisRunId.trim().length === 0) {
    throw new RadiusLivingPopulationServerError("analysisRunId가 비어 있습니다.");
  }
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    throw new RadiusLivingPopulationServerError("lat가 유효한 범위가 아닙니다.");
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    throw new RadiusLivingPopulationServerError("lng가 유효한 범위가 아닙니다.");
  }
  if (input.radiusMeters !== 300 && input.radiusMeters !== 500) {
    throw new RadiusLivingPopulationServerError("radiusMeters는 300 또는 500이어야 합니다.");
  }
}

export class RadiusLivingPopulationServerService {
  private readonly dependencies: RadiusLivingPopulationServerDependencies;
  private cached: CachedIndex | null = null;
  private readonly inFlight = new Map<string, Promise<RadiusLivingPopulationIndex>>();

  constructor(options: RadiusLivingPopulationServerServiceOptions = {}) {
    const repositoryRoot = options.repositoryRoot;
    this.dependencies = {
      loadCurrent: () => loadLivingPopulationCurrentSnapshot({ repositoryRoot }),
      loadMetric: loadLivingPopulationMetricSnapshot,
      loadGeometry: loadLivingPopulationGeometry,
      buildIndex: buildRadiusLivingPopulationIndex,
      validateCompatibility: validateLivingPopulationCompatibility,
      now: () => new Date(),
      ...options.dependencies,
    };
  }

  private async buildIndex(
    current: LivingPopulationCurrentSnapshot,
    key: string,
  ): Promise<RadiusLivingPopulationIndex> {
    const [metric, geometry] = await Promise.all([
      this.dependencies.loadMetric(current),
      this.dependencies.loadGeometry(current),
    ]);
    const index = this.dependencies.buildIndex({
      observations: metric.observations,
      gridFeatures: geometry.features,
      source: current.source,
      geometry: geometry.context,
    });
    this.dependencies.validateCompatibility(current, index);
    this.cached = { key, index };
    return index;
  }

  private async currentIndex(
    current: LivingPopulationCurrentSnapshot,
  ): Promise<RadiusLivingPopulationIndex> {
    const key = livingPopulationRadiusCacheKey(current);
    if (this.cached?.key === key) return this.cached.index;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.buildIndex(current, key);
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(key);
    }
  }

  async analyze(
    input: RadiusLivingPopulationServerInput,
  ): Promise<RadiusLivingPopulationServerResponse> {
    validateInput(input);
    const current = await this.dependencies.loadCurrent();
    const index = await this.currentIndex(current);
    const generatedAt = this.dependencies.now().toISOString();
    const analysis = aggregateRadiusLivingPopulation(
      {
        analysisRunId: input.analysisRunId,
        createdAt: generatedAt,
        target: {
          latitude: input.lat,
          longitude: input.lng,
          radiusMeters: input.radiusMeters,
        },
      },
      index,
    );
    return Object.freeze({
      analysis,
      referenceDate: current.referenceDate,
      dayOfWeek: dayOfWeek(current.referenceDate),
    });
  }
}

export function createRadiusLivingPopulationServerService(
  options: RadiusLivingPopulationServerServiceOptions = {},
): RadiusLivingPopulationServerService {
  return new RadiusLivingPopulationServerService(options);
}

const DEFAULT_SERVICE = createRadiusLivingPopulationServerService();

export function analyzeCurrentRadiusLivingPopulation(
  input: RadiusLivingPopulationServerInput,
): Promise<RadiusLivingPopulationServerResponse> {
  return DEFAULT_SERVICE.analyze(input);
}
