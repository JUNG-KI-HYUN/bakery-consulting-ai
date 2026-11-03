import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return previousModuleLoad.call(this, request, parent, isMain);
};

const provider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const repository = require(path.join(root, "lib/pork33-candidate-shortlist/repository.server.ts"));
const seedTypes = require(path.join(root, "lib/pork33-candidate-shortlist/seed-types.ts"));
const snapshotFixture = require(path.join(root, "lib/pork33-candidate-shortlist/sanitized-sbiz-fixture.ts"));
const snapshots = require(path.join(root, "lib/pork33-candidate-shortlist/decision-snapshots.server.ts"));
const briefingPdf = require(path.join(root, "lib/pork33-candidate-shortlist/briefing-pdf-export.server.ts"));
const reportCenter = require(path.join(root, "lib/store-development-report/report-center.ts"));
const storeCore = require(path.join(root, "lib/store-development-core/index.ts"));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p33-data-boundary-"));
const missingSeedPath = path.join(tempRoot, "missing", "private-seed.json");

after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
  Module._load = previousModuleLoad;
});

test("01 missing local source resolves explicit sanitized fixture", async () => {
  const resolution = await provider.loadPork33SeedPackage({ localSourcePath: missingSeedPath });
  assert.equal(resolution.mode, "SANITIZED_FIXTURE");
  assert.equal(resolution.sourcePath, null);
  assert.equal(resolution.seed.sourceDatasetId, "PORK33_SANITIZED_FIXTURE_V1");
  assert.equal(resolution.seed.candidates.length, 27);
  assert.ok(resolution.seed.candidates.every((candidate) => candidate.normalized.sourceType === "SANITIZED_FIXTURE"));
});

test("02 local provider prefers a valid private seed", async () => {
  const fixture = await provider.loadPork33SeedPackage({ localSourcePath: missingSeedPath });
  const privateSeed = structuredClone(fixture.seed);
  privateSeed.sourceDatasetId = "PORK33_FIELD_SOURCE_2026_10";
  const target = path.join(tempRoot, "private-seed.json");
  fs.writeFileSync(target, `${JSON.stringify(privateSeed)}\n`, "utf8");
  const resolution = await provider.loadPork33SeedPackage({ localSourcePath: target });
  assert.equal(resolution.mode, "LOCAL_PRIVATE");
  assert.equal(resolution.sourcePath, target);
  assert.equal(resolution.seed.sourceDatasetId, "PORK33_FIELD_SOURCE_2026_10");
});

test("03 repository builds a valid fixture state without private source", async () => {
  const state = await repository.loadCurrentPork33State({
    rootDir: path.join(tempRoot, "empty-runtime"),
    seedSourcePath: missingSeedPath,
  });
  assert.equal(state.sourceDatasetId, "PORK33_SANITIZED_FIXTURE_V1");
  assert.deepEqual(stateModule.validatePork33State(state), []);
  assert.equal(state.candidates.length, 27);
});

test("04 fixture state cannot generate a customer PDF", async () => {
  const state = stateModule.createPork33InitialState();
  assert.throws(() => seedTypes.assertPork33CustomerReportSource(state), /SANITIZED_FIXTURE/u);
  await assert.rejects(
    () => briefingPdf.generatePork33BriefingPdf(state, {
      assets: { mapsByCandidateId: {}, photosByCandidateId: {} },
      sbiz365ByCandidateId: {},
      assetPaths: {},
    }, { scopeType: "ALL" }),
    /SANITIZED_FIXTURE/u,
  );
});

test("05 fixture snapshot repository is complete without output", async () => {
  const state = stateModule.createPork33InitialState();
  const result = await snapshots.loadLatestPork33Sbiz365Snapshots(
    state,
    path.join(tempRoot, "missing-output"),
    path.join(tempRoot, "missing-private-snapshot.json"),
  );
  assert.equal(result.batchId, "sanitized-fixture-v1");
  assert.equal(Object.keys(result.byCandidateId).length, 27);
  assert.ok(Object.values(result.byCandidateId).every((snapshot) => snapshot.extractionStatus === "SANITIZED_FIXTURE"));
});

