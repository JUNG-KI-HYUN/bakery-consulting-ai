/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { after, test } = require("node:test");
const ts = require("typescript");

const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "server-only") return {};
  return previousModuleLoad.call(this, request, parent, isMain);
};
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText, filename);
};
after(() => {
  Module._load = previousModuleLoad;
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const {
  LivingPopulationCurrentLoadError,
  loadLivingPopulationCurrentSnapshot,
  loadLivingPopulationGeometry,
  loadLivingPopulationMetricSnapshot,
} = require("../../lib/market-data/basic-location/living-population-current.server.ts");
const {
  createRadiusLivingPopulationServerService,
  livingPopulationRadiusCacheKey,
} = require("../../lib/market-data/basic-location/radius-living-population-service.server.ts");
const {
  buildRadiusLivingPopulationIndex,
} = require("../../lib/market-data/basic-location/radius-living-population.ts");

// SAMPLE fixture values only. They are not real population, locations or official grid cells.
const CENTER = { latitude: 37.5, longitude: 127 };
const CELL_BOTH = "가나00000001";
const CELL_METRIC_ONLY = "가나00000002";
const CELL_GEOMETRY_ONLY = "가나00000003";
const SNAPSHOT_ID = "SAMPLE-LIVING-20260906";
const FIXED_NOW = "2026-09-18T00:00:00.000Z";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, content);
  return content;
}

function pointNorth(distanceMeters) {
  return {
    latitude: CENTER.latitude + (distanceMeters / 6_371_000) * (180 / Math.PI),
    longitude: CENTER.longitude,
  };
}

function feature(cellId, distanceMeters, geometryVersion = "SAMPLE-GRID-V1") {
  const center = pointNorth(distanceMeters);
  const delta = 0.00001;
  return {
    type: "Feature",
    id: cellId,
    properties: {
      grid_id: cellId,
      source_id: "SRC-SEOUL-LIVING-GRID",
      source_crs: "EPSG:5179",
      output_crs: "EPSG:4326",
      geometry_version: geometryVersion,
      status: "validated",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [center.longitude - delta, center.latitude - delta],
        [center.longitude + delta, center.latitude - delta],
        [center.longitude + delta, center.latitude + delta],
        [center.longitude - delta, center.latitude + delta],
        [center.longitude - delta, center.latitude - delta],
      ]],
    },
  };
}

function observation(cellId, hour, value, dataStatus, dong) {
  return {
    sourceId: "SRC-SEOUL-LIVING",
    referencePeriod: `2026-09-06T${hour}:00`,
    geographyType: "living_grid",
    geographyId: cellId,
    metric: "living_population_total",
    value,
    unit: "people",
    dataStatus,
    metadata: {
      rawDate: "20260906",
      rawHour: hour,
      administrativeDongCode: dong,
    },
  };
}

function baseObservations() {
  return [
    observation(CELL_BOTH, "00", 10.5, "available", "11110000"),
    observation(CELL_BOTH, "00", null, "suppressed", "11110001"),
    observation(CELL_METRIC_ONLY, "00", null, "suppressed", "11110000"),
  ];
}

