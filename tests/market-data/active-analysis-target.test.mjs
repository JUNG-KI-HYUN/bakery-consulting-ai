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
  activeAnalysisTargetSearchParams,
  competitionOfficialMarketChoices,
  officialMarketSelectionAfterLocationChange,
  parseActiveAnalysisTarget,
} = require(path.join(root, "lib/market-data/competition-location.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const target = {
  schemaVersion: "active-analysis-target-v2",
  analysisRunId: "basic-location-run:11111111-1111-4111-8111-111111111111",
  targetKey: "basic-location-run:11111111-1111-4111-8111-111111111111",
  latitude: 37.5,
  longitude: 127,
  radiusM: 300,
  label: "상세 분석지점",
  address: "서울시 fixture 상세주소",
  source: "map",
  explorationSnapshot: {
    marketId: "fixture-market",
    marketName: "탐색 Market",
    submarketId: "fixture-submarket",
    submarketName: "탐색 Submarket",
    nodeId: null,
    nodeName: null,
  },
  officialReference: {
    marketCode: "1234",
    marketName: "공식 참고상권",
    spatialRelation: "INSIDE",
    selectionMethod: "MANUAL",
    selectedAt: "2026-09-23T00:00:00.000Z",
  },
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
};

test("active target round-trip preserves detail radius while keeping FRAMEONE exploration context separate", () => {
  const parsed = parseActiveAnalysisTarget(
    Object.fromEntries(activeAnalysisTargetSearchParams(target)),
  );
  assert.deepEqual(parsed, target);
  assert.equal(parsed.radiusM, 300);
  assert.notEqual(parsed.label, parsed.explorationSnapshot.marketName);
  assert.equal(parsed.explorationSnapshot.submarketName, "탐색 Submarket");
  assert.equal(parsed.targetKey, parsed.analysisRunId);
});

test("changing location or radius clears the previous manual official-market selection", () => {
  const previous = { latitude: 37.5, longitude: 127, radiusM: 300, label: null };
  assert.equal(
    officialMarketSelectionAfterLocationChange(previous, { ...previous }, "1234"),
    "1234",
  );
  assert.equal(
    officialMarketSelectionAfterLocationChange(
      previous,
      { ...previous, latitude: 37.51 },
      "1234",
    ),
    null,
  );
  assert.equal(
    officialMarketSelectionAfterLocationChange(
      previous,
      { ...previous, radiusM: 500 },
      "1234",
    ),
    null,
  );
});

test("official-market relation candidates are recalculated from the new detail point", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[
      [126.999, 37.499], [127.001, 37.499], [127.001, 37.501],
      [126.999, 37.501], [126.999, 37.499],
    ]],
  };
  const markets = [{ marketCode: "1234", marketName: "fixture", geometry }];
  assert.equal(
    competitionOfficialMarketChoices(
      { analysisPoint: { latitude: 37.5, longitude: 127 }, analysisRadiusMeters: 300 },
      markets,
    )[0].relation,
    "INSIDE",
  );
  assert.deepEqual(
    competitionOfficialMarketChoices(
      { analysisPoint: { latitude: 37.6, longitude: 127.1 }, analysisRadiusMeters: 300 },
      markets,
    ),
    [],
  );
});

test("Competition, Rental, and Economic pages share the active-target workflow snapshot", () => {
  const workflow = fs.readFileSync(path.join(root, "app/markets/AnalysisWorkflow.tsx"), "utf8");
  const competition = fs.readFileSync(path.join(root, "app/markets/competition-structure/CompetitionStructureClient.tsx"), "utf8");
  const rental = fs.readFileSync(path.join(root, "app/markets/rental-research/page.tsx"), "utf8");
  for (const label of ["1. 분석대상", "2. 입지·상권", "3. 경쟁환경", "4. 임대시장", "5. 사업성·손익", "6. 후보점포 진단", "7. 데이터·근거"]) {
    assert.match(workflow, new RegExp(label.replace("·", "\\·")));
  }
  assert.match(competition, /ActiveAnalysisTargetCard/);
  assert.match(rental, /ActiveAnalysisTargetCard/);
  const economicClient = fs.readFileSync(path.join(root, "app/markets/economic-feasibility/EconomicFeasibilityClient.tsx"), "utf8");
  assert.match(economicClient, /AnalysisTargetHeader/);
  assert.match(workflow, /activeAnalysisTargetHref/);
  const marketsPage = fs.readFileSync(path.join(root, "app/markets/page.tsx"), "utf8");
  const explorer = fs.readFileSync(path.join(root, "app/markets/MarketsExplorer.tsx"), "utf8");
  assert.match(marketsPage, /parseActiveAnalysisTarget/);
  assert.match(marketsPage, /initialTarget=\{activeTarget\}/);
  assert.match(explorer, /initialTarget=\{activeTarget\}/);
});

test("new workflow removes V1 product labels and preserves calculation engines", () => {
  const files = [
    "app/markets/competition-structure/CompetitionStructureClient.tsx",
    "app/markets/economic-feasibility/page.tsx",
    "app/markets/rental-research/page.tsx",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.equal(files.includes("Competition Structure V1"), false);
  assert.equal(files.includes("Economic Feasibility V1"), false);
  assert.equal(files.includes("Rental Research"), false);
  assert.match(files, /buildCompetitionStructure/);
  const economicClient = fs.readFileSync(path.join(root, "app/markets/economic-feasibility/EconomicFeasibilityClient.tsx"), "utf8");
  assert.match(economicClient, /calculateEconomicFeasibility/);
  assert.equal(economicClient.includes("분기(선택)"), false);
  assert.equal(economicClient.includes("공식상권 코드<input"), false);
});

test("main map explicitly clears old official selection when a new analysis executes", () => {
  const viewer = fs.readFileSync(path.join(root, "app/markets/MarketSpatialViewer.tsx"), "utf8");
  const handler = viewer.slice(
    viewer.indexOf("const handleAnalysisExecuted"),
    viewer.indexOf("const handleAnalysisExecuted") + 700,
  );
  assert.match(handler, /setSelectedReferences\(\[\]\)/);
  assert.match(handler, /setSelectedReferenceIndex\(0\)/);
  assert.match(handler, /setHitTestDurationMs\(null\)/);
});
