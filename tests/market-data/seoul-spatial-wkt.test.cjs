/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { after, test } = require("node:test");
const ts = require("typescript");

const originalLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  parseSeoulSpatialWkt,
  toSeoulSpatialPrimitive,
} = require("../../lib/market-data/spatial/seoul-spatial-wkt.ts");

after(() => {
  if (originalLoader) require.extensions[".ts"] = originalLoader;
  else delete require.extensions[".ts"];
});

const context = {
  sourceId: "SRC-SEOUL-PEDESTRIAN-NETWORK",
  snapshotId: "fixture-snapshot",
  sourceBasis: "2020 기준",
  locator: { normalizedFile: "fixture/1120000000.ndjson", lineNumber: 1 },
};

function fixtureRow(overrides = {}) {
  return {
    nodeType: "NODE",
    nodeWkt: "POINT(127.0293145389241 37.56880434441091)",
    nodeId: "25947",
    nodeTypeCode: "0",
    linkWkt: null,
    linkId: "0",
    linkTypeCode: null,
    beginningLinkId: "0",
    endLinkId: "0",
    linkLength: 0,
    districtCode: "1120000000",
    districtName: "성동구",
    administrativeDongCode: "1120011400",
    administrativeDongName: "성수동2가",
    ...overrides,
  };
}

test("POINT는 longitude/latitude와 원문 정밀도를 보존한다", () => {
  const rawWkt = "  POINT(127.0293145389241 37.56880434441091)  ";
  const result = parseSeoulSpatialWkt(rawWkt);
  assert.equal(result.success, true);
  assert.equal(result.geometryType, "POINT");
  assert.equal(result.rawWkt, rawWkt);
  assert.deepEqual(result.coordinate, {
    longitude: 127.0293145389241,
    latitude: 37.56880434441091,
  });
  assert.deepEqual(result.qualityFlags, []);
});

test("LINESTRING은 두 개 이상 vertex의 순서를 유지한다", () => {
  const result = parseSeoulSpatialWkt("LINESTRING(127 37, 127.1 37.1, 127.2 37.2)");
  assert.equal(result.success, true);
  assert.equal(result.geometryType, "LINESTRING");
  assert.deepEqual(result.coordinates, [
    { longitude: 127, latitude: 37 },
    { longitude: 127.1, latitude: 37.1 },
    { longitude: 127.2, latitude: 37.2 },
  ]);
});

test("missing, malformed, invalid number와 coordinate count를 구분한다", () => {
  const cases = [
    [null, "MISSING_WKT"],
    ["", "MISSING_WKT"],
    ["POINT", "MALFORMED_WKT"],
    ["POINT((127 37))", "MALFORMED_WKT"],
    ["LINESTRING(127 37, 128 38", "MALFORMED_WKT"],
    ["POINT()", "INVALID_COORDINATE_COUNT"],
    ["POINT(127)", "INVALID_COORDINATE_COUNT"],
    ["POINT(abc 37)", "INVALID_NUMBER"],
    ["POINT(NaN 37)", "INVALID_NUMBER"],
    ["POINT(Infinity 37)", "INVALID_NUMBER"],
    ["POINT(-Infinity 37)", "INVALID_NUMBER"],
    ["POINT(127 37 1)", "INVALID_COORDINATE_COUNT"],
    ["LINESTRING()", "INVALID_COORDINATE_COUNT"],
    ["LINESTRING(127 37)", "INVALID_COORDINATE_COUNT"],
    ["LINESTRING(127 37, abc 38)", "INVALID_NUMBER"],
  ];
  for (const [input, reason] of cases) {
    assert.deepEqual(parseSeoulSpatialWkt(input).reason, reason, String(input));
  }
});

test("미지원 geometry, dimension, SRID와 EMPTY를 거부한다", () => {
  const unsupported = [
    "POLYGON((127 37, 128 37, 127 37))",
    "MULTIPOINT((127 37))",
    "MULTILINESTRING((127 37, 128 38))",
    "GEOMETRYCOLLECTION(POINT(127 37))",
    "POINT Z (127 37 1)",
    "POINT M (127 37 1)",
    "POINT ZM (127 37 1 1)",
    "POINT EMPTY",
    "SRID=4326;POINT(127 37)",
  ];
  for (const input of unsupported) {
    assert.equal(parseSeoulSpatialWkt(input).reason, "UNSUPPORTED_GEOMETRY_TYPE", input);
  }
});