test("06 provisioned private snapshot wins without completed output", async () => {
  const fixtureResolution = await provider.loadPork33SeedPackage({ localSourcePath: missingSeedPath });
  const privateSeed = structuredClone(fixtureResolution.seed);
  privateSeed.sourceDatasetId = "PORK33_FIELD_SOURCE_2026_10";
  const privateState = stateModule.createPork33InitialState(undefined, privateSeed);
  const rows = snapshotFixture.createSanitizedPork33Sbiz365Snapshots(
    privateState.candidates.map((candidate) => candidate.identity.displayCode),
  );
  const target = path.join(tempRoot, "SBIZ365_SNAPSHOTS.json");
  fs.writeFileSync(target, `${JSON.stringify(rows)}\n`, "utf8");
  const result = await snapshots.loadLatestPork33Sbiz365Snapshots(
    privateState,
    path.join(tempRoot, "missing-legacy-output"),
    target,
  );
  assert.equal(result.batchId, "local-private-snapshot");
  assert.equal(Object.keys(result.byCandidateId).length, 27);
});

test("07 private state never falls back to sanitized SBIZ data", async () => {
  const fixtureResolution = await provider.loadPork33SeedPackage({ localSourcePath: missingSeedPath });
  const privateSeed = structuredClone(fixtureResolution.seed);
  privateSeed.sourceDatasetId = "PORK33_FIELD_SOURCE_2026_10";
  const privateState = stateModule.createPork33InitialState(undefined, privateSeed);
  await assert.rejects(
    () => snapshots.loadLatestPork33Sbiz365Snapshots(
      privateState,
      path.join(tempRoot, "missing-legacy-output-2"),
      path.join(tempRoot, "missing-private-snapshot-2.json"),
    ),
    /provisioning/u,
  );
});

test("08 state module has no compile-time import of the private JSON", () => {
  const source = fs.readFileSync(path.join(root, "lib/pork33-candidate-shortlist/state.ts"), "utf8");
  assert.doesNotMatch(source, /pork33-field-source-2026-10\.v1\.json/u);
  assert.match(source, /PORK33_SANITIZED_SEED/u);
});

test("09 real local source regression remains available when provisioned", async (context) => {
  const resolution = await provider.loadPork33SeedPackage();
  if (resolution.mode !== "LOCAL_PRIVATE") {
    context.skip("local private source is not provisioned");
    return;
  }
  const state = await repository.loadCurrentPork33State();
  const inputs = await snapshots.loadPork33DecisionServerInputs(state);
  assert.equal(state.sourceDatasetId, "PORK33_FIELD_SOURCE_2026_10");
  assert.equal(state.candidates.length, 27);
  assert.equal(Object.keys(inputs.sbiz365ByCandidateId).length, 27);
  assert.equal(Object.keys(inputs.assets.mapsByCandidateId).length, 27);
  assert.equal(Object.keys(inputs.assets.photosByCandidateId).length, 24);
});

test("10 fixture supports Report Center and industry-neutral core contracts", async () => {
  const state = stateModule.createPork33InitialState();
  const snapshotSet = await snapshots.loadLatestPork33Sbiz365Snapshots(state);
  const caseSummary = reportCenter.buildPork33StoreDevelopmentCase(state);
  const readiness = reportCenter.derivePork33ReportDataReadiness(
    state,
    { mapsByCandidateId: {}, photosByCandidateId: {} },
    snapshotSet.byCandidateId,
    "FIELD_BRIEFING",
    "2026-11-03T00:00:00.000Z",
  );
  assert.equal(caseSummary.candidateCount, 27);
  assert.equal(caseSummary.regionCount, 5);
  assert.equal(readiness.items.find((item) => item.key === "SBIZ365").status, "READY");
  assert.equal(readiness.items.find((item) => item.key === "MAPS").status, "MISSING");
  assert.doesNotThrow(() => storeCore.assertIndustryProfileV1(storeCore.PORK33_INDUSTRY_PROFILE_V1));
  assert.ok(storeCore.resolveReportSectionsV1(storeCore.PORK33_INDUSTRY_PROFILE_V1).length > 0);
});
