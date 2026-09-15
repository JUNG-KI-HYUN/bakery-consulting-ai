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

const { adaptKakaoNearbyResults } = require("../../lib/market-data/basic-location/kakao-nearby-adapter.ts");
const { adaptOfficialCommercialAreaRelationResults } = require("../../lib/market-data/basic-location/official-commercial-area-adapter.ts");
const { createAnalysisRunSnapshot } = require("../../lib/market-data/basic-location/run.ts");

// SAMPLE fixtures only. They are not real stores, official markets, coordinates or geometry.
const FIXED_DATE = "2026-09-14T03:00:00.000Z";
const UUID_300 = "33333333-3333-4333-8333-333333333333";
const UUID_500 = "55555555-5555-4555-8555-555555555555";

function snapshot(radiusMeters = 300) {
  return createAnalysisRunSnapshot({
    target: {
      source: "map",
      confirmedAddress: null,
      latitude: 37.5,
      longitude: 127,
      radiusMeters,
    },
    frameone: { marketId: "SAMPLE-MARKET", marketName: "Sample Market" },
  }, {
    randomUUID: () => radiusMeters === 300 ? UUID_300 : UUID_500,
    now: () => new Date(FIXED_DATE),
  });
}

function samplePlace() {
  return {
    id: "SAMPLE-NORMALIZED-PLACE",
    name: "Sample Bakery",
    categoryId: "bakery",
    categoryLabel: "베이커리",
    address: "Sample address",
    latitude: 37.5001,
    longitude: 127.0001,
    distanceM: 20,
    matchedCategoryIds: ["bakery", "confectionery"],
    matchedCategoryLabels: ["베이커리", "제과점"],
  };
}

function kakaoInput(radiusMeters = 300, overrides = {}) {
  const run = snapshot(radiusMeters);
  const place = samplePlace();
  return {
    snapshot: run,
    fetchedAt: FIXED_DATE,
    searchState: {
      status: "success",
      error: null,
      response: {
        center: { latitude: run.target.latitude, longitude: run.target.longitude },
        radiusM: radiusMeters,
        categories: [
          { id: "bakery", totalCount: 1, places: [place] },
          { id: "confectionery", totalCount: 0, places: [] },
          { id: "cafe", totalCount: 0, places: [] },
        ],
        uniquePlaceCount: 1,
        uniquePlaces: [place],
      },
    },
    ...overrides,
  };
}

function officialInput(radiusMeters = 300, results = [{
  marketCode: "SAMPLE-OFFICIAL-001",
  marketName: "Sample Official Area",
  relation: "INSIDE",
  analysisRadiusMeters: radiusMeters,
}]) {
  return {
    snapshot: snapshot(radiusMeters),
    status: "success",
    results,
    error: null,
    geometryVersion: "sample-geometry-v1",
    sourceDate: "2023-10-20",
    evaluatedAt: FIXED_DATE,
    relationMethodologyVersion: "sample-relation-method-v1",
  };
}

test("Slice 2: 300m Kakao summary and normalized place Evidence are created", () => {
  const output = adaptKakaoNearbyResults(kakaoInput(300));
  const bakery = output.results.find((result) => result.metricKey === "kakao.nearby.bakery.returned_count");
  assert.equal(bakery.analysisUnit.type, "RADIUS_300M");
  assert.equal(bakery.analysisRunId, `basic-location-run:${UUID_300}`);
  assert.equal(output.placeEvidence[0].evidenceType, "KAKAO_NORMALIZED_PLACE");
  assert.equal(output.placeEvidence[0].fieldCheckRequired, true);
});

test("Slice 2: 500m Kakao results stay scoped to RADIUS_500M", () => {
  const output = adaptKakaoNearbyResults(kakaoInput(500));
  assert.ok(output.results.every((result) => result.analysisUnit.type === "RADIUS_500M"));
  assert.ok(output.results.every((result) => result.analysisRunId === `basic-location-run:${UUID_500}`));
});

test("Slice 2: successful Kakao count is OBSERVED_SOURCE_VALUE with limitations", () => {
  const result = adaptKakaoNearbyResults(kakaoInput()).results[0];
  assert.equal(result.valueType, "OBSERVED_SOURCE_VALUE");
  assert.equal(result.customerDisplayPolicy, "CUSTOMER_WITH_NOTE");
  assert.equal(result.confidence, "MEDIUM");
  assert.equal(result.fieldCheckRequired, true);
  assert.ok(result.limitations.some((item) => item.code === "SEARCH_NOT_CENSUS"));
});

