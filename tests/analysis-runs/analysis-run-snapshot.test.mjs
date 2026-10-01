import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const RUN_A = "basic-location-run:11111111-1111-4111-8111-111111111111";
const RUN_B = "basic-location-run:22222222-2222-4222-8222-222222222222";
const AT = "2026-10-01T01:00:00.000Z";

function installTypeScriptLoader() {
  const previous = loadModule.extensions[".ts"];
  loadModule.extensions[".ts"] = (module, filename) => {
    const original = module.require.bind(module);
    module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
  };
  return () => previous ? loadModule.extensions[".ts"] = previous : delete loadModule.extensions[".ts"];
}

function target(analysisRunId = RUN_A, officialMarketCode = "100001") {
  return {
    schemaVersion: "active-analysis-target-v2",
    analysisRunId,
    targetKey: analysisRunId,
    label: "테스트 위치",
    address: "서울시 테스트 주소",
    latitude: 37.5,
    longitude: 127,
    radiusM: 300,
    source: "address",
    explorationSnapshot: { marketId: "M1", marketName: "테스트상권", submarketId: null, submarketName: null, nodeId: null, nodeName: null },
    officialReference: officialMarketCode ? { marketCode: officialMarketCode, marketName: "공식 테스트상권", spatialRelation: "INSIDE", selectionMethod: "MANUAL", selectedAt: AT } : null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function locationResult(analysisRunId = RUN_A) {
  return { schemaVersion: "p0-basic-location-view-model-v1", analysisRunId, analysisContext: { analysisRunId }, presentation: { summary: {} } };
}

function competitionResult(analysisRunId = RUN_A, officialMarketCode = "100001", generatedAt = AT) {
  return {
    schemaVersion: "competition-structure-v1",
    analysisRunId,
    generatedAt,
    binding: { analysisRunId, officialBenchmarkIdentity: { officialMarketCode, quarterCode: "20262", industryCode: "CS100005" } },
    center: { latitude: 37.5, longitude: 127 },
    radiusM: 300,
    kakaoObservation: { categories: [], observedRawDetailCount: 1, uniqueObservedCandidateCount: 1, scope: "SEARCH_OBSERVATION_NOT_CENSUS" },
    candidates: [{ name: "장기 저장 금지 후보", rawResponse: { secret: "raw" } }],
    distanceBands: [], directionDistribution: [], nearestCandidates: [],
    officialAreaReference: { status: "AVAILABLE", officialMarketCode, officialMarketName: "공식 테스트상권", industryCode: "CS100005", industryName: "제과점", quarterCode: "20262", referencePeriod: "2026 Q2", storeCount: 1, trend: null, countCombinationPolicy: "KEEP_SEPARATE_FROM_KAKAO" },
    franchiseShare: null, fieldHandoff: [{ name: "장기 저장 금지 후보" }], provenance: [], warnings: [],
  };
}

function rentalResult(selectedRecordIds = ["record-1"]) {
  return { schemaVersion: "frameone.rental-market-analysis.v1", selectedRecordIds, sampleCount: selectedRecordIds.length };
}

function confirmation(analysisRunId = RUN_A, officialMarketCode = "100001", selectedRecordIds = ["record-1"]) {
  return { confirmationId: "rental-scope:one", analysisRunId, officialMarketCode, method: "MANUAL_ADDRESS_REVIEW", selectedRecordIds, basis: "주소 수동 대조", confirmedAt: AT };
}

function economicResult(analysisRunId = RUN_A, officialMarketCode = "100001", assumptionRevision = 1) {
  return { generatedAt: AT, binding: { analysisRunId, officialBenchmarkIdentity: { officialMarketCode, quarterCode: "20262", industryCode: "CS100005" }, rentalConfirmationId: "rental-scope:one", assumptionRevision }, result: { schemaVersion: "frameone.economic-feasibility.v1", metadata: { generatedAt: AT } } };
}

test("Analysis Run Snapshot registry persists only validated run-bound results", async (t) => {
  const restoreLoader = installTypeScriptLoader();
  const previousFile = process.env.FRAMEONE_ANALYSIS_RUNS_FILE;
  const tempRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "frameone-analysis-run-"));
  const registryFile = path.join(tempRoot, "analysis-runs.json");
  process.env.FRAMEONE_ANALYSIS_RUNS_FILE = registryFile;
  const repositoryPath = path.join(root, "lib/analysis-runs/analysis-run-repository.ts");
  const contractPath = path.join(root, "lib/analysis-runs/analysis-run-snapshot.ts");
  const repository = loadModule(repositoryPath);
  const contract = loadModule(contractPath);

  try {
    await t.test("create uses the existing canonical analysisRunId and persists target", async () => {
      const saved = await repository.saveAnalysisRunSection({ section: "location", target: target(), generatedAt: AT, result: locationResult() });
      assert.equal(saved.analysisRunId, RUN_A);
      assert.equal(saved.targetSnapshot.analysisRunId, RUN_A);
      assert.equal(saved.targetSnapshot.address, "서울시 테스트 주소");
      assert.equal(saved.targetSnapshot.explorationSnapshot.marketId, "M1");
      assert.equal(saved.sections.location.versions.length, 1);
    });

    await t.test("missing sections remain absent rather than zero-filled", async () => {
      const saved = await repository.getAnalysisRunSnapshot(RUN_A);
      assert.equal(saved.sections.competition, undefined);
      assert.equal(saved.sections.rental, undefined);
      assert.equal(saved.sections.economic, undefined);
    });

    await t.test("duplicate save is idempotent", async () => {
      await repository.saveAnalysisRunSection({ section: "location", target: target(), generatedAt: AT, result: locationResult() });
      const saved = await repository.getAnalysisRunSnapshot(RUN_A);
      assert.equal(saved.sections.location.versions.length, 1);
    });

    await t.test("competition binding mismatch is rejected", async () => {
      assert.throws(() => repository.saveAnalysisRunSection({ section: "competition", target: target(), result: competitionResult(RUN_B) }), /analysisRunId/);
      assert.throws(() => repository.saveAnalysisRunSection({ section: "competition", target: target(), result: competitionResult(RUN_A, "999999") }), /공식상권/);
    });

    await t.test("competition persists aggregates but no raw transient place detail", async () => {
      const saved = await repository.saveAnalysisRunSection({ section: "competition", target: target(), result: competitionResult() });
      const serialized = JSON.stringify(saved.sections.competition);
      assert.match(serialized, /APP_GENERATED_AGGREGATE_NO_RAW_TRANSIENT/);
      assert.equal(serialized.includes("장기 저장 금지 후보"), false);
      assert.equal(serialized.includes("rawResponse"), false);
      assert.equal(saved.sections.competition.transientDetailRestore, "REQUERY_REQUIRED");
    });

    await t.test("rental confirmation identity and selected records are enforced", async () => {
      assert.throws(() => repository.saveAnalysisRunSection({ section: "rental", target: target(), generatedAt: AT, confirmation: confirmation(RUN_B), result: rentalResult() }), /analysisRunId/);
      assert.throws(() => repository.saveAnalysisRunSection({ section: "rental", target: target(), generatedAt: AT, confirmation: confirmation(RUN_A, "100001", ["other"]), result: rentalResult() }), /표본/);
      const saved = await repository.saveAnalysisRunSection({ section: "rental", target: target(), generatedAt: AT, confirmation: confirmation(), result: rentalResult() });
      assert.equal(saved.sections.rental.versions[0].result.confirmation.confirmationId, "rental-scope:one");
    });

    await t.test("economic run, official reference, and assumption revision mismatches are rejected", async () => {
      assert.throws(() => repository.saveAnalysisRunSection({ section: "economic", target: target(), result: economicResult(RUN_B) }), /analysisRunId/);
      assert.throws(() => repository.saveAnalysisRunSection({ section: "economic", target: target(), result: economicResult(RUN_A, "999999") }), /공식상권/);
      assert.throws(() => repository.saveAnalysisRunSection({ section: "economic", target: target(), result: economicResult(RUN_A, "100001", -1) }), /revision/);
      const saved = await repository.saveAnalysisRunSection({ section: "economic", target: target(), result: economicResult() });
      assert.equal(saved.sections.economic.versions[0].binding.assumptionRevision, 1);
    });

    await t.test("new generatedAt appends a version instead of overwriting", async () => {
      await repository.saveAnalysisRunSection({ section: "competition", target: target(), result: competitionResult(RUN_A, "100001", "2026-10-01T02:00:00.000Z") });
      const saved = await repository.getAnalysisRunSnapshot(RUN_A);
      assert.equal(saved.sections.competition.versions.length, 2);
    });

    await t.test("CURRENT, STALE, and NOT_RUN meaning is independent from persistence", async () => {
      const saved = await repository.getAnalysisRunSnapshot(RUN_A);
      assert.equal(contract.snapshotResultStatus(saved, target()), "CURRENT");
      assert.equal(contract.snapshotResultStatus(saved, target(RUN_B)), "STALE");
      assert.equal(contract.snapshotResultStatus(null, target()), "NOT_RUN");
    });

    await t.test("refresh-style read returns persisted sections", async () => {
      const restored = await repository.getAnalysisRunSnapshot(RUN_A);
      assert.equal(restored.sections.location.versions.at(-1).result.analysisRunId, RUN_A);
      assert.equal(restored.sections.economic.versions.at(-1).binding.analysisRunId, RUN_A);
    });

    await t.test("simulated repository reload reads the same runtime file", async () => {
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const reloaded = loadModule(repositoryPath);
      const restored = await reloaded.getAnalysisRunSnapshot(RUN_A);
      assert.equal(restored.analysisRunId, RUN_A);
      assert.equal(restored.sections.rental.versions.length, 1);
    });

    await t.test("Case link and Market wiring remain present", () => {
      const caseContract = fs.readFileSync(path.join(root, "lib/cases/case-contract.ts"), "utf8");
      const caseDetail = fs.readFileSync(path.join(root, "components/cases/CaseDetailClient.tsx"), "utf8");
      const marketPage = fs.readFileSync(path.join(root, "app/markets/page.tsx"), "utf8");
      assert.match(caseContract, /analysisRunLinks/);
      assert.match(caseDetail, /activeAnalysisTargetHref/);
      assert.match(caseDetail, /latestAnalysisTarget/);
      assert.match(marketPage, /caseContext/);
      assert.match(marketPage, /initialLocationResult/);
    });

    await t.test("runtime file is isolated and gitignored", () => {
      assert.equal(registryFile.startsWith(tempRoot), true);
      assert.match(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), /\/data\/analysis-runs\.json/);
    });
  } finally {
    if (previousFile === undefined) delete process.env.FRAMEONE_ANALYSIS_RUNS_FILE;
    else process.env.FRAMEONE_ANALYSIS_RUNS_FILE = previousFile;
    restoreLoader();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
