import "server-only";

import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

import type { MarketDataObservation, MarketDataStatus } from "../types";
import type {
  LivingPopulationGridFeature,
  RadiusLivingPopulationGeometryContext,
  RadiusLivingPopulationIndex,
  RadiusLivingPopulationSourceContext,
} from "./radius-living-population";

const SOURCE_ID = "SRC-SEOUL-LIVING" as const;
const GEOMETRY_SOURCE_ID = "SRC-SEOUL-LIVING-GRID";
const SCHEMA_VERSION = "1.0.0";
const CELL_ID_PATTERN = /^[가-힣]{2}\d{8}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type JsonObject = Record<string, unknown>;

export class LivingPopulationCurrentLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LivingPopulationCurrentLoadError";
  }
}

export interface LivingPopulationServerPaths {
  repositoryRoot: string;
  marketDataRoot: string;
  ingestRoot: string;
  currentPointerPath: string;
  sourceRegistryPath: string;
}

export interface LivingPopulationCompatibilityExpectation {
  metricCellCount: number;
  geometryCellCount: number;
  matchedCellCount: number;
  metricOnlyCellIds: readonly string[];
  geometryOnlyCellCount: number;
}

export interface LivingPopulationCurrentSnapshot {
  source: Readonly<RadiusLivingPopulationSourceContext>;
  snapshotId: string;
  referenceDate: string;
  referenceYmd: string;
  status: "READY";
  normalizedLocator: string;
  normalizedPath: string;
  normalizedChecksum: string;
  normalizedRowCount: number;
  normalizedPageCount: number;
  metricCellCount: number;
  checkpointPath: string;
  checkpointChecksum: string;
  manifestLocator: string;
  manifestPath: string;
  publicationDecisionPath: string;
  spatialAggregationReady: boolean;
  radiusAggregationReady: true;
  geometry: Readonly<RadiusLivingPopulationGeometryContext>;
  geometryPath: string;
  geometryChecksum: string;
  compatibility: Readonly<LivingPopulationCompatibilityExpectation>;
}

interface CheckpointPage {
  startIndex: number;
  endIndex: number;
  rowCount: number;
  normalizedChunk: string;
  normalizedChecksum: string;
  normalizedCount: number;
}

export interface LoadedLivingPopulationMetricSnapshot {
  snapshotId: string;
  referenceDate: string;
  rowCount: number;
  pageCount: number;
  checksum: string;
  observations: Iterable<MarketDataObservation>;
}

export interface LoadedLivingPopulationGeometry {
  context: Readonly<RadiusLivingPopulationGeometryContext>;
  featureCount: number;
  checksum: string;
  features: readonly LivingPopulationGridFeature[];
}

function object(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LivingPopulationCurrentLoadError(`${name} must be a JSON object`);
  }
  return value as JsonObject;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new LivingPopulationCurrentLoadError(`${name} must be an array`);
  }
  return value;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LivingPopulationCurrentLoadError(`${name} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, name: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new LivingPopulationCurrentLoadError(`${name} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new LivingPopulationCurrentLoadError(`${name} must be a boolean`);
  }
  return value;
}

function exact(value: unknown, expected: unknown, name: string): void {
  if (value !== expected) {
    throw new LivingPopulationCurrentLoadError(
      `${name} mismatch: expected ${String(expected)}, received ${String(value)}`,
    );
  }
}

function checksum(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256(value: unknown, name: string): string {
  const result = string(value, name);
  if (!SHA256_PATTERN.test(result)) {
    throw new LivingPopulationCurrentLoadError(`${name} must be a lowercase SHA-256`);
  }
  return result;
}

function normalizedDate(value: unknown, name: string): { ymd: string; iso: string } {
  const compact = string(value, name).replaceAll("-", "");
  if (!/^\d{8}$/.test(compact)) {
    throw new LivingPopulationCurrentLoadError(`${name} must be YYYYMMDD or YYYY-MM-DD`);
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
    throw new LivingPopulationCurrentLoadError(`${name} is not a valid date`);
  }
  return {
    ymd: compact,
    iso: `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`,
  };
}

function resolveWithin(root: string, locator: string, name: string): string {
  if (path.isAbsolute(locator)) {
    throw new LivingPopulationCurrentLoadError(`${name} must be a relative locator`);
  }
  const resolved = path.resolve(root, locator);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new LivingPopulationCurrentLoadError(`${name} escapes its allowed root`);
  }
  return resolved;
}

