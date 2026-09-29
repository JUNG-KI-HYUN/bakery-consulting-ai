import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) =>
    original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
};

const adapterPath = path.join(root, "lib/decision-evidence/location-adapter.ts");
const { buildLocationDecisionEvidence } = require(adapterPath);
const {
  createAvailableResult,
  createGeometryBlockedResult,
  createUnavailableResult,
} = require(path.join(root, "lib/market-data/basic-location/results.ts"));
const { buildBasicLocationInterpretation } = require(
  path.join(root, "lib/market-data/basic-location/interpretation.ts"),
);
const { buildCompetitionStructure } = require(
  path.join(root, "lib/market-data/competition-structure.ts"),
);
const {
  competitionStructureLocationInput,
  createCompetitionLocationTarget,
} = require(path.join(root, "lib/market-data/competition-location.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

// fixture-only identifiers and values; not real analysis data
const RUN_A = "basic-location-run:55555555-5555-4555-8555-555555555555";
const RUN_B = "basic-location-run:66666666-6666-4666-8666-666666666666";
const UPDATED_AT = "2026-09-29T00:00:00.000Z";

const KAKAO_SOURCE = { sourceId: "SRC-KAKAO-LOCAL-MAP", sourceName: "fixture kakao", sourceType: "EXTERNAL_PLATFORM" };
const OFFICIAL_SOURCE = { sourceId: "SRC-SEOUL-STORES", sourceName: "fixture official", sourceType: "PUBLIC_DATA_OFFICIAL" };
const RADIUS_UNIT = (runId) => ({ type: "RADIUS_500M", id: `${runId}:target`, label: "분석 반경 500m" });
const FIXTURE_LIMITATION = { code: "SEARCH_NOT_CENSUS", message: "fixture 검색 결과이며 전수조사가 아닙니다.", severity: "CAUTION" };

function base(runId, overrides = {}) {
  return {
    analysisRunId: runId,
    analysisLayer: "SURROUNDING_POI",
    analysisUnit: RADIUS_UNIT(runId),
    metricKey: "kakao.nearby.bakery.returned_count",
    metricLabel: "Kakao 베이커리 검색 반환건수",
    unit: "places",
    primarySource: KAKAO_SOURCE,
    sourceReferences: [{ sourceId: KAKAO_SOURCE.sourceId, locator: "fixture#bakery", sourceVersion: null }],
    referenceDate: UPDATED_AT,
    referencePeriod: null,
    limitations: [],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: null,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function kakaoResult(runId = RUN_A, overrides = {}) {
  return createAvailableResult({
    ...base(runId),
    value: 4,
    valueType: "OBSERVED_SOURCE_VALUE",
    confidence: "MEDIUM",
    confidenceReasons: [],
    limitations: [FIXTURE_LIMITATION],
    fieldCheckRequired: true,
    fieldCheckKeys: ["COMPETITOR_OPEN_CHECK"],
    ...overrides,
  });
}

function officialStoresResult(runId = RUN_A) {
  return createAvailableResult({
    ...base(runId, {
      analysisLayer: "DATA_EVIDENCE",
      analysisUnit: { type: "OFFICIAL_COMMERCIAL_AREA", id: "3110001", label: "fixture 공식상권" },
      metricKey: "official_commercial_area.stores.store_count",
      metricLabel: "공식상권 점포 수",
      unit: "count",
      primarySource: OFFICIAL_SOURCE,
      referencePeriod: "2026-Q2",
    }),
    value: 7,
    valueType: "OFFICIAL_VALUE",
    confidence: "HIGH",
    confidenceReasons: [],
  });
}

function livingResult(runId = RUN_A) {
  return createAvailableResult({
    ...base(runId, {
      analysisLayer: "DEMAND",
      analysisUnit: { type: "RADIUS_500M", id: `${runId}:living-population-radius`, label: "분석지점 반경 500m" },
      metricKey: "living_population.radius.hour.12",
      metricLabel: "12시 생활인구",
      unit: "persons",
      primarySource: OFFICIAL_SOURCE,
      referencePeriod: "2026-09",
    }),
    value: 1234.5,
    valueType: "CALCULATED_VALUE",
    confidence: "MEDIUM",
    confidenceReasons: [],
  });
}

function blockedResult(runId = RUN_A) {
  return createGeometryBlockedResult({
    ...base(runId, {
      analysisLayer: "DEMAND",
      analysisUnit: { type: "FRAMEONE_MARKET", id: "fixture-market", label: "fixture market" },
      metricKey: "frameone.market.living_population",
      metricLabel: "FRAMEONE Market 생활인구",
      primarySource: null,
      limitations: [{ code: "FRAMEONE_GEOMETRY_MISSING", message: "fixture geometry 없음", severity: "BLOCKING" }],
    }),
  });
}

function unavailableResult(runId = RUN_A, missingReason = "NOT_CALCULATED") {
  return createUnavailableResult({
    ...base(runId, {
      analysisLayer: "DEMAND",
      analysisUnit: { type: "RADIUS_500M", id: `${runId}:living-population-radius`, label: "분석지점 반경 500m" },
      metricKey: "living_population.radius.hour.13",
      metricLabel: "13시 생활인구",
      primarySource: OFFICIAL_SOURCE,
    }),
    missingReason,
  });
}

function unknownValueTypeResult(runId = RUN_A) {
  return Object.freeze({
    ...kakaoResult(runId),
    resultId: `${runId}::fixture::unknown-value-type`,
    metricKey: "fixture.unknown_value_type",
    metricLabel: "fixture UNKNOWN 값유형",
    valueType: "UNKNOWN",
    value: 0,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
  });
}

function competitionPlace(overrides = {}) {
  return {
    kakaoPlaceId: "fixture-a",
    name: "fixture bakery a",
    phone: "010-0000-0000",
    roadAddress: "fixture road a",
    addressName: null,
    latitude: 37.501,
    longitude: 127,
    distanceM: 110,
    sourceCategoryId: "bakery",
    sourceCategoryLabel: "베이커리",
    ...overrides,
  };
}

function competition(runId = RUN_A, { places, officialMarketData = null, categoryError = null } = {}) {
  const target = createCompetitionLocationTarget({ analysisRunId: runId, latitude: 37.5, longitude: 127, radiusM: 500 });
  const bakeryPlaces = places ?? [
    competitionPlace(),
    competitionPlace({ kakaoPlaceId: "fixture-b", name: "fixture bakery b", roadAddress: "fixture road b", latitude: 37.5, longitude: 127.001, distanceM: 90 }),
  ];
  const cafePlaces = places ? [] : [competitionPlace({ sourceCategoryId: "cafe", sourceCategoryLabel: "카페" })];
  const result = buildCompetitionStructure({
    ...competitionStructureLocationInput(target),
    generatedAt: UPDATED_AT,
    categories: [
      { id: "bakery", label: "베이커리", totalCount: bakeryPlaces.length, places: bakeryPlaces, error: null },
      { id: "cafe", label: "카페", totalCount: cafePlaces.length, places: cafePlaces, error: categoryError },
    ],
    officialMarketData,
    officialMarketCode: officialMarketData ? officialMarketData.officialMarketCode : null,
  });
  return { target, result };
}

const OFFICIAL_MARKET_DATA = {
  officialMarketCode: "3110001",
  officialMarketName: "fixture 공식상권",
  industryCode: "CS100005",
  industryName: "제과점",
  quarterCode: "20262",
  referencePeriod: "2026-Q2",
  sales: [],
  stores: [{ sourceId: "SRC-SEOUL-STORES", referencePeriod: "2026-Q2", geographyType: "official_market", geographyId: "3110001", metric: "store_count", value: 7, unit: "count", dataStatus: "available" }],
  dataStatus: "available",
};

function standardInput(overrides = {}) {
  const results = [kakaoResult(), officialStoresResult(), livingResult()];
  const { target, result } = competition();
  return {
    locationBinding: { analysisRunId: RUN_A },
    results,
    interpretation: buildBasicLocationInterpretation({ analysisRunId: RUN_A, results }),
    competitionTarget: target,
    competitionResult: result,
    ...overrides,
  };
}

function allItems(output) {
  return [...output.observedFacts, ...output.missingInformation, ...output.expertReviewItems];
}

function byKey(items, key) {
  return items.find((item) => item.id.endsWith(`|${key}`));
}

function resultItem(output, result) {
  return allItems(output).find((item) => item.locationReference?.resultId === result.resultId);
}

const FORBIDDEN_PHRASES = [
  "좋은 상권", "나쁜 상권", "경쟁이 심", "경쟁이 약", "성공 가능성", "실패 가능성",
  "안전하", "위험하", "계약 가능", "계약 불가", "추천", "보류", "위험 점포",
];

test("1. normal BasicLocation results become LOCATION evidence with provenance", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  const item = resultItem(output, kakaoResult());
  assert.equal(item.sourceDomain, "LOCATION");
  assert.equal(item.bucket, "OBSERVED_FACT");
  assert.equal(item.category, "LOCATION");
  assert.equal(item.locationReference.analysisRunId, RUN_A);
  assert.equal(item.locationReference.status, "AVAILABLE");
  assert.equal(item.locationReference.valueType, "OBSERVED_SOURCE_VALUE");
  assert.equal(item.locationReference.primarySourceId, "SRC-KAKAO-LOCAL-MAP");
  assert.equal(item.verificationStatus, undefined);
  assert.equal(output.createsVerdict, false);
  assert.equal(output.createsScore, false);
  assert.equal(output.createsRisk, false);
});

test("2. locationBinding null is an integration gap and no result evidence is used", () => {
  const output = buildLocationDecisionEvidence(standardInput({ locationBinding: null }));
  const item = byKey(output.missingInformation, "location-binding-absent");
  assert.equal(item.bucket, "MISSING_INFORMATION");
  assert.equal(item.nature, "INTEGRATION_STATE");
  assert.equal(output.observedFacts.length, 0);
  assert.equal(output.referenceCompetition, null);
});

test("3. results from another run are not used as current evidence", () => {
  const stale = kakaoResult(RUN_B);
  const output = buildLocationDecisionEvidence(standardInput({ results: [stale, officialStoresResult()], interpretation: null }));
  assert.equal(resultItem(output, stale), undefined);
  const gap = byKey(output.missingInformation, "basic-location-result-run-mismatch");
  assert.equal(gap.nature, "INTEGRATION_STATE");
  assert.match(gap.description, /1건/);
  assert.ok(resultItem(output, officialStoresResult()));
});

test("4. interpretation from another run is an integration gap and is ignored", () => {
  const resultsB = [kakaoResult(RUN_B)];
  const output = buildLocationDecisionEvidence(standardInput({
    interpretation: buildBasicLocationInterpretation({ analysisRunId: RUN_B, results: resultsB }),
  }));
  const gap = byKey(output.missingInformation, "basic-location-interpretation-run-mismatch");
  assert.equal(gap.nature, "INTEGRATION_STATE");
  assert.deepEqual(output.referenceNextChecks, []);
  assert.equal(output.referenceLimitations.some((entry) => entry.origin === "BASIC_LOCATION_INTERPRETATION"), false);
});

test("5. BLOCKED result is missing information, not a constraint or risk", () => {
  const blocked = blockedResult();
  const output = buildLocationDecisionEvidence(standardInput({ results: [blocked], interpretation: null }));
  const item = resultItem(output, blocked);
  assert.equal(item.bucket, "MISSING_INFORMATION");
  assert.equal(item.category, "DEMAND");
  assert.equal(item.nature, undefined);
  assert.equal(item.locationReference.status, "BLOCKED");
  assert.equal(item.locationReference.value, null);
  assert.equal(allItems(output).some((entry) => entry.bucket === "OBSERVED_CONSTRAINT"), false);
  const blocking = output.referenceLimitations.find((entry) => entry.code === "FRAMEONE_GEOMETRY_MISSING");
  assert.equal(blocking.severity, "BLOCKING");
});

test("6. NOT_AVAILABLE result is missing information with its reason, not a constraint", () => {
  const unavailable = unavailableResult(RUN_A, "NOT_CALCULATED");
  const output = buildLocationDecisionEvidence(standardInput({ results: [unavailable], interpretation: null }));
  const item = resultItem(output, unavailable);
  assert.equal(item.bucket, "MISSING_INFORMATION");
  assert.equal(item.locationReference.missingReason, "NOT_CALCULATED");
  assert.match(item.description, /분석 미실행/);
  assert.equal(output.observedFacts.some((entry) => entry.locationReference?.resultId === unavailable.resultId), false);
});

test("7. valueType UNKNOWN stays missing even when the raw value is 0", () => {
  const unknown = unknownValueTypeResult();
  const output = buildLocationDecisionEvidence(standardInput({ results: [unknown], interpretation: null }));
  const item = resultItem(output, unknown);
  assert.equal(item.bucket, "MISSING_INFORMATION");
  assert.equal(item.locationReference.valueType, "UNKNOWN");
  assert.match(item.description, /0으로 해석하지 않습니다/);
});

test("8. null values stay null in metadata and never become the text 'null'", () => {
  const output = buildLocationDecisionEvidence(standardInput({
    results: [blockedResult(), unavailableResult()],
    interpretation: null,
    competitionResult: null,
  }));
  for (const item of allItems(output)) {
    assert.equal(item.description.includes("null"), false, item.id);
    assert.equal(item.title.includes("null"), false, item.id);
  }
  for (const item of output.missingInformation.filter((entry) => entry.locationReference)) {
    assert.equal(item.locationReference.value, null);
  }
});

test("9. official reference result is REFERENCE_SUMMARY", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  const item = resultItem(output, officialStoresResult());
  assert.equal(item.bucket, "OBSERVED_FACT");
  assert.equal(item.nature, "REFERENCE_SUMMARY");
  assert.match(item.description, /후보점포 값이 아닙니다/);
});

test("10. Kakao observed result is OBSERVATION and keeps not-census meaning", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  const item = resultItem(output, kakaoResult());
  assert.equal(item.nature, "OBSERVATION");
  assert.match(item.description, /실제 전체 경쟁점 수가 아닙니다/);
  const zero = kakaoResult(RUN_A, { value: 0 });
  const zeroItem = resultItem(buildLocationDecisionEvidence(standardInput({ results: [zero], interpretation: null })), zero);
  assert.match(zeroItem.description, /실제 경쟁점이 0개라는 뜻이 아닙니다/);
});

test("living population derived result is DERIVED_CALCULATION under DEMAND", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  const item = resultItem(output, livingResult());
  assert.equal(item.category, "DEMAND");
  assert.equal(item.nature, "DERIVED_CALCULATION");
  assert.equal(item.locationReference.referencePeriod, "2026-09");
});

