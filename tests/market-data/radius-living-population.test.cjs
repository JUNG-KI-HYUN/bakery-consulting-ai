/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, test } = require("node:test");
const ts = require("typescript");

const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const {
  RADIUS_LIVING_POPULATION_INCLUSION_METHOD,
  RADIUS_LIVING_POPULATION_ROW_SEMANTICS,
  aggregateRadiusLivingPopulation,
  buildRadiusLivingPopulationIndex,
  haversineDistanceMeters,
  isPointWithinRadius,
} = require("../../lib/market-data/basic-location/radius-living-population.ts");
const {
  adaptRadiusLivingPopulationResults,
} = require("../../lib/market-data/basic-location/radius-living-population-adapter.ts");
const {
  createAnalysisRunSnapshot,
} = require("../../lib/market-data/basic-location/run.ts");

// SAMPLE fixtures only. They are not real population, locations or official grid cells.
const CENTER = { latitude: 37.5, longitude: 127 };
const EARTH_RADIUS_METERS = 6_371_000;
const FIXED_DATE = "2026-09-18T00:00:00.000Z";
const UUID_300 = "30000000-0000-4000-8000-000000000000";
const UUID_500 = "50000000-0000-4000-8000-000000000000";

const SOURCE = {
  sourceId: "SRC-SEOUL-LIVING",
  sourceName: "SAMPLE Seoul living population",
  snapshotId: "SAMPLE-SNAPSHOT-20260906",
  referenceDate: "2026-09-06",
  locator: "sample/normalized",
};
const GEOMETRY = {
  sourceId: "SRC-SEOUL-LIVING-GRID",
  geometryVersion: "SAMPLE-GRID-V1",
  outputCrs: "EPSG:4326",
  locator: "sample/grid.geojson",
};

function pointNorth(distanceMeters) {
  return {
    latitude: CENTER.latitude + (distanceMeters / EARTH_RADIUS_METERS) * (180 / Math.PI),
    longitude: CENTER.longitude,
  };
}

function gridFeature(cellId, distanceMeters, overrides = {}) {
  const center = pointNorth(distanceMeters);
  const delta = 0.00001;
  return {
    type: "Feature",
    id: cellId,
    properties: {
      grid_id: cellId,
      source_id: GEOMETRY.sourceId,
      geometry_version: GEOMETRY.geometryVersion,
      output_crs: GEOMETRY.outputCrs,
      status: "validated",
      ...(overrides.properties ?? {}),
    },
    geometry: overrides.geometry ?? {
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

function observation(cellId, hour, value, options = {}) {
  const status = options.status ?? "available";
  return {
    sourceId: "SRC-SEOUL-LIVING",
    referencePeriod: `2026-09-06T${hour}:00`,
    geographyType: "living_grid",
    geographyId: cellId,
    metric: "living_population_total",
    value: status === "available" ? value : null,
    unit: "people",
    dataStatus: status,
    metadata: {
      rawDate: "20260906",
      rawHour: hour,
      administrativeDongCode: options.dong ?? "11110000",
    },
  };
}

function fullDay(cellId, valueForHour = (hour) => hour + 1, dong = "11110000") {
  return Array.from({ length: 24 }, (_, hour) =>
    observation(cellId, String(hour).padStart(2, "0"), valueForHour(hour), { dong }),
  );
}

function snapshot(radiusMeters = 300) {
  return createAnalysisRunSnapshot({
    target: {
      source: "map",
      confirmedAddress: null,
      ...CENTER,
      radiusMeters,
    },
    frameone: {
      marketId: "SAMPLE-MARKET",
      marketName: "Sample Market",
    },
  }, {
    randomUUID: () => radiusMeters === 300 ? UUID_300 : UUID_500,
    now: () => new Date(FIXED_DATE),
  });
}

function buildIndex({ observations = [], gridFeatures = [] } = {}) {
  return buildRadiusLivingPopulationIndex({
    observations,
    gridFeatures,
    source: SOURCE,
    geometry: GEOMETRY,
  });
}

test("P1-B: 300m radius includes only centroids at or inside 300m", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0), gridFeature("SAMPLE-B", 299), gridFeature("SAMPLE-C", 301)],
    observations: [...fullDay("SAMPLE-A"), ...fullDay("SAMPLE-B"), ...fullDay("SAMPLE-C")],
  });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.deepEqual(result.includedCellIds, ["SAMPLE-A", "SAMPLE-B"]);
  assert.equal(result.analysisUnit, "RADIUS_300M");
});