function resolveFromInside(
  base: string,
  locator: string,
  containmentRoot: string,
  name: string,
): string {
  if (path.isAbsolute(locator)) {
    throw new LivingPopulationCurrentLoadError(`${name} must be a relative locator`);
  }
  const resolved = path.resolve(base, locator);
  const relative = path.relative(containmentRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new LivingPopulationCurrentLoadError(`${name} escapes its allowed root`);
  }
  return resolved;
}

async function readJson(filePath: string, name: string): Promise<JsonObject> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new LivingPopulationCurrentLoadError(`${name} could not be read: ${filePath}`, {
      cause: error,
    });
  }
  try {
    return object(JSON.parse(content), name);
  } catch (error) {
    if (error instanceof LivingPopulationCurrentLoadError) throw error;
    throw new LivingPopulationCurrentLoadError(`${name} is not valid JSON: ${filePath}`, {
      cause: error,
    });
  }
}

export function defaultLivingPopulationServerPaths(
  repositoryRoot = process.cwd(),
): LivingPopulationServerPaths {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const marketDataRoot = path.join(
    resolvedRepositoryRoot,
    "data/seoul-market/v1.1-final",
  );
  const ingestRoot = path.join(marketDataRoot, "13_SOURCE_INGEST");
  return Object.freeze({
    repositoryRoot: resolvedRepositoryRoot,
    marketDataRoot,
    ingestRoot,
    currentPointerPath: path.join(
      ingestRoot,
      "manifests/SRC-SEOUL-LIVING/current.json",
    ),
    sourceRegistryPath: path.join(ingestRoot, "DATA_SOURCE_REGISTRY.json"),
  });
}

