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
  applyBasicLocationDisplayPolicy,
} = require("../../lib/market-data/basic-location/display-policy.ts");
const {
  buildBasicLocationInterpretation,
} = require("../../lib/market-data/basic-location/interpretation.ts");
const {
  createAvailableResult,
  createGeometryBlockedResult,
  createUnavailableResult,
} = require("../../lib/market-data/basic-location/results.ts");
const {
  buildP0BasicLocationViewModel,
  P0BasicLocationViewModelValidationError,
} = require("../../lib/market-data/basic-location/view-model.ts");

// SAMPLE fixtures only. They are not real locations, stores, sales or geometry.
const RUN_ID = "basic-location-run:55555555-5555-4555-8555-555555555555";
const OTHER_RUN_ID = "basic-location-run:66666666-6666-4666-8666-666666666666";
const UPDATED_AT = "2026-09-16T05:00:00.000Z";

const units = {
  radius500: { type: "RADIUS_500M", id: "sample-radius-500", label: "분석 반경 500m" },
  market: { type: "FRAMEONE_MARKET", id: "sample-market", label: "Sample Market" },
  district: { type: "FRAMEONE_MARKET", id: "sample-district", label: "Sample District" },
  submarket: { type: "FRAMEONE_SUBMARKET", id: "sample-submarket", label: "Sample Submarket" },
  node: { type: "FRAMEONE_NODE", id: "sample-node", label: "Sample Node" },
  official: { type: "OFFICIAL_COMMERCIAL_AREA", id: "sample-official", label: "Sample Official Area" },
};

const note = (code, message, severity = "CAUTION") => ({ code, message, severity });

function available({
  analysisRunId = RUN_ID,
  metricKey,
  metricLabel = metricKey,
  value,
  resultUnit = null,
  valueType = "CANONICAL_VALUE",
  analysisLayer = "DATA_EVIDENCE",
  analysisUnit = units.radius500,
  policy = "CUSTOMER_READY",
  limitations = [],
  fieldCheckRequired = false,
  fieldCheckKeys = [],
  referenceDate = "2026-09-16",
  referencePeriod = null,
  sourceName = "Sample source",
}) {
  return createAvailableResult({
    analysisRunId,
    analysisLayer,
    analysisUnit,
    metricKey,
    metricLabel,
    value,
    unit: resultUnit,
    valueType,
    primarySource: { sourceId: "sample-source", sourceName, sourceType: "ANALYSIS_INPUT" },
    sourceReferences: [{ sourceId: "sample-source", locator: "sample-locator", sourceVersion: "v1" }],
    referenceDate,
    referencePeriod,
    confidence: "HIGH",
    confidenceReasons: [{ code: "SAMPLE_ONLY", message: "Sample fixture." }],
    limitations,
    fieldCheckRequired,
    fieldCheckKeys,
    customerDisplayPolicy: policy,
    methodologyNote: "Sample methodology.",
    updatedAt: UPDATED_AT,
  });
}

function blocked() {
  return createGeometryBlockedResult({
    analysisRunId: RUN_ID,
    analysisLayer: "DEMAND",
    analysisUnit: units.market,
    metricKey: "frameone.market.floating_population",
    metricLabel: "FRAMEONE Market 생활인구",
    unit: "people",
    primarySource: null,
    sourceReferences: [],
    referenceDate: null,
    referencePeriod: null,
    limitations: [note("GEOMETRY_REQUIRED", "검증 geometry가 없어 집계하지 않았습니다.", "BLOCKING")],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
    methodologyNote: null,
    updatedAt: UPDATED_AT,
  });
}

function unavailable() {
  return createUnavailableResult({
    analysisRunId: RUN_ID,
    analysisLayer: "SURROUNDING_POI",
    analysisUnit: units.radius500,
    metricKey: "kakao.nearby.cafe.returned_count",
    metricLabel: "카페 검색 반환건수",
    unit: "places",
    primarySource: { sourceId: "kakao", sourceName: "Kakao Local", sourceType: "EXTERNAL_PLATFORM" },
    sourceReferences: [],
    referenceDate: "2026-09-16",
    referencePeriod: null,
    limitations: [note("SEARCH_NOT_CENSUS", "검색 반환건수는 전체 점포수가 아닙니다.")],
    missingReason: "SOURCE_ERROR",
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
    methodologyNote: null,
    updatedAt: UPDATED_AT,
  });
}

