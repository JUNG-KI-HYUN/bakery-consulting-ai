/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
  createRadiusLivingPopulationApiRequest,
  parseRadiusLivingPopulationApiRequest,
  parseRadiusLivingPopulationApiResponse,
  toRadiusLivingPopulationApiResponse,
} = require("../../lib/market-data/basic-location/radius-living-population-runtime.ts");
const { createAnalysisRunSnapshot } = require("../../lib/market-data/basic-location/run.ts");
const { adaptRadiusLivingPopulationResults } = require("../../lib/market-data/basic-location/radius-living-population-adapter.ts");
const { buildGeometryDependentBlockedResults } = require("../../lib/market-data/basic-location/adapters.ts");
const { collectBasicLocationResults } = require("../../lib/market-data/basic-location/result-collection.ts");
const { applyBasicLocationDisplayPolicy } = require("../../lib/market-data/basic-location/display-policy.ts");
const { buildBasicLocationInterpretation } = require("../../lib/market-data/basic-location/interpretation.ts");
const { buildP0BasicLocationViewModel } = require("../../lib/market-data/basic-location/view-model.ts");
const { acceptRunBoundSourceUpdate, buildMarketAnalysisContext } = require("../../lib/market-data/market-analysis-context.ts");

// SAMPLE fixtures only. Population, coordinates and source locators are not production facts.
const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GENERATED_AT = "2026-09-18T00:00:00.000Z";

function snapshot(radiusMeters = 500, uuid = UUID_A) {
  return createAnalysisRunSnapshot({
    target: { source: "map", confirmedAddress: null, latitude: 37.5, longitude: 127, radiusMeters },
    frameone: {
      districtId: "SAMPLE-DISTRICT", districtName: "SAMPLE DISTRICT",
      marketId: "SAMPLE-MARKET", marketName: "SAMPLE MARKET",
      submarketId: null, submarketName: null, nodeId: null, nodeName: null,
    },
  }, { randomUUID: () => uuid, now: () => new Date(GENERATED_AT) });
}

function safeAnalysis(run, { partial = false } = {}) {
  const hourly = Array.from({ length: 24 }, (_, index) => ({
    hour: String(index).padStart(2, "0"),
    population: partial && index === 12 ? null : 100 + index,
    status: partial ? (index === 12 ? "NOT_AVAILABLE" : "PARTIAL") : "AVAILABLE",
    includedCellCount: 2,
    contributingCellCount: partial && index === 12 ? 0 : 2,
    completeCellCount: partial ? 1 : 2,
    partiallyKnownCellCount: partial && index !== 12 ? 1 : 0,
    unavailableCellCount: partial && index === 12 ? 2 : 0,
    noObservationCellCount: 0,
    suppressedObservationCount: partial ? 1 : 0,
    missingObservationCount: 0,
    invalidObservationCount: 0,
    excludedMetricOnlyCellCount: 0,
  }));
  return {
    contractVersion: "FRAMEONE_RADIUS_LIVING_POPULATION_V1",
    analysisRunId: run.analysisRunId,
    generatedAt: GENERATED_AT,
    sourceId: "SRC-SEOUL-LIVING",
    sourceSnapshotId: "SAMPLE-SNAPSHOT",
    referenceDate: "2026-09-06",
    radiusMeters: run.target.radiusMeters,
    analysisUnit: run.target.radiusMeters === 300 ? "RADIUS_300M" : "RADIUS_500M",
    inclusionMethod: "CELL_CENTROID_WITHIN_RADIUS",
    rowSemantics: "SUM_H_DNG_ROWS_PER_CELL_HOUR",
    includedCellCount: 2,
    includedMetricCellCount: 2,
    geometryOnlyIncludedCellCount: 0,
    excludedMetricOnlyCellCount: 0,
    hourly,
    summary: partial ? {
      status: "PARTIAL", observedPeakHour: null, observedPeakPopulation: null,
      observedMinimumHour: null, observedMinimumPopulation: null, dailyMeanPopulation: null,
      meaning: "REFERENCE_DATE_24_HOUR_PROFILE",
    } : {
      status: "AVAILABLE", observedPeakHour: "23", observedPeakPopulation: 123,
      observedMinimumHour: "00", observedMinimumPopulation: 100, dailyMeanPopulation: 111.5,
      meaning: "REFERENCE_DATE_24_HOUR_PROFILE",
    },
    limitations: [
      { code: "STATISTICAL_ESTIMATE_NOT_ACTUAL", message: "SAMPLE statistical estimate." },
      { code: "CENTROID_INCLUSION", message: "SAMPLE centroid inclusion." },
    ],
    lineage: {
      livingPopulation: { sourceId: "SRC-SEOUL-LIVING", sourceName: "[내국인] 서울 생활인구(250m)", snapshotId: "SAMPLE-SNAPSHOT", referenceDate: "2026-09-06", locator: "sample/living" },
      gridGeometry: { sourceId: "SRC-SEOUL-LIVING-GRID", geometryVersion: "SAMPLE-GRID-V1", outputCrs: "EPSG:4326", locator: "sample/grid" },
      methodology: { version: "RADIUS_LIVING_POPULATION_CENTROID_V1", inclusionMethod: "CELL_CENTROID_WITHIN_RADIUS", rowSemantics: "SUM_H_DNG_ROWS_PER_CELL_HOUR" },
    },
  };
}

