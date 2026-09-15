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
  adaptOfficialMarketStatisticsResults,
  adaptOfficialSalesResults,
  adaptOfficialStoresResults,
  adaptOfficialTrendResults,
} = require("../../lib/market-data/basic-location/official-market-stats-adapter.ts");
const { createAnalysisRunSnapshot } = require("../../lib/market-data/basic-location/run.ts");

// SAMPLE fixtures only. They do not represent a real market, store, sales value or geometry.
const OFFICIAL_CODE = "3119999";
const OFFICIAL_NAME = "Sample Official Area";
const REFERENCE_PERIOD = "2026-Q1";
const FETCHED_AT = "2026-09-15T01:00:00.000Z";

function snapshot() {
  return createAnalysisRunSnapshot({
    target: { source: "map", confirmedAddress: null, latitude: 37.5, longitude: 127, radiusMeters: 500 },
    frameone: { marketId: "SAMPLE-MARKET", marketName: "Sample Market" },
  }, {
    randomUUID: () => "66666666-6666-4666-8666-666666666666",
    now: () => new Date(FETCHED_AT),
  });
}

function observation(sourceId, metric, value, unit, dataStatus = "available", overrides = {}) {
  return {
    sourceId,
    referencePeriod: REFERENCE_PERIOD,
    geographyType: "official_market",
    geographyId: OFFICIAL_CODE,
    geographyName: OFFICIAL_NAME,
    industryCode: "CS100005",
    industryName: "제과점",
    metric,
    value,
    unit,
    dataStatus,
    ...overrides,
  };
}

function salesObservations(amount = 1200000, count = 120) {
  return [
    observation("SRC-SEOUL-SALES", "monthly_sales_amount", amount, "KRW"),
    observation("SRC-SEOUL-SALES", "monthly_sales_count", count, "count"),
  ];
}

function storeObservations() {
  return [
    observation("SRC-SEOUL-STORES", "similar_industry_store_count", 12, "count"),
    observation("SRC-SEOUL-STORES", "store_count", 10, "count"),
    observation("SRC-SEOUL-STORES", "franchise_store_count", 2, "count"),
    observation("SRC-SEOUL-STORES", "opening_rate", 5, "percent"),
    observation("SRC-SEOUL-STORES", "opening_store_count", 1, "count"),
    observation("SRC-SEOUL-STORES", "closing_rate", 10, "percent"),
    observation("SRC-SEOUL-STORES", "closing_store_count", 1, "count"),
  ];
}

