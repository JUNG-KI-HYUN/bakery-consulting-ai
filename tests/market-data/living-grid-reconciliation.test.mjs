import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inspectGeometry,
  parseCsvRows,
  reconcileIdSets,
} from "../../data/seoul-market/v1.1-final/12_VALIDATION/reconcile-living-grid.mjs";

test("reconcileIdSets classifies both directions and validates equations", () => {
  const result = reconcileIdSets(
    ["다사47256125", "다사53005400", "다사53005400"],
    ["다사53005400", "다사54504050"],
  );

  assert.deepEqual(result.both, ["다사53005400"]);
  assert.deepEqual(result.metricOnly, ["다사47256125"]);
  assert.deepEqual(result.geometryOnly, ["다사54504050"]);
  assert.equal(result.equations.metric.valid, true);
  assert.equal(result.equations.geometry.valid, true);
});

test("inspectGeometry reports missing, malformed, duplicate, and null geometry", () => {
  const result = inspectGeometry({
    type: "FeatureCollection",
    features: [
      { properties: { grid_id: "다사53005400" }, geometry: { type: "Polygon" } },
      { properties: { grid_id: "다사53005400" }, geometry: { type: "Polygon" } },
      { properties: { grid_id: "bad" }, geometry: null },
      { properties: {}, geometry: { type: "MultiPolygon" } },
    ],
  });

  assert.equal(result.summary.feature_count, 4);
  assert.equal(result.summary.unique_cell_id_count, 2);
  assert.equal(result.summary.duplicate_cell_id_count, 1);
  assert.equal(result.summary.missing_cell_id_count, 1);
  assert.equal(result.summary.malformed_cell_id_count, 1);
  assert.equal(result.summary.null_geometry_count, 1);
  assert.deepEqual(result.summary.geometry_types, { Polygon: 2, MultiPolygon: 1 });
});

test("parseCsvRows preserves quoted commas and escaped quotes", () => {
  const rows = [];
  parseCsvRows('CELL_ID,note\n"다사53005400","a,b"\n"다사54504050","a""b"\n', (row) => rows.push(row));
  assert.deepEqual(rows, [
    ["CELL_ID", "note"],
    ["다사53005400", "a,b"],
    ["다사54504050", 'a"b'],
  ]);
});