function createFixture(options = {}) {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "living-radius-server-"));
  const marketDataRoot = path.join(repositoryRoot, "data/seoul-market/v1.1-final");
  const ingestRoot = path.join(marketDataRoot, "13_SOURCE_INGEST");
  const snapshotId = options.snapshotId ?? SNAPSHOT_ID;
  const normalizedLocator = `normalized/SRC-SEOUL-LIVING/${snapshotId}`;
  const normalizedPath = path.join(ingestRoot, normalizedLocator);
  const normalizedChunk = "pages/000001-000003.ndjson";
  const normalizedFile = path.join(normalizedPath, normalizedChunk);
  const observations = options.observations ?? baseObservations();
  const normalizedContent = `${observations.map((row) => JSON.stringify(row)).join("\n")}\n`;
  fs.mkdirSync(path.dirname(normalizedFile), { recursive: true });
  fs.writeFileSync(normalizedFile, normalizedContent);
  const normalizedPageChecksum = sha256(normalizedContent);
  const normalizedSetChecksum = sha256(normalizedPageChecksum);

  const checkpointLocator = `raw/SRC-SEOUL-LIVING/${snapshotId}/checkpoint.json`;
  const checkpointPath = path.join(ingestRoot, checkpointLocator);
  const checkpoint = {
    schema_version: "1.0.0",
    snapshot_id: snapshotId,
    source_id: "SRC-SEOUL-LIVING",
    source_reference_date: "20260906",
    total_count: observations.length,
    completed_pages: [{
      start_index: 1,
      end_index: observations.length,
      row_count: observations.length,
      normalized_chunk: normalizedChunk,
      normalized_sha256: normalizedPageChecksum,
      normalized_count: observations.length,
    }],
  };
  const checkpointContent = writeJson(checkpointPath, checkpoint);

  const geometryVersion = options.geometryVersion ?? "SAMPLE-GRID-V1";
  const geometryLocator = "data/seoul-market/v1.1-final/09_GEO/LIVING_GRID_250M.geojson";
  const geometryPath = path.join(repositoryRoot, geometryLocator);
  const geometryFeatures = options.geometryFeatures ?? [
    feature(CELL_BOTH, 0, geometryVersion),
    feature(CELL_GEOMETRY_ONLY, 400, geometryVersion),
  ];
  const geometryContent = writeJson(geometryPath, {
    type: "FeatureCollection",
    features: geometryFeatures,
  });

  const manifestLocator = `manifests/SRC-SEOUL-LIVING/snapshots/${snapshotId}.manifest.json`;
  const manifestPath = path.join(ingestRoot, manifestLocator);
  const uniqueMetricCells = new Set(observations.map((row) => row.geographyId)).size;
  const manifest = {
    manifest_kind: "LIVING_POPULATION_API_SNAPSHOT",
    schema_version: "1.0.0",
    snapshot_id: snapshotId,
    source_id: "SRC-SEOUL-LIVING",
    source_reference_date: "20260906",
    normalized_rows: observations.length,
    expected_page_count: 1,
    page_count: 1,
    unique_cell_count: uniqueMetricCells,
    checksums: {
      normalized_page_set_sha256: normalizedSetChecksum,
      checkpoint_sha256: sha256(checkpointContent),
    },
    validation: {
      result: "PASS",
      count_consistent: true,
      pagination_contiguous: true,
      expected_page_count_match: true,
      normalized_checksum_match: true,
      single_ymd: true,
      tt_valid: true,
      cell_id_complete: true,
      h_dng_cd_valid: true,
      schema_drift: false,
      duplicate_candidate_count: 0,
    },
    status: "READY",
    limited_run: false,
    source_snapshot_ready: true,
    staging: false,
    normalized_path: normalizedLocator,
    checkpoint_path: checkpointLocator,
  };
  if (options.manifestMutator) options.manifestMutator(manifest);
  writeJson(manifestPath, manifest);

  const reconciliationLocator = "../12_VALIDATION/LIVING_GRID_RECONCILIATION_V1.json";
  const verificationLocator = "../12_VALIDATION/OFFICIAL_LIVING_GRID_SOURCE_VERIFICATION_V1.json";
  const reconciliationPath = path.resolve(ingestRoot, reconciliationLocator);
  const verificationPath = path.resolve(ingestRoot, verificationLocator);
  const matched = 1;
  const geometryOnly = geometryFeatures.length - matched;
  const metricOnlyIds = [CELL_METRIC_ONLY];
  writeJson(reconciliationPath, {
    schema_version: "1.0.0",
    audit: "250m_CELL_ID_GEOMETRY_RECONCILIATION_V1",
    metric: {
      manifest_path: path.relative(repositoryRoot, manifestPath).replaceAll("\\", "/"),
      snapshot_id: snapshotId,
      status: "READY",
      source_reference_date: "20260906",
      row_count: observations.length,
      unique_cell_id_count: uniqueMetricCells,
    },
    geometry: {
      path: geometryLocator,
      feature_count: geometryFeatures.length,
      source_id: "SRC-SEOUL-LIVING-GRID",
      source_date_or_version: geometryVersion,
      output_crs: "EPSG:4326",
    },
    reconciliation: {
      both: { count: matched },
      metric_only: { count: metricOnlyIds.length, cell_ids: metricOnlyIds },
      geometry_only: { count: geometryOnly },
    },
  });
  writeJson(verificationPath, {
    schema_version: "1.0.0",
    result: "READY",
    local_geometry: {
      path: geometryLocator,
      sha256: sha256(geometryContent),
      source_id: "SRC-SEOUL-LIVING-GRID",
      geometry_version: geometryVersion,
      output_crs: "EPSG:4326",
      feature_count: geometryFeatures.length,
      unique_cell_id_count: geometryFeatures.length,
      official_shp_cell_id_set_equal: true,
      official_viewer_cell_id_set_equal: true,
    },
    compatibility: {
      status: "READY",
      metric_to_geometry: "READY_WITH_EXPLICIT_MISMATCH_POLICY",
    },
  });

  const decisionLocator = `manifests/SRC-SEOUL-LIVING/publication-decisions/${snapshotId}.json`;
  writeJson(path.join(ingestRoot, decisionLocator), {
    schema_version: "1.0.0",
    artifact_kind: "LIVING_POPULATION_CURRENT_PUBLICATION_DECISION",
    source_id: "SRC-SEOUL-LIVING",
    snapshot_id: snapshotId,
    reference_ymd: "20260906",
    decision: "ELIGIBLE",
    publication_scope: "SOURCE_CURRENT_ONLY",
    spatial_aggregation_ready: false,
    manifest: manifestLocator,
    reconciliation: reconciliationLocator,
    official_geometry_verification: verificationLocator,
    gate_checks: [{ id: "sample-fixture-ready", passed: true }],
  });
  const pointer = {
    schema_version: "1.0.0",
    source_id: "SRC-SEOUL-LIVING",
    snapshot_id: snapshotId,
    reference_ymd: "20260906",
    manifest: manifestLocator,
    publication_decision: decisionLocator,
    publication_scope: "SOURCE_CURRENT_ONLY",
    spatial_aggregation_ready: false,
  };
  if (options.pointerMutator) options.pointerMutator(pointer);
  writeJson(path.join(ingestRoot, "manifests/SRC-SEOUL-LIVING/current.json"), pointer);
  writeJson(path.join(ingestRoot, "DATA_SOURCE_REGISTRY.json"), {
    schemaVersion: "1.0.0",
    sources: [{ sourceId: "SRC-SEOUL-LIVING", sourceName: "SAMPLE Seoul living population" }],
  });
  return { repositoryRoot, geometryPath, normalizedFile };
}

