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

const {
  competitionLocationFromSearchResult,
  competitionExecutionMatchesTarget,
  competitionOfficialMarketChoices,
  initialOfficialMarketCode,
  parseCompetitionLocationQuery,
} = require(path.join(root, "lib/market-data/competition-location.ts"));
const { GET: geocode } = require(path.join(root, "app/api/markets/geocode/route.ts"));
const originalFetch = global.fetch;
const originalApiKey = process.env.KAKAO_REST_API_KEY;

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalApiKey;
});

test("lat/lng query initializes the analysis point and preserves 300m/500m radius", () => {
  assert.deepEqual(
    parseCompetitionLocationQuery({
      lat: "37.5665",
      lng: "126.978",
      radius: "300",
      label: "종각역 인근",
    }),
    {
      latitude: 37.5665,
      longitude: 126.978,
      radiusM: 300,
      label: "종각역 인근",
    },
  );
  assert.equal(
    parseCompetitionLocationQuery({ lat: "37.5", lng: "127", radius: "500" }).radiusM,
    500,
  );
  assert.equal(parseCompetitionLocationQuery({ lat: "", lng: "127" }), null);

  const target = {
    latitude: 37.5126,
    longitude: 127.1025,
    radiusM: 500,
  };
  assert.equal(competitionExecutionMatchesTarget(target, {
    analysisPoint: { latitude: 37.5126, longitude: 127.1025 },
    analysisRadiusMeters: 500,
  }), true);
  assert.equal(competitionExecutionMatchesTarget(target, {
    analysisPoint: { latitude: 37.5126, longitude: 127.1025 },
    analysisRadiusMeters: 300,
  }), false);

  const clientSource = fs.readFileSync(
    path.join(root, "app/markets/competition-structure/CompetitionStructureClient.tsx"),
    "utf8",
  );
  assert.match(clientSource, /!executedTarget/);
  assert.match(clientSource, /window\.history\.replaceState/);
});

test("search result selection creates an internal point without exposing coordinate input semantics", () => {
  assert.deepEqual(
    competitionLocationFromSearchResult({
      latitude: 37.513,
      longitude: 127.102,
      name: "롯데월드타워",
      address: "서울 송파구 올림픽로 300",
    }),
    { latitude: 37.513, longitude: 127.102, label: "롯데월드타워" },
  );
  assert.throws(() =>
    competitionLocationFromSearchResult({
      latitude: Number.NaN,
      longitude: 127,
      name: "invalid",
      address: "fixture",
    }),
  );
});

test("existing geocode route returns selectable address and business-name results", async () => {
  process.env.KAKAO_REST_API_KEY = "fixture-key";
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/search/address.json")) {
      return Response.json({
        documents: [{
          address_name: "서울 송파구 fixture 1",
          x: "127.101",
          y: "37.501",
          road_address: { address_name: "서울 송파구 fixture road 1" },
        }],
      });
    }
    return Response.json({
      documents: [{
        id: "place-1",
        place_name: "fixture tower",
        address_name: "서울 송파구 fixture 2",
        road_address_name: "서울 송파구 fixture road 2",
        x: "127.102",
        y: "37.502",
      }],
    });
  };
  const response = await geocode(
    new Request("http://fixture.invalid/api/markets/geocode?address=fixture"),
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.results.map((item) => [item.name, item.source]), [
    ["서울 송파구 fixture road 1", "ADDRESS"],
    ["fixture tower", "KEYWORD"],
  ]);
  assert.equal(payload.latitude, payload.results[0].latitude);
});

test("official markets are derived from the point and multiple choices are not auto-confirmed", () => {
  const square = (longitude) => ({
    type: "Polygon",
    coordinates: [[
      [longitude - 0.001, 37.499],
      [longitude + 0.001, 37.499],
      [longitude + 0.001, 37.501],
      [longitude - 0.001, 37.501],
      [longitude - 0.001, 37.499],
    ]],
  });
  const choices = competitionOfficialMarketChoices(
    { analysisPoint: { latitude: 37.5, longitude: 127 }, analysisRadiusMeters: 500 },
    [
      { marketCode: "2", marketName: "반경 상권", geometry: square(127.004) },
      { marketCode: "1", marketName: "포함 상권", geometry: square(127) },
    ],
  );
  assert.deepEqual(choices.map((choice) => [choice.marketName, choice.relation]), [
    ["포함 상권", "INSIDE"],
    ["반경 상권", "RADIUS_OVERLAP"],
  ]);
  assert.equal(initialOfficialMarketCode(choices), null);
  assert.equal(initialOfficialMarketCode([choices[0]]), "1");
});

test("Competition UI has no direct coordinate or official-code input and blocks analysis without a selected point", () => {
  const clientSource = fs.readFileSync(
    path.join(root, "app/markets/competition-structure/CompetitionStructureClient.tsx"),
    "utf8",
  );
  const mapSource = fs.readFileSync(path.join(root, "app/markets/KakaoBaseMap.tsx"), "utf8");
  assert.equal(clientSource.includes('inputMode="decimal"'), false);
  assert.equal(clientSource.includes("서울 공식상권 코드 (선택)"), false);
  assert.match(clientSource, /주소 또는 상호명으로 분석지점 찾기|addressOrPlaceSearch/);
  assert.match(clientSource, /officialChoices\.map/);
  assert.match(mapSource, /disabled=\{status !== "ready" \|\| !selectedPoint/);
  assert.match(mapSource, /candidateSearchResults\.map/);
});

test("Competition engine implementation remains imported rather than duplicated in the UX", () => {
  const clientSource = fs.readFileSync(
    path.join(root, "app/markets/competition-structure/CompetitionStructureClient.tsx"),
    "utf8",
  );
  assert.match(clientSource, /buildCompetitionStructure\(/);
  assert.equal(clientSource.includes("function competitionDistanceBand"), false);
  assert.equal(clientSource.includes("function createCompetitionCandidateId"), false);
});
