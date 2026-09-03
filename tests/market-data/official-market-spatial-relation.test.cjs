/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { classifyOfficialMarketRelation: classify, findRelatedOfficialMarkets: find } = require("../../lib/market-data/official-market-spatial-relation.ts");

// Synthetic metre-based fixtures only; these are NOT FRAMEONE or official data.
const point = { longitude: 127, latitude: 37.5 };
const latScale = 6_371_000 * Math.PI / 180;
const lngScale = latScale * Math.cos(point.latitude * Math.PI / 180);
const position = (x, y) => [point.longitude + x / lngScale, point.latitude + y / latScale];
const ring = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]].map(([x, y]) => position(x, y));
const polygon = (...rings) => ({ type: "Polygon", coordinates: rings });
const market = (code, geometry) => ({ marketCode: `fixture-${code}`, marketName: `fixture ${code}`, geometry });
const analysis = (radius = 500) => ({ analysisPoint: point, analysisRadiusMeters: radius });

test("spatial CASE A: polygon interior", () => assert.equal(classify(point, 300, polygon(ring(-100, -100, 100, 100))), "INSIDE"));
test("spatial CASE B: circle intersects edge despite ALL vertices outside radius", () => {
  assert.equal(classify(point, 300, polygon(ring(200, -1000, 600, 1000))), "RADIUS_OVERLAP");
});
test("spatial CASE C: 300m outside, 500m overlap", () => {
  const geometry = polygon(ring(400, -1000, 600, 1000));
  assert.equal(classify(point, 300, geometry), "OUTSIDE");
  assert.equal(classify(point, 500, geometry), "RADIUS_OVERLAP");
});
test("spatial CASE D: unrelated polygon", () => assert.equal(classify(point, 500, polygon(ring(900, 900, 1000, 1000))), "OUTSIDE"));
test("spatial CASE E: outer boundary, vertex, duplicate vertex and circle tangency", () => {
  assert.equal(classify(point, 300, polygon(ring(0, -100, 100, 100))), "INSIDE");
  assert.equal(classify(point, 300, polygon(ring(0, 0, 100, 100))), "INSIDE");
  const duplicate = ring(0, -100, 100, 100); duplicate.splice(1, 0, duplicate[0]);
  assert.equal(classify(point, 300, polygon(duplicate)), "INSIDE");
  assert.equal(classify(point, 300, polygon(ring(300, -1000, 600, 1000))), "RADIUS_OVERLAP");
});
test("spatial CASE F/G: preserve multiple overlaps AND multiple interiors; no geometry in results", () => {
  const inputs = [market("inside1", polygon(ring(-100, -100, 100, 100))), market("inside2", polygon(ring(-200, -200, 200, 200))), market("overlap1", polygon(ring(400, -1000, 600, 1000))), market("overlap2", polygon(ring(-600, -1000, -400, 1000)))];
  const before = JSON.stringify(inputs), result = find(analysis(), inputs);
  assert.equal(result.insideMarkets.length, 2);
  assert.equal(result.radiusOverlapMarkets.length, 2);
  assert.equal(JSON.stringify(inputs), before);
  assert.ok(result.results.every((item) => !Object.hasOwn(item, "geometry") && item.analysisRadiusMeters === 500));
});
test("spatial CASE I: no analysis returns null without touching geometry", () => {
  assert.equal(find(null, [{ get geometry() { throw Error("must not calculate"); } }]), null);
});
test("spatial CASE M: MultiPolygon later component inside takes precedence over earlier overlap", () => {
  assert.equal(classify(point, 300, { type: "MultiPolygon", coordinates: [[ring(200, -1000, 600, 1000)], [ring(-100, -100, 100, 100)]] }), "INSIDE");
});
test("spatial CASE N: hole interior excluded, hole edge inside, circle crossing hole edge overlaps", () => {
  const geometry = polygon(ring(-1000, -1000, 1000, 1000), ring(-400, -400, 400, 400));
  assert.equal(classify(point, 300, geometry), "OUTSIDE");
  assert.equal(classify(point, 500, geometry), "RADIUS_OVERLAP");
  const [longitude, latitude] = position(400, 0);
  assert.equal(classify({ longitude, latitude }, 300, geometry), "INSIDE");
  assert.equal(classify(point, 300, polygon(...geometry.coordinates.map((r) => [...r].reverse()))), "OUTSIDE");
});
test("missing/malformed geometry or invalid calculations stay UNKNOWN", () => {
  for (const geometry of [null, {}, { type: "Point", coordinates: [127, 37.5] }, polygon([]), polygon(ring(0, 0, 1, 1).slice(0, 4)), polygon([position(0, 0), position(1, 0), position(2, 0), position(0, 0)]), polygon([[NaN, 37], [127, 37], [127, 38], [NaN, 37]])]) assert.equal(classify(point, 300, geometry), "UNKNOWN");
  assert.equal(classify({ latitude: NaN, longitude: 127 }, 300, polygon(ring(-1, -1, 1, 1))), "UNKNOWN");
  assert.equal(classify(point, NaN, polygon(ring(-1, -1, 1, 1))), "UNKNOWN");
  assert.equal(find(analysis(), [market("missing", null)]).unknownMarkets.length, 1);
});
test("actual official GeoJSON sanity: types, closed lon/lat rings, all boundary points and Garak pair", (t) => {
  const data = JSON.parse(fs.readFileSync("data/seoul-market/v1.1-final/09_GEO/OFFICIAL_SEOUL_MARKETS.geojson", "utf8"));
  let polygons = 0, multiPolygons = 0, holes = 0;
  for (const feature of data.features) {
    const geometry = feature.geometry;
    if (geometry.type === "Polygon") polygons++;
    else multiPolygons++;
    const parts = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const part of parts) {
      holes += part.length - 1;
      for (const r of part) {
        assert.deepEqual(r[0], r.at(-1));
        assert.ok(r.every(([lng, lat]) => lng > 126 && lng < 128 && lat > 37 && lat < 38));
      }
    }
    const [longitude, latitude] = parts[0][0][0];
    assert.equal(classify({ longitude, latitude }, 300, geometry), "INSIDE", feature.properties.official_area_code);
  }
  assert.deepEqual({ polygons, multiPolygons, holes }, { polygons: 1561, multiPolygons: 89, holes: 41 });
  const inputs = data.features.map((f) => ({ marketCode: f.properties.official_area_code, marketName: f.properties.official_area_name, geometry: f.geometry }));
  // Verified source geometry vertex, not an invented customer/FRAMEONE coordinate.
  const garak = inputs.find((item) => item.marketCode === "3120231");
  const [longitude, latitude] = garak.geometry.coordinates[0][0];
  const result = find({ analysisPoint: { longitude, latitude }, analysisRadiusMeters: 500 }, inputs);
  assert.equal(result.unknownMarkets.length, 0);
  assert.equal(result.results.find((item) => item.marketCode === "3120231").relation, "INSIDE");
  assert.equal(result.results.find((item) => item.marketCode === "3120234").relation, "RADIUS_OVERLAP");
  t.diagnostic(JSON.stringify({ polygons, multiPolygons, holes, garakBoundaryPoint: { longitude, latitude }, related: [...result.insideMarkets, ...result.radiusOverlapMarkets] }));
});