function response(run, options) {
  return { analysis: safeAnalysis(run, options), referenceDate: "2026-09-06", dayOfWeek: "SUNDAY" };
}

function request(run) {
  return createRadiusLivingPopulationApiRequest(run);
}

function groups(overrides = {}) {
  return { target: [], frameone: [], blocked: [], kakao: [], officialRelation: [], officialStats: [], demand: [], ...overrides };
}

function sourceState(run, analysis, status = "success") {
  return {
    requestStatus: status,
    referenceDate: status === "success" ? "2026-09-06" : null,
    dayOfWeek: status === "success" ? "SUNDAY" : null,
    radiusMeters: status === "success" ? run.target.radiusMeters : null,
    analysis: status === "success" ? analysis : null,
  };
}

function viewModel(run, { partial = false, includeBlocked = false, status = "success" } = {}) {
  const analysis = safeAnalysis(run, { partial });
  const demand = status === "success" ? adaptRadiusLivingPopulationResults(run, analysis) : [];
  const results = collectBasicLocationResults({
    analysisRunId: run.analysisRunId,
    resultGroups: groups({ blocked: includeBlocked ? buildGeometryDependentBlockedResults(run) : [], demand }),
  });
  const staff = applyBasicLocationDisplayPolicy(results, "STAFF");
  return buildP0BasicLocationViewModel({
    analysisRunId: run.analysisRunId,
    audience: "STAFF",
    displayableResults: staff,
    interpretation: buildBasicLocationInterpretation({ analysisRunId: run.analysisRunId, results }),
    livingPopulation: sourceState(run, analysis, status),
  });
}

function contextInput(run, livingPopulation) {
  return {
    executedAnalysis: null,
    runSnapshot: run,
    selectedFrameoneMarket: null,
    kakaoNearby: { status: "idle", response: null, error: null, analysisRunId: run.analysisRunId, completedAt: null },
    officialMarkets: { status: "idle", error: null, analysisRunId: run.analysisRunId, completedAt: null, results: null, manuallySelected: null },
    publicData: { requestStatus: "idle", requestedOfficialMarketCode: null, data: null, error: null, analysisRunId: run.analysisRunId, completedAt: null },
    livingPopulation,
  };
}

