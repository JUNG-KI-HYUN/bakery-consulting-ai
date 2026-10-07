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
    label: "Human Decision fixture",
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
      metadata: { engineVersion: overrides.engineVersion ?? "economic-feasibility-v1", generatedAt },
    },
  };
}

function runSnapshot(runId) {
  return {
    schemaVersion: "frameone.analysis-run-snapshot.v1",
    analysisRunId: runId,
    targetSnapshot: target(runId),
    createdAt: AT,
    updatedAt: AT,
    sections: { economic: { versions: [economicVersion(runId)] } },
  };
}

function facilityChecks() {
  return Object.fromEntries(FACILITY_KEYS.map((key) => [key, { state: "FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD", observedAt: AT }]));
}

function leaseChecks() {
  return Object.fromEntries(LEASE_KEYS.map((key) => [key, { state: "ACCEPTABLE", verificationStatus: "VERIFIED", sourceType: "DOCUMENT", observedAt: AT }]));
}

function decisionBody(verdict, overrides = {}) {
  return {
    verdict,
    rationale: "담당자가 현재 근거와 사업조건을 검토했습니다.",
    positiveFactors: ["확인된 장점"],
    keyRisks: ["확인된 핵심위험"],
    unresolvedConditions: ["추가 확인사항"],
    conditionsBeforeProceeding: ["계약 전 서면확인"],
    landlordConfirmations: ["임대인 동의 확인"],
    expertConfirmations: ["전문가 확인"],
    nextActions: ["다음 검토 진행"],
    reviewerName: "테스트 담당자",
    ...overrides,
  };
}

