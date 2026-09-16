/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  acceptRunBoundSourceUpdate,
  buildMarketAnalysisContext,
} = require("../../lib/market-data/market-analysis-context.ts");
const {
  createAnalysisRunSnapshot,
} = require("../../lib/market-data/basic-location/run.ts");

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STARTED_A = new Date("2026-09-16T01:00:00.000Z");
const STARTED_B = new Date("2026-09-16T01:01:00.000Z");

function run({
  uuid = UUID_A,
  now = STARTED_A,
  source = "map",
  confirmedAddress = null,
  latitude = 37.5,
  longitude = 127,
  radiusMeters = 300,
  marketId = "FIXTURE-MARKET-A",
  marketName = "Fixture Market A",
} = {}) {
  return createAnalysisRunSnapshot({
    target: { source, confirmedAddress, latitude, longitude, radiusMeters },
    frameone: {
      districtId: "FIXTURE-DISTRICT",
      districtName: "Fixture District",
      marketId,
      marketName,
      submarketId: "FIXTURE-SUBMARKET",
      submarketName: "Fixture Submarket",
      nodeId: null,
      nodeName: null,
    },
  }, { randomUUID: () => uuid, now: () => now });
}

function contextInput(snapshot, sourceRunId = snapshot.analysisRunId) {
  return {
    runSnapshot: snapshot,
    executedAnalysis: null,
    selectedFrameoneMarket: { marketId: "DRAFT-MARKET", marketName: "Draft Market" },
    selectedFrameoneSubmarket: null,
    kakaoNearby: {
      status: "success",
      response: { categories: [{ id: "bakery", totalCount: 0, places: [] }] },
      error: null,
      analysisRunId: sourceRunId,
      completedAt: "2026-09-16T01:00:10.000Z",
    },
    officialMarkets: {
      status: "success",
      error: null,
      analysisRunId: sourceRunId,
      completedAt: "2026-09-16T01:00:11.000Z",
      results: [{
        marketCode: "FIXTURE-OFFICIAL",
        marketName: "Fixture Official Market",
        relation: "INSIDE",
        analysisRadiusMeters: snapshot.target.radiusMeters,
      }],
      manuallySelected: {
        marketCode: "FIXTURE-OFFICIAL",
        marketName: "Fixture Official Market",
      },
    },
    publicData: {
      requestStatus: "success",
      requestedOfficialMarketCode: "FIXTURE-OFFICIAL",
      data: {
        officialMarketCode: "FIXTURE-OFFICIAL",
        officialMarketName: "Fixture Official Market",
        dataStatus: "available",
      },
      error: null,
      analysisRunId: sourceRunId,
      completedAt: "2026-09-16T01:00:12.000Z",
    },
  };
}

test("Slice 5A: one explicit creation produces one immutable run identity", () => {
  let uuidCalls = 0;
  const snapshot = createAnalysisRunSnapshot({
    target: {
      source: "address",
      confirmedAddress: "Fixture confirmed address",
      latitude: 37.5,
      longitude: 127,
      radiusMeters: 300,
    },
    frameone: { marketId: "FIXTURE-MARKET-A", marketName: "Fixture Market A" },
  }, {
    randomUUID: () => {
      uuidCalls += 1;
      return UUID_A;
    },
    now: () => STARTED_A,
  });

  assert.equal(uuidCalls, 1);
  assert.equal(snapshot.analysisRunId, `basic-location-run:${UUID_A}`);
  assert.equal(snapshot.target.source, "address");
  assert.equal(snapshot.target.confirmedAddress, "Fixture confirmed address");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.frameone), true);
});

test("Slice 5A: re-executed radius, location or FRAMEONE Context receives a new run", () => {
  const first = run();
  const radiusChanged = run({ uuid: UUID_B, now: STARTED_B, radiusMeters: 500 });
  const locationChanged = run({ uuid: UUID_B, now: STARTED_B, latitude: 37.6 });
  const marketChanged = run({
    uuid: UUID_B,
    now: STARTED_B,
    marketId: "FIXTURE-MARKET-B",
    marketName: "Fixture Market B",
  });

  assert.notEqual(first.analysisRunId, radiusChanged.analysisRunId);
  assert.notEqual(first.analysisRunId, locationChanged.analysisRunId);
  assert.notEqual(first.analysisRunId, marketChanged.analysisRunId);
  assert.equal(first.target.radiusMeters, 300);
  assert.equal(radiusChanged.target.radiusMeters, 500);
});