async function consumeMetric(current) {
  const loaded = await loadLivingPopulationMetricSnapshot(current);
  return { loaded, observations: [...loaded.observations] };
}

function cloneCurrent(current, overrides = {}) {
  const snapshotId = overrides.snapshotId ?? current.snapshotId;
  const normalizedLocator = overrides.normalizedLocator ?? current.normalizedLocator;
  const geometryVersion = overrides.geometryVersion ?? current.geometry.geometryVersion;
  return {
    ...current,
    ...overrides,
    snapshotId,
    normalizedLocator,
    normalizedChecksum: overrides.normalizedChecksum ?? current.normalizedChecksum,
    source: {
      ...current.source,
      snapshotId,
      locator: normalizedLocator,
    },
    geometry: {
      ...current.geometry,
      geometryVersion,
    },
  };
}

async function createServiceHarness(options = {}) {
  const fixture = createFixture();
  const initial = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  let current = initial;
  let buildCount = 0;
  const metricRows = baseObservations();
  const dependencies = {
    loadCurrent: async () => current,
    loadMetric: async (descriptor) => {
      if (options.loadDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.loadDelayMs));
      }
      return {
        snapshotId: descriptor.snapshotId,
        referenceDate: descriptor.referenceDate,
        rowCount: metricRows.length,
        pageCount: 1,
        checksum: descriptor.normalizedChecksum,
        observations: metricRows.map((row) => ({ ...row, metadata: { ...row.metadata } })),
      };
    },
    loadGeometry: async (descriptor) => ({
      context: descriptor.geometry,
      featureCount: 2,
      checksum: descriptor.geometryChecksum,
      features: [
        feature(CELL_BOTH, 0, descriptor.geometry.geometryVersion),
        feature(CELL_GEOMETRY_ONLY, 400, descriptor.geometry.geometryVersion),
      ],
    }),
    buildIndex: (input) => {
      buildCount += 1;
      return buildRadiusLivingPopulationIndex(input);
    },
    now: () => new Date(FIXED_NOW),
  };
  const service = createRadiusLivingPopulationServerService({ dependencies });
  return {
    service,
    getCurrent: () => current,
    setCurrent: (next) => { current = next; },
    getBuildCount: () => buildCount,
  };
}