test("11. riskSignals never produce OBSERVED_CONSTRAINT and are merged with limitations", () => {
  const input = standardInput();
  assert.ok(input.interpretation.riskSignals.length > 0);
  const output = buildLocationDecisionEvidence(input);
  assert.equal(allItems(output).some((item) => item.bucket === "OBSERVED_CONSTRAINT"), false);
  const messages = output.referenceLimitations.map((entry) => entry.message);
  assert.equal(new Set(messages).size, messages.length);
  for (const signal of input.interpretation.riskSignals) {
    assert.ok(messages.includes(signal.message));
    assert.equal(allItems(output).some((item) => item.description === signal.message), false);
  }
});

test("12. riskSignals produce no risk, score, or verdict fields", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  const keys = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        visit(child);
      }
    }
  };
  visit(output);
  const forbidden = /risk|score|verdict|recommend|hardfail|reject|approve|intensity/i;
  const allowed = new Set(["createsRisk", "createsScore", "createsVerdict"]);
  assert.deepEqual([...keys].filter((key) => forbidden.test(key) && !allowed.has(key)), []);
  assert.equal(output.createsRisk, false);
  assert.equal(allItems(output).some((item) => /risk:/i.test(item.id)), false);
});

test("13. fieldCheckRequired becomes missing field check, never EXPERT_REVIEW", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  assert.equal(output.expertReviewItems.length, 0);
  assert.equal(allItems(output).some((item) => item.bucket === "EXPERT_REVIEW"), false);
  const check = byKey(output.missingInformation, "field-check:COMPETITOR_OPEN_CHECK");
  assert.equal(check.bucket, "MISSING_INFORMATION");
  assert.equal(check.sourceRef.fieldKey, "COMPETITOR_OPEN_CHECK");
  assert.match(check.description, /전문가 검토 항목으로 분류하지 않습니다/);
  assert.ok(output.referenceNextChecks.some((entry) => entry.id === "next-check:competitor_open_check"));
});