test("Slice 5A: matching Source results and completion metadata belong to their run", () => {
  const snapshot = run();
  const context = buildMarketAnalysisContext(contextInput(snapshot));

  assert.equal(context.analysisRunId, snapshot.analysisRunId);
  assert.equal(context.analysisStartedAt, snapshot.createdAt);
  assert.deepEqual(context.runSnapshot, snapshot);
  assert.deepEqual(context.sourceCompletion, {
    kakaoCompletedAt: "2026-09-16T01:00:10.000Z",
    officialRelationCompletedAt: "2026-09-16T01:00:11.000Z",
    officialStatsCompletedAt: "2026-09-16T01:00:12.000Z",
  });
  assert.equal(context.kakaoNearby.status, "success");
  assert.equal(context.officialMarkets.status, "success");
  assert.equal(context.publicData.requestStatus, "success");
});

test("Slice 5A: stale Kakao, Relation and official statistics cannot overwrite Run B", () => {
  const runA = run();
  const runB = run({ uuid: UUID_B, now: STARTED_B, radiusMeters: 500 });
  const staleInput = contextInput(runB, runA.analysisRunId);
  const context = buildMarketAnalysisContext(staleInput);

  assert.equal(context.analysisRunId, runB.analysisRunId);
  assert.equal(context.target.executedRadiusMeters, 500);
  assert.deepEqual(context.kakaoNearby, {
    status: "idle", error: null, bakery: null, confectionery: null, cafe: null,
  });
  assert.equal(context.officialMarkets.status, "idle");
  assert.equal(context.officialMarkets.relatedMarkets, null);
  assert.equal(context.publicData.requestStatus, "idle");
  assert.equal(context.publicData.selectedOfficialMarketData, null);
  assert.deepEqual(context.sourceCompletion, {
    kakaoCompletedAt: null,
    officialRelationCompletedAt: null,
    officialStatsCompletedAt: null,
  });
});

test("Slice 5A: selector edits cannot rewrite the executed FRAMEONE snapshot", () => {
  const snapshot = run();
  const input = contextInput(snapshot);
  input.selectedFrameoneMarket = { marketId: "DRAFT-MARKET-B", marketName: "Draft Market B" };
  const context = buildMarketAnalysisContext(input);

  assert.equal(context.frameone.selectedMarketId, "FIXTURE-MARKET-A");
  assert.equal(context.frameone.selectedMarketName, "Fixture Market A");
  assert.equal(context.runSnapshot.frameone.nodeId, null);
});

test("Slice 5A: stale updater preserves the active value and completion timestamp", () => {
  const current = {
    analysisRunId: `basic-location-run:${UUID_B}`,
    status: "success",
    completedAt: "2026-09-16T01:01:10.000Z",
  };
  const stale = {
    analysisRunId: `basic-location-run:${UUID_A}`,
    status: "success",
    completedAt: "2026-09-16T01:02:00.000Z",
  };
  const accepted = acceptRunBoundSourceUpdate(current.analysisRunId, current, stale);

  assert.equal(accepted, current);
  assert.equal(accepted.completedAt, "2026-09-16T01:01:10.000Z");
});

test("Slice 5A: run creation is wired only to the explicit analysis handler", () => {
  const viewerPath = path.join(__dirname, "../../app/markets/MarketSpatialViewer.tsx");
  const source = fs.readFileSync(viewerPath, "utf8");
  const handlerStart = source.indexOf("const handleAnalysisExecuted");
  const nextHandler = source.indexOf("const selectedReference", handlerStart);
  const handlerSource = source.slice(handlerStart, nextHandler);

  assert.equal((source.match(/createAnalysisRunSnapshot\(/g) ?? []).length, 1);
  assert.match(handlerSource, /createAnalysisRunSnapshot\(/);
  assert.doesNotMatch(source.slice(0, handlerStart), /createAnalysisRunSnapshot\(/);
});