test("P1-D 01: 300m request contains exactly four allowed fields", () => assert.deepEqual(Object.keys(request(snapshot(300))), ["analysisRunId", "lat", "lng", "radiusMeters"]));
test("P1-D 02: 500m request preserves run, coordinates and radius", () => assert.deepEqual(request(snapshot()), { analysisRunId: `basic-location-run:${UUID_A}`, lat: 37.5, lng: 127, radiusMeters: 500 }));
test("P1-D 03: server parser accepts a valid 300m request", () => assert.equal(parseRadiusLivingPopulationApiRequest(request(snapshot(300))).radiusMeters, 300));
test("P1-D 04: server parser accepts a valid 500m request", () => assert.equal(parseRadiusLivingPopulationApiRequest(request(snapshot())).radiusMeters, 500));
test("P1-D 05: server parser rejects null", () => assert.throws(() => parseRadiusLivingPopulationApiRequest(null), /object/));
test("P1-D 06: server parser rejects arrays", () => assert.throws(() => parseRadiusLivingPopulationApiRequest([]), /object/));
test("P1-D 07: server parser rejects extra client fields", () => assert.throws(() => parseRadiusLivingPopulationApiRequest({ ...request(snapshot()), rawRows: [] }), /unsupported/));
test("P1-D 08: server parser rejects an empty run id", () => assert.throws(() => parseRadiusLivingPopulationApiRequest({ ...request(snapshot()), analysisRunId: " " }), /analysisRunId/));
test("P1-D 09: server parser rejects non-finite latitude", () => assert.throws(() => parseRadiusLivingPopulationApiRequest({ ...request(snapshot()), lat: NaN }), /lat/));
test("P1-D 10: server parser rejects latitude outside WGS84", () => assert.throws(() => parseRadiusLivingPopulationApiRequest({ ...request(snapshot()), lat: 91 }), /WGS84/));
test("P1-D 11: server parser rejects longitude outside WGS84", () => assert.throws(() => parseRadiusLivingPopulationApiRequest({ ...request(snapshot()), lng: 181 }), /WGS84/));
test("P1-D 12: server parser rejects unsupported radius", () => assert.throws(() => parseRadiusLivingPopulationApiRequest({ ...request(snapshot()), radiusMeters: 400 }), /300 or 500/));
test("P1-D 13: server parser rejects a missing coordinate", () => { const body = request(snapshot()); delete body.lat; assert.throws(() => parseRadiusLivingPopulationApiRequest(body), /lat/); });
test("P1-D 14: response parser accepts the V1 ordered 24-hour contract", () => { const run = snapshot(); assert.equal(parseRadiusLivingPopulationApiResponse(response(run), request(run)).analysis.hourly.length, 24); });
test("P1-D 15: response parser rejects a stale run", () => assert.throws(() => parseRadiusLivingPopulationApiResponse(response(snapshot()), request(snapshot(500, UUID_B))), /different analysis run/));
test("P1-D 16: response parser rejects a different radius", () => assert.throws(() => parseRadiusLivingPopulationApiResponse(response(snapshot(300)), { ...request(snapshot(300)), radiusMeters: 500 }), /different analysis run/));
test("P1-D 17: response parser rejects a different contract version", () => { const run = snapshot(); const value = response(run); value.analysis.contractVersion = "V0"; assert.throws(() => parseRadiusLivingPopulationApiResponse(value, request(run)), /24-hour contract/); });
test("P1-D 18: response parser rejects fewer than 24 hours", () => { const run = snapshot(); const value = response(run); value.analysis.hourly = value.analysis.hourly.slice(0, 23); assert.throws(() => parseRadiusLivingPopulationApiResponse(value, request(run)), /24-hour contract/); });
test("P1-D 19: response parser rejects out-of-order hours", () => { const run = snapshot(); const value = response(run); value.analysis.hourly[0].hour = "01"; assert.throws(() => parseRadiusLivingPopulationApiResponse(value, request(run)), /24-hour contract/); });
test("P1-D 20: response parser rejects mismatched reference date", () => { const run = snapshot(); const value = response(run); value.referenceDate = "2026-09-07"; assert.throws(() => parseRadiusLivingPopulationApiResponse(value, request(run)), /metadata/); });
test("P1-D 21: response parser rejects an unknown weekday", () => { const run = snapshot(); const value = response(run); value.dayOfWeek = "FUNDAY"; assert.throws(() => parseRadiusLivingPopulationApiResponse(value, request(run)), /metadata/); });
test("P1-D 22: client response rejects server-only cell identifiers", () => { const run = snapshot(); const value = response(run); value.analysis.includedCellIds = ["SAMPLE-CELL"]; assert.throws(() => parseRadiusLivingPopulationApiResponse(value, request(run)), /server-only/); });
test("P1-D 23: API sanitizer removes both raw cell-id arrays", () => { const value = response(snapshot()); value.analysis.includedCellIds = ["SAMPLE-A"]; value.analysis.excludedMetricOnlyCellIds = ["SAMPLE-B"]; const safe = toRadiusLivingPopulationApiResponse(value); assert.equal("includedCellIds" in safe.analysis, false); assert.equal("excludedMetricOnlyCellIds" in safe.analysis, false); });
test("P1-D 24: stale source update preserves the active state", () => { const current = { analysisRunId: "B", status: "loading" }; assert.equal(acceptRunBoundSourceUpdate("B", current, { analysisRunId: "A", status: "success" }), current); });
test("P1-D 25: matching source update is accepted", () => { const incoming = { analysisRunId: "B", status: "success" }; assert.equal(acceptRunBoundSourceUpdate("B", { analysisRunId: "B", status: "loading" }, incoming), incoming); });