export async function loadLivingPopulationCurrentSnapshot(
  options: { repositoryRoot?: string } = {},
): Promise<LivingPopulationCurrentSnapshot> {
  const paths = defaultLivingPopulationServerPaths(options.repositoryRoot);
  const pointer = await readJson(paths.currentPointerPath, "living current pointer");
  exact(pointer.schema_version, SCHEMA_VERSION, "current.schema_version");
  exact(pointer.source_id, SOURCE_ID, "current.source_id");
  exact(pointer.publication_scope, "SOURCE_CURRENT_ONLY", "current.publication_scope");
  const snapshotId = string(pointer.snapshot_id, "current.snapshot_id");
  const reference = normalizedDate(pointer.reference_ymd, "current.reference_ymd");
  const spatialAggregationReady = boolean(
    pointer.spatial_aggregation_ready,
    "current.spatial_aggregation_ready",
  );
  const manifestLocator = string(pointer.manifest, "current.manifest");
  const manifestPath = resolveWithin(paths.ingestRoot, manifestLocator, "current.manifest");
  const publicationDecisionPath = resolveWithin(
    paths.ingestRoot,
    string(pointer.publication_decision, "current.publication_decision"),
    "current.publication_decision",
  );

  const [manifest, decision, registry] = await Promise.all([
    readJson(manifestPath, "living snapshot manifest"),
    readJson(publicationDecisionPath, "living publication decision"),
    readJson(paths.sourceRegistryPath, "data source registry"),
  ]);

  exact(manifest.schema_version, SCHEMA_VERSION, "manifest.schema_version");
  exact(manifest.manifest_kind, "LIVING_POPULATION_API_SNAPSHOT", "manifest.manifest_kind");
  exact(manifest.source_id, SOURCE_ID, "manifest.source_id");
  exact(manifest.snapshot_id, snapshotId, "manifest.snapshot_id");
  exact(manifest.source_reference_date, reference.ymd, "manifest.source_reference_date");
  exact(manifest.status, "READY", "manifest.status");
  exact(manifest.source_snapshot_ready, true, "manifest.source_snapshot_ready");
  exact(manifest.staging, false, "manifest.staging");
  exact(manifest.limited_run, false, "manifest.limited_run");
  const validation = object(manifest.validation, "manifest.validation");
  for (const key of [
    "count_consistent",
    "pagination_contiguous",
    "expected_page_count_match",
    "normalized_checksum_match",
    "single_ymd",
    "tt_valid",
    "cell_id_complete",
    "h_dng_cd_valid",
  ]) {
    exact(validation[key], true, `manifest.validation.${key}`);
  }
  exact(validation.result, "PASS", "manifest.validation.result");
  exact(validation.schema_drift, false, "manifest.validation.schema_drift");
  exact(validation.duplicate_candidate_count, 0, "manifest.validation.duplicate_candidate_count");

  const normalizedRows = integer(manifest.normalized_rows, "manifest.normalized_rows", 1);
  const normalizedPageCount = integer(manifest.page_count, "manifest.page_count", 1);
  exact(manifest.expected_page_count, normalizedPageCount, "manifest.expected_page_count");
  const metricCellCount = integer(manifest.unique_cell_count, "manifest.unique_cell_count", 1);
  const checksums = object(manifest.checksums, "manifest.checksums");
  const normalizedChecksum = sha256(
    checksums.normalized_page_set_sha256,
    "manifest.checksums.normalized_page_set_sha256",
  );
  const checkpointChecksum = sha256(
    checksums.checkpoint_sha256,
    "manifest.checksums.checkpoint_sha256",
  );
  const normalizedLocator = string(manifest.normalized_path, "manifest.normalized_path");
  const normalizedPath = resolveWithin(paths.ingestRoot, normalizedLocator, "manifest.normalized_path");
  const checkpointPath = resolveWithin(
    paths.ingestRoot,
    string(manifest.checkpoint_path, "manifest.checkpoint_path"),
    "manifest.checkpoint_path",
  );
  let checkpointBytes: Buffer;
  try {
    checkpointBytes = await fs.readFile(checkpointPath);
  } catch (error) {
    throw new LivingPopulationCurrentLoadError(`checkpoint could not be read: ${checkpointPath}`, {
      cause: error,
    });
  }
  exact(checksum(checkpointBytes), checkpointChecksum, "checkpoint checksum");

  exact(decision.schema_version, SCHEMA_VERSION, "decision.schema_version");
  exact(
    decision.artifact_kind,
    "LIVING_POPULATION_CURRENT_PUBLICATION_DECISION",
    "decision.artifact_kind",
  );
  exact(decision.source_id, SOURCE_ID, "decision.source_id");
  exact(decision.snapshot_id, snapshotId, "decision.snapshot_id");
  exact(decision.reference_ymd, reference.ymd, "decision.reference_ymd");
  exact(decision.decision, "ELIGIBLE", "decision.decision");
  exact(decision.manifest, manifestLocator, "decision.manifest");
  exact(
    decision.spatial_aggregation_ready,
    spatialAggregationReady,
    "decision.spatial_aggregation_ready",
  );
  for (const [index, value] of array(decision.gate_checks, "decision.gate_checks").entries()) {
    exact(object(value, `decision.gate_checks[${index}]`).passed, true, `decision.gate_checks[${index}].passed`);
  }

  const reconciliationPath = resolveFromInside(
    paths.ingestRoot,
    string(decision.reconciliation, "decision.reconciliation"),
    paths.marketDataRoot,
    "decision.reconciliation",
  );
  const verificationPath = resolveFromInside(
    paths.ingestRoot,
    string(decision.official_geometry_verification, "decision.official_geometry_verification"),
    paths.marketDataRoot,
    "decision.official_geometry_verification",
  );
  const [reconciliation, verification] = await Promise.all([
    readJson(reconciliationPath, "living grid reconciliation"),
    readJson(verificationPath, "official living grid verification"),
  ]);

  exact(reconciliation.schema_version, SCHEMA_VERSION, "reconciliation.schema_version");
  exact(reconciliation.audit, "250m_CELL_ID_GEOMETRY_RECONCILIATION_V1", "reconciliation.audit");
  const reconMetric = object(reconciliation.metric, "reconciliation.metric");
  exact(reconMetric.snapshot_id, snapshotId, "reconciliation.metric.snapshot_id");
  exact(reconMetric.source_reference_date, reference.ymd, "reconciliation.metric.source_reference_date");
  exact(reconMetric.status, "READY", "reconciliation.metric.status");
  exact(reconMetric.row_count, normalizedRows, "reconciliation.metric.row_count");
  exact(reconMetric.unique_cell_id_count, metricCellCount, "reconciliation.metric.unique_cell_id_count");
  const expectedManifestPath = path.relative(paths.repositoryRoot, manifestPath).replaceAll("\\", "/");
  exact(reconMetric.manifest_path, expectedManifestPath, "reconciliation.metric.manifest_path");

  const reconGeometry = object(reconciliation.geometry, "reconciliation.geometry");
  const recon = object(reconciliation.reconciliation, "reconciliation.reconciliation");
  const both = object(recon.both, "reconciliation.reconciliation.both");
  const metricOnly = object(recon.metric_only, "reconciliation.reconciliation.metric_only");
  const geometryOnly = object(recon.geometry_only, "reconciliation.reconciliation.geometry_only");
  const metricOnlyCellIds = array(metricOnly.cell_ids, "reconciliation.metric_only.cell_ids")
    .map((value, index) => string(value, `reconciliation.metric_only.cell_ids[${index}]`))
    .sort();
  const compatibility = Object.freeze({
    metricCellCount,
    geometryCellCount: integer(reconGeometry.feature_count, "reconciliation.geometry.feature_count", 1),
    matchedCellCount: integer(both.count, "reconciliation.both.count"),
    metricOnlyCellIds: Object.freeze(metricOnlyCellIds),
    geometryOnlyCellCount: integer(geometryOnly.count, "reconciliation.geometry_only.count"),
  });
  exact(metricOnly.count, metricOnlyCellIds.length, "reconciliation.metric_only.count");
  exact(
    compatibility.matchedCellCount + compatibility.metricOnlyCellIds.length,
    compatibility.metricCellCount,
    "metric compatibility equation",
  );
  exact(
    compatibility.matchedCellCount + compatibility.geometryOnlyCellCount,
    compatibility.geometryCellCount,
    "geometry compatibility equation",
  );

  exact(verification.schema_version, SCHEMA_VERSION, "verification.schema_version");
  exact(verification.result, "READY", "verification.result");
  const verificationCompatibility = object(verification.compatibility, "verification.compatibility");
  exact(verificationCompatibility.status, "READY", "verification.compatibility.status");
  exact(
    verificationCompatibility.metric_to_geometry,
    "READY_WITH_EXPLICIT_MISMATCH_POLICY",
    "verification.compatibility.metric_to_geometry",
  );
  const localGeometry = object(verification.local_geometry, "verification.local_geometry");
  exact(localGeometry.source_id, GEOMETRY_SOURCE_ID, "verification.local_geometry.source_id");
  exact(localGeometry.output_crs, "EPSG:4326", "verification.local_geometry.output_crs");
  exact(localGeometry.feature_count, compatibility.geometryCellCount, "verification.local_geometry.feature_count");
  exact(localGeometry.unique_cell_id_count, compatibility.geometryCellCount, "verification.local_geometry.unique_cell_id_count");
  exact(localGeometry.official_shp_cell_id_set_equal, true, "verification.local_geometry.official_shp_cell_id_set_equal");
  exact(localGeometry.official_viewer_cell_id_set_equal, true, "verification.local_geometry.official_viewer_cell_id_set_equal");
  const geometryVersion = string(localGeometry.geometry_version, "verification.local_geometry.geometry_version");
  exact(reconGeometry.source_id, GEOMETRY_SOURCE_ID, "reconciliation.geometry.source_id");
  exact(reconGeometry.output_crs, "EPSG:4326", "reconciliation.geometry.output_crs");
  exact(reconGeometry.source_date_or_version, geometryVersion, "reconciliation.geometry.source_date_or_version");
  const geometryLocator = string(localGeometry.path, "verification.local_geometry.path");
  exact(reconGeometry.path, geometryLocator, "reconciliation.geometry.path");
  const geometryPath = resolveWithin(paths.repositoryRoot, geometryLocator, "verification.local_geometry.path");
  const geometryChecksum = sha256(localGeometry.sha256, "verification.local_geometry.sha256");

  exact(registry.schemaVersion, SCHEMA_VERSION, "registry.schemaVersion");
  const registryEntry = array(registry.sources, "registry.sources")
    .map((value, index) => object(value, `registry.sources[${index}]`))
    .find((entry) => entry.sourceId === SOURCE_ID);
  if (!registryEntry) {
    throw new LivingPopulationCurrentLoadError(`${SOURCE_ID} is missing from the source registry`);
  }
  const sourceName = string(registryEntry.sourceName, "registry SRC-SEOUL-LIVING.sourceName");

  return Object.freeze({
    source: Object.freeze({
      sourceId: SOURCE_ID,
      sourceName,
      snapshotId,
      referenceDate: reference.iso,
      locator: normalizedLocator,
    }),
    snapshotId,
    referenceDate: reference.iso,
    referenceYmd: reference.ymd,
    status: "READY",
    normalizedLocator,
    normalizedPath,
    normalizedChecksum,
    normalizedRowCount: normalizedRows,
    normalizedPageCount,
    metricCellCount,
    checkpointPath,
    checkpointChecksum,
    manifestLocator,
    manifestPath,
    publicationDecisionPath,
    spatialAggregationReady,
    radiusAggregationReady: true,
    geometry: Object.freeze({
      sourceId: GEOMETRY_SOURCE_ID,
      geometryVersion,
      outputCrs: "EPSG:4326",
      locator: geometryLocator,
    }),
    geometryPath,
    geometryChecksum,
    compatibility,
  });
}