test("14. matching Competition result yields COMPETITION observation evidence", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  const item = byKey(output.observedFacts, "competition-kakao-observation");
  assert.equal(item.category, "COMPETITION");
  assert.equal(item.nature, "OBSERVATION");
  assert.match(item.description, /관측 후보 2곳/);
  assert.match(item.description, /복수 채널에서 함께 관측된 후보 1곳/);
  assert.equal(output.referenceCompetition.analysisRunId, RUN_A);
  assert.equal(output.referenceCompetition.multiChannelCandidateCount, 1);
  const spatial = byKey(output.observedFacts, "competition-spatial-distribution");
  assert.equal(spatial.nature, "DERIVED_CALCULATION");
});

test("15. Competition result from another run is stale integration state", () => {
  const { result: staleResult } = competition(RUN_B);
  const { target } = competition(RUN_A);
  const output = buildLocationDecisionEvidence(standardInput({ competitionTarget: target, competitionResult: staleResult }));
  const gap = byKey(output.missingInformation, "competition-result-stale");
  assert.equal(gap.nature, "INTEGRATION_STATE");
  assert.equal(byKey(output.observedFacts, "competition-kakao-observation"), undefined);
  assert.equal(output.referenceCompetition, null);

  const { target: targetB, result: resultB } = competition(RUN_B);
  const mismatch = buildLocationDecisionEvidence(standardInput({ competitionTarget: targetB, competitionResult: resultB }));
  assert.equal(byKey(mismatch.missingInformation, "competition-target-run-mismatch").nature, "INTEGRATION_STATE");
  assert.equal(mismatch.referenceCompetition, null);
});