function fixtureResults() {
  return [
    available({ metricKey: "analysis.target.latitude", value: 37.5, policy: "INTERNAL_ONLY" }),
    available({ metricKey: "analysis.target.longitude", value: 127, policy: "INTERNAL_ONLY" }),
    available({ metricKey: "analysis.target.radius_meters", value: 500, resultUnit: "m", policy: "INTERNAL_ONLY" }),
    available({ metricKey: "analysis.target.source", value: "address", policy: "INTERNAL_ONLY" }),
    available({
      metricKey: "analysis.target.confirmed_address",
      metricLabel: "분석대상 확인 주소",
      value: "Sample confirmed address",
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("NOT_BUILDING_VERIFIED", "후보건물로 검증된 주소를 의미하지 않습니다.")],
      fieldCheckRequired: true,
      fieldCheckKeys: ["target.entrance"],
    }),
    available({ metricKey: "frameone.district.name", value: "Sample District", analysisLayer: "MARKET_IDENTITY", analysisUnit: units.district }),
    available({ metricKey: "frameone.market.id", value: "sample-market", policy: "INTERNAL_ONLY", analysisLayer: "MARKET_IDENTITY", analysisUnit: units.market }),
    available({ metricKey: "frameone.market.name", value: "Sample Market", analysisLayer: "MARKET_IDENTITY", analysisUnit: units.market }),
    available({ metricKey: "frameone.submarket.name", value: "Sample Submarket", analysisLayer: "MARKET_IDENTITY", analysisUnit: units.submarket }),
    available({ metricKey: "frameone.node.name", value: "Sample Node", analysisLayer: "MARKET_IDENTITY", analysisUnit: units.node }),
    available({
      metricKey: "frameone.node.address",
      value: "Sample node metadata address",
      policy: "CUSTOMER_WITH_NOTE",
      analysisLayer: "MARKET_IDENTITY",
      analysisUnit: units.node,
      limitations: [note("NOT_VERIFIED_GEOMETRY", "실제 검증 좌표나 경계를 의미하지 않습니다.")],
    }),
    available({
      metricKey: "kakao.nearby.bakery.returned_count",
      metricLabel: "베이커리 검색 반환건수",
      value: 0,
      resultUnit: "places",
      valueType: "OBSERVED_SOURCE_VALUE",
      analysisLayer: "COMPETITION",
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("SEARCH_NOT_CENSUS", "검색 반환건수는 전체 경쟁점 수가 아닙니다.")],
      fieldCheckRequired: true,
      fieldCheckKeys: ["kakao.bakery.operating_status"],
      sourceName: "Kakao Local",
    }),
    available({
      metricKey: "official_commercial_area.spatial_relation",
      metricLabel: "공식상권 공간관계",
      value: "RADIUS_OVERLAP",
      analysisUnit: units.official,
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("BOUNDARY_DISTINCT", "FRAMEONE Market과 동일 경계를 의미하지 않습니다.")],
    }),
    available({
      metricKey: "official_commercial_area.sales.quarter_total_estimated",
      metricLabel: "공식상권 분기 추정매출",
      value: 123456,
      resultUnit: "KRW",
      valueType: "ESTIMATED_VALUE",
      analysisLayer: "DEMAND",
      analysisUnit: units.official,
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("OFFICIAL_AREA_SCOPE", "공식상권 전체 범위의 추정값입니다.")],
      referenceDate: null,
      referencePeriod: "2026-Q1",
    }),
    available({
      metricKey: "official_commercial_area.stores.total_count",
      metricLabel: "공식상권 점포수",
      value: 42,
      resultUnit: "stores",
      valueType: "OFFICIAL_VALUE",
      analysisUnit: units.official,
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("OFFICIAL_AREA_SCOPE", "공식상권 전체 범위 통계입니다.")],
    }),
    available({
      metricKey: "official_commercial_area.trend.sales_qoq_rate",
      metricLabel: "공식상권 매출 전분기 대비",
      value: 2.5,
      resultUnit: "%",
      valueType: "CALCULATED_VALUE",
      analysisLayer: "MARKET_CHANGE",
      analysisUnit: units.official,
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("NO_PROSPECT_JUDGMENT", "증감만으로 유망 여부를 판단하지 않습니다.")],
    }),
    blocked(),
    unavailable(),
    available({ metricKey: "internal.hidden.sample", value: "secret", policy: "HIDDEN" }),
  ];
}

