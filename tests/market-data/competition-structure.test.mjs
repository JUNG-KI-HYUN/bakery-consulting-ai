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
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};

const {
  buildCompetitionStructure,
  competitionDirection,
  competitionDistanceBand,
  createCompetitionCandidateId,
} = require(path.join(root, "lib/market-data/competition-structure.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

function place(overrides = {}) {
  return {
    kakaoPlaceId: null,
    name: "fixture bakery",
    phone: null,
    roadAddress: "fixture road 1",
    addressName: "fixture lot 1",
    latitude: 37.5,
    longitude: 127,
    distanceM: 100,
    sourceCategoryId: "bakery",
    sourceCategoryLabel: "베이커리",
    ...overrides,
  };
}

function category(id, places, overrides = {}) {
  return {
    id,
    label: { bakery: "베이커리", confectionery: "제과점", cafe: "카페" }[id],
    totalCount: places.length,
    places,
    error: null,
    ...overrides,
  };
}

function build(categories, overrides = {}) {
  return buildCompetitionStructure({
    analysisRunId: "basic-location-run:11111111-1111-4111-8111-111111111111",
    generatedAt: "2026-09-23T00:00:00.000Z",
    center: { latitude: 37.5, longitude: 127 },
    radiusM: 500,
    categories,
    officialMarketData: null,
    ...overrides,
  });
}

test("same Kakao placeId dedupes while different ids with the same name stay separate", () => {
  const result = build([
    category("bakery", [place({ kakaoPlaceId: "same" }), place({ kakaoPlaceId: "first", name: "same name" })]),
    category("cafe", [place({ kakaoPlaceId: "same", sourceCategoryId: "cafe" }), place({ kakaoPlaceId: "second", name: "same name", sourceCategoryId: "cafe" })]),
  ]);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates.filter((item) => item.kakaoPlaceId === "same").length, 1);
  assert.equal(result.candidates.filter((item) => item.name === "same name").length, 2);
});

test("fallback dedupe preserves bakery+cafe overlap without inferring classification", () => {
  const result = build([
    category("bakery", [place({ name: "Fixture Bakery!" })]),
    category("cafe", [place({ name: "fixture bakery", sourceCategoryId: "cafe" })]),
  ]);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].observedChannels, ["bakery", "cafe"]);
  assert.equal(result.candidates[0].channelOverlapCount, 2);
  assert.equal(result.candidates[0].classification, "UNKNOWN");
  assert.equal(result.candidates[0].franchiseClassification, "UNKNOWN");
  assert.equal(result.franchiseShare, null);
});

test("competitionCandidateId is deterministic for Kakao id and normalized fallback", () => {
  const withId = place({ kakaoPlaceId: "12345" });
  assert.equal(createCompetitionCandidateId(withId), "kakao:12345");
  const left = createCompetitionCandidateId(place({ name: "Fixture  Bakery!", roadAddress: " Seoul  Road 1 " }));
  const right = createCompetitionCandidateId(place({ name: "fixture bakery", roadAddress: "seoul road 1" }));
  assert.equal(left, right);
  assert.equal(left, createCompetitionCandidateId(place({ name: "fixture bakery", roadAddress: "seoul road 1" })));
});

test("distance band boundaries are complete, non-overlapping, and capped at 500m", () => {
  const cases = [
    [0, "0-100m"], [100, "0-100m"], [100.01, "100-200m"],
    [200, "100-200m"], [200.01, "200-300m"], [300, "200-300m"],
    [300.01, "300-400m"], [400, "300-400m"], [400.01, "400-500m"],
    [500, "400-500m"], [500.01, null], [-1, null], [Number.NaN, null],
  ];
  for (const [distance, expected] of cases) {
    assert.equal(competitionDistanceBand(distance), expected, String(distance));
  }
});

test("bearing calculation covers CENTER and all eight directions", () => {
  const center = { latitude: 0, longitude: 0 };
  const cases = [
    [{ latitude: 0, longitude: 0 }, "CENTER"],
    [{ latitude: 1, longitude: 0 }, "N"],
    [{ latitude: 1, longitude: 1 }, "NE"],
    [{ latitude: 0, longitude: 1 }, "E"],
    [{ latitude: -1, longitude: 1 }, "SE"],
    [{ latitude: -1, longitude: 0 }, "S"],
    [{ latitude: -1, longitude: -1 }, "SW"],
    [{ latitude: 0, longitude: -1 }, "W"],
    [{ latitude: 1, longitude: -1 }, "NW"],
  ];
  for (const [point, expected] of cases) {
    assert.equal(competitionDirection(center, point), expected);
  }
});