async function loadCheckpointPages(
  current: LivingPopulationCurrentSnapshot,
): Promise<CheckpointPage[]> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(current.checkpointPath);
  } catch (error) {
    throw new LivingPopulationCurrentLoadError(`checkpoint could not be read: ${current.checkpointPath}`, {
      cause: error,
    });
  }
  exact(checksum(bytes), current.checkpointChecksum, "checkpoint checksum");
  let checkpoint: JsonObject;
  try {
    checkpoint = object(JSON.parse(bytes.toString("utf8")), "checkpoint");
  } catch (error) {
    throw new LivingPopulationCurrentLoadError("checkpoint is not valid JSON", { cause: error });
  }
  exact(checkpoint.schema_version, SCHEMA_VERSION, "checkpoint.schema_version");
  exact(checkpoint.source_id, SOURCE_ID, "checkpoint.source_id");
  exact(checkpoint.snapshot_id, current.snapshotId, "checkpoint.snapshot_id");
  exact(checkpoint.source_reference_date, current.referenceYmd, "checkpoint.source_reference_date");
  exact(checkpoint.total_count, current.normalizedRowCount, "checkpoint.total_count");
  const pages = array(checkpoint.completed_pages, "checkpoint.completed_pages").map(
    (value, index): CheckpointPage => {
      const page = object(value, `checkpoint.completed_pages[${index}]`);
      return {
        startIndex: integer(page.start_index, `checkpoint.completed_pages[${index}].start_index`, 1),
        endIndex: integer(page.end_index, `checkpoint.completed_pages[${index}].end_index`, 1),
        rowCount: integer(page.row_count, `checkpoint.completed_pages[${index}].row_count`, 1),
        normalizedChunk: string(page.normalized_chunk, `checkpoint.completed_pages[${index}].normalized_chunk`),
        normalizedChecksum: sha256(page.normalized_sha256, `checkpoint.completed_pages[${index}].normalized_sha256`),
        normalizedCount: integer(page.normalized_count, `checkpoint.completed_pages[${index}].normalized_count`, 1),
      };
    },
  );
  exact(pages.length, current.normalizedPageCount, "checkpoint page count");
  let expectedStart = 1;
  let rows = 0;
  for (const [index, page] of pages.entries()) {
    exact(page.startIndex, expectedStart, `checkpoint page ${index} start_index`);
    exact(page.endIndex - page.startIndex + 1, page.rowCount, `checkpoint page ${index} row range`);
    exact(page.normalizedCount, page.rowCount, `checkpoint page ${index} normalized_count`);
    expectedStart = page.endIndex + 1;
    rows += page.rowCount;
  }
  exact(rows, current.normalizedRowCount, "checkpoint normalized row total");
  exact(
    checksum(pages.map((page) => page.normalizedChecksum).join("\n")),
    current.normalizedChecksum,
    "normalized page-set checksum",
  );
  return pages;
}