function buildFor(audience, results = fixtureResults()) {
  const displayableResults = applyBasicLocationDisplayPolicy(results, audience);
  const interpretation = buildBasicLocationInterpretation({
    analysisRunId: RUN_ID,
    results: displayableResults.map(({ result }) => result),
  });
  return {
    displayableResults,
    interpretation,
    model: buildP0BasicLocationViewModel({
      analysisRunId: RUN_ID,
      audience,
      displayableResults,
      interpretation,
    }),
  };
}

function allInterpretationSignals(model) {
  return [
    ...(model.currentInterpretation.summary ? [model.currentInterpretation.summary] : []),
    ...model.currentInterpretation.confirmedSignals,
    ...model.currentInterpretation.referenceSignals,
    ...model.currentInterpretation.riskSignals,
    ...model.limitations.unknowns,
    ...model.fieldHandoff.nextChecks,
  ];
}

test("Slice 5B: identical input produces an identical deterministic View Model", () => {
  const first = buildFor("CUSTOMER");
  const second = buildP0BasicLocationViewModel({
    analysisRunId: RUN_ID,
    audience: "CUSTOMER",
    displayableResults: first.displayableResults,
    interpretation: first.interpretation,
  });
  assert.deepEqual(second, first.model);
});

test("Slice 5B: analysisRunId is preserved across the root and Analysis Context", () => {
  const { model } = buildFor("CUSTOMER");
  assert.equal(model.analysisRunId, RUN_ID);
  assert.equal(model.analysisContext.analysisRunId, RUN_ID);
});

test("Slice 5B: CUSTOMER View Model contains only policy-filtered CUSTOMER results", () => {
  const { model } = buildFor("CUSTOMER");
  const keys = model.dataEvidence.map((item) => item.metricKey);
  assert.ok(!keys.includes("analysis.target.latitude"));
  assert.ok(!keys.includes("frameone.market.id"));
  assert.ok(!keys.includes("internal.hidden.sample"));
  assert.ok(keys.includes("analysis.target.confirmed_address"));
});

test("Slice 5B: Interpretation with any hidden basis is excluded as a whole", () => {
  const base = buildFor("CUSTOMER");
  const visibleId = base.displayableResults[0].result.resultId;
  const hiddenId = fixtureResults().at(-1).resultId;
  const interpretation = {
    ...base.interpretation,
    riskSignals: [{
      id: "mixed-hidden-basis",
      message: "This must not be exposed.",
      basisResultIds: [visibleId, hiddenId],
    }],
  };
  const model = buildP0BasicLocationViewModel({
    analysisRunId: RUN_ID,
    audience: "CUSTOMER",
    displayableResults: base.displayableResults,
    interpretation,
  });
  assert.deepEqual(model.currentInterpretation.riskSignals, []);
});

test("Slice 5B: every included Interpretation basis exists in dataEvidence", () => {
  const { model } = buildFor("CUSTOMER");
  const ids = new Set(model.dataEvidence.map((item) => item.resultId));
  for (const signal of allInterpretationSignals(model)) {
    assert.ok(signal.basisResultIds.length > 0);
    assert.ok(signal.basisResultIds.every((resultId) => ids.has(resultId)));
  }
});

test("Slice 5B: STAFF View Model receives internal results but never HIDDEN results", () => {
  const { model } = buildFor("STAFF");
  const keys = model.dataEvidence.map((item) => item.metricKey);
  assert.ok(keys.includes("analysis.target.latitude"));
  assert.ok(keys.includes("frameone.market.id"));
  assert.ok(!keys.includes("internal.hidden.sample"));
  assert.equal(model.analysisContext.target.latitude, 37.5);
  assert.equal(model.analysisContext.frameone.marketId, "sample-market");
});