test("nearest five uses valid distances and deterministic id tie-breaking", () => {
  const distances = [300, 10, 20, 20, 40, 50, 60, Number.NaN];
  const result = build([
    category("bakery", distances.map((distanceM, index) => place({
      kakaoPlaceId: `id-${String(9 - index).padStart(2, "0")}`,
      name: `fixture-${index}`,
      roadAddress: `fixture road ${index}`,
      distanceM,
    }))),
  ]);
  assert.equal(result.nearestCandidates.length, 5);
  assert.deepEqual(result.nearestCandidates.map((item) => item.distanceM), [10, 20, 20, 40, 50]);
  assert.ok(result.nearestCandidates[1].competitionCandidateId < result.nearestCandidates[2].competitionCandidateId);
  assert.equal(result.distanceBands.reduce((sum, item) => sum + item.candidateCount, 0), 7);
  assert.match(result.warnings.join(" "), /거리값이 유효하지 않은 후보 1개/);
});

test("Kakao totalCount and observed detail count stay separate", () => {
  const result = build([
    category("bakery", [place({ kakaoPlaceId: "one" })], { totalCount: 99 }),
    category("cafe", [place({ kakaoPlaceId: "one", sourceCategoryId: "cafe" })], { totalCount: 88 }),
  ]);
  assert.deepEqual(result.kakaoObservation.categories.map((item) => [item.totalCount, item.observedDetailCount]), [[99, 1], [88, 1]]);
  assert.equal(result.kakaoObservation.observedRawDetailCount, 2);
  assert.equal(result.kakaoObservation.uniqueObservedCandidateCount, 1);
});

test("official STORES remains a separate reference and Trend keeps store-count semantics", () => {
  const officialMarketData = {
    officialMarketCode: "3110001",
    officialMarketName: "fixture official market",
    industryCode: "CS100005",
    industryName: "제과점",
    quarterCode: "20262",
    referencePeriod: "2026-Q2",
    sales: [],
    stores: [{
      sourceId: "SRC-SEOUL-STORES",
      referencePeriod: "2026-Q2",
      geographyType: "official_market",
      geographyId: "3110001",
      metric: "store_count",
      value: 7,
      unit: "count",
      dataStatus: "available",
    }],
    dataStatus: "available",
    officialTrend: {
      officialMarketCode: "3110001",
      officialMarketName: "fixture official market",
      industryCode: "CS100005",
      industryName: "제과점",
      latestQuarterCode: "20262",
      latestReferencePeriod: "2026-Q2",
      periods: [{ quarterCode: "20262", referencePeriod: "2026-Q2", estimatedSalesAmount: null, storeCount: 7, salesQoqRate: null, storeCountDelta: 1, dataStatus: "partial" }],
      dataStatus: "partial",
    },
  };
  const result = build([
    category("bakery", Array.from({ length: 3 }, (_, index) => place({ kakaoPlaceId: String(index), roadAddress: `road ${index}` }))),
  ], { officialMarketData });
  assert.equal(result.kakaoObservation.uniqueObservedCandidateCount, 3);
  assert.equal(result.officialAreaReference.storeCount, 7);
  assert.equal(result.officialAreaReference.countCombinationPolicy, "KEEP_SEPARATE_FROM_KAKAO");
  assert.equal(result.officialAreaReference.trend.periods[0].storeCountDelta, 1);
  assert.equal("combinedCount" in result, false);
});

test("result is JSON serializable, removes non-finite values, and does not mutate input", () => {
  const categories = [
    category("bakery", [place({ kakaoPlaceId: "valid" }), place({ kakaoPlaceId: "invalid", distanceM: Number.POSITIVE_INFINITY, roadAddress: "other road" })]),
  ];
  const beforeFirst = { ...categories[0].places[0] };
  const beforeLength = categories[0].places.length;
  const result = build(categories);
  const serialized = JSON.stringify(result);
  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.equal(serialized.includes("NaN"), false);
  assert.equal(serialized.includes("Infinity"), false);
  assert.equal(serialized.includes("undefined"), false);
  assert.equal(result.candidates.find((item) => item.kakaoPlaceId === "invalid").distanceM, null);
  assert.deepEqual(categories[0].places[0], beforeFirst);
  assert.equal(categories[0].places.length, beforeLength);
});

test("candidates beyond the requested radius are excluded", () => {
  const result = build([
    category("bakery", [place({ kakaoPlaceId: "inside", distanceM: 300 }), place({ kakaoPlaceId: "outside", distanceM: 301, roadAddress: "other" })]),
  ], { radiusM: 300 });
  assert.deepEqual(result.candidates.map((item) => item.kakaoPlaceId), ["inside"]);
});
