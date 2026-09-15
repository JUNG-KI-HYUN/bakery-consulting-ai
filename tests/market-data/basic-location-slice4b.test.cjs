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
  buildBasicLocationInterpretation,
} = require("../../lib/market-data/basic-location/interpretation.ts");
const {
  createAvailableResult,
  createGeometryBlockedResult,
  createUnavailableResult,
} = require("../../lib/market-data/basic-location/results.ts");

// SAMPLE fixtures only. They do not represent real locations, stores, sales or geometry.
const RUN_ID = "basic-location-run:dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UPDATED_AT = "2026-09-15T04:00:00.000Z";

function unit(type = "RADIUS_500M", id = "sample-radius", label = "분석 반경 500m") {
  return { type, id, label };
}

function availableResult({
  metricKey,
  metricLabel = metricKey,
  value = 1,
  resultUnit = "count",
  analysisUnit = unit(),
  valueType = "CALCULATED_VALUE",
  limitations = [],
  fieldCheckRequired = false,
  fieldCheckKeys = [],
  referencePeriod = null,
}) {
  return createAvailableResult({
    analysisRunId: RUN_ID,
    analysisLayer: "DATA_EVIDENCE",
    analysisUnit,
    metricKey,
    metricLabel,
    value,
    unit: resultUnit,
    valueType,
    primarySource: null,
    sourceReferences: [],
    referenceDate: referencePeriod ? null : "2026-09-15",
    referencePeriod,
    confidence: "HIGH",
    confidenceReasons: [{ code: "SAMPLE_ONLY", message: "Sample fixture." }],
    limitations,
    fieldCheckRequired,
    fieldCheckKeys,
    customerDisplayPolicy: limitations.length > 0 ? "CUSTOMER_WITH_NOTE" : "CUSTOMER_READY",
    methodologyNote: null,
    updatedAt: UPDATED_AT,
  });
}

function unavailableResult(metricKey, missingReason = "SOURCE_ERROR") {
  return createUnavailableResult({
    analysisRunId: RUN_ID,
    analysisLayer: "SURROUNDING_POI",
    analysisUnit: unit(),
    metricKey,
    metricLabel: metricKey,
    unit: "places",
    primarySource: null,
    sourceReferences: [],
    referenceDate: "2026-09-15",
    referencePeriod: null,
    limitations: [{ code: "SEARCH_NOT_CENSUS", message: "검색결과는 전수자료가 아닙니다.", severity: "CAUTION" }],
    missingReason,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "HIDDEN",
    methodologyNote: null,
    updatedAt: UPDATED_AT,
  });
}

function interpret(results) {
  return buildBasicLocationInterpretation({ analysisRunId: RUN_ID, results });
}

function allSignals(output) {
  return [
    ...(output.summary ? [output.summary] : []),
    ...output.confirmedSignals,
    ...output.referenceSignals,
    ...output.riskSignals,
    ...output.unknowns,
    ...output.nextChecks,
  ];
}

test("Slice 4B: identical input produces an identical deterministic Interpretation", () => {
  const results = [availableResult({ metricKey: "frameone.market.name", metricLabel: "FRAMEONE 주요상권", value: "Sample Market", resultUnit: null, valueType: "CANONICAL_VALUE", analysisUnit: unit("FRAMEONE_MARKET", "SAMPLE-MARKET", "Sample Market") })];
  assert.deepEqual(interpret(results), interpret(results));
});

test("Slice 4B: every emitted Signal has non-empty basisResultIds", () => {
  const results = [availableResult({ metricKey: "frameone.market.name", value: "Sample Market", resultUnit: null, valueType: "CANONICAL_VALUE", analysisUnit: unit("FRAMEONE_MARKET", "SAMPLE-MARKET", "Sample Market") })];
  assert.ok(allSignals(interpret(results)).every((signal) => signal.basisResultIds.length > 0));
});

test("Slice 4B: Kakao returned count remains a search observation rather than a competitor census", () => {
  const result = availableResult({
    metricKey: "kakao.nearby.bakery.returned_count",
    metricLabel: "Kakao 베이커리 검색 반환건수",
    value: 3,
    resultUnit: "places",
    valueType: "OBSERVED_SOURCE_VALUE",
    limitations: [{ code: "SEARCH_NOT_CENSUS", message: "Kakao 장소검색 결과이며 전체 사업체 전수조사가 아닙니다.", severity: "CAUTION" }],
  });
  const message = interpret([result]).referenceSignals[0].message;
  assert.match(message, /검색조건의 반환값/);
  assert.match(message, /실제 전체 경쟁점 수가 아닙니다/);
  assert.doesNotMatch(message, /과밀|포화|경쟁이 (높|낮)/);
});