const request = (radiusMeters = 300, analysisRunId = "basic-location-run:sample") => ({
  analysisRunId,
  lat: CENTER.latitude,
  lng: CENTER.longitude,
  radiusMeters,
});

test("P1-C: current pointer loads the published snapshot", async () => {
  const fixture = createFixture();
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  assert.equal(current.snapshotId, SNAPSHOT_ID);
  assert.equal(current.status, "READY");
});

test("P1-C: metric snapshot loads normalized observations", async () => {
  const fixture = createFixture();
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  const { loaded, observations } = await consumeMetric(current);
  assert.equal(loaded.rowCount, 3);
  assert.equal(observations.length, 3);
});

test("P1-C: geometry loader loads validated Polygon features", async () => {
  const fixture = createFixture();
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  const geometry = await loadLivingPopulationGeometry(current);
  assert.equal(geometry.featureCount, 2);
  assert.ok(geometry.features.every((item) => item.geometry.type === "Polygon"));
});

test("P1-C: source, checksum and geometry version metadata are preserved", async () => {
  const fixture = createFixture();
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  assert.equal(current.source.sourceId, "SRC-SEOUL-LIVING");
  assert.match(current.normalizedChecksum, /^[a-f0-9]{64}$/);
  assert.equal(current.geometry.geometryVersion, "SAMPLE-GRID-V1");
});

test("P1-C: radius readiness is separate from Market/Submarket readiness", async () => {
  const fixture = createFixture();
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  assert.equal(current.spatialAggregationReady, false);
  assert.equal(current.radiusAggregationReady, true);
});

test("P1-C: first analysis builds the index once", async () => {
  const harness = await createServiceHarness();
  await harness.service.analyze(request());
  assert.equal(harness.getBuildCount(), 1);
});

test("P1-C: identical cache key reuses the index", async () => {
  const harness = await createServiceHarness();
  await harness.service.analyze(request());
  await harness.service.analyze(request(500));
  assert.equal(harness.getBuildCount(), 1);
});

test("P1-C: snapshot change invalidates the cache", async () => {
  const harness = await createServiceHarness();
  await harness.service.analyze(request());
  harness.setCurrent(cloneCurrent(harness.getCurrent(), { snapshotId: "SAMPLE-LIVING-20260907" }));
  await harness.service.analyze(request());
  assert.equal(harness.getBuildCount(), 2);
});

test("P1-C: normalized locator change invalidates the cache", async () => {
  const harness = await createServiceHarness();
  await harness.service.analyze(request());
  harness.setCurrent(cloneCurrent(harness.getCurrent(), { normalizedLocator: "sample/normalized-v2" }));
  await harness.service.analyze(request());
  assert.equal(harness.getBuildCount(), 2);
});

test("P1-C: normalized checksum change invalidates the cache", async () => {
  const harness = await createServiceHarness();
  await harness.service.analyze(request());
  harness.setCurrent(cloneCurrent(harness.getCurrent(), { normalizedChecksum: "f".repeat(64) }));
  await harness.service.analyze(request());
  assert.equal(harness.getBuildCount(), 2);
});

