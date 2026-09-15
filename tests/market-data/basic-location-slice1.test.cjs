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
  adaptAnalysisTargetResults,
  adaptFrameoneCanonicalResults,
  buildGeometryDependentBlockedResults,
} = require("../../lib/market-data/basic-location/adapters.ts");
const {
  createAnalysisRunId,
  createAnalysisRunSnapshot,
} = require("../../lib/market-data/basic-location/run.ts");
const {
  applyBasicLocationDisplayPolicy,
} = require("../../lib/market-data/basic-location/display-policy.ts");

// Synthetic fixtures only. No customer data, real location, geometry or claimed statistics.
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const FIXED_DATE = new Date("2026-09-14T00:00:00.000Z");

function snapshot(radiusMeters = 500, withSubmarket = true) {
  return createAnalysisRunSnapshot({
    target: {
      source: "map",
      confirmedAddress: null,
      latitude: 37.5,
      longitude: 127,
      radiusMeters,
    },
    frameone: {
      districtId: "FIXTURE-DISTRICT",
      districtName: "Fixture District",
      marketId: "FIXTURE-MARKET",
      marketName: "Fixture Market",
      submarketId: withSubmarket ? "FIXTURE-SUBMARKET" : null,
      submarketName: withSubmarket ? "Fixture Submarket" : null,
    },
  }, {
    randomUUID: () => radiusMeters === 300 ? UUID_A : UUID_B,
    now: () => FIXED_DATE,
  });
}

function canonicalInput(run = snapshot()) {
  return {
    snapshot: run,
    hierarchyVersion: "fixture-v1",
    hierarchyCheckedAt: "2026-08-27",
    district: { districtId: "FIXTURE-DISTRICT", name: "Fixture District" },
    market: {
      marketId: "FIXTURE-MARKET",
      name: "Fixture Market",
      gu: "Fixture District",
      bakeryMarketImportance: "A",
      researchPriority: "B",
      geometryStatus: "text_only",
    },
    submarket: run.frameone.submarketId ? {
      parentMarketId: "FIXTURE-MARKET",
      submarketId: "FIXTURE-SUBMARKET",
      name: "Fixture Submarket",
      administrativeDong: null,
      status: "text_only",
    } : null,
  };
}

test("Slice 1: analysisRunId uses random UUIDs rather than timestamp-only IDs", () => {
  const first = createAnalysisRunId(() => UUID_A);
  const second = createAnalysisRunId(() => UUID_B);
  assert.equal(first, `basic-location-run:${UUID_A}`);
  assert.equal(second, `basic-location-run:${UUID_B}`);
  assert.notEqual(first, second);
});

test("Slice 1: 300m run snapshot preserves only executed inputs", () => {
  const run = snapshot(300);
  assert.equal(run.target.radiusMeters, 300);
  assert.equal(run.analysisRunId, `basic-location-run:${UUID_A}`);
  assert.equal(run.createdAt, FIXED_DATE.toISOString());
  assert.equal(Object.isFrozen(run), true);
  assert.equal(Object.isFrozen(run.target), true);
});

test("Slice 1: 500m run snapshot maps to a 500m target Result", () => {
  const run = snapshot(500);
  const radius = adaptAnalysisTargetResults(run).find((result) => result.metricKey === "analysis.target.radius_meters");
  assert.equal(run.target.radiusMeters, 500);
  assert.equal(radius.analysisUnit.type, "RADIUS_500M");
  assert.equal(radius.value, 500);
  assert.equal(radius.unit, "m");
});

test("Slice 1: FRAMEONE Market canonical metadata becomes CANONICAL_VALUE Results", () => {
  const results = adaptFrameoneCanonicalResults(canonicalInput());
  const name = results.find((result) => result.metricKey === "frameone.market.name");
  assert.equal(name.value, "Fixture Market");
  assert.equal(name.valueType, "CANONICAL_VALUE");
  assert.equal(name.analysisUnit.type, "FRAMEONE_MARKET");
  assert.equal(name.status, "AVAILABLE");
});

test("Slice 1: FRAMEONE Submarket relation remains canonical and parent-scoped", () => {
  const results = adaptFrameoneCanonicalResults(canonicalInput());
  const parent = results.find((result) => result.metricKey === "frameone.submarket.parent_market_id");
  assert.equal(parent.value, "FIXTURE-MARKET");
  assert.equal(parent.analysisUnit.type, "FRAMEONE_SUBMARKET");
  assert.equal(parent.valueType, "CANONICAL_VALUE");
});

test("Slice 1: Market living population aggregation is a normal BLOCKED Result", () => {
  const result = buildGeometryDependentBlockedResults(snapshot()).find(
    (item) => item.metricKey === "living_population.market_aggregation",
  );
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.missingReason, "BLOCKED_BY_GEOMETRY");
  assert.equal(result.confidence, "UNKNOWN");
  assert.ok(result.limitations.some((item) => item.severity === "BLOCKING"));
});

test("Slice 1: Submarket living population aggregation is blocked when a Submarket is selected", () => {
  const result = buildGeometryDependentBlockedResults(snapshot()).find(
    (item) => item.metricKey === "living_population.submarket_aggregation",
  );
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.analysisUnit.id, "FIXTURE-SUBMARKET");
});