test("16-17. classification and franchise remain UNKNOWN", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  assert.equal(output.referenceCompetition.classification, "UNKNOWN");
  assert.equal(output.referenceCompetition.franchiseClassification, "UNKNOWN");
  assert.equal(output.referenceCompetition.fieldVerificationStatus, "NOT_CHECKED");
  assert.equal(output.referenceCompetition.franchiseShare, null);
  const gap = byKey(output.missingInformation, "competition-classification-unverified");
  assert.match(gap.description, /classification=UNKNOWN/);
  assert.match(gap.description, /franchiseClassification=UNKNOWN/);
});

test("18. SEARCH_OBSERVATION_NOT_CENSUS meaning is preserved", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  assert.equal(output.referenceCompetition.scope, "SEARCH_OBSERVATION_NOT_CENSUS");
  const item = byKey(output.observedFacts, "competition-kakao-observation");
  assert.match(item.description, /SEARCH_OBSERVATION_NOT_CENSUS/);
  assert.doesNotMatch(item.description, /경쟁점 총/);
});

test("19. missing Competition result differs from zero observed candidates", () => {
  const absent = buildLocationDecisionEvidence(standardInput({ competitionResult: null, competitionTarget: null }));
  assert.equal(byKey(absent.missingInformation, "competition-structure-absent").nature, "INTEGRATION_STATE");
  assert.equal(absent.referenceCompetition, null);

  const { target, result } = competition(RUN_A, { places: [] });
  const zero = buildLocationDecisionEvidence(standardInput({ competitionTarget: target, competitionResult: result }));
  assert.equal(byKey(zero.missingInformation, "competition-structure-absent"), undefined);
  assert.equal(zero.referenceCompetition.uniqueObservedCandidateCount, 0);
  assert.match(byKey(zero.observedFacts, "competition-kakao-observation").description, /실제 경쟁점이 없다는 뜻이 아닙니다/);
});