test("V3-A: STAFF audit context produces a customer-friendly presentation header", () => {
  const { model } = buildFor("STAFF");
  assert.deepEqual(model.presentation.header, {
    marketName: "Sample Market",
    submarketName: "Sample Submarket",
    radiusMeters: 500,
    targetSourceLabel: "주소 검색",
    confirmedAddress: "Sample confirmed address",
  });
});

test("V3-A: presentation header is null-safe when no submarket is selected", () => {
  const results = fixtureResults().filter((result) =>
    result.metricKey !== "frameone.submarket.name");
  const { model } = buildFor("STAFF", results);
  assert.equal(model.presentation.header.marketName, "Sample Market");
  assert.equal(model.presentation.header.submarketName, null);
});

test("V3-A: presentation always contains the four compact status cards", () => {
  const { model } = buildFor("STAFF");
  assert.deepEqual(model.presentation.statusCards.map((card) => card.id), [
    "radius",
    "kakao",
    "official-market",
    "analysis-stage",
  ]);
  assert.equal(model.presentation.statusCards.find((card) => card.id === "kakao").value, "일부 자료 확인 필요");
  assert.equal(model.presentation.statusCards.find((card) => card.id === "official-market").value, "포함 0 · 교차 1");
});

test("V3-A: complete customer-displayable Kakao categories advance the P0 status", () => {
  const results = fixtureResults().filter((result) =>
    result.metricKey !== "kakao.nearby.cafe.returned_count");
  results.push(
    available({
      metricKey: "kakao.nearby.confectionery.returned_count",
      metricLabel: "제과점 검색 반환건수",
      value: 1,
      resultUnit: "places",
      valueType: "OBSERVED_SOURCE_VALUE",
      analysisLayer: "COMPETITION",
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("SEARCH_NOT_CENSUS", "검색 반환건수는 전체 경쟁점 수가 아닙니다.")],
    }),
    available({
      metricKey: "kakao.nearby.cafe.returned_count",
      metricLabel: "카페 검색 반환건수",
      value: 2,
      resultUnit: "places",
      valueType: "OBSERVED_SOURCE_VALUE",
      analysisLayer: "COMPETITION",
      policy: "CUSTOMER_WITH_NOTE",
      limitations: [note("SEARCH_NOT_CENSUS", "검색 반환건수는 전체 경쟁점 수가 아닙니다.")],
    }),
  );
  const { model } = buildFor("STAFF", results);
  assert.equal(model.presentation.statusCards.find((card) => card.id === "kakao").value, "Kakao 확인");
  assert.equal(model.presentation.statusCards.find((card) => card.id === "analysis-stage").value, "P0 기초근거 확인");
});

test("V3-A: official-market status counts customer-displayable inside and overlap relations", () => {
  const results = fixtureResults();
  results.push(available({
    metricKey: "official_commercial_area.spatial_relation",
    metricLabel: "공식상권 공간관계",
    value: "INSIDE",
    analysisUnit: { type: "OFFICIAL_COMMERCIAL_AREA", id: "sample-official-inside", label: "Sample Inside Area" },
    policy: "CUSTOMER_WITH_NOTE",
    limitations: [note("BOUNDARY_DISTINCT", "FRAMEONE Market과 동일 경계를 의미하지 않습니다.")],
  }));
  const { model } = buildFor("STAFF", results);
  assert.equal(model.presentation.statusCards.find((card) => card.id === "official-market").value, "포함 1 · 교차 1");
});

test("V3-A: confirmed feature lineage excludes INTERNAL_ONLY and HIDDEN results", () => {
  const rawResults = fixtureResults();
  const forbiddenIds = new Set(rawResults
    .filter((result) => result.customerDisplayPolicy === "INTERNAL_ONLY" || result.customerDisplayPolicy === "HIDDEN")
    .map((result) => result.resultId));
  const { model } = buildFor("STAFF", rawResults);
  const featureBasisIds = model.presentation.summary.confirmedFeatures.flatMap((feature) => feature.basisResultIds);
  assert.ok(featureBasisIds.length > 0);
  assert.ok(featureBasisIds.every((resultId) => !forbiddenIds.has(resultId)));
  assert.ok(!JSON.stringify(model.presentation).includes("secret"));
});