test("WGS84 밖은 실패하고 서울 reference 밖의 유효 WGS84는 quality flag로 남긴다", () => {
  assert.equal(parseSeoulSpatialWkt("POINT(181 37)").reason, "OUT_OF_WGS84_RANGE");
  assert.equal(parseSeoulSpatialWkt("POINT(127 91)").reason, "OUT_OF_WGS84_RANGE");
  const outsideSeoul = parseSeoulSpatialWkt("POINT(0 0)");
  assert.equal(outsideSeoul.success, true);
  assert.deepEqual(outsideSeoul.qualityFlags, ["OUTSIDE_SEOUL_REFERENCE_RANGE"]);
});

test("NODE primitive는 POINT와 유효 node ID만 canonical field로 승격한다", () => {
  const result = toSeoulSpatialPrimitive(fixtureRow(), context);
  assert.equal(result.success, true);
  assert.equal(result.primitive.kind, "NODE");
  assert.equal(result.primitive.evidenceLevel, "E1");
  assert.equal(result.primitive.nodeId, "25947");
  assert.equal(Object.hasOwn(result.primitive, "linkId"), false);
  assert.equal(result.primitive.rawWkt, fixtureRow().nodeWkt);
  assert.deepEqual(result.primitive.qualityFlags, ["COUNTERPART_ID_SENTINEL_ZERO"]);
  assert.deepEqual(result.primitive.provenance.rawIds, { nodeId: "25947", linkId: "0" });
});

test("LINK primitive는 relation 원천값을 중립 명칭으로 보존한다", () => {
  const row = fixtureRow({
    nodeType: "LINK",
    nodeWkt: null,
    nodeId: "0",
    nodeTypeCode: null,
    linkWkt: "LINESTRING(127 37, 127.1 37.1)",
    linkId: "117621",
    linkTypeCode: "1111",
    beginningLinkId: "134236",
    endLinkId: "134237",
    linkLength: 12.5,
  });
  const result = toSeoulSpatialPrimitive(row, context);
  assert.equal(result.success, true);
  assert.equal(result.primitive.kind, "LINK");
  assert.equal(result.primitive.linkId, "117621");
  assert.equal(Object.hasOwn(result.primitive, "nodeId"), false);
  assert.equal(result.primitive.sourceBeginLinkageId, "134236");
  assert.equal(result.primitive.sourceEndLinkageId, "134237");
  assert.equal(Object.hasOwn(result.primitive, "startNodeId"), false);
  assert.equal(Object.hasOwn(result.primitive, "endNodeId"), false);
  assert.deepEqual(result.primitive.provenance.rawIds, { nodeId: "0", linkId: "117621" });
});

test("Crosswalk source도 NODE와 LINK를 업무 의미 없이 E1 primitive로 변환한다", () => {
  const crosswalkContext = { ...context, sourceId: "SRC-SEOUL-CROSSWALK" };
  const node = toSeoulSpatialPrimitive(fixtureRow(), crosswalkContext);
  const link = toSeoulSpatialPrimitive(fixtureRow({
    nodeType: "LINK",
    nodeWkt: null,
    nodeId: "0",
    linkWkt: "LINESTRING(127 37, 127.1 37.1)",
    linkId: "221823",
    beginningLinkId: "125855",
    endLinkId: "125853",
  }), crosswalkContext);
  assert.equal(node.success && node.primitive.kind, "NODE");
  assert.equal(link.success && link.primitive.kind, "LINK");
  assert.equal(node.success && node.primitive.provenance.sourceId, "SRC-SEOUL-CROSSWALK");
  assert.equal(link.success && link.primitive.provenance.sourceId, "SRC-SEOUL-CROSSWALK");
});

test("primitive 변환은 sentinel ID, row/WKT 불일치와 counterpart WKT를 fail-closed 처리한다", () => {
  assert.equal(toSeoulSpatialPrimitive(fixtureRow({ nodeId: "0" }), context).reason, "INVALID_PRIMITIVE_ID");
  assert.equal(toSeoulSpatialPrimitive(fixtureRow({ nodeType: "UNKNOWN" }), context).reason, "UNSUPPORTED_ROW_TYPE");
  assert.equal(toSeoulSpatialPrimitive(fixtureRow({ nodeWkt: "LINESTRING(127 37, 128 38)" }), context).reason, "WKT_TYPE_MISMATCH");
  assert.equal(toSeoulSpatialPrimitive(fixtureRow({ linkWkt: "LINESTRING(127 37, 128 38)" }), context).reason, "UNEXPECTED_COUNTERPART_WKT");
});