function parseObservation(
  value: unknown,
  current: LivingPopulationCurrentSnapshot,
  location: string,
): MarketDataObservation {
  const observation = object(value, location);
  exact(observation.sourceId, SOURCE_ID, `${location}.sourceId`);
  exact(observation.geographyType, "living_grid", `${location}.geographyType`);
  exact(observation.metric, "living_population_total", `${location}.metric`);
  exact(observation.unit, "people", `${location}.unit`);
  const cellId = string(observation.geographyId, `${location}.geographyId`);
  if (!CELL_ID_PATTERN.test(cellId)) {
    throw new LivingPopulationCurrentLoadError(`${location}.geographyId has an invalid CELL_ID`);
  }
  const metadata = object(observation.metadata, `${location}.metadata`);
  exact(metadata.rawDate, current.referenceYmd, `${location}.metadata.rawDate`);
  const hour = string(metadata.rawHour, `${location}.metadata.rawHour`);
  if (!/^(?:[01]\d|2[0-3])$/.test(hour)) {
    throw new LivingPopulationCurrentLoadError(`${location}.metadata.rawHour has an invalid TT`);
  }
  const administrativeDongCode = string(
    metadata.administrativeDongCode,
    `${location}.metadata.administrativeDongCode`,
  );
  if (!/^\d{8}$/.test(administrativeDongCode)) {
    throw new LivingPopulationCurrentLoadError(
      `${location}.metadata.administrativeDongCode has an invalid H_DNG_CD`,
    );
  }
  exact(
    observation.referencePeriod,
    `${current.referenceDate}T${hour}:00`,
    `${location}.referencePeriod`,
  );
  if (!["available", "suppressed", "missing", "invalid"].includes(String(observation.dataStatus))) {
    throw new LivingPopulationCurrentLoadError(`${location}.dataStatus is invalid`);
  }
  const dataStatus = observation.dataStatus as MarketDataStatus;
  const valueNumber = observation.value;
  if (
    dataStatus === "available" &&
    (typeof valueNumber !== "number" || !Number.isFinite(valueNumber) || valueNumber < 0)
  ) {
    throw new LivingPopulationCurrentLoadError(`${location}.value has an invalid SPOP representation`);
  }
  if (dataStatus !== "available" && valueNumber !== null) {
    throw new LivingPopulationCurrentLoadError(
      `${location}.value must be null for non-available SPOP`,
    );
  }
  return observation as unknown as MarketDataObservation;
}

