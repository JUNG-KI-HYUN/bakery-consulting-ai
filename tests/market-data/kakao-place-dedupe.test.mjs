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
  module.require = (specifier) => original(
    specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier,
  );
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { dedupeKakaoPlaces } = require(path.join(root, "lib/market-data/kakao-place-dedupe.ts"));
const { GET } = require(path.join(root, "app/api/markets/nearby-places/route.ts"));
const originalFetch = global.fetch;
const originalApiKey = process.env.KAKAO_REST_API_KEY;
after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalApiKey;
});

function place(overrides = {}) {
  return {
    kakaoPlaceId: null,
    name: "fixture bakery",
    phone: null,
    roadAddress: "fixture road 1",
    addressName: "fixture lot 1",
    distanceM: 100,
    sourceCategoryId: "bakery",
    sourceCategoryLabel: "베이커리",
    ...overrides,
  };
}

test("CASE 1: identical Kakao place id across three sources becomes one", () => {
  const result = dedupeKakaoPlaces([
    place({ kakaoPlaceId: "123", sourceCategoryId: "bakery" }),
    place({ kakaoPlaceId: "123", sourceCategoryId: "confectionery" }),
    place({ kakaoPlaceId: "123", sourceCategoryId: "cafe" }),
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].matchedCategoryIds, ["bakery", "confectionery", "cafe"]);
});

test("CASE 2: missing ids with normalized name and shared address become one", () => {
  assert.equal(dedupeKakaoPlaces([
    place({ name: "Fixture  Bakery!", phone: "02-000-0000" }),
    place({ name: "fixture bakery", phone: null, roadAddress: null, addressName: "fixture road 1" }),
  ]).length, 1);
});

test("CASE 3: missing ids with normalized phone and shared address become one", () => {
  assert.equal(dedupeKakaoPlaces([
    place({ name: "fixture bakery", phone: "02-123-4567" }),
    place({ name: "different listing", phone: "02 123 4567" }),
  ]).length, 1);
});

test("CASE 4: same franchise with different branch names and addresses stays separate", () => {
  assert.equal(dedupeKakaoPlaces([
    place({ name: "fixture cafe 성수점", roadAddress: "fixture road 1" }),
    place({ name: "fixture cafe 강남점", roadAddress: "fixture road 2", addressName: "fixture lot 2" }),
  ]).length, 2);
});

test("CASE 5: same name with different addresses stays separate", () => {
  assert.equal(dedupeKakaoPlaces([
    place({ roadAddress: "fixture road 1", addressName: "fixture lot 1" }),
    place({ roadAddress: "fixture road 2", addressName: "fixture lot 2" }),
  ]).length, 2);
});

test("CASE 6: nearby coordinates alone never merge", () => {
  assert.equal(dedupeKakaoPlaces([
    place({ name: "fixture A", roadAddress: null, addressName: null, latitude: 37.5, longitude: 127.1 }),
    place({ name: "fixture B", roadAddress: null, addressName: null, latitude: 37.500001, longitude: 127.100001 }),
  ]).length, 2);
});

test("CASE 7: insufficient identity fields stay separate", () => {
  assert.equal(dedupeKakaoPlaces([
    place({ name: "fixture", roadAddress: null, addressName: null, distanceM: 10 }),
    place({ name: "fixture", roadAddress: null, addressName: null, distanceM: 11 }),
  ]).length, 2);
});

test("CASE 8: missing distance stays missing instead of becoming zero", () => {
  const result = dedupeKakaoPlaces([place({ distanceM: undefined })]);
  assert.equal(result[0].distanceM, undefined);
});

test("CASE 9: merged results retain distance ordering", () => {
  const result = dedupeKakaoPlaces([
    place({ kakaoPlaceId: "far", name: "far", distanceM: 300 }),
    place({ kakaoPlaceId: "near", name: "near", distanceM: 20, sourceCategoryId: "cafe" }),
    place({ kakaoPlaceId: "far", name: "far duplicate", distanceM: 250, sourceCategoryId: "cafe" }),
    place({ kakaoPlaceId: "unknown", name: "unknown", distanceM: undefined }),
  ]);
  assert.deepEqual(result.map((item) => item.kakaoPlaceId), ["near", "far", "unknown"]);
  assert.equal(result[1].distanceM, 250);
});

test("CASE 10: existing API category contract remains and unique output is additive", async () => {
  process.env.KAKAO_REST_API_KEY = "fixture-key";
  global.fetch = async () => Response.json({
    meta: { total_count: 1 },
    documents: [{
      id: "contract-id",
      place_name: "fixture bakery",
      category_name: "fixture category",
      road_address_name: "fixture road 1",
      address_name: "fixture lot 1",
      phone: "02-123-4567",
      x: "127.1",
      y: "37.5",
      distance: "25",
    }],
  });

  const response = await GET(new Request("http://fixture.invalid/api/markets/nearby-places?lat=37.5&lng=127.1&radius=500"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.categories.length, 3);
  assert.deepEqual(Object.keys(payload.categories[0]).sort(), ["id", "label", "places", "totalCount"]);
  assert.deepEqual(Object.keys(payload.categories[0].places[0]).sort(), [
    "address", "categoryId", "categoryLabel", "distanceM", "id", "latitude", "longitude", "name",
  ]);
  assert.equal(payload.uniquePlaceCount, 1);
  assert.equal(payload.uniquePlaces.length, 1);
  assert.deepEqual(payload.uniquePlaces[0].matchedCategoryIds, ["bakery", "confectionery", "cafe"]);
  assert.ok(!("phone" in payload.categories[0].places[0]));
  assert.ok(!("roadAddress" in payload.categories[0].places[0]));
});