test("P1-B: 500m radius includes the wider deterministic cell set", () => {
  const index = buildIndex({
    gridFeatures: [
      gridFeature("SAMPLE-A", 0),
      gridFeature("SAMPLE-B", 299),
      gridFeature("SAMPLE-C", 301),
      gridFeature("SAMPLE-D", 499),
      gridFeature("SAMPLE-E", 501),
    ],
    observations: [
      ...fullDay("SAMPLE-A"),
      ...fullDay("SAMPLE-B"),
      ...fullDay("SAMPLE-C"),
      ...fullDay("SAMPLE-D"),
      ...fullDay("SAMPLE-E"),
    ],
  });
  const radius300 = aggregateRadiusLivingPopulation(snapshot(300), index);
  const radius500 = aggregateRadiusLivingPopulation(snapshot(500), index);
  assert.deepEqual(radius500.includedCellIds, ["SAMPLE-A", "SAMPLE-B", "SAMPLE-C", "SAMPLE-D"]);
  assert.ok(radius500.includedCellCount > radius300.includedCellCount);
  assert.ok(radius300.includedCellIds.every((cellId) => radius500.includedCellIds.includes(cellId)));
});

test("P1-B: same immutable inputs create the same output", () => {
  const index = buildIndex({ gridFeatures: [gridFeature("SAMPLE-A", 0)], observations: fullDay("SAMPLE-A") });
  const run = snapshot(300);
  assert.deepEqual(
    aggregateRadiusLivingPopulation(run, index),
    aggregateRadiusLivingPopulation(run, index),
  );
});

test("P1-B: unsupported radius is rejected at aggregation boundary", () => {
  const index = buildIndex({ gridFeatures: [gridFeature("SAMPLE-A", 0)], observations: fullDay("SAMPLE-A") });
  const run = snapshot(300);
  const invalid = { ...run, target: { ...run.target, radiusMeters: 400 } };
  assert.throws(() => aggregateRadiusLivingPopulation(invalid, index), /300 또는 500/);
});

test("P1-B: haversine radius boundary is inclusive and deterministic", () => {
  const boundary = pointNorth(300);
  const outside = pointNorth(300.001);
  assert.ok(Math.abs(haversineDistanceMeters(CENTER, boundary) - 300) < 1e-6);
  assert.equal(isPointWithinRadius(CENTER, boundary, 300), true);
  assert.equal(isPointWithinRadius(CENTER, outside, 300), false);
  assert.equal(isPointWithinRadius(CENTER, boundary, 300), true);
});

test("P1-B: metric-only CELL is excluded and retained as limitation evidence", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [...fullDay("SAMPLE-A"), observation("SAMPLE-METRIC-ONLY", "00", null, { status: "suppressed" })],
  });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(result.excludedMetricOnlyCellCount, 1);
  assert.deepEqual(result.excludedMetricOnlyCellIds, ["SAMPLE-METRIC-ONLY"]);
  assert.equal(result.hourly[0].excludedMetricOnlyCellCount, 1);
  assert.ok(result.limitations.some((item) => item.code === "METRIC_ONLY_CELL_EXCLUDED"));
});

test("P1-B: geometry-only CELL is observation absence rather than population zero", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0), gridFeature("SAMPLE-GEOMETRY-ONLY", 50)],
    observations: fullDay("SAMPLE-A", () => 10),
  });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(result.geometryOnlyIncludedCellCount, 1);
  assert.equal(result.hourly[0].population, 10);
  assert.equal(result.hourly[0].status, "PARTIAL");
  assert.equal(result.hourly[0].noObservationCellCount, 1);
});