export async function loadLivingPopulationMetricSnapshot(
  current: LivingPopulationCurrentSnapshot,
): Promise<LoadedLivingPopulationMetricSnapshot> {
  const pages = await loadCheckpointPages(current);
  let consumed = false;
  const observations: Iterable<MarketDataObservation> = {
    *[Symbol.iterator]() {
      if (consumed) {
        throw new LivingPopulationCurrentLoadError("metric observation stream can only be consumed once");
      }
      consumed = true;
      let rowCount = 0;
      const cellIds = new Set<string>();
      for (const [pageIndex, page] of pages.entries()) {
        const pagePath = resolveWithin(
          current.normalizedPath,
          page.normalizedChunk,
          `checkpoint.completed_pages[${pageIndex}].normalized_chunk`,
        );
        let bytes: Buffer;
        try {
          bytes = readFileSync(pagePath);
        } catch (error) {
          throw new LivingPopulationCurrentLoadError(`normalized page could not be read: ${pagePath}`, {
            cause: error,
          });
        }
        exact(checksum(bytes), page.normalizedChecksum, `normalized page ${pageIndex} checksum`);
        const lines = bytes.toString("utf8").split("\n").filter((line) => line.length > 0);
        exact(lines.length, page.normalizedCount, `normalized page ${pageIndex} row count`);
        for (const [lineIndex, line] of lines.entries()) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch (error) {
            throw new LivingPopulationCurrentLoadError(
              `normalized page ${pageIndex} line ${lineIndex + 1} is not valid JSON`,
              { cause: error },
            );
          }
          const observation = parseObservation(
            parsed,
            current,
            `normalized page ${pageIndex} line ${lineIndex + 1}`,
          );
          rowCount += 1;
          cellIds.add(observation.geographyId as string);
          yield observation;
        }
      }
      exact(rowCount, current.normalizedRowCount, "normalized observation row count");
      exact(cellIds.size, current.metricCellCount, "normalized unique CELL_ID count");
    },
  };
  return Object.freeze({
    snapshotId: current.snapshotId,
    referenceDate: current.referenceDate,
    rowCount: current.normalizedRowCount,
    pageCount: pages.length,
    checksum: current.normalizedChecksum,
    observations,
  });
}