test("P1-C: geometry version change invalidates the cache", async () => {
  const harness = await createServiceHarness();
  await harness.service.analyze(request());
  harness.setCurrent(cloneCurrent(harness.getCurrent(), { geometryVersion: "SAMPLE-GRID-V2" }));
  await harness.service.analyze(request());
  assert.equal(harness.getBuildCount(), 2);
});

test("P1-C: concurrent requests reuse one in-flight index build", async () => {
  const harness = await createServiceHarness({ loadDelayMs: 25 });
  await Promise.all([
    harness.service.analyze(request(300, "run:concurrent-1")),
    harness.service.analyze(request(500, "run:concurrent-2")),
  ]);
  assert.equal(harness.getBuildCount(), 1);
});

test("P1-C: 300m service returns RADIUS_300M", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request(300));
  assert.equal(result.analysis.analysisUnit, "RADIUS_300M");
  assert.deepEqual(result.analysis.includedCellIds, [CELL_BOTH]);
});

test("P1-C: 500m service returns RADIUS_500M", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request(500));
  assert.equal(result.analysis.analysisUnit, "RADIUS_500M");
  assert.deepEqual(result.analysis.includedCellIds, [CELL_BOTH, CELL_GEOMETRY_ONLY]);
});

test("P1-C: service preserves analysisRunId without creating a UUID", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request(300, "existing-analysis-run-id"));
  assert.equal(result.analysis.analysisRunId, "existing-analysis-run-id");
});

test("P1-C: service preserves referenceDate", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request());
  assert.equal(result.referenceDate, "2026-09-06");
  assert.equal(result.analysis.referenceDate, "2026-09-06");
});

test("P1-C: 2026-09-06 has deterministic SUNDAY metadata", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request());
  assert.equal(result.dayOfWeek, "SUNDAY");
});

test("P1-C: unsupported radius is rejected before loading data", async () => {
  const harness = await createServiceHarness();
  await assert.rejects(() => harness.service.analyze(request(400)), /300 또는 500/);
  assert.equal(harness.getBuildCount(), 0);
});

test("P1-C: missing current pointer fails closed", async () => {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "living-radius-missing-"));
  await assert.rejects(
    () => loadLivingPopulationCurrentSnapshot({ repositoryRoot }),
    (error) => error instanceof LivingPopulationCurrentLoadError && /could not be read/.test(error.message),
  );
});

test("P1-C: pointer schema mismatch fails closed", async () => {
  const fixture = createFixture({ pointerMutator: (pointer) => { pointer.schema_version = "2.0.0"; } });
  await assert.rejects(
    () => loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot }),
    /schema_version mismatch/,
  );
});

test("P1-C: pointer source mismatch fails closed", async () => {
  const fixture = createFixture({ pointerMutator: (pointer) => { pointer.source_id = "SRC-OTHER"; } });
  await assert.rejects(
    () => loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot }),
    /current.source_id mismatch/,
  );
});

test("P1-C: invalid TT in normalized data fails closed", async () => {
  const rows = baseObservations();
  rows[0].metadata.rawHour = "24";
  rows[0].referencePeriod = "2026-09-06T24:00";
  const fixture = createFixture({ observations: rows });
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  await assert.rejects(async () => consumeMetric(current), /invalid TT/);
});

test("P1-C: invalid CELL_ID in normalized data fails closed", async () => {
  const rows = baseObservations();
  rows[0].geographyId = "BAD-CELL";
  rows[1].geographyId = "BAD-CELL";
  const fixture = createFixture({ observations: rows });
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  await assert.rejects(async () => consumeMetric(current), /invalid CELL_ID/);
});

test("P1-C: invalid SPOP representation fails closed", async () => {
  const rows = baseObservations();
  rows[0].value = "10.5";
  const fixture = createFixture({ observations: rows });
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  await assert.rejects(async () => consumeMetric(current), /invalid SPOP representation/);
});