function sourceState(observations, overrides = {}) {
  return {
    status: "success",
    referencePeriod: REFERENCE_PERIOD,
    observations,
    error: null,
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}

function adapterInput(state) {
  return {
    snapshot: snapshot(),
    officialMarketCode: OFFICIAL_CODE,
    officialMarketName: OFFICIAL_NAME,
    state,
  };
}

function trendFixture() {
  return {
    officialMarketCode: OFFICIAL_CODE,
    officialMarketName: OFFICIAL_NAME,
    industryCode: "CS100005",
    industryName: "제과점",
    latestQuarterCode: "20261",
    latestReferencePeriod: "2026-Q1",
    periods: [
      {
        quarterCode: "20254",
        referencePeriod: "2025-Q4",
        estimatedSalesAmount: 1000000,
        storeCount: 10,
        salesQoqRate: null,
        storeCountDelta: null,
        dataStatus: "available",
      },
      {
        quarterCode: "20261",
        referencePeriod: "2026-Q1",
        estimatedSalesAmount: 1200000,
        storeCount: 8,
        salesQoqRate: 20,
        storeCountDelta: -2,
        dataStatus: "available",
      },
    ],
    dataStatus: "available",
  };
}

function trendState(trend = trendFixture(), overrides = {}) {
  return { status: "success", trend, error: null, fetchedAt: FETCHED_AT, ...overrides };
}

test("Slice 3: official SALES Results use the existing normalized metrics", () => {
  const results = adaptOfficialSalesResults(adapterInput(sourceState(salesObservations())));
  const amount = results.find((result) => result.metricKey.endsWith("monthly_sales_amount"));
  assert.equal(amount.value, 1200000);
  assert.equal(amount.valueType, "ESTIMATED_VALUE");
  assert.equal(amount.primarySource.sourceId, "SRC-SEOUL-SALES");
});

test("Slice 3: SALES stays on OFFICIAL_COMMERCIAL_AREA instead of radius or FRAMEONE units", () => {
  const results = adaptOfficialSalesResults(adapterInput(sourceState(salesObservations())));
  assert.ok(results.every((result) => result.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA"));
  assert.ok(results.every((result) => !["RADIUS_300M", "RADIUS_500M", "FRAMEONE_MARKET"].includes(result.analysisUnit.type)));
  assert.ok(results.every((result) => result.analysisUnit.id === OFFICIAL_CODE));
});

test("Slice 3: official STORES Results preserve all seven current Source metrics", () => {
  const results = adaptOfficialStoresResults(adapterInput(sourceState(storeObservations())));
  assert.equal(results.length, 7);
  assert.equal(results.find((result) => result.metricKey === "official_commercial_area.stores.store_count").value, 10);
  assert.ok(results.every((result) => result.valueType === "OFFICIAL_VALUE"));
});

test("Slice 3: STORES count remains distinct from Kakao observed search count", () => {
  const result = adaptOfficialStoresResults(adapterInput(sourceState(storeObservations()))).find(
    (item) => item.metricKey.endsWith("similar_industry_store_count"),
  );
  assert.equal(result.analysisUnit.type, "OFFICIAL_COMMERCIAL_AREA");
  assert.equal(result.valueType, "OFFICIAL_VALUE");
  assert.doesNotMatch(result.metricKey, /kakao|nearby/);
});

test("Slice 3: Trend source values and existing calculated changes keep distinct value types", () => {
  const results = adaptOfficialTrendResults(adapterInput(trendState()));
  const sales = results.find((result) => result.metricKey.endsWith("estimated_sales_amount") && result.referencePeriod === "2026-Q1");
  const stores = results.find((result) => result.metricKey.endsWith("store_count") && result.referencePeriod === "2026-Q1");
  const qoq = results.find((result) => result.metricKey.endsWith("sales_qoq_rate") && result.referencePeriod === "2026-Q1");
  const delta = results.find((result) => result.metricKey.endsWith("store_count_delta") && result.referencePeriod === "2026-Q1");
  assert.equal(sales.valueType, "ESTIMATED_VALUE");
  assert.equal(stores.valueType, "OFFICIAL_VALUE");
  assert.equal(qoq.valueType, "CALCULATED_VALUE");
  assert.equal(delta.value, -2);
  assert.equal(delta.valueType, "CALCULATED_VALUE");
});

test("Slice 3: every Result preserves its actual referencePeriod", () => {
  const current = adaptOfficialSalesResults(adapterInput(sourceState(salesObservations())));
  const trend = adaptOfficialTrendResults(adapterInput(trendState()));
  assert.ok(current.every((result) => result.referencePeriod === "2026-Q1"));
  assert.deepEqual([...new Set(trend.map((result) => result.referencePeriod))], ["2025-Q4", "2026-Q1"]);
});

test("Slice 3: explicit official zero is AVAILABLE while normalized missing remains null", () => {
  const observations = salesObservations(0, null);
  observations[1].dataStatus = "missing";
  const results = adaptOfficialSalesResults(adapterInput(sourceState(observations)));
  const amount = results.find((result) => result.metricKey.endsWith("monthly_sales_amount"));
  const count = results.find((result) => result.metricKey.endsWith("monthly_sales_count"));
  assert.equal(amount.value, 0);
  assert.equal(amount.status, "AVAILABLE");
  assert.equal(count.value, null);
  assert.equal(count.status, "NOT_AVAILABLE");
  assert.notEqual(count.value, 0);
});

test("Slice 3: successful no-data and Source failure use different missing reasons", () => {
  const noData = adaptOfficialSalesResults(adapterInput(sourceState([])))[0];
  const failed = adaptOfficialSalesResults(adapterInput(sourceState(null, {
    status: "error",
    error: "sample Source failure",
  })))[0];
  assert.equal(noData.missingReason, "NO_DATA");
  assert.equal(failed.missingReason, "SOURCE_ERROR");
  assert.equal(noData.value, null);
  assert.equal(failed.value, null);
});

test("Slice 3: official market ID mismatches are rejected", () => {
  const observations = salesObservations();
  observations[0].geographyId = "3119998";
  assert.throws(
    () => adaptOfficialSalesResults(adapterInput(sourceState(observations))),
    /공식상권 ID/,
  );
});

test("Slice 3: parser-invalid and suppressed values remain null rather than zero", () => {
  const observations = salesObservations(null, null);
  observations[0].dataStatus = "invalid";
  observations[1].dataStatus = "suppressed";
  const results = adaptOfficialSalesResults(adapterInput(sourceState(observations)));
  assert.ok(results.every((result) => result.value === null));
  assert.equal(results[0].missingReason, "UNKNOWN");
  assert.equal(results[1].missingReason, "NO_DATA");
  assert.ok(results[0].limitations.some((item) => item.code === "INVALID_SOURCE_VALUE"));
  assert.ok(results[1].limitations.some((item) => item.code === "SOURCE_SUPPRESSED"));
});

test("Slice 3: official statistics keep scope limitations and customer note policy", () => {
  const results = [
    ...adaptOfficialSalesResults(adapterInput(sourceState(salesObservations()))),
    ...adaptOfficialStoresResults(adapterInput(sourceState(storeObservations()))),
  ];
  assert.ok(results.every((result) => result.customerDisplayPolicy === "CUSTOMER_WITH_NOTE"));
  assert.ok(results.every((result) => result.limitations.some((item) => item.code === "OFFICIAL_AREA_SCOPE_ONLY")));
  assert.ok(results.every((result) => result.limitations.some((item) => item.code === "UNIT_SCOPE_MISMATCH_RISK")));
});

test("Slice 3: SALES success and STORES failure remain independently usable", () => {
  const results = adaptOfficialMarketStatisticsResults({
    snapshot: snapshot(),
    officialMarketCode: OFFICIAL_CODE,
    officialMarketName: OFFICIAL_NAME,
    sales: sourceState(salesObservations()),
    stores: sourceState(null, { status: "error", error: "sample STORES failure" }),
    trend: trendState(null, { status: "idle" }),
  });
  const sales = results.filter((result) => result.metricKey.includes(".sales."));
  const stores = results.filter((result) => result.metricKey.includes(".stores."));
  assert.ok(sales.every((result) => result.status === "AVAILABLE"));
  assert.ok(stores.every((result) => result.status === "NOT_AVAILABLE" && result.missingReason === "SOURCE_ERROR"));
});

test("Slice 3: malformed count, percent and period inputs are rejected", () => {
  const negativeCount = storeObservations();
  negativeCount.find((item) => item.metric === "store_count").value = -1;
  assert.throws(() => adaptOfficialStoresResults(adapterInput(sourceState(negativeCount))), /음수/);
  const invalidRate = storeObservations();
  invalidRate.find((item) => item.metric === "opening_rate").value = 101;
  assert.throws(() => adaptOfficialStoresResults(adapterInput(sourceState(invalidRate))), /0~100/);
  assert.throws(
    () => adaptOfficialSalesResults(adapterInput(sourceState(salesObservations(), { referencePeriod: "20261" }))),
    /YYYY-Q1~Q4/,
  );
});
