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
const { buildMarketAnalysisContext: build } = require("../../lib/market-data/market-analysis-context.ts");

// Synthetic fixtures only. No customer data or claimed real market statistics.
const execution = (source = "address", radius = 500) => ({
  source, confirmedAddress: source === "address" ? "fixture confirmed address" : null,
  analysisPoint: { longitude: 127, latitude: 37.5 }, analysisRadiusMeters: radius,
});
const relation = (code, value) => ({
  marketCode: `fixture-${code}`, marketName: `fixture ${code}`,
  relation: value, analysisRadiusMeters: 500,
});
const observation = (metric, value, sourceId = "SRC-SEOUL-STORES", dataStatus = "available") => ({
  sourceId, referencePeriod: "2026-Q2", geographyType: "official_market",
  geographyId: "fixture-inside", geographyName: "fixture official inside",
  industryCode: "CS100005", industryName: "fixture bakery industry", metric, value,
  unit: metric === "monthly_sales_amount" ? "KRW" : "count", dataStatus,
  metadata: { rawReferencePeriod: "20262", officialMarketTypeCode: "fixture-type" },
});
function publicFixture(dataStatus = "available") {
  return {
    officialMarketCode: "fixture-inside", officialMarketName: "fixture official inside",
    industryCode: "CS100005", industryName: "fixture bakery industry",
    quarterCode: "20262", referencePeriod: "2026-Q2", dataStatus,
    sales: dataStatus === "available" ? [observation("monthly_sales_amount", 123456, "SRC-SEOUL-SALES")] : [],
    stores: dataStatus === "missing" ? [] : [
      observation("similar_industry_store_count", 12), observation("store_count", 9),
      observation("franchise_store_count", 3), observation("closing_store_count", null, "SRC-SEOUL-STORES", "suppressed"),
      observation("opening_store_count", 0),
    ],
  };
}
function input() {
  return {
    executedAnalysis: null, selectedFrameoneMarket: null, selectedFrameoneSubmarket: null,
    kakaoNearby: { status: "idle", response: null, error: null },
    officialMarkets: { status: "idle", error: null, results: null, manuallySelected: null },
    publicData: { requestStatus: "idle", requestedOfficialMarketCode: null, data: null, error: null },
  };
}
function analyzedInput() {
  const state = input(); state.executedAnalysis = execution();
  state.officialMarkets = { status: "success", error: null, manuallySelected: null,
    results: [relation("inside", "INSIDE"), relation("overlap", "RADIUS_OVERLAP"), relation("outside", "OUTSIDE"), relation("unknown", "UNKNOWN")] };
  return state;
}
function selectManual(state, code = "inside") {
  state.officialMarkets.manuallySelected = { marketCode: `fixture-${code}`, marketName: `fixture official ${code}` };
}
function loadPublic(state, dataStatus = "available") {
  selectManual(state);
  state.publicData = { requestStatus: "success", requestedOfficialMarketCode: "fixture-inside", data: publicFixture(dataStatus), error: null };
}
function nearbyFixture() {
  return { status: "success", error: null, response: { categories: ["bakery", "confectionery", "cafe"].map((id, index) => ({
    id, totalCount: [11, 11, 63][index], places: [{
      id: index < 2 ? "fixture-shared-place" : "fixture-cafe", name: "fixture place",
      categoryId: id, categoryLabel: `fixture ${id}`, address: "fixture place address",
      longitude: 127, latitude: 37.5, distanceM: 10,
    }],
  })) } };
}

