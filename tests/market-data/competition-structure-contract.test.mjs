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

const { buildCompetitionStructure } = require(
  path.join(root, "lib/market-data/competition-structure.ts"),
);

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const RUN_ID = "basic-location-run:22222222-2222-4222-8222-222222222222";

function input(overrides = {}) {
  return {
    analysisRunId: RUN_ID,
    generatedAt: "2026-09-29T00:00:00.000Z",
    center: { latitude: 37.5, longitude: 127 },
    radiusM: 500,
    categories: [
      {
        id: "bakery",
        label: "베이커리",
        totalCount: 2,
        places: [
          {
            kakaoPlaceId: "fixture-a",
            name: "fixture bakery a",
            phone: null,
            roadAddress: "fixture road a",
            addressName: null,
            latitude: 37.501,
            longitude: 127,
            distanceM: 110,
            sourceCategoryId: "bakery",
            sourceCategoryLabel: "베이커리",
          },
          {
            kakaoPlaceId: "fixture-b",
            name: "fixture bakery b",
            phone: null,
            roadAddress: "fixture road b",
            addressName: null,
            latitude: 37.5,
            longitude: 127.001,
            distanceM: 90,
            sourceCategoryId: "bakery",
            sourceCategoryLabel: "베이커리",
          },
        ],
        error: null,
      },
    ],
    officialMarketData: null,
    ...overrides,
  };
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

test("analysisRunId is preserved on the result and its binding", () => {
  const result = buildCompetitionStructure(input());
  assert.equal(result.analysisRunId, RUN_ID);
  assert.equal(result.binding.analysisRunId, RUN_ID);
});

test("empty or whitespace analysisRunId is rejected", () => {
  assert.throws(() => buildCompetitionStructure(input({ analysisRunId: "" })));
  assert.throws(() => buildCompetitionStructure(input({ analysisRunId: "   " })));
});

test("identical input produces identical output", () => {
  assert.deepEqual(buildCompetitionStructure(input()), buildCompetitionStructure(input()));
});

test("classification, franchise, and field verification stay unconfirmed", () => {
  const result = buildCompetitionStructure(input());
  assert.ok(result.candidates.length > 0);
  for (const candidate of result.candidates) {
    assert.equal(candidate.classification, "UNKNOWN");
    assert.equal(candidate.franchiseClassification, "UNKNOWN");
    assert.equal(candidate.fieldVerificationStatus, "NOT_CHECKED");
  }
  for (const handoff of result.fieldHandoff) {
    assert.equal(handoff.classification, "UNKNOWN");
    assert.equal(handoff.fieldVerificationStatus, "NOT_CHECKED");
    assert.equal(handoff.confirmationRequired, true);
  }
  assert.equal(result.franchiseShare, null);
  assert.equal(result.kakaoObservation.scope, "SEARCH_OBSERVATION_NOT_CENSUS");
});

test("result carries no risk, score, or verdict fields", () => {
  const keys = collectKeys(buildCompetitionStructure(input()));
  const forbidden = /risk|score|verdict|recommend|hardfail|reject|approve|intensity/i;
  assert.deepEqual([...keys].filter((key) => forbidden.test(key)), []);
});