test("Slice 4B: Kakao zero and Source error remain distinct", () => {
  const zero = availableResult({
    metricKey: "kakao.nearby.cafe.returned_count",
    metricLabel: "Kakao 카페 검색 반환건수",
    value: 0,
    resultUnit: "places",
    valueType: "OBSERVED_SOURCE_VALUE",
  });
  const zeroOutput = interpret([zero]);
  assert.match(zeroOutput.referenceSignals[0].message, /검색조건에서 0건/);
  assert.match(zeroOutput.referenceSignals[0].message, /실제 경쟁점이 0개라는 뜻은 아닙니다/);

  const failed = unavailableResult("kakao.nearby.cafe.returned_count");
  const failedOutput = interpret([failed]);
  assert.equal(failedOutput.referenceSignals.length, 0);
  assert.match(failedOutput.unknowns[0].message, /Source 오류나 미실행/);
  assert.match(failedOutput.unknowns[0].message, /0건으로 해석하지 않습니다/);
});

test("Slice 4B: official commercial area relation stays separate from FRAMEONE and 500m boundaries", () => {
  const result = availableResult({
    metricKey: "official_commercial_area.spatial_relation",
    metricLabel: "공간관계",
    value: "INSIDE",
    resultUnit: null,
    analysisUnit: unit("OFFICIAL_COMMERCIAL_AREA", "3119999", "Sample Official Area"),
    limitations: [{ code: "UNIT_SCOPE_MISMATCH_RISK", message: "공식상권은 분석반경과 다른 공간단위입니다.", severity: "CAUTION" }],
  });
  const message = interpret([result]).confirmedSignals[0].message;
  assert.match(message, /서울시 공식상권/);
  assert.match(message, /FRAMEONE Market과 별개/);
  assert.doesNotMatch(message, /500m 경계/);
});

test("Slice 4B: SALES remains estimated official-area data instead of radius or candidate-store sales", () => {
  const result = availableResult({
    metricKey: "official_commercial_area.sales.monthly_sales_amount",
    metricLabel: "공식상권 월 추정매출",
    value: 1200000,
    resultUnit: "KRW",
    analysisUnit: unit("OFFICIAL_COMMERCIAL_AREA", "3119999", "Sample Official Area"),
    valueType: "ESTIMATED_VALUE",
    referencePeriod: "2026-Q1",
  });
  const message = interpret([result]).referenceSignals[0].message;
  assert.match(message, /공식상권.*전체/);
  assert.match(message, /추정매출/);
  assert.match(message, /300m\/500m 반경 또는 후보점포 매출이 아닙니다/);
});

test("Slice 4B: STORES is not summed with Kakao returned counts", () => {
  const stores = availableResult({
    metricKey: "official_commercial_area.stores.store_count",
    metricLabel: "공식상권 점포 수",
    value: 10,
    analysisUnit: unit("OFFICIAL_COMMERCIAL_AREA", "3119999", "Sample Official Area"),
    valueType: "OFFICIAL_VALUE",
    referencePeriod: "2026-Q1",
  });
  const kakao = availableResult({
    metricKey: "kakao.nearby.bakery.returned_count",
    metricLabel: "Kakao 베이커리 검색 반환건수",
    value: 3,
    resultUnit: "places",
    valueType: "OBSERVED_SOURCE_VALUE",
  });
  const output = interpret([stores, kakao]);
  assert.equal(output.referenceSignals.length, 2);
  assert.match(output.referenceSignals[0].message, /Kakao 검색 반환건수와 합산하지 않습니다/);
  assert.ok(!output.referenceSignals.some((signal) => /13/.test(signal.message)));
});

test("Slice 4B: Trend values do not create location-quality verdicts", () => {
  const result = availableResult({
    metricKey: "official_commercial_area.trend.20261.sales_qoq_rate",
    metricLabel: "공식상권 추정매출 전분기 대비",
    value: 20,
    resultUnit: "percent",
    analysisUnit: unit("OFFICIAL_COMMERCIAL_AREA", "3119999", "Sample Official Area"),
    referencePeriod: "2026-Q1",
  });
  const output = interpret([result]);
  assert.match(output.referenceSignals[0].message, /기록된 값과 증감만 설명/);
  assert.doesNotMatch(JSON.stringify(output), /성장상권|쇠퇴|유망|창업 위험/);
});

test("Slice 4B: geometry BLOCKED remains unknown and is never converted to zero", () => {
  const result = createGeometryBlockedResult({
    analysisRunId: RUN_ID,
    analysisLayer: "DEMAND",
    analysisUnit: unit("FRAMEONE_MARKET", "SAMPLE-MARKET", "Sample Market"),
    metricKey: "living_population.market_aggregation",
    metricLabel: "Market 생활인구 공간집계",
    unit: "people",
    primarySource: null,
    sourceReferences: [],
    referenceDate: "2026-09-15",
    referencePeriod: null,
    limitations: [{ code: "GEOMETRY_UNCONFIRMED", message: "검증된 FRAMEONE geometry가 없습니다.", severity: "BLOCKING" }],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: null,
    updatedAt: UPDATED_AT,
  });
  const output = interpret([result]);
  assert.equal(output.unknowns.length, 1);
  assert.match(output.unknowns[0].message, /geometry가 없어 집계하지 않았습니다/);
  assert.match(output.unknowns[0].message, /0으로 바꾸거나.*대체하지 않습니다/);
});