test("P1-B: duplicate CELL_ID+TT rows are summed by distinct H_DNG_CD", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [
      observation("SAMPLE-A", "00", 10.1, { dong: "11110000" }),
      observation("SAMPLE-A", "00", 2.2, { dong: "11110001" }),
    ],
  });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.ok(Math.abs(result.hourly[0].population - 12.3) < 1e-12);
  assert.equal(index.duplicateCellHourCombinationCount, 1);
  assert.equal(index.maxAdministrativeDongRowsPerCellHour, 2);
  assert.equal(index.rowSemantics, RADIUS_LIVING_POPULATION_ROW_SEMANTICS);
});

test("P1-B: duplicate candidate key is rejected instead of silently deduped", () => {
  const duplicate = observation("SAMPLE-A", "00", 10, { dong: "11110000" });
  assert.throws(() => buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [duplicate, { ...duplicate }],
  }), /중복 observation/);
});

test("P1-B: hourly output always has deterministic 00 through 23 ordering", () => {
  const index = buildIndex({ gridFeatures: [gridFeature("SAMPLE-A", 0)], observations: fullDay("SAMPLE-A") });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.deepEqual(result.hourly.map((hour) => hour.hour), Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")));
});

test("P1-B: missing hour is NOT_AVAILABLE null and never synthetic zero", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [observation("SAMPLE-A", "00", 7)],
  });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(result.hourly[0].population, 7);
  assert.equal(result.hourly[1].population, null);
  assert.equal(result.hourly[1].status, "NOT_AVAILABLE");
  assert.notEqual(result.hourly[1].population, 0);
});

test("P1-B: suppressed value remains null when it is the only observation", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [observation("SAMPLE-A", "00", null, { status: "suppressed" })],
  });
  const hour = aggregateRadiusLivingPopulation(snapshot(300), index).hourly[0];
  assert.equal(hour.population, null);
  assert.equal(hour.suppressedObservationCount, 1);
  assert.equal(hour.status, "NOT_AVAILABLE");
});

test("P1-B: known subtotal with one suppressed H_DNG row is PARTIAL", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [
      observation("SAMPLE-A", "00", 7.25, { dong: "11110000" }),
      observation("SAMPLE-A", "00", null, { dong: "11110001", status: "suppressed" }),
    ],
  });
  const hour = aggregateRadiusLivingPopulation(snapshot(300), index).hourly[0];
  assert.equal(hour.population, 7.25);
  assert.equal(hour.partiallyKnownCellCount, 1);
  assert.equal(hour.status, "PARTIAL");
});

test("P1-B: decimal population values are preserved without integer rounding", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [
      observation("SAMPLE-A", "00", 1.25, { dong: "11110000" }),
      observation("SAMPLE-A", "00", 2.5, { dong: "11110001" }),
    ],
  });
  assert.equal(aggregateRadiusLivingPopulation(snapshot(300), index).hourly[0].population, 3.75);
});

test("P1-B: complete 24-hour summary is explicitly reference-date scoped", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: fullDay("SAMPLE-A", (hour) => hour),
  });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(result.summary.status, "AVAILABLE");
  assert.equal(result.summary.observedPeakHour, "23");
  assert.equal(result.summary.observedMinimumHour, "00");
  assert.equal(result.summary.dailyMeanPopulation, 11.5);
  assert.equal(result.summary.meaning, "REFERENCE_DATE_24_HOUR_PROFILE");
  assert.ok(result.limitations.some((item) => item.code === "SINGLE_DATE_SNAPSHOT" && item.message.includes("2026-09-06")));
});

test("P1-B: incomplete profile does not manufacture peak, minimum or daily mean", () => {
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [observation("SAMPLE-A", "00", 10)],
  });
  const summary = aggregateRadiusLivingPopulation(snapshot(300), index).summary;
  assert.equal(summary.status, "PARTIAL");
  assert.equal(summary.observedPeakHour, null);
  assert.equal(summary.observedMinimumHour, null);
  assert.equal(summary.dailyMeanPopulation, null);
});

