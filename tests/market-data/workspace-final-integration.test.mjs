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
  analysisResultStatus,
  createActiveAnalysisTarget,
} = require(path.join(root, "lib/market-data/basic-location/run.ts"));
const {
  createRentalScopeConfirmation,
  isRentalScopeConfirmationCurrent,
  rentalComparisonStatus,
} = require(path.join(root, "lib/research/rental-scope.ts"));
const {
  economicResultStatus,
  officialBenchmarkIdentity,
} = require(path.join(root, "lib/economic-feasibility/workspace-binding.ts"));
const { resolveActiveTargetOfficialReference } = require(path.join(root, "lib/market-data/active-official-reference.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const targetInput = {
  analysis: {
    label: "fixture",
    address: "서울 fixture",
    latitude: 37.5,
    longitude: 127,
    radiusM: 300,
    source: "map",
  },
  explorationSnapshot: {
    marketId: "market-a",
    marketName: "Market A",
  },
};

test("active target uses analysisRunId as its only canonical identity", () => {
  const target = createActiveAnalysisTarget(targetInput, {
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    now: () => new Date("2026-09-23T00:00:00.000Z"),
  });
  assert.equal(target.targetKey, target.analysisRunId);
  assert.equal(target.analysisRunId, "basic-location-run:11111111-1111-4111-8111-111111111111");
  assert.equal(target.explorationSnapshot.marketId, "market-a");
});

test("even the same location creates a new analysisRunId on explicit execution", () => {
  const first = createActiveAnalysisTarget(targetInput, {
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
  });
  const second = createActiveAnalysisTarget(targetInput, {
    randomUUID: () => "22222222-2222-4222-8222-222222222222",
  });
  assert.notEqual(first.analysisRunId, second.analysisRunId);
  assert.deepEqual(
    [first.latitude, first.longitude, first.radiusM],
    [second.latitude, second.longitude, second.radiusM],
  );
});

test("result binding distinguishes NOT_RUN, CURRENT, and STALE", () => {
  assert.equal(analysisResultStatus("run-a", null), "NOT_RUN");
  assert.equal(analysisResultStatus("run-a", "run-a"), "CURRENT");
  assert.equal(analysisResultStatus("run-a", "run-b"), "STALE");
});

test("rental confirmation records run, method, records, basis, and confirmation time", () => {
  const confirmation = createRentalScopeConfirmation({
    analysisRunId: "run-a",
    officialMarketCode: "1234",
    method: "MANUAL_ADDRESS_REVIEW",
    selectedRecordIds: ["b", "a", "a"],
    basis: "주소 수동 대조",
  }, {
    randomUUID: () => "33333333-3333-4333-8333-333333333333",
    now: () => new Date("2026-09-23T01:00:00.000Z"),
  });
  assert.deepEqual(confirmation.selectedRecordIds, ["a", "b"]);
  assert.equal(confirmation.method, "MANUAL_ADDRESS_REVIEW");
  assert.equal(confirmation.confirmedAt, "2026-09-23T01:00:00.000Z");
  assert.match(confirmation.confirmationId, /^rental-scope:/);
});

test("target, official reference, or selected record changes invalidate rental confirmation", () => {
  const confirmation = createRentalScopeConfirmation({
    analysisRunId: "run-a",
    officialMarketCode: "1234",
    method: "MANUAL_ADDRESS_REVIEW",
    selectedRecordIds: ["a", "b"],
    basis: "주소 수동 대조",
  }, { randomUUID: () => "33333333-3333-4333-8333-333333333333" });
  const expected = { analysisRunId: "run-a", officialMarketCode: "1234", selectedRecordIds: ["b", "a"] };
  assert.equal(isRentalScopeConfirmationCurrent(confirmation, expected), true);
  assert.equal(isRentalScopeConfirmationCurrent(confirmation, { ...expected, analysisRunId: "run-b" }), false);
  assert.equal(isRentalScopeConfirmationCurrent(confirmation, { ...expected, officialMarketCode: "9999" }), false);
  assert.equal(isRentalScopeConfirmationCurrent(confirmation, { ...expected, selectedRecordIds: ["a"] }), false);
  assert.equal(rentalComparisonStatus({ availableRecordCount: 0, confirmation, ...expected }), "NOT_AVAILABLE");
});

test("economic binding invalidates on run, benchmark quarter, rental scope, or assumption revision", () => {
  const identity = officialBenchmarkIdentity({
    officialMarketCode: "1234",
    quarterCode: "20262",
    industryCode: "CS100005",
  });
  const binding = {
    analysisRunId: "run-a",
    officialBenchmarkIdentity: identity,
    rentalConfirmationId: "rental-a",
    assumptionRevision: 2,
  };
  const snapshot = { generatedAt: "2026-09-23T00:00:00.000Z", binding, result: {} };
  assert.equal(economicResultStatus(snapshot, binding), "CURRENT");
  assert.equal(economicResultStatus(snapshot, { ...binding, analysisRunId: "run-b" }), "STALE");
  assert.equal(economicResultStatus(snapshot, { ...binding, rentalConfirmationId: "rental-b" }), "STALE");
  assert.equal(economicResultStatus(snapshot, { ...binding, assumptionRevision: 3 }), "STALE");
  assert.equal(economicResultStatus(snapshot, { ...binding, officialBenchmarkIdentity: { ...identity, quarterCode: "20263" } }), "STALE");
});

test("economic input uses tab-scoped session storage and keeps calculations explicit", () => {
  const source = fs.readFileSync(path.join(root, "app/markets/economic-feasibility/EconomicFeasibilityClient.tsx"), "utf8");
  assert.match(source, /sessionStorage/);
  assert.equal(source.includes("localStorage"), false);
  assert.match(source, /assumptionRevision/);
  assert.match(source, /현재 조건으로 다시 계산/);
  assert.match(source, /이전 분석대상 또는 이전 조건/);
});

test("official reference URL hints are revalidated against validated polygons", () => {
  const source = fs.readFileSync(path.join(root, "lib/market-data/official-market-reference.server.ts"), "utf8");
  assert.match(source, /status !== "validated"/);
  assert.match(source, /output_crs !== "EPSG:4326"/);
  assert.match(source, /resolveActiveTargetOfficialReference/);
});

test("a single spatial candidate is auto-selected and a wrong URL reference is discarded", () => {
  const target = createActiveAnalysisTarget(targetInput, {
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    now: () => new Date("2026-09-23T00:00:00.000Z"),
  });
  const polygon = {
    type: "Polygon",
    coordinates: [[
      [126.999, 37.499], [127.001, 37.499], [127.001, 37.501],
      [126.999, 37.501], [126.999, 37.499],
    ]],
  };
  const resolved = resolveActiveTargetOfficialReference(
    { ...target, officialReference: { marketCode: "wrong", marketName: "wrong", spatialRelation: "INSIDE", selectionMethod: "MANUAL", selectedAt: target.createdAt } },
    [{ marketCode: "valid", marketName: "검증상권", geometry: polygon }],
    () => new Date("2026-09-23T02:00:00.000Z"),
  );
  assert.equal(resolved.officialReference.marketCode, "valid");
  assert.equal(resolved.officialReference.selectionMethod, "AUTO_SINGLE_CANDIDATE");
});

test("multiple official candidates are never auto-confirmed", () => {
  const target = createActiveAnalysisTarget(targetInput, {
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
  });
  const polygon = {
    type: "Polygon",
    coordinates: [[
      [126.999, 37.499], [127.001, 37.499], [127.001, 37.501],
      [126.999, 37.501], [126.999, 37.499],
    ]],
  };
  const resolved = resolveActiveTargetOfficialReference(target, [
    { marketCode: "a", marketName: "후보 A", geometry: polygon },
    { marketCode: "b", marketName: "후보 B", geometry: polygon },
  ]);
  assert.equal(resolved.officialReference, null);
});

test("competition UI keeps search exposure, detail, dedupe, and field verification separate", () => {
  const source = fs.readFileSync(path.join(root, "app/markets/competition-structure/CompetitionStructureClient.tsx"), "utf8");
  for (const label of ["Kakao 검색 노출 참고", "API 상세 관측", "중복 정규화 후보", "현장확인 경쟁점"]) {
    assert.match(source, new RegExp(label));
  }
  assert.equal(source.includes(">UNKNOWN<"), false);
  assert.equal(source.includes("NOT_CHECKED 상태"), false);
});

test("candidate handoff appends a source snapshot without requiring old records to have links", () => {
  const types = fs.readFileSync(path.join(root, "lib/diagnosis/types.ts"), "utf8");
  const page = fs.readFileSync(path.join(root, "app/consultations/new/page.tsx"), "utf8");
  assert.match(types, /analysisTargetLinks\?:/);
  assert.match(page, /\.\.\.\(current\.analysisTargetLinks \?\? \[\]\)/);
  assert.match(page, /sourceSnapshot: target/);
  assert.match(page, /candidateStore:/);
});

test("common target header hides developer identity fields from rendered labels", () => {
  const source = fs.readFileSync(path.join(root, "app/markets/AnalysisWorkflow.tsx"), "utf8");
  assert.match(source, /현재 분석대상/);
  assert.match(source, /FRAMEONE 탐색분류/);
  assert.match(source, /서울시 공식통계 참고상권/);
  assert.equal(source.includes("schema version"), false);
  assert.equal(source.includes("latitude"), false);
  assert.equal(source.includes("longitude"), false);
});