test("P1-D 26: context stores only aggregated living-population state", () => {
  const run = snapshot();
  const living = { status: "success", response: response(run), error: null, analysisRunId: run.analysisRunId, completedAt: GENERATED_AT };
  const context = buildMarketAnalysisContext(contextInput(run, living));
  assert.equal(context.livingPopulation.analysis.hourly.length, 24);
  assert.equal(context.sourceCompletion.livingPopulationCompletedAt, GENERATED_AT);
  assert.equal("includedCellIds" in context.livingPopulation.analysis, false);
});

test("P1-D 27: stale living source is reset independently", () => {
  const run = snapshot();
  const old = snapshot(500, UUID_B);
  const living = { status: "success", response: response(old), error: null, analysisRunId: old.analysisRunId, completedAt: GENERATED_AT };
  const context = buildMarketAnalysisContext(contextInput(run, living));
  assert.equal(context.livingPopulation.requestStatus, "idle");
  assert.equal(context.livingPopulation.analysis, null);
  assert.equal(context.sourceCompletion.livingPopulationCompletedAt, null);
});

test("P1-D 28: Demand Results are collected after official statistics", () => {
  const run = snapshot();
  const demand = adaptRadiusLivingPopulationResults(run, safeAnalysis(run));
  const output = collectBasicLocationResults({ analysisRunId: run.analysisRunId, resultGroups: groups({ demand }) });
  assert.equal(output[0].metricKey, "living_population.radius.included_cell_count");
  assert.equal(output.at(-1).metricKey, "living_population.radius.hour.23");
});

test("P1-D 29: successful complete demand removes only living pending items", () => {
  const model = viewModel(snapshot());
  assert.equal(model.presentation.evidence.livingPopulation.summary.dailyMeanPopulation, 111.5);
  assert.equal(model.presentation.evidence.livingPopulation.hourlyProfile.length, 24);
  assert.ok(!model.presentation.summary.unavailableNow.some((item) => item.id === "living-population-demand"));
  assert.ok(!model.presentation.summary.nextAnalysis.some((item) => item.id === "living-population"));
  assert.ok(model.presentation.summary.nextAnalysis.some((item) => item.id === "transit-pedestrian"));
});