test("Slice 1: blocked values are null and never synthetic zero", () => {
  const results = buildGeometryDependentBlockedResults(snapshot());
  assert.ok(results.length > 0);
  assert.ok(results.every((result) => result.value === null));
  assert.ok(results.every((result) => result.value !== 0));
});

test("Slice 1: adapters are pure inputs and do not require consultation data files", () => {
  const run = snapshot(500, false);
  const input = canonicalInput(run);
  const before = structuredClone(input);
  const targetResults = adaptAnalysisTargetResults(run);
  const canonicalResults = adaptFrameoneCanonicalResults(input);
  const blockedResults = buildGeometryDependentBlockedResults(run);
  assert.deepEqual(input, before);
  assert.ok(targetResults.length > 0 && canonicalResults.length > 0 && blockedResults.length > 0);
  assert.ok(!JSON.stringify([...targetResults, ...canonicalResults, ...blockedResults]).includes("consultations.json"));
  assert.ok(!JSON.stringify([...targetResults, ...canonicalResults, ...blockedResults]).includes("diagnosis-drafts.json.backup"));
});

test("Slice 1 guards invalid coordinates, radius and hierarchy mismatches", () => {
  assert.throws(() => createAnalysisRunSnapshot({
    target: { source: "map", confirmedAddress: null, latitude: Number.NaN, longitude: 127, radiusMeters: 300 },
    frameone: { marketId: "FIXTURE-MARKET", marketName: "Fixture Market" },
  }, { randomUUID: () => UUID_A, now: () => FIXED_DATE }), /latitude/);
  assert.throws(() => createAnalysisRunSnapshot({
    target: { source: "map", confirmedAddress: null, latitude: 37.5, longitude: 127, radiusMeters: 400 },
    frameone: { marketId: "FIXTURE-MARKET", marketName: "Fixture Market" },
  }, { randomUUID: () => UUID_A, now: () => FIXED_DATE }), /radiusMeters/);
  const input = canonicalInput();
  input.submarket.parentMarketId = "FIXTURE-OTHER-MARKET";
  assert.throws(() => adaptFrameoneCanonicalResults(input), /Submarket canonical hierarchy/);
});

test("Slice 4A.1: confirmed analysis address keeps its building-verification limitation", () => {
  const run = createAnalysisRunSnapshot({
    target: {
      source: "address",
      confirmedAddress: "Sample address",
      latitude: 37.5,
      longitude: 127,
      radiusMeters: 300,
    },
    frameone: { marketId: "FIXTURE-MARKET", marketName: "Fixture Market" },
  }, { randomUUID: () => UUID_A, now: () => FIXED_DATE });
  const result = adaptAnalysisTargetResults(run).find(
    (item) => item.metricKey === "analysis.target.confirmed_address",
  );

  assert.equal(result.customerDisplayPolicy, "CUSTOMER_WITH_NOTE");
  assert.ok(result.limitations.some(
    (item) => item.code === "ANALYSIS_ADDRESS_NOT_BUILDING_VERIFICATION",
  ));
  assert.equal(result.value, "Sample address");
  assert.equal(result.primarySource.sourceType, "ANALYSIS_INPUT");
  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.confidence, "HIGH");
  assert.doesNotThrow(() => applyBasicLocationDisplayPolicy([result], "CUSTOMER"));
});

test("Slice 4A.1: FRAMEONE Node metadata retains its non-spatial limitation", () => {
  const run = createAnalysisRunSnapshot({
    target: {
      source: "map",
      confirmedAddress: null,
      latitude: 37.5,
      longitude: 127,
      radiusMeters: 500,
    },
    frameone: {
      districtId: "FIXTURE-DISTRICT",
      districtName: "Fixture District",
      marketId: "FIXTURE-MARKET",
      marketName: "Fixture Market",
      submarketId: "FIXTURE-SUBMARKET",
      submarketName: "Fixture Submarket",
      nodeId: "FIXTURE-NODE",
      nodeName: "Fixture Node",
    },
  }, { randomUUID: () => UUID_B, now: () => FIXED_DATE });
  const input = canonicalInput(run);
  input.node = {
    nodeId: "FIXTURE-NODE",
    parentSubmarketId: "FIXTURE-SUBMARKET",
    type: "MICRO_AREA",
    name: "Fixture Node",
    address: "Sample Node address",
  };
  const nodeResults = adaptFrameoneCanonicalResults(input).filter(
    (item) => item.analysisUnit.type === "FRAMEONE_NODE",
  );
  const customerWithNote = nodeResults.filter(
    (item) => item.customerDisplayPolicy === "CUSTOMER_WITH_NOTE",
  );

  assert.deepEqual(
    customerWithNote.map((item) => item.metricKey),
    ["frameone.node.type", "frameone.node.address"],
  );
  assert.ok(customerWithNote.every((item) => item.limitations.length >= 1));
  assert.ok(customerWithNote.every((item) => item.limitations.some(
    (limitation) => limitation.code === "FRAMEONE_NODE_LOCATION_UNVERIFIED",
  )));
  assert.ok(customerWithNote.every((item) => item.primarySource.sourceType === "FRAMEONE_CANONICAL"));
  assert.ok(customerWithNote.every((item) => item.status === "AVAILABLE" && item.confidence === "HIGH"));
  assert.ok(!nodeResults.some((item) => /latitude|longitude|geometry/.test(item.metricKey)));
  assert.doesNotThrow(() => applyBasicLocationDisplayPolicy(nodeResults, "CUSTOMER"));
});