test("P1-B: radius result is never mislabeled as FRAMEONE Market or Submarket", () => {
  const index = buildIndex({ gridFeatures: [gridFeature("SAMPLE-A", 0)], observations: fullDay("SAMPLE-A") });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(result.analysisUnit, "RADIUS_300M");
  assert.notEqual(result.analysisUnit, "FRAMEONE_MARKET");
  assert.notEqual(result.analysisUnit, "FRAMEONE_SUBMARKET");
});

test("P1-B: lineage retains living snapshot, geometry version and inclusion method", () => {
  const index = buildIndex({ gridFeatures: [gridFeature("SAMPLE-A", 0)], observations: fullDay("SAMPLE-A") });
  const result = aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(result.sourceSnapshotId, SOURCE.snapshotId);
  assert.equal(result.lineage.gridGeometry.geometryVersion, GEOMETRY.geometryVersion);
  assert.equal(result.inclusionMethod, RADIUS_LIVING_POPULATION_INCLUSION_METHOD);
  assert.equal(result.lineage.methodology.inclusionMethod, RADIUS_LIVING_POPULATION_INCLUSION_METHOD);
});

test("P1-B: aggregation does not mutate caller inputs", () => {
  const features = [gridFeature("SAMPLE-A", 0)];
  const observations = fullDay("SAMPLE-A");
  const before = JSON.stringify({ features, observations });
  const index = buildIndex({ gridFeatures: features, observations });
  aggregateRadiusLivingPopulation(snapshot(300), index);
  assert.equal(JSON.stringify({ features, observations }), before);
});

test("P1-B: invalid or incompatible geometry fails closed", () => {
  const invalid = gridFeature("SAMPLE-A", 0, { geometry: { type: "Point", coordinates: [127, 37.5] } });
  assert.throws(() => buildIndex({ gridFeatures: [invalid], observations: [] }), /Polygon/);
  const wrongCrs = gridFeature("SAMPLE-B", 0, { properties: { output_crs: "EPSG:5179" } });
  assert.throws(() => buildIndex({ gridFeatures: [wrongCrs], observations: [] }), /contract/);
});

test("P1-B: BasicLocationResult adapter uses DEMAND, CALCULATED_VALUE and CUSTOMER_WITH_NOTE", () => {
  const run = snapshot(300);
  const index = buildIndex({ gridFeatures: [gridFeature("SAMPLE-A", 0)], observations: fullDay("SAMPLE-A") });
  const analysis = aggregateRadiusLivingPopulation(run, index);
  const results = adaptRadiusLivingPopulationResults(run, analysis);
  const hour = results.find((result) => result.metricKey === "living_population.radius.hour.00");
  assert.equal(hour.analysisLayer, "DEMAND");
  assert.equal(hour.analysisUnit.type, "RADIUS_300M");
  assert.equal(hour.valueType, "CALCULATED_VALUE");
  assert.equal(hour.customerDisplayPolicy, "CUSTOMER_WITH_NOTE");
  assert.equal(hour.sourceReferences.length, 2);
  assert.equal(hour.status, "AVAILABLE");
});

test("P1-B: BasicLocationResult adapter preserves PARTIAL rather than claiming complete total", () => {
  const run = snapshot(300);
  const index = buildIndex({
    gridFeatures: [gridFeature("SAMPLE-A", 0)],
    observations: [
      observation("SAMPLE-A", "00", 5, { dong: "11110000" }),
      observation("SAMPLE-A", "00", null, { dong: "11110001", status: "suppressed" }),
    ],
  });
  const analysis = aggregateRadiusLivingPopulation(run, index);
  const hour = adaptRadiusLivingPopulationResults(run, analysis).find(
    (result) => result.metricKey === "living_population.radius.hour.00",
  );
  assert.equal(hour.value, 5);
  assert.equal(hour.status, "PARTIAL");
  assert.equal(hour.confidence, "LOW");
});

