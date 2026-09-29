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

const locationPath = path.join(root, "lib/market-data/competition-location.ts");
const {
  competitionExecutionMatchesTarget,
  competitionOfficialMarketChoices,
  competitionResultMatchesTarget,
  competitionStructureLocationInput,
  createCompetitionLocationTarget,
  initialOfficialMarketCode,
  officialMarketSelectionAfterLocationChange,
} = require(locationPath);
const { buildCompetitionStructure } = require(
  path.join(root, "lib/market-data/competition-structure.ts"),
);

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const RUN_A = "basic-location-run:33333333-3333-4333-8333-333333333333";
const RUN_B = "basic-location-run:44444444-4444-4444-8444-444444444444";

function minimalTarget(overrides = {}) {
  return { analysisRunId: RUN_A, latitude: 37.5, longitude: 127, radiusM: 500, ...overrides };
}

function square(longitude) {
  return {
    type: "Polygon",
    coordinates: [[
      [longitude - 0.001, 37.499],
      [longitude + 0.001, 37.499],
      [longitude + 0.001, 37.501],
      [longitude - 0.001, 37.501],
      [longitude - 0.001, 37.499],
    ]],
  };
}

function coreResult(target) {
  return buildCompetitionStructure({
    ...competitionStructureLocationInput(target),
    generatedAt: "2026-09-29T00:00:00.000Z",
    categories: [],
    officialMarketData: null,
  });
}

test("valid minimal target produces a frozen target with the same run id", () => {
  const target = createCompetitionLocationTarget(minimalTarget());
  assert.deepEqual(target, minimalTarget());
  assert.equal(target.analysisRunId, RUN_A);
  assert.equal(Object.isFrozen(target), true);
});

test("empty and whitespace-only analysisRunId are rejected", () => {
  assert.throws(() => createCompetitionLocationTarget(minimalTarget({ analysisRunId: "" })), /analysisRunId/);
  assert.throws(() => createCompetitionLocationTarget(minimalTarget({ analysisRunId: "   " })), /analysisRunId/);
  assert.throws(() => competitionStructureLocationInput(minimalTarget({ analysisRunId: " " })), /analysisRunId/);
});

test("invalid coordinates and radius are rejected rather than coerced", () => {
  assert.throws(() => createCompetitionLocationTarget(minimalTarget({ latitude: Number.NaN })));
  assert.throws(() => createCompetitionLocationTarget(minimalTarget({ longitude: 181 })));
  assert.throws(() => createCompetitionLocationTarget(minimalTarget({ latitude: null })));
  assert.throws(() => createCompetitionLocationTarget(minimalTarget({ radiusM: 400 })));
});

test("input is not mutated and output is JSON serializable", () => {
  const input = minimalTarget();
  const before = structuredClone(input);
  const target = createCompetitionLocationTarget(input);
  const structureInput = competitionStructureLocationInput(input);
  assert.deepEqual(input, before);
  assert.deepEqual(JSON.parse(JSON.stringify(target)), before);
  assert.deepEqual(JSON.parse(JSON.stringify(structureInput)), {
    analysisRunId: RUN_A,
    center: { latitude: 37.5, longitude: 127 },
    radiusM: 500,
  });
});

test("workspace-specific properties are not carried into the contract", () => {
  const target = createCompetitionLocationTarget({
    ...minimalTarget(),
    schemaVersion: "active-analysis-target-v2",
    targetKey: RUN_A,
    label: "fixture label",
    address: "fixture address",
    source: "map",
    explorationSnapshot: { marketId: "fixture-market" },
    officialReference: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  });
  assert.deepEqual(Object.keys(target).sort(), ["analysisRunId", "latitude", "longitude", "radiusM"]);
});

test("module does not depend on the workspace ActiveAnalysisTarget type", () => {
  const source = fs.readFileSync(locationPath, "utf8");
  assert.equal(source.includes("ActiveAnalysisTarget"), false);
  assert.equal(source.includes("basic-location/run"), false);
  assert.equal(/from\s+["']@\/app\//.test(source), false);
});

test("no risk, score, or verdict fields are produced", () => {
  const forbidden = /risk|score|verdict|recommend|hardfail|reject|approve|directcompetition/i;
  const keys = [
    ...Object.keys(createCompetitionLocationTarget(minimalTarget())),
    ...Object.keys(competitionStructureLocationInput(minimalTarget())),
  ];
  assert.deepEqual(keys.filter((key) => forbidden.test(key)), []);
  const source = fs.readFileSync(locationPath, "utf8");
  assert.equal(forbidden.test(source), false);
});

test("UNKNOWN relations and null inputs are not promoted to matches or choices", () => {
  const choices = competitionOfficialMarketChoices(
    { analysisPoint: { latitude: 37.5, longitude: 127 }, analysisRadiusMeters: 500 },
    [
      { marketCode: "9", marketName: "geometry missing", geometry: null },
      { marketCode: "1", marketName: "포함 상권", geometry: square(127) },
    ],
  );
  assert.deepEqual(choices.map((choice) => [choice.marketCode, choice.relation]), [["1", "INSIDE"]]);
  assert.deepEqual(competitionOfficialMarketChoices(null, [
    { marketCode: "1", marketName: "포함 상권", geometry: square(127) },
  ]), []);
  assert.equal(initialOfficialMarketCode([]), null);
  assert.equal(competitionExecutionMatchesTarget(null, {
    analysisPoint: { latitude: 37.5, longitude: 127 },
    analysisRadiusMeters: 500,
  }), false);
  assert.equal(competitionResultMatchesTarget(null, null), false);
});

test("multiple official market choices are not auto-selected", () => {
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

test("location change clears the official market selection", () => {
  const point = { latitude: 37.5, longitude: 127, radiusM: 500 };
  assert.equal(officialMarketSelectionAfterLocationChange(point, { ...point }, "1"), "1");
  assert.equal(officialMarketSelectionAfterLocationChange(point, { ...point, radiusM: 300 }, "1"), null);
  assert.equal(officialMarketSelectionAfterLocationChange(point, { ...point, latitude: 37.51 }, "1"), null);
});

test("minimal target connects to Competition Core and binds the same run", () => {
  const target = createCompetitionLocationTarget(minimalTarget());
  const result = coreResult(target);
  assert.equal(result.analysisRunId, RUN_A);
  assert.equal(result.binding.analysisRunId, RUN_A);
  assert.equal(competitionResultMatchesTarget(target, result), true);
  assert.equal(competitionExecutionMatchesTarget(target, {
    analysisPoint: { latitude: 37.5, longitude: 127 },
    analysisRadiusMeters: 500,
  }), true);
});

test("same coordinates under another run are stale, not a match", () => {
  const staleResult = coreResult(createCompetitionLocationTarget(minimalTarget({ analysisRunId: RUN_B })));
  const target = createCompetitionLocationTarget(minimalTarget());
  assert.equal(competitionResultMatchesTarget(target, staleResult), false);
  assert.equal(competitionResultMatchesTarget(target, {
    ...coreResult(target),
    binding: { ...coreResult(target).binding, analysisRunId: RUN_B },
  }), false);
  assert.equal(competitionResultMatchesTarget(target, coreResult(
    createCompetitionLocationTarget(minimalTarget({ radiusM: 300 })),
  )), false);
});