test("Competition channel error is missing information, not zero", () => {
  const { target, result } = competition(RUN_A, { categoryError: "fixture error" });
  const output = buildLocationDecisionEvidence(standardInput({ competitionTarget: target, competitionResult: result }));
  const gap = byKey(output.missingInformation, "competition-channel-error:cafe");
  assert.match(gap.description, /0건으로 해석하지 않으며/);
});

test("20. official store reference and Kakao observations are not summed", () => {
  const { target, result } = competition(RUN_A, { officialMarketData: OFFICIAL_MARKET_DATA });
  const output = buildLocationDecisionEvidence(standardInput({ competitionTarget: target, competitionResult: result }));
  const official = byKey(output.observedFacts, "competition-official-store-reference");
  assert.equal(official.nature, "REFERENCE_SUMMARY");
  assert.match(official.description, /점포 수 참고값: 7/);
  assert.match(official.description, /합산하지 않습니다/);
  assert.equal(output.referenceCompetition.officialAreaReference.storeCount, 7);
  assert.equal(output.referenceCompetition.uniqueObservedCandidateCount, 2);
  assert.equal(output.referenceCompetition.officialAreaReference.countCombinationPolicy, "KEEP_SEPARATE_FROM_KAKAO");
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes("\"combinedCount\""), false);
  assert.equal(allItems(output).some((item) => /\b9\b/.test(item.description)), false);
});

