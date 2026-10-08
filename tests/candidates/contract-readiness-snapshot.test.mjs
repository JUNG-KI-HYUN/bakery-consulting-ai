import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const AT = "2026-10-07T01:00:00.000Z";
const LATER = "2026-10-08T01:00:00.000Z";
const FACILITY_KEYS = ["electricity", "waterSupply", "drainage", "exhaust", "landlordConsent", "equipmentIngress", "manufacturingSpace", "drawingOrMeasurement", "fireEgress", "buildingUsePermit", "odorNoise"];
const LEASE_KEYS = ["businessUseRestriction", "restorationScope", "requiredWorksConsent", "permitFailureCondition", "specialClauseStatus", "writtenConfirmationStatus", "repairResponsibility", "handoverCondition", "premiumComposition", "premiumPaymentTiming", "premiumLeaseCondition"];

function installTypeScriptLoader() {
  const previousLoader = loadModule.extensions[".ts"];
  loadModule.extensions[".ts"] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) => originalRequire(specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier);
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
  };
  return () => {
    if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
    else delete loadModule.extensions[".ts"];
  };
}

function request(url, method, body) {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function target(runId) {
  return {
    analysisRunId: runId,
    label: "Readiness fixture",
    address: "서울시 테스트 주소",
    latitude: 37.5,
    longitude: 127,
    radiusM: 300,
    source: "candidate_store",
    explorationSnapshot: { source: "fixture" },
    officialReference: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function economicVersion(runId, overrides = {}) {
  const generatedAt = overrides.generatedAt ?? AT;
  return {
    generatedAt,
    binding: {
      analysisRunId: runId,
      officialBenchmarkIdentity: null,
      rentalConfirmationId: null,
      assumptionRevision: overrides.assumptionRevision ?? 1,
    },
    result: {
      schemaVersion: "frameone.economic-feasibility.v1",
      inputs: { fixedMonthlyCosts: { rentMonthly: 4_000_000, managementFeeMonthly: 300_000 } },
      bep: { monthlyBepSales: 20_000_000, dailyBepSales: 800_000 },
      validation: { errors: [], warnings: [] },
      metadata: {
        engineVersion: overrides.engineVersion ?? "economic-feasibility-v1",
        generatedAt,
      },
    },
  };
}

function runSnapshot(runId, versions = [economicVersion(runId)]) {
  return {
    schemaVersion: "frameone.analysis-run-snapshot.v1",
    analysisRunId: runId,
    targetSnapshot: target(runId),
    createdAt: AT,
    updatedAt: AT,
    sections: { economic: { versions } },
  };
}

function facilityChecks() {
  return Object.fromEntries(FACILITY_KEYS.map((key) => [key, { state: "FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD", observedAt: AT }]));
}

function leaseChecks() {
  return Object.fromEntries(LEASE_KEYS.map((key) => [key, { state: "ACCEPTABLE", verificationStatus: "VERIFIED", sourceType: "DOCUMENT", observedAt: AT }]));
}

test("Candidate Contract Readiness Snapshot은 현재 평가와 명시적 이력을 분리한다", async (t) => {
  const previous = {
    cases: process.env.FRAMEONE_CASES_FILE,
    candidates: process.env.FRAMEONE_CANDIDATES_FILE,
    facility: process.env.FRAMEONE_CANDIDATE_FACILITY_FILE,
    lease: process.env.FRAMEONE_CANDIDATE_LEASE_FILE,
    runs: process.env.FRAMEONE_ANALYSIS_RUNS_FILE,
    readiness: process.env.FRAMEONE_CONTRACT_READINESS_FILE,
    economicSelections: process.env.FRAMEONE_CANDIDATE_ECONOMIC_SELECTIONS_FILE,
  };
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-contract-readiness-"));
  const files = {
    cases: path.join(tempRoot, "cases.json"),
    candidates: path.join(tempRoot, "candidates.json"),
    facility: path.join(tempRoot, "facility.json"),
    lease: path.join(tempRoot, "lease.json"),
    runs: path.join(tempRoot, "analysis-runs.json"),
    readiness: path.join(tempRoot, "readiness.json"),
    economicSelections: path.join(tempRoot, "economic-selections.json"),
  };
  process.env.FRAMEONE_CASES_FILE = files.cases;
  process.env.FRAMEONE_CANDIDATES_FILE = files.candidates;
  process.env.FRAMEONE_CANDIDATE_FACILITY_FILE = files.facility;
  process.env.FRAMEONE_CANDIDATE_LEASE_FILE = files.lease;
  process.env.FRAMEONE_ANALYSIS_RUNS_FILE = files.runs;
  process.env.FRAMEONE_CONTRACT_READINESS_FILE = files.readiness;
  process.env.FRAMEONE_CANDIDATE_ECONOMIC_SELECTIONS_FILE = files.economicSelections;
  fs.writeFileSync(files.runs, JSON.stringify({ schemaVersion: "frameone.analysis-run-registry.v1", runs: [] }));
  const restoreLoader = installTypeScriptLoader();

  try {
    const cases = loadModule(path.join(repositoryRoot, "app/api/cases/route.ts"));
    const candidates = loadModule(path.join(repositoryRoot, "app/api/candidates/route.ts"));
    const facility = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/facility-assessment/route.ts"));
    const lease = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/lease-assessment/route.ts"));
    const readiness = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/contract-readiness/route.ts"));
    const economicSelection = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/economic-selection/route.ts"));
    let sequence = 1;

    const appendRun = (run) => {
      const registry = JSON.parse(fs.readFileSync(files.runs, "utf8"));
      registry.runs.push(run);
      fs.writeFileSync(files.runs, JSON.stringify(registry));
    };
    const replaceRun = (runId, updater) => {
      const registry = JSON.parse(fs.readFileSync(files.runs, "utf8"));
      const index = registry.runs.findIndex((item) => item.analysisRunId === runId);
      updater(registry.runs[index]);
      fs.writeFileSync(files.runs, JSON.stringify(registry));
    };
    const updateCandidateFile = (candidateId, updater) => {
      const records = JSON.parse(fs.readFileSync(files.candidates, "utf8"));
      updater(records.find((item) => item.candidateId === candidateId));
      fs.writeFileSync(files.candidates, JSON.stringify(records));
    };
    const createScenario = async ({ mode = "READY", withRun = true } = {}) => {
      const n = sequence++;
      const runId = `basic-location-run:${String(n).padStart(8, "0")}-1111-4111-8111-${String(n).padStart(12, "0")}`;
      if (withRun) appendRun(runSnapshot(runId));
      const caseRecord = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: `Readiness Case ${n}`, clientName: "Fixture" }))).json();
      const candidate = await (await candidates.POST(request("http://localhost/api/candidates", "POST", {
        caseId: caseRecord.caseId,
        label: `Readiness 후보 ${n}`,
        source: withRun ? "MARKET_ANALYSIS" : "CASE_DIRECT",
        ...(withRun ? { linkedAnalysisRunId: runId } : {}),
      }))).json();
      const params = { params: Promise.resolve({ candidateId: candidate.candidateId }) };
      if (mode !== "EMPTY") {
        const fChecks = facilityChecks();
        if (mode === "BLOCKED") fChecks.exhaust = { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD", observedAt: AT };
        if (mode === "REVIEW_REQUIRED") fChecks.exhaust = { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" };
        await facility.POST(request("http://localhost", "POST", { caseId: caseRecord.caseId, checks: fChecks }), params);
        await lease.POST(request("http://localhost", "POST", {
          caseId: caseRecord.caseId,
          reviewedTerms: { monthlyRentWon: 4_000_000, maintenanceFeeWon: 300_000 },
          checks: leaseChecks(),
        }), params);
      }
      return { caseRecord, candidate, params, runId };
    };
    const getView = async (scenario) => {
      const response = await readiness.GET(new Request(`http://localhost?caseId=${scenario.caseRecord.caseId}`), scenario.params);
      return { response, body: await response.json() };
    };
    const saveView = async (scenario, extra = {}) => {
      const response = await readiness.POST(request("http://localhost", "POST", { caseId: scenario.caseRecord.caseId, ...extra }), scenario.params);
      return { response, body: await response.json() };
    };

    await t.test("GET은 snapshot을 만들지 않고 current evaluation을 반환한다", async () => {
      const scenario = await createScenario();
      const { response, body } = await getView(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.currentEvaluation.readinessStatus, "READY");
      assert.equal(body.snapshotCount, 0);
      assert.equal(body.latestSavedSnapshot, null);
    });

    await t.test("존재하지 않는 Candidate는 거부한다", async () => {
      const response = await readiness.GET(new Request("http://localhost?caseId=case-missing"), { params: Promise.resolve({ candidateId: "candidate-missing" }) });
      assert.equal(response.status, 404);
    });

    await t.test("Candidate의 Case ownership을 검증한다", async () => {
      const scenario = await createScenario();
      const response = await readiness.GET(new Request("http://localhost?caseId=case-other"), scenario.params);
      assert.equal(response.status, 404);
    });

    await t.test("POST는 current evaluation을 Snapshot으로 저장한다", async () => {
      const scenario = await createScenario();
      const { response, body } = await saveView(scenario);
      assert.equal(response.status, 201);
      assert.match(body.latestSavedSnapshot.readinessSnapshotId, /^contract-readiness-/);
      assert.equal(body.latestSavedSnapshot.result.readinessStatus, "READY");
    });

    await t.test("저장 후 snapshotCount가 증가한다", async () => {
      const scenario = await createScenario();
      assert.equal((await saveView(scenario)).body.snapshotCount, 1);
      assert.equal((await saveView(scenario)).body.snapshotCount, 2);
    });

    await t.test("Snapshot은 append-only로 서로 다른 ID를 가진다", async () => {
      const scenario = await createScenario();
      const first = (await saveView(scenario)).body.latestSavedSnapshot;
      const second = (await saveView(scenario)).body.latestSavedSnapshot;
      const stored = JSON.parse(fs.readFileSync(files.readiness, "utf8")).filter((item) => item.candidateId === scenario.candidate.candidateId);
      assert.equal(stored.length, 2);
      assert.notEqual(first.readinessSnapshotId, second.readinessSnapshotId);
    });

    await t.test("새 저장은 과거 Snapshot을 변경하지 않는다", async () => {
      const scenario = await createScenario();
      const first = structuredClone((await saveView(scenario)).body.latestSavedSnapshot);
      await saveView(scenario);
      const stored = JSON.parse(fs.readFileSync(files.readiness, "utf8")).filter((item) => item.candidateId === scenario.candidate.candidateId);
      assert.deepEqual(stored[0], first);
    });

    await t.test("POST는 client supplied result를 무시하고 서버에서 재계산한다", async () => {
      const scenario = await createScenario({ mode: "EMPTY", withRun: false });
      const { body } = await saveView(scenario, { readinessStatus: "READY", result: { readinessStatus: "READY" } });
      assert.equal(body.latestSavedSnapshot.result.readinessStatus, "REVIEW_REQUIRED");
    });

    await t.test("Facility 변경 후 저장 Snapshot은 stale이다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await facility.PATCH(request("http://localhost", "PATCH", { caseId: scenario.caseRecord.caseId, checks: { exhaust: { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" } } }), scenario.params);
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("Lease 변경 후 저장 Snapshot은 stale이다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await lease.PATCH(request("http://localhost", "PATCH", { caseId: scenario.caseRecord.caseId, reviewedTerms: { monthlyRentWon: 4_100_000 } }), scenario.params);
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("Analysis Run 연결 변경 후 저장 Snapshot은 stale이다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      const nextRunId = `basic-location-run:99999999-1111-4111-8111-${String(sequence++).padStart(12, "0")}`;
      const nextRun = runSnapshot(nextRunId);
      appendRun(nextRun);
      updateCandidateFile(scenario.candidate.candidateId, (record) => { record.analysisLinks = [{ analysisRunId: nextRunId, targetSnapshot: nextRun.targetSnapshot, linkedAt: LATER }]; });
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("Economic generatedAt 변경 후 저장 Snapshot은 stale이다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions = [economicVersion(scenario.runId, { generatedAt: LATER })]; });
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("Economic engineVersion 변경 후 저장 Snapshot은 stale이다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions = [economicVersion(scenario.runId, { engineVersion: "economic-feasibility-v2" })]; });
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("Economic assumptionRevision 변경 후 저장 Snapshot은 stale이다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions = [economicVersion(scenario.runId, { assumptionRevision: 2 })]; });
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("동일 input binding이면 stale은 false다", async () => {
      const scenario = await createScenario();
      assert.equal((await saveView(scenario)).body.isLatestSnapshotStale, false);
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, false);
    });

    await t.test("BLOCKED 상태도 현재 근거 그대로 저장할 수 있다", async () => {
      const scenario = await createScenario({ mode: "BLOCKED" });
      assert.equal((await saveView(scenario)).body.latestSavedSnapshot.result.readinessStatus, "BLOCKED");
    });

    await t.test("REVIEW_REQUIRED 상태도 현재 근거 그대로 저장할 수 있다", async () => {
      const scenario = await createScenario({ mode: "REVIEW_REQUIRED" });
      assert.equal((await saveView(scenario)).body.latestSavedSnapshot.result.readinessStatus, "REVIEW_REQUIRED");
    });

    await t.test("READY 상태를 저장할 수 있다", async () => {
      const scenario = await createScenario();
      assert.equal((await saveView(scenario)).body.latestSavedSnapshot.result.readinessStatus, "READY");
    });

    await t.test("READY Snapshot은 Verdict 또는 Approval을 생성하지 않는다", async () => {
      const scenario = await createScenario();
      const snapshot = (await saveView(scenario)).body.latestSavedSnapshot;
      assert.equal(snapshot.createsVerdict, false);
      assert.equal(snapshot.createsApproval, false);
      assert.equal(Object.hasOwn(snapshot, "verdict"), false);
    });

    await t.test("복수 Analysis Run 연결은 자동 선택하지 않는다", async () => {
      const scenario = await createScenario();
      const nextRunId = `basic-location-run:88888888-1111-4111-8111-${String(sequence++).padStart(12, "0")}`;
      const nextRun = runSnapshot(nextRunId);
      appendRun(nextRun);
      updateCandidateFile(scenario.candidate.candidateId, (record) => { record.analysisLinks.push({ analysisRunId: nextRunId, targetSnapshot: nextRun.targetSnapshot, linkedAt: LATER }); });
      const current = (await getView(scenario)).body.currentEvaluation;
      assert.equal(current.readinessStatus, "REVIEW_REQUIRED");
      assert.ok(current.reviewIssues.some((item) => item.code === "ANALYSIS_RUN_SELECTION_AMBIGUOUS"));
    });

    await t.test("복수 Economic version은 자동 선택하지 않는다", async () => {
      const scenario = await createScenario();
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions.push(economicVersion(scenario.runId, { generatedAt: LATER })); });
      const current = (await getView(scenario)).body.currentEvaluation;
      assert.equal(current.readinessStatus, "REVIEW_REQUIRED");
      assert.ok(current.evidenceGaps.some((item) => item.code === "ECONOMIC_VERSION_SELECTION_REQUIRED"));
    });

    await t.test("복수 Economic version에서 유효한 명시적 선택을 저장하고 사용한다", async () => {
      const scenario = await createScenario();
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions.push(economicVersion(scenario.runId, { generatedAt: LATER, assumptionRevision: 2 })); });
      const response = await economicSelection.PUT(request("http://localhost", "PUT", {
        caseId: scenario.caseRecord.caseId,
        analysisRunId: scenario.runId,
        generatedAt: AT,
        assumptionRevision: 1,
        engineVersion: "economic-feasibility-v1",
      }), scenario.params);
      assert.equal(response.status, 200);
      const view = await response.json();
      assert.equal(view.selection.generatedAt, AT);
      const current = (await getView(scenario)).body.currentEvaluation;
      assert.equal(current.readinessStatus, "READY");
      assert.equal(current.sourceReferences.economic.generatedAt, AT);
    });

    await t.test("존재하지 않거나 다른 Analysis Run의 Economic version 선택을 거부한다", async () => {
      const scenario = await createScenario();
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions.push(economicVersion(scenario.runId, { generatedAt: LATER })); });
      const missing = await economicSelection.PUT(request("http://localhost", "PUT", {
        caseId: scenario.caseRecord.caseId,
        analysisRunId: scenario.runId,
        generatedAt: "2026-10-09T01:00:00.000Z",
        assumptionRevision: 1,
        engineVersion: "economic-feasibility-v1",
      }), scenario.params);
      const wrongRun = await economicSelection.PUT(request("http://localhost", "PUT", {
        caseId: scenario.caseRecord.caseId,
        analysisRunId: "basic-location-run:99999999-1111-4111-8111-999999999999",
        generatedAt: AT,
        assumptionRevision: 1,
        engineVersion: "economic-feasibility-v1",
      }), scenario.params);
      assert.equal(missing.status, 400);
      assert.equal(wrongRun.status, 400);
    });

    await t.test("Economic 선택 API는 Candidate와 Case ownership을 검증한다", async () => {
      const scenario = await createScenario();
      const response = await economicSelection.PUT(request("http://localhost", "PUT", {
        caseId: "case-other",
        analysisRunId: scenario.runId,
        generatedAt: AT,
        assumptionRevision: 1,
        engineVersion: "economic-feasibility-v1",
      }), scenario.params);
      assert.equal(response.status, 404);
    });

    await t.test("Economic 선택 변경은 저장된 Readiness Snapshot을 stale로 만든다", async () => {
      const scenario = await createScenario();
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions.push(economicVersion(scenario.runId, { generatedAt: LATER, assumptionRevision: 2 })); });
      const select = (generatedAt, assumptionRevision) => economicSelection.PUT(request("http://localhost", "PUT", {
        caseId: scenario.caseRecord.caseId,
        analysisRunId: scenario.runId,
        generatedAt,
        assumptionRevision,
        engineVersion: "economic-feasibility-v1",
      }), scenario.params);
      await select(AT, 1);
      assert.equal((await saveView(scenario)).body.isLatestSnapshotStale, false);
      await select(LATER, 2);
      assert.equal((await getView(scenario)).body.isLatestSnapshotStale, true);
    });

    await t.test("repository reload 후에도 Economic 선택을 유지한다", async () => {
      const scenario = await createScenario();
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions.push(economicVersion(scenario.runId, { generatedAt: LATER })); });
      await economicSelection.PUT(request("http://localhost", "PUT", {
        caseId: scenario.caseRecord.caseId,
        analysisRunId: scenario.runId,
        generatedAt: AT,
        assumptionRevision: 1,
        engineVersion: "economic-feasibility-v1",
      }), scenario.params);
      const repositoryPath = path.join(repositoryRoot, "lib/candidates/candidate-economic-selection-repository.ts");
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const freshRepository = loadModule(repositoryPath);
      const restored = await freshRepository.getCandidateEconomicSelection(scenario.candidate.candidateId, scenario.caseRecord.caseId);
      assert.equal(restored.generatedAt, AT);
      assert.equal(restored.analysisRunId, scenario.runId);
    });

    await t.test("repository reload 후에도 Snapshot 이력을 읽는다", async () => {
      const scenario = await createScenario();
      await saveView(scenario);
      const repositoryPath = path.join(repositoryRoot, "lib/candidates/contract-readiness-repository.ts");
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const freshRepository = loadModule(repositoryPath);
      const reloaded = await freshRepository.getCandidateContractReadinessView(scenario.candidate.candidateId, scenario.caseRecord.caseId);
      assert.equal(reloaded.snapshotCount, 1);
      assert.equal(reloaded.latestSavedSnapshot.candidateId, scenario.candidate.candidateId);
    });

    await t.test("Snapshot 저장은 Facility와 Lease repository를 변경하지 않는다", async () => {
      const scenario = await createScenario();
      const facilityBefore = await (await facility.GET(new Request(`http://localhost?caseId=${scenario.caseRecord.caseId}`), scenario.params)).json();
      const leaseBefore = await (await lease.GET(new Request(`http://localhost?caseId=${scenario.caseRecord.caseId}`), scenario.params)).json();
      await saveView(scenario);
      const facilityAfter = await (await facility.GET(new Request(`http://localhost?caseId=${scenario.caseRecord.caseId}`), scenario.params)).json();
      const leaseAfter = await (await lease.GET(new Request(`http://localhost?caseId=${scenario.caseRecord.caseId}`), scenario.params)).json();
      assert.deepEqual(facilityAfter, facilityBefore);
      assert.deepEqual(leaseAfter, leaseBefore);
    });
  } finally {
    for (const [key, envName] of Object.entries({
      cases: "FRAMEONE_CASES_FILE",
      candidates: "FRAMEONE_CANDIDATES_FILE",
      facility: "FRAMEONE_CANDIDATE_FACILITY_FILE",
      lease: "FRAMEONE_CANDIDATE_LEASE_FILE",
      runs: "FRAMEONE_ANALYSIS_RUNS_FILE",
      readiness: "FRAMEONE_CONTRACT_READINESS_FILE",
      economicSelections: "FRAMEONE_CANDIDATE_ECONOMIC_SELECTIONS_FILE",
    })) {
      if (previous[key] === undefined) delete process.env[envName]; else process.env[envName] = previous[key];
    }
    restoreLoader();
    const resolved = path.resolve(tempRoot);
    assert.equal(path.dirname(resolved), tempParent);
    assert.match(path.basename(resolved), /^frameone-contract-readiness-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