test("P1-C: corrupt geometry fails closed without silently skipping it", async () => {
  const invalid = feature(CELL_BOTH, 0);
  invalid.geometry = { type: "Point", coordinates: [127, 37.5] };
  const fixture = createFixture({ geometryFeatures: [invalid, feature(CELL_GEOMETRY_ONLY, 400)] });
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  await assert.rejects(() => loadLivingPopulationGeometry(current), /type mismatch/);
});

test("P1-C: metric-only and geometry-only semantics remain explicit", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request(500));
  assert.equal(result.analysis.excludedMetricOnlyCellCount, 1);
  assert.deepEqual(result.analysis.excludedMetricOnlyCellIds, [CELL_METRIC_ONLY]);
  assert.equal(result.analysis.geometryOnlyIncludedCellCount, 1);
  assert.equal(result.analysis.hourly[0].noObservationCellCount, 1);
});

test("P1-C: suppression remains PARTIAL rather than becoming zero or complete", async () => {
  const harness = await createServiceHarness();
  const result = await harness.service.analyze(request(300));
  assert.equal(result.analysis.hourly[0].population, 10.5);
  assert.equal(result.analysis.hourly[0].status, "PARTIAL");
  assert.equal(result.analysis.hourly[0].suppressedObservationCount, 1);
});

test("P1-C: cache key includes snapshot, normalized locator/checksum, geometry and methodology", async () => {
  const fixture = createFixture();
  const current = await loadLivingPopulationCurrentSnapshot({ repositoryRoot: fixture.repositoryRoot });
  const key = livingPopulationRadiusCacheKey(current);
  assert.ok(key.includes(current.snapshotId));
  assert.ok(key.includes(current.normalizedLocator));
  assert.ok(key.includes(current.normalizedChecksum));
  assert.ok(key.includes(current.geometry.geometryVersion));
  assert.ok(key.includes("RADIUS_LIVING_POPULATION_CENTROID_V1"));
});

test("P1-C integration: actual current snapshot builds once and serves 300m/500m", { timeout: 30_000 }, async () => {
  const repositoryRoot = path.join(__dirname, "../..");
  const geojson = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot,
    "data/seoul-market/v1.1-final/09_GEO/LIVING_GRID_250M.geojson",
  ), "utf8"));
  const targetFeature = geojson.features.find(
    (item) => item.properties.grid_id === "다사53005400",
  );
  assert.ok(targetFeature);
  const targetRing = targetFeature.geometry.coordinates[0];
  const longitudeValues = targetRing.map(([longitude]) => longitude);
  const latitudeValues = targetRing.map(([, latitude]) => latitude);
  const target = {
    lng: (Math.min(...longitudeValues) + Math.max(...longitudeValues)) / 2,
    lat: (Math.min(...latitudeValues) + Math.max(...latitudeValues)) / 2,
  };
  let buildCount = 0;
  const service = createRadiusLivingPopulationServerService({
    repositoryRoot,
    dependencies: {
      buildIndex: (input) => {
        buildCount += 1;
        return buildRadiusLivingPopulationIndex(input);
      },
      now: () => new Date(FIXED_NOW),
    },
  });
  const result300 = await service.analyze({
    analysisRunId: "actual-current-300",
    ...target,
    radiusMeters: 300,
  });
  const result500 = await service.analyze({
    analysisRunId: "actual-current-500",
    ...target,
    radiusMeters: 500,
  });
  assert.equal(result300.referenceDate, "2026-09-06");
  assert.equal(result300.dayOfWeek, "SUNDAY");
  assert.equal(result300.analysis.sourceSnapshotId, "SRC-SEOUL-LIVING_20260906_20260911T045831120Z_bbd51d31");
  assert.equal(result300.analysis.excludedMetricOnlyCellCount, 1);
  assert.ok(result300.analysis.includedCellCount > 0);
  assert.ok(result500.analysis.includedCellCount > result300.analysis.includedCellCount);
  assert.equal(buildCount, 1);
});