test("Context CASE A: pre-analysis is null/idle without invented zero or UNKNOWN", () => {
  const result = build(input());
  assert.equal(result.schemaVersion, "market-analysis-context-v1");
  assert.equal(result.target, null);
  assert.deepEqual(result.frameone, {
    selectedMarketId: null, selectedMarketName: null,
    selectedSubmarketId: null, selectedSubmarketName: null,
  });
  assert.deepEqual(result.kakaoNearby, { status: "idle", error: null, bakery: null, confectionery: null, cafe: null });
  assert.deepEqual(result.officialMarkets, { status: "idle", error: null, relatedMarkets: null, unknownMarkets: null, manuallySelected: null });
  assert.deepEqual(result.publicData, { requestStatus: "idle", status: null, selectedOfficialMarketData: null, error: null });
  assert.ok(!JSON.stringify(result).includes("UNKNOWN"));
});
test("Context CASE B: address, confirmed point and executed 500m preserved", () => {
  const state = analyzedInput();
  assert.deepEqual(build(state).target, {
    source: "address", confirmedAddress: "fixture confirmed address", analysisPoint: state.executedAnalysis.analysisPoint, executedRadiusMeters: 500,
  });
});
test("Context CASE C: map analysis permits null address", () => {
  const state = analyzedInput(); state.executedAnalysis = execution("map", 300);
  assert.deepEqual(build(state).target, {
    source: "map", confirmedAddress: null, analysisPoint: state.executedAnalysis.analysisPoint, executedRadiusMeters: 300,
  });
});
test("Context CASE D: draft edits cannot overwrite the executed radius/point/address", () => {
  const state = analyzedInput();
  const before = build(state);
  // These fields intentionally are not part of the builder contract.
  state.radiusM = 300; state.candidateAddress = "fixture unexecuted address";
  state.selectedPoint = { longitude: 128, latitude: 38 };
  assert.deepEqual(build(state), before);
  assert.equal(build(state).target.executedRadiusMeters, 500);
});
test("Context CASE E: current FRAMEONE Market/Submarket IDs and names remain a separate staff selection", () => {
  const state = analyzedInput(); loadPublic(state);
  state.selectedFrameoneMarket = { marketId: "fixture-frameone", marketName: "fixture FRAMEONE" };
  state.selectedFrameoneSubmarket = { submarketId: "fixture-submarket", submarketName: "fixture FRAMEONE submarket" };
  const result = build(state);
  assert.deepEqual(result.frameone, {
    selectedMarketId: "fixture-frameone", selectedMarketName: "fixture FRAMEONE",
    selectedSubmarketId: "fixture-submarket", selectedSubmarketName: "fixture FRAMEONE submarket",
  });
  assert.equal(result.publicData.selectedOfficialMarketData.officialMarketCode, "fixture-inside");
  state.selectedFrameoneMarket = null; state.selectedFrameoneSubmarket = null;
  assert.deepEqual(build(state).officialMarkets, result.officialMarkets);
});
test("Context CASE F: all INSIDE and RADIUS_OVERLAP results survive together", () => {
  const state = analyzedInput();
  state.officialMarkets.results.push(relation("inside2", "INSIDE"), relation("overlap2", "RADIUS_OVERLAP"));
  const result = build(state).officialMarkets;
  assert.deepEqual(result.relatedMarkets.map((item) => item.marketCode), ["fixture-inside", "fixture-overlap", "fixture-inside2", "fixture-overlap2"]);
  assert.deepEqual(result.unknownMarkets, [relation("unknown", "UNKNOWN")]);
  assert.equal(result.manuallySelected, null);
});
test("Context CASE G: manual overlap selection never replaces spatial results", () => {
  const state = analyzedInput(), before = build(state).officialMarkets.relatedMarkets;
  selectManual(state, "overlap");
  const result = build(state).officialMarkets;
  assert.deepEqual(result.relatedMarkets, before);
  assert.equal(result.manuallySelected.marketCode, "fixture-overlap");
  assert.deepEqual(result.manuallySelected.spatialRelation, relation("overlap", "RADIUS_OVERLAP"));
});
test("Context CASE H: manual OUTSIDE remains OUTSIDE without confirmed/crosswalk promotion", () => {
  const state = analyzedInput(); selectManual(state, "outside");
  const result = build(state);
  assert.equal(result.officialMarkets.manuallySelected.spatialRelation.relation, "OUTSIDE");
  assert.ok(!result.officialMarkets.relatedMarkets.some((item) => item.marketCode === "fixture-outside"));
  assert.ok(!JSON.stringify(result).includes('"confirmed"'));
});
test("Context CASE I: three independent Kakao search categories preserve overlapping IDs and counts", () => {
  const state = analyzedInput(); state.kakaoNearby = nearbyFixture();
  const result = build(state);
  assert.deepEqual(Object.keys(result.kakaoNearby), ["status", "error", "bakery", "confectionery", "cafe"]);
  for (const category of state.kakaoNearby.response.categories) {
    assert.equal(result.kakaoNearby[category.id].totalCount, category.totalCount);
    assert.deepEqual(result.kakaoNearby[category.id].places, category.places);
  }
  assert.equal(result.kakaoNearby.bakery.places[0].id, result.kakaoNearby.confectionery.places[0].id);
});
for (const [letter, status] of [["J", "available"], ["K", "partial"], ["L", "missing"]]) {
  test(`Context CASE ${letter}: public ${status} contract, quarter and referencePeriod preserved`, () => {
    const state = analyzedInput(); loadPublic(state, status);
    const result = build(state).publicData;
    assert.equal(result.requestStatus, "success"); assert.equal(result.status, status);
    assert.deepEqual(result.selectedOfficialMarketData, state.publicData.data);
    assert.equal(result.selectedOfficialMarketData.quarterCode, "20262");
    assert.equal(result.selectedOfficialMarketData.referencePeriod, "2026-Q2");
  });
}
test("Context CASE M: observations retain metrics, metadata, null, zero and source without summing", () => {
  const state = analyzedInput(); loadPublic(state);
  const result = build(state).publicData.selectedOfficialMarketData;
  assert.deepEqual(result, state.publicData.data);
  assert.deepEqual(result.stores.map((item) => item.value), [12, 9, 3, null, 0]);
  assert.equal(result.sales[0].metric, "monthly_sales_amount");
  assert.equal(result.sales[0].sourceId, "SRC-SEOUL-SALES");
  assert.equal(result.sales[0].geographyId, result.officialMarketCode);
});
test("Context CASE N: address and map use exactly the same builder structure", () => {
  const address = analyzedInput(), map = analyzedInput(); map.executedAnalysis = execution("map");
  const a = build(address), b = build(map);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  assert.deepEqual(Object.keys(a.target), Object.keys(b.target));
  assert.deepEqual({ ...a, target: null }, { ...b, target: null });
});
test("Context CASE O: deterministic, no source mutations, recursively read-only independent snapshots", () => {
  const state = analyzedInput(); loadPublic(state); state.kakaoNearby = nearbyFixture();
  const original = structuredClone(state), a = build(state), b = build(state);
  assert.deepEqual(a, b); assert.deepEqual(state, original);
  assert.equal(Object.isFrozen(state.publicData.data), false);
  assert.equal(Object.isFrozen(a.publicData.selectedOfficialMarketData.stores[0].metadata), true);
  assert.throws(() => a.kakaoNearby.bakery.places.push({}), TypeError);
  state.executedAnalysis.analysisPoint.longitude = 128;
  state.publicData.data.stores[0].value = 999;
  state.kakaoNearby.response.categories[0].places[0].name = "fixture changed";
  state.officialMarkets.results[0].relation = "OUTSIDE";
  assert.deepEqual(a, b);
});