export async function loadLivingPopulationGeometry(
  current: LivingPopulationCurrentSnapshot,
): Promise<LoadedLivingPopulationGeometry> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(current.geometryPath);
  } catch (error) {
    throw new LivingPopulationCurrentLoadError(`living grid geometry could not be read: ${current.geometryPath}`, {
      cause: error,
    });
  }
  exact(checksum(bytes), current.geometryChecksum, "living grid geometry checksum");
  let collection: JsonObject;
  try {
    collection = object(JSON.parse(bytes.toString("utf8")), "living grid geometry");
  } catch (error) {
    throw new LivingPopulationCurrentLoadError("living grid geometry is not valid JSON", { cause: error });
  }
  exact(collection.type, "FeatureCollection", "geometry.type");
  const features = array(collection.features, "geometry.features").map((value, index) => {
    const feature = object(value, `geometry.features[${index}]`);
    exact(feature.type, "Feature", `geometry.features[${index}].type`);
    const properties = object(feature.properties, `geometry.features[${index}].properties`);
    const cellId = string(properties.grid_id, `geometry.features[${index}].properties.grid_id`);
    if (!CELL_ID_PATTERN.test(cellId)) {
      throw new LivingPopulationCurrentLoadError(`geometry CELL_ID is invalid: ${cellId}`);
    }
    exact(properties.source_id, current.geometry.sourceId, `geometry ${cellId} source_id`);
    exact(properties.geometry_version, current.geometry.geometryVersion, `geometry ${cellId} geometry_version`);
    exact(properties.output_crs, "EPSG:4326", `geometry ${cellId} output_crs`);
    exact(properties.status, "validated", `geometry ${cellId} status`);
    const geometry = object(feature.geometry, `geometry ${cellId}`);
    exact(geometry.type, "Polygon", `geometry ${cellId} type`);
    array(geometry.coordinates, `geometry ${cellId} coordinates`);
    return feature as unknown as LivingPopulationGridFeature;
  });
  exact(features.length, current.compatibility.geometryCellCount, "geometry feature count");
  return Object.freeze({
    context: current.geometry,
    featureCount: features.length,
    checksum: current.geometryChecksum,
    features: Object.freeze(features),
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateLivingPopulationCompatibility(
  current: LivingPopulationCurrentSnapshot,
  index: RadiusLivingPopulationIndex,
): void {
  exact(index.source.sourceId, SOURCE_ID, "index source family");
  exact(index.source.snapshotId, current.snapshotId, "index snapshot ID");
  exact(index.source.referenceDate, current.referenceDate, "index reference date");
  exact(index.source.locator, current.normalizedLocator, "index normalized locator");
  exact(index.geometry.sourceId, current.geometry.sourceId, "index geometry source");
  exact(index.geometry.geometryVersion, current.geometry.geometryVersion, "index geometry version");
  exact(index.geometry.outputCrs, "EPSG:4326", "index geometry CRS");
  exact(index.metricCellCount, current.compatibility.metricCellCount, "metric CELL count");
  exact(index.geometryCellCount, current.compatibility.geometryCellCount, "geometry CELL count");
  exact(index.matchedCellCount, current.compatibility.matchedCellCount, "matched CELL count");
  exact(index.geometryOnlyCellIds.length, current.compatibility.geometryOnlyCellCount, "geometry-only CELL count");
  const actualMetricOnly = [...index.metricOnlyCellIds].sort();
  if (!sameStrings(actualMetricOnly, current.compatibility.metricOnlyCellIds)) {
    throw new LivingPopulationCurrentLoadError(
      `metric-only CELL set mismatch: expected ${current.compatibility.metricOnlyCellIds.join(",")}, received ${actualMetricOnly.join(",")}`,
    );
  }
}