test("21. inputs are not mutated", () => {
  const input = standardInput();
  const before = JSON.stringify(input);
  buildLocationDecisionEvidence(input);
  assert.equal(JSON.stringify(input), before);
});

test("22. output is deterministic and JSON serializable", () => {
  const first = buildLocationDecisionEvidence(standardInput());
  const second = buildLocationDecisionEvidence(standardInput());
  assert.deepEqual(first, second);
  const serialized = JSON.stringify(first);
  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.equal(serialized.includes("NaN"), false);
  assert.equal(serialized.includes("Infinity"), false);
});

test("23. sourceRef carries no PII", () => {
  const output = buildLocationDecisionEvidence(standardInput());
  for (const item of allItems(output)) {
    const serialized = JSON.stringify(item.sourceRef);
    assert.equal(serialized.includes("fixture road"), false, item.id);
    assert.equal(serialized.includes("010-"), false, item.id);
    assert.equal(serialized.includes("fixture bakery"), false, item.id);
    for (const key of Object.keys(item.sourceRef)) {
      assert.equal(/^(name|phone|email|address|customerName|ownerName)$/i.test(key), false);
    }
  }
});

test("24. no forbidden judgement phrases in generated text", () => {
  const outputs = [
    buildLocationDecisionEvidence(standardInput()),
    buildLocationDecisionEvidence(standardInput({ results: [blockedResult(), unavailableResult(), unknownValueTypeResult()], interpretation: null })),
    buildLocationDecisionEvidence(standardInput({ locationBinding: null })),
    buildLocationDecisionEvidence(standardInput({ competitionResult: null })),
  ];
  for (const output of outputs) {
    for (const item of allItems(output)) {
      for (const phrase of FORBIDDEN_PHRASES) {
        assert.equal(item.title.includes(phrase), false, `${item.id}: ${phrase}`);
        assert.equal(item.description.includes(phrase), false, `${item.id}: ${phrase}`);
      }
    }
  }
});
