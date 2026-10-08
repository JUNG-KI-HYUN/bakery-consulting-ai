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
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
};

const {
  MARKET_WORKFLOW_STEPS,
  caseAwareMarketWorkflowPath,
} = require(path.join(root, "lib/navigation/case-aware-market-navigation.ts"));
const {
  activeAnalysisTargetHref,
} = require(path.join(root, "lib/market-data/competition-location.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

test("Case-aware market steps preserve caseId across the analysis workflow", () => {
  for (const step of MARKET_WORKFLOW_STEPS.filter((item) => item.id !== "candidate")) {
    const href = caseAwareMarketWorkflowPath(step, "case-test/navigation");
    const url = new URL(href, "https://frameone.local");
    assert.equal(url.searchParams.get("caseId"), "case-test/navigation");
  }
});

test("Case-aware candidate step uses the Case candidate creation route", () => {
  const step = MARKET_WORKFLOW_STEPS.find((item) => item.id === "candidate");
  assert.equal(
    caseAwareMarketWorkflowPath(step, "case-test/navigation"),
    "/cases/case-test%2Fnavigation/candidates/new?origin=market",
  );
});

test("Standalone market workflow keeps every existing route unchanged", () => {
  for (const step of MARKET_WORKFLOW_STEPS) {
    assert.equal(caseAwareMarketWorkflowPath(step, null), step.pathname);
  }
});

test("Pilot location CTA preserves Case context before adding the analysis target", () => {
  const competitionStep = MARKET_WORKFLOW_STEPS.find((item) => item.id === "competition");
  const target = {
    schemaVersion: "active-analysis-target-v2",
    analysisRunId: "basic-location-run:pilot",
    targetKey: "basic-location-run:pilot",
    label: "fixture location",
    address: "fixture address",
    latitude: 37.5,
    longitude: 127.1,
    radiusM: 500,
    source: "address",
    explorationSnapshot: {
      marketId: "fixture-market",
      marketName: "fixture market",
      submarketId: null,
      submarketName: null,
      nodeId: null,
      nodeName: null,
    },
    officialReference: null,
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
  };
  const href = activeAnalysisTargetHref(
    caseAwareMarketWorkflowPath(competitionStep, "case-pilot"),
    target,
  );
  const url = new URL(href, "https://frameone.local");

  assert.equal(url.pathname, "/markets/competition-structure");
  assert.equal(url.searchParams.get("caseId"), "case-pilot");
  assert.equal(url.searchParams.get("analysisRunId"), "basic-location-run:pilot");
});

test("Competition, rental, and economic pages pass the Case context to the workflow", () => {
  for (const file of [
    "app/markets/competition-structure/page.tsx",
    "app/markets/rental-research/page.tsx",
    "app/markets/economic-feasibility/page.tsx",
  ]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /query\.caseId/);
    assert.match(source, /caseId=\{caseId\}/);
  }
  const competitionClient = fs.readFileSync(
    path.join(root, "app/markets/competition-structure/CompetitionStructureClient.tsx"),
    "utf8",
  );
  assert.match(competitionClient, /caseId: string \| null/);
  assert.match(competitionClient, /caseId=\{caseId\}/);
});

test("MarketsExplorer passes only validated Case context into the workflow", () => {
  const explorer = fs.readFileSync(path.join(root, "app/markets/MarketsExplorer.tsx"), "utf8");
  assert.match(explorer, /caseId=\{caseContext\?\.caseId \?\? null\}/);
});

test("Kakao location CTA receives a Case-aware competition href", () => {
  const explorer = fs.readFileSync(path.join(root, "app/markets/MarketsExplorer.tsx"), "utf8");
  const viewer = fs.readFileSync(path.join(root, "app/markets/MarketSpatialViewer.tsx"), "utf8");
  const map = fs.readFileSync(path.join(root, "app/markets/KakaoBaseMap.tsx"), "utf8");

  assert.match(explorer, /<MarketSpatialViewer[\s\S]*caseId=\{caseContext\?\.caseId \?\? null\}/);
  assert.match(viewer, /caseAwareMarketWorkflowPath\(COMPETITION_WORKFLOW_STEP, caseId\)/);
  assert.match(viewer, /downstreamCompetitionHref=\{activeAnalysisTarget \? competitionEnvironmentHref : null\}/);
  assert.match(map, /href=\{competitionStructureHref\}/);
});