test("Candidate Human Decision은 최신 Readiness Snapshot에 사람의 판단만 append한다", async (t) => {
  const envNames = {
    cases: "FRAMEONE_CASES_FILE",
    candidates: "FRAMEONE_CANDIDATES_FILE",
    facility: "FRAMEONE_CANDIDATE_FACILITY_FILE",
    lease: "FRAMEONE_CANDIDATE_LEASE_FILE",
    runs: "FRAMEONE_ANALYSIS_RUNS_FILE",
    readiness: "FRAMEONE_CONTRACT_READINESS_FILE",
    decisions: "FRAMEONE_CANDIDATE_DECISIONS_FILE",
  };
  const previous = Object.fromEntries(Object.entries(envNames).map(([key, envName]) => [key, process.env[envName]]));
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-human-decision-"));
  const files = Object.fromEntries(Object.keys(envNames).map((key) => [key, path.join(tempRoot, `${key}.json`)]));
  for (const [key, envName] of Object.entries(envNames)) process.env[envName] = files[key];
  fs.writeFileSync(files.runs, JSON.stringify({ schemaVersion: "frameone.analysis-run-registry.v1", runs: [] }));
  const restoreLoader = installTypeScriptLoader();

  try {
    const cases = loadModule(path.join(repositoryRoot, "app/api/cases/route.ts"));
    const candidates = loadModule(path.join(repositoryRoot, "app/api/candidates/route.ts"));
    const facility = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/facility-assessment/route.ts"));
    const lease = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/lease-assessment/route.ts"));
    const readiness = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/contract-readiness/route.ts"));
    const decision = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/decision/route.ts"));
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
    const createScenario = async (mode = "READY") => {
      const n = sequence++;
      const runId = `basic-location-run:${String(n).padStart(8, "0")}-2222-4222-8222-${String(n).padStart(12, "0")}`;
      appendRun(runSnapshot(runId));
      const caseRecord = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: `Decision Case ${n}`, clientName: "Fixture" }))).json();
      const candidate = await (await candidates.POST(request("http://localhost/api/candidates", "POST", {
        caseId: caseRecord.caseId,
        label: `Decision 후보 ${n}`,
        source: "MARKET_ANALYSIS",
        linkedAnalysisRunId: runId,
      }))).json();
      const params = { params: Promise.resolve({ candidateId: candidate.candidateId }) };
      const fChecks = facilityChecks();
      if (mode === "BLOCKED") fChecks.exhaust = { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD", observedAt: AT };
      if (mode === "REVIEW_REQUIRED") fChecks.exhaust = { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" };
      await facility.POST(request("http://localhost", "POST", { caseId: caseRecord.caseId, checks: fChecks }), params);
      await lease.POST(request("http://localhost", "POST", {
        caseId: caseRecord.caseId,
        reviewedTerms: { monthlyRentWon: 4_000_000, maintenanceFeeWon: 300_000 },
        checks: leaseChecks(),
      }), params);
      return { caseRecord, candidate, params, runId };
    };
    const saveReadiness = async (scenario) => readiness.POST(request("http://localhost", "POST", { caseId: scenario.caseRecord.caseId }), scenario.params);
    const getDecision = async (scenario, caseId = scenario.caseRecord.caseId) => {
      const response = await decision.GET(new Request(`http://localhost?caseId=${caseId}`), scenario.params);
      return { response, body: await response.json() };
    };
    const saveDecision = async (scenario, verdict, overrides = {}) => {
      const response = await decision.POST(request("http://localhost", "POST", {
        caseId: scenario.caseRecord.caseId,
        ...decisionBody(verdict, overrides),
      }), scenario.params);
      return { response, body: await response.json() };
    };

    await t.test("Decision GET empty는 현재 Readiness와 빈 이력을 반환한다", async () => {
      const scenario = await createScenario();
      const { response, body } = await getDecision(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.latestDecision, null);
      assert.equal(body.decisionCount, 0);
      assert.equal(body.canCreateDecision, false);
    });

    await t.test("유효한 Human Decision POST를 저장한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      const { response, body } = await saveDecision(scenario, "RECOMMEND");
      assert.equal(response.status, 201);
      assert.equal(body.latestDecision.verdict, "RECOMMEND");
      assert.equal(body.latestDecision.basis.readinessStatus, "READY");
    });

    await t.test("Decision은 append-only로 저장된다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      const first = (await saveDecision(scenario, "RECOMMEND")).body.latestDecision;
      const second = (await saveDecision(scenario, "HOLD")).body.latestDecision;
      assert.notEqual(first.decisionId, second.decisionId);
      assert.equal(second.previousDecisionId, first.decisionId);
      assert.equal((await getDecision(scenario)).body.decisionCount, 2);
    });

    await t.test("새 판단은 기존 Decision을 변경하지 않는다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      const first = structuredClone((await saveDecision(scenario, "RECOMMEND")).body.latestDecision);
      await saveDecision(scenario, "HOLD");
      const stored = JSON.parse(fs.readFileSync(files.decisions, "utf8")).filter((item) => item.candidateId === scenario.candidate.candidateId);
      assert.deepEqual(stored[0], first);
    });

    await t.test("저장된 Readiness Snapshot이 없으면 Decision을 거부한다", async () => {
      const scenario = await createScenario();
      const { response } = await saveDecision(scenario, "RECOMMEND");
      assert.equal(response.status, 400);
    });

    await t.test("stale Readiness Snapshot이면 Decision을 거부한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      await new Promise((resolve) => setTimeout(resolve, 2));
      await facility.PATCH(request("http://localhost", "PATCH", { caseId: scenario.caseRecord.caseId, checks: { exhaust: { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" } } }), scenario.params);
      const { response } = await saveDecision(scenario, "HOLD");
      assert.equal(response.status, 400);
    });

    await t.test("Candidate와 Case ownership mismatch를 거부한다", async () => {
      const scenario = await createScenario();
      assert.equal((await getDecision(scenario, "case-other")).response.status, 404);
    });

    for (const [name, mode, verdict, expectedStatus] of [
      ["BLOCKED + RECOMMEND", "BLOCKED", "RECOMMEND", 400],
      ["BLOCKED + CONDITIONAL_RECOMMEND", "BLOCKED", "CONDITIONAL_RECOMMEND", 400],
      ["BLOCKED + HOLD", "BLOCKED", "HOLD", 201],
      ["BLOCKED + RISK", "BLOCKED", "RISK", 201],
      ["REVIEW_REQUIRED + RECOMMEND", "REVIEW_REQUIRED", "RECOMMEND", 400],
      ["REVIEW_REQUIRED + CONDITIONAL_RECOMMEND", "REVIEW_REQUIRED", "CONDITIONAL_RECOMMEND", 201],
      ["REVIEW_REQUIRED + HOLD", "REVIEW_REQUIRED", "HOLD", 201],
      ["REVIEW_REQUIRED + RISK", "REVIEW_REQUIRED", "RISK", 201],
      ["READY + RECOMMEND", "READY", "RECOMMEND", 201],
      ["READY + CONDITIONAL_RECOMMEND", "READY", "CONDITIONAL_RECOMMEND", 201],
      ["READY + HOLD", "READY", "HOLD", 201],
      ["READY + RISK", "READY", "RISK", 201],
    ]) {
      await t.test(`${name} 조합의 허용규칙을 지킨다`, async () => {
        const scenario = await createScenario(mode);
        await saveReadiness(scenario);
        assert.equal((await saveDecision(scenario, verdict)).response.status, expectedStatus);
      });
    }

    await t.test("rationale이 없으면 거부한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      assert.equal((await saveDecision(scenario, "RECOMMEND", { rationale: "" })).response.status, 400);
    });

    await t.test("조건부 추천인데 계약 전 조건이 없으면 거부한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      assert.equal((await saveDecision(scenario, "CONDITIONAL_RECOMMEND", { conditionsBeforeProceeding: [] })).response.status, 400);
    });

    await t.test("위험인데 핵심위험이 없으면 거부한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      assert.equal((await saveDecision(scenario, "RISK", { keyRisks: [] })).response.status, 400);
    });

    await t.test("Decision 후 Facility 변경은 기존 판단을 재검토 상태로 표시한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      await saveDecision(scenario, "RECOMMEND");
      await new Promise((resolve) => setTimeout(resolve, 2));
      await facility.PATCH(request("http://localhost", "PATCH", { caseId: scenario.caseRecord.caseId, checks: { exhaust: { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" } } }), scenario.params);
      const body = (await getDecision(scenario)).body;
      assert.equal(body.isLatestDecisionStale, true);
      assert.equal(body.canCreateDecision, false);
    });

    await t.test("Decision 후 Lease 변경은 기존 판단을 재검토 상태로 표시한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      await saveDecision(scenario, "RECOMMEND");
      await new Promise((resolve) => setTimeout(resolve, 2));
      await lease.PATCH(request("http://localhost", "PATCH", { caseId: scenario.caseRecord.caseId, reviewedTerms: { monthlyRentWon: 4_100_000 } }), scenario.params);
      assert.equal((await getDecision(scenario)).body.isLatestDecisionStale, true);
    });

    await t.test("Decision 후 Economic binding 변경은 기존 판단을 재검토 상태로 표시한다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      await saveDecision(scenario, "RECOMMEND");
      replaceRun(scenario.runId, (run) => { run.sections.economic.versions = [economicVersion(scenario.runId, { generatedAt: LATER })]; });
      assert.equal((await getDecision(scenario)).body.isLatestDecisionStale, true);
    });

    await t.test("client supplied readiness 값은 무시한다", async () => {
      const scenario = await createScenario("BLOCKED");
      await saveReadiness(scenario);
      const { response } = await saveDecision(scenario, "RECOMMEND", { readinessStatus: "READY" });
      assert.equal(response.status, 400);
      assert.equal((await getDecision(scenario)).body.decisionCount, 0);
    });

    await t.test("Decision은 자동 approval 또는 verdict calculation을 생성하지 않는다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      const saved = (await saveDecision(scenario, "RISK")).body.latestDecision;
      assert.equal(saved.createsAutomaticRecommendation, false);
      assert.equal(saved.decidedByHuman, true);
      assert.equal(Object.hasOwn(saved, "approval"), false);
      assert.equal(saved.verdict, "RISK");
    });

    await t.test("repository reload 후에도 Decision 이력을 읽는다", async () => {
      const scenario = await createScenario();
      await saveReadiness(scenario);
      await saveDecision(scenario, "RECOMMEND");
      const repositoryPath = path.join(repositoryRoot, "lib/candidates/human-decision-repository.ts");
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const freshRepository = loadModule(repositoryPath);
      const reloaded = await freshRepository.getCandidateHumanDecisionView(scenario.candidate.candidateId, scenario.caseRecord.caseId);
      assert.equal(reloaded.decisionCount, 1);
      assert.equal(reloaded.latestDecision.candidateId, scenario.candidate.candidateId);
    });
  } finally {
    for (const [key, envName] of Object.entries(envNames)) {
      if (previous[key] === undefined) delete process.env[envName]; else process.env[envName] = previous[key];
    }
    restoreLoader();
    const resolved = path.resolve(tempRoot);
    assert.equal(path.dirname(resolved), tempParent);
    assert.match(path.basename(resolved), /^frameone-human-decision-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