test("Slice 2: a successful Kakao zero is preserved only as search-return zero", () => {
  const output = adaptKakaoNearbyResults(kakaoInput());
  const result = output.results.find((item) => item.metricKey === "kakao.nearby.cafe.returned_count");
  assert.equal(result.value, 0);
  assert.equal(result.status, "AVAILABLE");
  assert.match(result.metricLabel, /검색 반환건수/);
  assert.ok(result.limitations.some((item) => item.code === "SEARCH_NOT_CENSUS"));
});

test("Slice 2: Kakao Source failure is null/SOURCE_ERROR and never competitor zero", () => {
  const input = kakaoInput();
  input.searchState = { status: "error", response: null, error: "sample source failure" };
  const result = adaptKakaoNearbyResults(input).results[0];
  assert.equal(result.value, null);
  assert.equal(result.status, "NOT_AVAILABLE");
  assert.equal(result.missingReason, "SOURCE_ERROR");
  assert.notEqual(result.value, 0);
});

test("Slice 2: official market ID/name remain separate OFFICIAL_VALUE Results", () => {
  const results = adaptOfficialCommercialAreaRelationResults(officialInput());
  const id = results.find((result) => result.metricKey === "official_commercial_area.id");
  const name = results.find((result) => result.metricKey === "official_commercial_area.name");
  assert.equal(id.value, "SAMPLE-OFFICIAL-001");
  assert.equal(name.value, "Sample Official Area");
  assert.equal(id.valueType, "OFFICIAL_VALUE");
  assert.equal(name.valueType, "OFFICIAL_VALUE");
});

test("Slice 2: official spatial relation is a calculated result", () => {
  const result = adaptOfficialCommercialAreaRelationResults(officialInput()).find(
    (item) => item.metricKey === "official_commercial_area.spatial_relation",
  );
  assert.equal(result.value, "INSIDE");
  assert.equal(result.valueType, "CALCULATED_VALUE");
  assert.equal(result.analysisUnit.type, "OFFICIAL_COMMERCIAL_AREA");
  assert.ok(result.limitations.some((item) => item.code === "UNIT_SCOPE_MISMATCH_RISK"));
});

test("Slice 2: official area and FRAMEONE Market analysis units cannot be confused", () => {
  const result = adaptOfficialCommercialAreaRelationResults(officialInput()).find(
    (item) => item.metricKey === "official_commercial_area.id",
  );
  assert.equal(result.analysisUnit.type, "OFFICIAL_COMMERCIAL_AREA");
  assert.notEqual(result.analysisUnit.type, "FRAMEONE_MARKET");
  assert.equal(result.primarySource.sourceType, "PUBLIC_DATA_OFFICIAL");
});

test("Slice 2: no official relation is calculated zero while Source error is unavailable", () => {
  const outside = adaptOfficialCommercialAreaRelationResults(officialInput(300, [{
    marketCode: "SAMPLE-OFFICIAL-OUTSIDE",
    marketName: "Sample Outside Area",
    relation: "OUTSIDE",
    analysisRadiusMeters: 300,
  }]))[0];
  const failedInput = officialInput();
  failedInput.status = "error";
  failedInput.results = null;
  failedInput.error = "sample layer failure";
  const failed = adaptOfficialCommercialAreaRelationResults(failedInput)[0];
  assert.equal(outside.value, 0);
  assert.equal(outside.status, "AVAILABLE");
  assert.equal(failed.value, null);
  assert.equal(failed.status, "NOT_AVAILABLE");
  assert.equal(failed.missingReason, "SOURCE_ERROR");
});

test("Slice 2: invalid Kakao coordinates and radius mismatch are rejected", () => {
  const invalidCoordinate = kakaoInput();
  invalidCoordinate.searchState.response.uniquePlaces[0].latitude = Number.NaN;
  assert.throws(() => adaptKakaoNearbyResults(invalidCoordinate), /latitude/);
  const invalidRadius = kakaoInput();
  invalidRadius.searchState.response.radiusM = 500;
  assert.throws(() => adaptKakaoNearbyResults(invalidRadius), /응답 반경/);
});

test("Slice 2: invalid official ID and relation radius are rejected", () => {
  const invalidId = officialInput(300, [{
    marketCode: "",
    marketName: "Sample Area",
    relation: "INSIDE",
    analysisRadiusMeters: 300,
  }]);
  assert.throws(() => adaptOfficialCommercialAreaRelationResults(invalidId), /marketCode/);
  const invalidRadius = officialInput(300, [{
    marketCode: "SAMPLE-OFFICIAL-002",
    marketName: "Sample Area",
    relation: "RADIUS_OVERLAP",
    analysisRadiusMeters: 500,
  }]);
  assert.throws(() => adaptOfficialCommercialAreaRelationResults(invalidRadius), /관계 반경/);
});