test("P1-B integration: current snapshot contract and radius analysis remain reproducible", { timeout: 30_000 }, () => {
  const repositoryRoot = path.join(__dirname, "../..");
  const ingestRoot = path.join(repositoryRoot, "data/seoul-market/v1.1-final/13_SOURCE_INGEST");
  const currentPath = path.join(ingestRoot, "manifests/SRC-SEOUL-LIVING/current.json");
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const manifestPath = path.join(ingestRoot, current.manifest);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const geojsonPath = path.join(repositoryRoot, "data/seoul-market/v1.1-final/09_GEO/LIVING_GRID_250M.geojson");
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));

  function* currentObservations() {
    const pagesDirectory = path.join(ingestRoot, manifest.normalized_path, "pages");
    for (const filename of fs.readdirSync(pagesDirectory).sort()) {
      const content = fs.readFileSync(path.join(pagesDirectory, filename), "utf8");
      for (const line of content.split("\n")) {
        if (line) yield JSON.parse(line);
      }
    }
  }

  const index = buildRadiusLivingPopulationIndex({
    observations: currentObservations(),
    gridFeatures: geojson.features,
    source: {
      sourceId: "SRC-SEOUL-LIVING",
      sourceName: "[내국인] 서울 생활인구(250m)",
      snapshotId: current.snapshot_id,
      referenceDate: current.reference_ymd,
      locator: current.manifest,
    },
    geometry: {
      sourceId: "SRC-SEOUL-LIVING-GRID",
      geometryVersion: "SEOUL_250M_GRID_SHP_2025-05-12",
      outputCrs: "EPSG:4326",
      locator: "data/seoul-market/v1.1-final/09_GEO/LIVING_GRID_250M.geojson",
    },
  });

  assert.equal(manifest.normalized_rows, 253_346);
  assert.equal(index.metricCellCount, 8_559);
  assert.equal(index.geometryCellCount, 10_125);
  assert.equal(index.matchedCellCount, 8_558);
  assert.deepEqual(index.metricOnlyCellIds, ["다사47256125"]);
  assert.equal(index.geometryOnlyCellIds.length, 1_567);
  assert.equal(index.duplicateCellHourCombinationCount, 44_302);
  assert.equal(index.maxAdministrativeDongRowsPerCellHour, 4);

  const targetFeature = geojson.features.find((feature) => feature.properties.grid_id === "다사53005400");
  assert.ok(targetFeature);
  const ring = targetFeature.geometry.coordinates[0];
  const target = {
    longitude: (Math.min(...ring.map(([longitude]) => longitude)) + Math.max(...ring.map(([longitude]) => longitude))) / 2,
    latitude: (Math.min(...ring.map(([, latitude]) => latitude)) + Math.max(...ring.map(([, latitude]) => latitude))) / 2,
  };
  const makeRun = (radiusMeters, uuid) => createAnalysisRunSnapshot({
    target: { source: "map", confirmedAddress: null, ...target, radiusMeters },
    frameone: { marketId: "SAMPLE-INTEGRATION-MARKET", marketName: "Sample Integration Market" },
  }, { randomUUID: () => uuid, now: () => new Date(FIXED_DATE) });
  const radius300 = aggregateRadiusLivingPopulation(makeRun(300, UUID_300), index);
  const radius500 = aggregateRadiusLivingPopulation(makeRun(500, UUID_500), index);
  assert.equal(radius300.referenceDate, "2026-09-06");
  assert.equal(radius300.hourly.length, 24);
  assert.ok(radius300.includedCellCount > 0);
  assert.ok(radius500.includedCellCount > radius300.includedCellCount);
  assert.ok(radius300.includedCellIds.every((cellId) => radius500.includedCellIds.includes(cellId)));
  assert.equal(radius300.excludedMetricOnlyCellCount, 1);
});