test("Context statuses: Kakao idle/loading/transport error have no synthetic category zeros", () => {
  for (const status of ["idle", "loading", "error"]) {
    const state = analyzedInput(); state.kakaoNearby = { status, response: null, error: status === "error" ? "fixture transport error" : null };
    const result = build(state).kakaoNearby;
    assert.equal(result.status, status);
    assert.equal(result.bakery, null); assert.equal(result.confectionery, null); assert.equal(result.cafe, null);
    assert.equal(result.error, state.kakaoNearby.error);
  }
});
test("Context statuses: category failure 0 is unknown; successful zero stays zero; missing category stays null", () => {
  const state = analyzedInput();
  state.kakaoNearby = { status: "error", error: "fixture category error", response: { categories: [
    { id: "bakery", totalCount: 0, places: [], error: "fixture category error" },
    { id: "confectionery", totalCount: 0, places: [] },
  ] } };
  const result = build(state).kakaoNearby;
  assert.equal(result.bakery.status, "error"); assert.equal(result.bakery.totalCount, null);
  assert.equal(result.confectionery.status, "success"); assert.equal(result.confectionery.totalCount, 0);
  assert.equal(result.cafe, null);
});
test("Context statuses: no spatial relation, unknown geometry, layer failure and public failure are distinct", () => {
  const state = analyzedInput(); selectManual(state, "outside");
  state.officialMarkets.results = [relation("outside", "OUTSIDE"), relation("unknown", "UNKNOWN")];
  state.publicData = { requestStatus: "error", requestedOfficialMarketCode: "fixture-outside", data: null, error: "fixture Seoul error" };
  let result = build(state);
  assert.deepEqual(result.officialMarkets.relatedMarkets, []);
  assert.equal(result.officialMarkets.status, "success");
  assert.equal(result.officialMarkets.unknownMarkets[0].relation, "UNKNOWN");
  assert.equal(result.publicData.requestStatus, "error"); assert.equal(result.publicData.status, null);
  for (const status of ["loading", "error"]) {
    state.officialMarkets.status = status; state.officialMarkets.results = null;
    state.officialMarkets.error = status === "error" ? "fixture geometry load error" : null;
    result = build(state);
    assert.equal(result.officialMarkets.status, status); assert.equal(result.officialMarkets.relatedMarkets, null);
    assert.equal(result.officialMarkets.manuallySelected.spatialRelation, null);
    assert.equal(result.publicData.error, "fixture Seoul error");
  }
});
test("Context guards: previous official request/result cannot leak into a new manual selection", () => {
  const state = analyzedInput(); loadPublic(state); selectManual(state, "outside");
  for (const requestStatus of ["loading", "error", "success"]) {
    state.publicData.requestStatus = requestStatus; state.publicData.error = "fixture stale error";
    assert.deepEqual(build(state).publicData, { requestStatus: "idle", status: null, selectedOfficialMarketData: null, error: null });
  }
  selectManual(state); state.publicData.data.officialMarketCode = "fixture-other";
  assert.equal(build(state).publicData.selectedOfficialMarketData, null);
  state.officialMarkets.manuallySelected = null;
  assert.equal(build(state).publicData.requestStatus, "idle");
});
test("Context guards: public reference before target execution remains official data without invented spatial relation", () => {
  const state = input(); loadPublic(state);
  const result = build(state);
  assert.equal(result.target, null); assert.equal(result.officialMarkets.relatedMarkets, null);
  assert.equal(result.officialMarkets.manuallySelected.spatialRelation, null);
  assert.equal(result.publicData.status, "available");
});