test("V3-A: unavailable and next-analysis items remain explicit static scope", () => {
  const { model } = buildFor("STAFF");
  assert.deepEqual(model.presentation.summary.unavailableNow.map((item) => item.label), [
    "생활인구 기반 수요",
    "실제 보행 흐름",
    "체류 가능성",
    "출점 유망구간",
  ]);
  assert.ok(model.presentation.summary.nextAnalysis.length > 0);
  assert.ok(model.presentation.summary.nextAnalysis.every((item) => item.statusLabel === "추가 분석 예정"));
});

test("Slice 5B: Market Identity preserves input collection order", () => {
  const { model } = buildFor("CUSTOMER");
  assert.deepEqual(model.marketIdentity.map((item) => item.metricKey), [
    "frameone.district.name",
    "frameone.market.name",
    "frameone.submarket.name",
    "frameone.node.name",
    "frameone.node.address",
  ]);
});

test("Slice 5B: Kakao and official-market evidence remain separate", () => {
  const { model } = buildFor("CUSTOMER");
  assert.deepEqual(model.availableEvidence.kakaoObserved.map((item) => item.metricKey), [
    "kakao.nearby.bakery.returned_count",
  ]);
  assert.ok(model.officialMarketReference.relation.every((item) =>
    item.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA"));
  assert.ok(model.availableEvidence.kakaoObserved.every((item) =>
    item.analysisUnit.type === "RADIUS_500M"));
});

test("Slice 5B: Kakao count and official store count are not combined", () => {
  const { model } = buildFor("CUSTOMER");
  assert.equal(model.availableEvidence.kakaoObserved[0].value, 0);
  assert.equal(model.officialMarketReference.stores[0].value, 42);
  assert.equal(model.dataEvidence.length, model.dataEvidence.map((item) => item.resultId).length);
  assert.ok(!model.dataEvidence.some((item) => item.metricKey.includes("combined")));
});

test("Slice 5B: SALES stays estimated and scoped to OFFICIAL_COMMERCIAL_AREA", () => {
  const { model } = buildFor("CUSTOMER");
  const sales = model.officialMarketReference.sales[0];
  assert.equal(sales.value, 123456);
  assert.equal(sales.valueType, "ESTIMATED_VALUE");
  assert.equal(sales.analysisUnit.type, "OFFICIAL_COMMERCIAL_AREA");
  assert.equal(sales.referencePeriod, "2026-Q1");
});

test("Slice 5B: BLOCKED, NOT_AVAILABLE and note requirements remain distinct", () => {
  const { model } = buildFor("CUSTOMER");
  const blockedItem = model.limitations.results.find((item) => item.status === "BLOCKED");
  const unavailableItem = model.limitations.results.find((item) => item.status === "NOT_AVAILABLE");
  assert.equal(blockedItem.valueType, "UNKNOWN");
  assert.equal(blockedItem.missingReason, "BLOCKED_BY_GEOMETRY");
  assert.equal(blockedItem.limitations[0].severity, "BLOCKING");
  assert.equal(unavailableItem.missingReason, "SOURCE_ERROR");
  assert.equal(unavailableItem.requiresNote, true);
});

test("Slice 5B: fieldCheckRequired interpretation is handed off to nextChecks", () => {
  const { model } = buildFor("CUSTOMER");
  assert.ok(model.fieldHandoff.nextChecks.length >= 1);
  assert.ok(model.fieldHandoff.nextChecks.every((signal) => signal.basisResultIds.length > 0));
});

test("Slice 5B: Data Evidence preserves source, status, confidence, period and note metadata", () => {
  const { displayableResults, model } = buildFor("CUSTOMER");
  const original = displayableResults.find(({ result }) =>
    result.metricKey === "official_commercial_area.sales.quarter_total_estimated");
  const evidence = model.dataEvidence.find((item) =>
    item.metricKey === "official_commercial_area.sales.quarter_total_estimated");
  assert.deepEqual(evidence.primarySource, original.result.primarySource);
  assert.deepEqual(evidence.sourceReferences, original.result.sourceReferences);
  assert.equal(evidence.status, original.result.status);
  assert.equal(evidence.confidence, original.result.confidence);
  assert.equal(evidence.referencePeriod, original.result.referencePeriod);
  assert.deepEqual(evidence.limitations, original.result.limitations);
  assert.equal(evidence.requiresNote, original.requiresNote);
});

test("Slice 5B: builder does not mutate Result or Interpretation input", () => {
  const base = buildFor("CUSTOMER");
  const resultsBefore = JSON.stringify(base.displayableResults);
  const interpretationBefore = JSON.stringify(base.interpretation);
  buildP0BasicLocationViewModel({
    analysisRunId: RUN_ID,
    audience: "CUSTOMER",
    displayableResults: base.displayableResults,
    interpretation: base.interpretation,
  });
  assert.equal(JSON.stringify(base.displayableResults), resultsBefore);
  assert.equal(JSON.stringify(base.interpretation), interpretationBefore);
  assert.ok(Object.isFrozen(base.model));
  assert.ok(Object.isFrozen(base.model.dataEvidence));
  assert.ok(Object.isFrozen(base.model.presentation));
});

test("Slice 5B: empty and partial inputs produce valid deterministic sections", () => {
  const emptyInterpretation = buildBasicLocationInterpretation({ analysisRunId: RUN_ID, results: [] });
  const empty = buildP0BasicLocationViewModel({
    analysisRunId: RUN_ID,
    audience: "CUSTOMER",
    displayableResults: [],
    interpretation: emptyInterpretation,
  });
  assert.equal(empty.analysisContext.target.latitude, null);
  assert.deepEqual(empty.dataEvidence, []);
  assert.deepEqual(empty.officialMarketReference.sales, []);

  const partialResults = applyBasicLocationDisplayPolicy([unavailable()], "CUSTOMER");
  const partialInterpretation = buildBasicLocationInterpretation({
    analysisRunId: RUN_ID,
    results: partialResults.map(({ result }) => result),
  });
  const partial = buildP0BasicLocationViewModel({
    analysisRunId: RUN_ID,
    audience: "CUSTOMER",
    displayableResults: partialResults,
    interpretation: partialInterpretation,
  });
  assert.equal(partial.dataEvidence[0].status, "NOT_AVAILABLE");
  assert.equal(partial.dataEvidence[0].value, null);
  assert.equal(partial.limitations.results[0].missingReason, "SOURCE_ERROR");
});

test("Slice 5B: CUSTOMER Analysis Context does not reconstruct filtered coordinates", () => {
  const { model } = buildFor("CUSTOMER");
  assert.equal(model.analysisContext.target.latitude, null);
  assert.equal(model.analysisContext.target.longitude, null);
  assert.equal(model.analysisContext.target.radiusMeters, null);
  assert.equal(model.analysisContext.target.confirmedAddress, "Sample confirmed address");
});

test("Slice 5B: mismatched Interpretation run is rejected", () => {
  const base = buildFor("CUSTOMER");
  assert.throws(() => buildP0BasicLocationViewModel({
    analysisRunId: OTHER_RUN_ID,
    audience: "CUSTOMER",
    displayableResults: [],
    interpretation: base.interpretation,
  }), P0BasicLocationViewModelValidationError);
});

test("Slice 5B: a Result from another run is rejected", () => {
  const otherResult = available({
    analysisRunId: OTHER_RUN_ID,
    metricKey: "sample.other-run",
    value: 1,
  });
  const interpretation = buildBasicLocationInterpretation({ analysisRunId: RUN_ID, results: [] });
  assert.throws(() => buildP0BasicLocationViewModel({
    analysisRunId: RUN_ID,
    audience: "STAFF",
    displayableResults: [{ result: otherResult, requiresNote: false }],
    interpretation,
  }), P0BasicLocationViewModelValidationError);
});