test("P1-D 30: PARTIAL summary remains null while known profile values remain partial", () => {
  const living = viewModel(snapshot(), { partial: true }).presentation.evidence.livingPopulation;
  assert.equal(living.summary.status, "PARTIAL");
  assert.equal(living.summary.dailyMeanPopulation, null);
  assert.equal(living.summary.observedPeakPopulation, null);
  assert.equal(living.hourlyProfile[0].population, 100);
  assert.equal(living.hourlyProfile[0].status, "PARTIAL");
  assert.equal(living.hourlyProfile[12].population, null);
});

test("P1-D 31: living failure remains generic and keeps its pending scope", () => {
  const model = viewModel(snapshot(), { status: "error" });
  assert.equal(model.presentation.evidence.livingPopulation.statusLabel, "불러오기 실패");
  assert.equal(model.presentation.evidence.livingPopulation.basisResultIds.length, 0);
  assert.ok(model.presentation.summary.unavailableNow.some((item) => item.id === "living-population-demand" && item.stateLabel === "현재 불러오기 실패"));
});

test("P1-D 32: radius demand success coexists with FRAMEONE geometry BLOCKED Results", () => {
  const model = viewModel(snapshot(), { includeBlocked: true });
  assert.equal(model.presentation.evidence.livingPopulation.statusLabel, "확인");
  assert.ok(model.limitations.results.some((item) => item.status === "BLOCKED"));
  assert.ok(model.availableEvidence.demand.length >= 24);
});

test("P1-D 33: staff evidence preserves source, value type, methodology and result id", () => {
  const model = viewModel(snapshot());
  const hour = model.dataEvidence.find((item) => item.metricKey === "living_population.radius.hour.00");
  assert.equal(hour.primarySource.sourceId, "SRC-SEOUL-LIVING");
  assert.equal(hour.referenceDate, "2026-09-06");
  assert.equal(hour.analysisUnit.type, "RADIUS_500M");
  assert.equal(hour.valueType, "CALCULATED_VALUE");
  assert.match(hour.methodologyNote, /methodologyVersion=RADIUS_LIVING_POPULATION_CENTROID_V1/);
  assert.match(hour.resultId, /living_population\.radius\.hour\.00$/);
  assert.ok(model.presentation.audit.groups.some((group) => group.id === "living-population"));
});

test("P1-D 34: demand interpretation is reference-only and avoids demand ranking", () => {
  const model = viewModel(snapshot());
  assert.ok(model.currentInterpretation.referenceSignals.some((signal) => signal.message.includes("수요의 높고 낮음 판정이 아닙니다")));
  assert.equal(model.currentInterpretation.riskSignals.some((signal) => signal.message.includes("수요가 높")), false);
});

test("P1-D 35: 300m and 500m runs retain their own analysis units", () => {
  assert.equal(viewModel(snapshot(300)).presentation.evidence.livingPopulation.radiusMeters, 300);
  assert.equal(viewModel(snapshot(500)).presentation.evidence.livingPopulation.radiusMeters, 500);
});

test("P1-D 36: living failure does not erase independent Kakao or official results", () => {
  const run = snapshot();
  const input = contextInput(run, {
    status: "error", response: null, error: "generic living failure",
    analysisRunId: run.analysisRunId, completedAt: GENERATED_AT,
  });
  input.kakaoNearby = {
    status: "success", error: null, analysisRunId: run.analysisRunId, completedAt: GENERATED_AT,
    response: { categories: [{ id: "bakery", totalCount: 1, places: [] }] },
  };
  input.officialMarkets = {
    status: "success", error: null, analysisRunId: run.analysisRunId, completedAt: GENERATED_AT,
    results: [], manuallySelected: null,
  };
  const context = buildMarketAnalysisContext(input);
  assert.equal(context.livingPopulation.requestStatus, "error");
  assert.equal(context.kakaoNearby.bakery.totalCount, 1);
  assert.equal(context.officialMarkets.status, "success");
});