test("Slice 4B: fieldCheckRequired creates deduplicated next checks", () => {
  const first = availableResult({
    metricKey: "kakao.nearby.bakery.returned_count",
    fieldCheckRequired: true,
    fieldCheckKeys: ["COMPETITOR_OPEN_CHECK"],
  });
  const second = availableResult({
    metricKey: "kakao.nearby.cafe.returned_count",
    fieldCheckRequired: true,
    fieldCheckKeys: ["COMPETITOR_OPEN_CHECK"],
  });
  const output = interpret([first, second]);
  assert.equal(output.nextChecks.length, 1);
  assert.equal(output.nextChecks[0].basisResultIds.length, 2);
  assert.match(output.nextChecks[0].message, /실제 영업 여부/);
});

test("Slice 4B: repeated identical limitations become one warning with merged basis", () => {
  const limitation = { code: "UNIT_SCOPE_MISMATCH_RISK", message: "공식상권 전체값은 분석반경 값이 아닙니다.", severity: "CAUTION" };
  const sales = availableResult({ metricKey: "official_commercial_area.sales.monthly_sales_amount", limitations: [limitation] });
  const stores = availableResult({ metricKey: "official_commercial_area.stores.store_count", limitations: [limitation] });
  const output = interpret([sales, stores]);
  assert.equal(output.riskSignals.length, 1);
  assert.deepEqual(output.riskSignals[0].basisResultIds, [sales.resultId, stores.resultId]);
});

test("Slice 4B: every basisResultId points to an actual input Result", () => {
  const results = [
    availableResult({ metricKey: "frameone.market.name", value: "Sample Market", resultUnit: null, valueType: "CANONICAL_VALUE", analysisUnit: unit("FRAMEONE_MARKET", "SAMPLE-MARKET", "Sample Market") }),
    unavailableResult("kakao.nearby.unique_returned_count"),
  ];
  const ids = new Set(results.map((result) => result.resultId));
  assert.ok(allSignals(interpret(results)).every(
    (signal) => signal.basisResultIds.every((resultId) => ids.has(resultId)),
  ));
});

test("Slice 4B: Interpretation does not mutate input Results", () => {
  const results = [availableResult({
    metricKey: "kakao.nearby.bakery.returned_count",
    limitations: [{ code: "SEARCH_NOT_CENSUS", message: "검색결과는 전수자료가 아닙니다.", severity: "CAUTION" }],
  })];
  const before = structuredClone(results);
  interpret(results);
  assert.deepEqual(results, before);
});

test("Slice 4B: partial Source failure preserves available evidence and an unknown", () => {
  const sales = availableResult({
    metricKey: "official_commercial_area.sales.monthly_sales_amount",
    metricLabel: "공식상권 월 추정매출",
    value: 1200000,
    resultUnit: "KRW",
    analysisUnit: unit("OFFICIAL_COMMERCIAL_AREA", "3119999", "Sample Official Area"),
    valueType: "ESTIMATED_VALUE",
    referencePeriod: "2026-Q1",
  });
  const stores = unavailableResult("official_commercial_area.stores.store_count");
  const output = interpret([sales, stores]);
  assert.equal(output.referenceSignals.length, 1);
  assert.equal(output.unknowns.length, 1);
  assert.equal(output.unknowns[0].basisResultIds[0], stores.resultId);
});

test("Slice 4B: address and Node limitations create specific next checks", () => {
  const address = availableResult({
    metricKey: "analysis.target.confirmed_address",
    value: "Sample address",
    resultUnit: null,
    limitations: [{ code: "ANALYSIS_ADDRESS_NOT_BUILDING_VERIFICATION", message: "후보건물 검증 결과가 아닙니다.", severity: "CAUTION" }],
  });
  const node = availableResult({
    metricKey: "frameone.node.type",
    value: "MICRO_AREA",
    resultUnit: null,
    analysisUnit: unit("FRAMEONE_NODE", "SAMPLE-NODE", "Sample Node"),
    valueType: "CANONICAL_VALUE",
    limitations: [{ code: "FRAMEONE_NODE_LOCATION_UNVERIFIED", message: "검증된 Node 위치가 아닙니다.", severity: "CAUTION" }],
  });
  const output = interpret([address, node]);
  assert.equal(output.nextChecks.length, 2);
  assert.ok(output.nextChecks.some((signal) => /후보점포 및 출입구/.test(signal.message)));
  assert.ok(output.nextChecks.some((signal) => /실제 공간위치와 보행동선/.test(signal.message)));
});
