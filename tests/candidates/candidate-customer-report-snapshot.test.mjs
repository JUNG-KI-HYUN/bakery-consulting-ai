import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtureRoot = path.join(root, "tests/candidates/fixtures/customer-report-smoke");
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = (specifier) => originalRequire(
    specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier,
  );
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const snapshotRepository = loadModule(path.join(root, "lib/reports/candidate-customer-report-snapshot-repository.ts"));
const { getCandidateCustomerReport } = loadModule(path.join(root, "lib/reports/candidate-customer-report-service.ts"));
const snapshotCollectionRoute = loadModule(path.join(root, "app/api/candidates/[candidateId]/report-snapshots/route.ts"));
const snapshotItemRoute = loadModule(path.join(root, "app/api/candidates/[candidateId]/report-snapshots/[reportSnapshotId]/route.ts"));
if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
else delete loadModule.extensions[".ts"];

const CASE_ID = "case-report-smoke";
const CANDIDATE_ID = "candidate-report-smoke";
let tempRoot;
let paths;
let originalEnv;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const READY_AT = "2026-10-07T01:00:00.000Z";
const READY_RUN_ID = "basic-location-run:99999999-9999-4999-8999-999999999999";
const READY_REFS = {
  facility: { assessmentId: "facility-report-smoke", revisionId: "facility-report-smoke-r1", recordedAt: READY_AT, updatedAt: READY_AT },
  lease: { assessmentId: "lease-report-smoke", revisionId: "lease-report-smoke-r1", recordedAt: READY_AT, updatedAt: READY_AT },
  analysisRun: { analysisRunId: READY_RUN_ID, linkedAt: READY_AT, snapshotUpdatedAt: READY_AT },
  economic: { analysisRunId: READY_RUN_ID, generatedAt: READY_AT, assumptionRevision: 1, engineVersion: "economic-feasibility-v1" },
};

function readyBinding() {
  return {
    facilityAssessmentId: READY_REFS.facility.assessmentId,
    facilityUpdatedAt: READY_AT,
    leaseAssessmentId: READY_REFS.lease.assessmentId,
    leaseUpdatedAt: READY_AT,
    analysisRunId: READY_RUN_ID,
    economicGeneratedAt: READY_AT,
    economicEngineVersion: "economic-feasibility-v1",
    economicAssumptionRevision: 1,
  };
}

function installReadyFixture() {
  const targetSnapshot = {
    analysisRunId: READY_RUN_ID,
    label: "고객 리포트 UI Fixture 점포",
    address: "서울특별시 테스트 주소",
    latitude: 37.5,
    longitude: 127,
    radiusM: 300,
    source: "candidate_store",
    explorationSnapshot: { marketId: null, marketName: null, submarketId: null, submarketName: null, nodeId: null, nodeName: null },
    officialReference: null,
    createdAt: READY_AT,
    updatedAt: READY_AT,
  };
  const candidates = readJson(paths.candidates);
  candidates[0].analysisLinks = [{ analysisRunId: READY_RUN_ID, targetSnapshot, linkedAt: READY_AT }];
  writeJson(paths.candidates, candidates);
  writeJson(paths.facility, [{
    assessmentId: READY_REFS.facility.assessmentId, candidateId: CANDIDATE_ID, caseId: CASE_ID,
    checks: { electricity: { state: "UNKNOWN", verificationStatus: "NOT_CHECKED", sourceType: "FIELD" } },
    revisions: [{ revisionId: READY_REFS.facility.revisionId, checks: { electricity: { state: "UNKNOWN", verificationStatus: "NOT_CHECKED", sourceType: "FIELD" } }, recordedAt: READY_AT }],
    createdAt: READY_AT, updatedAt: READY_AT,
  }]);
  writeJson(paths.lease, [{
    assessmentId: READY_REFS.lease.assessmentId, candidateId: CANDIDATE_ID, caseId: CASE_ID,
    reviewedTerms: { monthlyRentWon: 4000000 },
    checks: { requiredWorksConsent: { state: "CONDITIONAL", verificationStatus: "LANDLORD_CONFIRM_REQUIRED", sourceType: "LANDLORD" } },
    revisions: [{ revisionId: READY_REFS.lease.revisionId, reviewedTerms: { monthlyRentWon: 4000000 }, checks: { requiredWorksConsent: { state: "CONDITIONAL", verificationStatus: "LANDLORD_CONFIRM_REQUIRED", sourceType: "LANDLORD" } }, recordedAt: READY_AT }],
    createdAt: READY_AT, updatedAt: READY_AT,
  }]);
  const scenario = { monthlySales: 40000000, estimatedOperatingProfit: 3000000, rentBurdenRate: 0.1 };
  writeJson(paths.analysisRuns, { schemaVersion: "frameone.analysis-run-registry.v1", runs: [{
    schemaVersion: "frameone.analysis-run-snapshot.v1", analysisRunId: READY_RUN_ID, targetSnapshot,
    createdAt: READY_AT, updatedAt: READY_AT,
    sections: { economic: { versions: [{
      generatedAt: READY_AT,
      binding: { analysisRunId: READY_RUN_ID, assumptionRevision: 1 },
      result: {
        schemaVersion: "frameone.economic-feasibility.v1",
        inputs: { expectedTicket: 10000, operatingDaysPerMonth: 25, fixedMonthlyCosts: { rentMonthly: 4000000, managementFeeMonthly: 300000, laborMonthly: 8000000 } },
        scenarios: { conservative: scenario, base: scenario, upside: scenario },
        bep: { monthlyBepSales: 28000000, dailyBepSales: 1120000, requiredDailyTransactionsForBep: 112 },
        officialBenchmark: { status: "NOT_AVAILABLE" }, validation: { errors: [], warnings: [] },
        limitations: ["Fixture 계산 결과"], metadata: { engineVersion: "economic-feasibility-v1", generatedAt: READY_AT },
      },
    }] } },
  }] });
  writeJson(paths.readiness, [{
    readinessSnapshotId: "contract-readiness-report-smoke", candidateId: CANDIDATE_ID, caseId: CASE_ID,
    schemaVersion: "frameone.contract-readiness.v1", ruleVersion: "contract-readiness-v1",
    result: { readinessStatus: "REVIEW_REQUIRED", blockingIssues: [], reviewIssues: [], evidenceGaps: [], nextActions: [] },
    inputBinding: readyBinding(), sourceReferences: structuredClone(READY_REFS), evaluatedAt: READY_AT, savedAt: READY_AT,
    createsVerdict: false, createsApproval: false,
  }]);
  const decisions = readJson(paths.decisions);
  decisions[0].basis.readinessInputBinding = readyBinding();
  writeJson(paths.decisions, decisions);
}

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-report-snapshot-"));
  paths = {
    cases: path.join(tempRoot, "cases.json"),
    candidates: path.join(tempRoot, "candidates.json"),
    analysisRuns: path.join(tempRoot, "analysis-runs.json"),
    facility: path.join(tempRoot, "facility.json"),
    lease: path.join(tempRoot, "lease.json"),
    readiness: path.join(tempRoot, "readiness.json"),
    economicSelections: path.join(tempRoot, "economic-selections.json"),
    decisions: path.join(tempRoot, "decisions.json"),
    snapshots: path.join(tempRoot, "report-snapshots.json"),
  };
  for (const [key, fixture] of Object.entries({
    cases: "cases.json",
    candidates: "candidates.json",
    analysisRuns: "analysis-runs.json",
    facility: "facility.json",
    lease: "lease.json",
    readiness: "readiness.json",
    decisions: "decisions.json",
  })) fs.copyFileSync(path.join(fixtureRoot, fixture), paths[key]);
  writeJson(paths.snapshots, []);
  writeJson(paths.economicSelections, []);
  originalEnv = { ...process.env };
  Object.assign(process.env, {
    FRAMEONE_CASES_FILE: paths.cases,
    FRAMEONE_CANDIDATES_FILE: paths.candidates,
    FRAMEONE_ANALYSIS_RUNS_FILE: paths.analysisRuns,
    FRAMEONE_CANDIDATE_FACILITY_FILE: paths.facility,
    FRAMEONE_CANDIDATE_LEASE_FILE: paths.lease,
    FRAMEONE_CONTRACT_READINESS_FILE: paths.readiness,
    FRAMEONE_CANDIDATE_ECONOMIC_SELECTIONS_FILE: paths.economicSelections,
    FRAMEONE_CANDIDATE_DECISIONS_FILE: paths.decisions,
    FRAMEONE_CUSTOMER_REPORT_SNAPSHOTS_FILE: paths.snapshots,
  });
});

after(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("Customer Report Snapshot repository and UI contract", async (t) => {
  let firstSnapshot;

  await t.test("Snapshot GET is empty before issue", async () => {
    const response = await snapshotCollectionRoute.GET(
      new Request(`http://localhost/api/candidates/${CANDIDATE_ID}/report-snapshots?caseId=${CASE_ID}`),
      { params: Promise.resolve({ candidateId: CANDIDATE_ID }) },
    );
    assert.equal(response.status, 200);
    const view = await response.json();
    assert.deepEqual(view, { latestSnapshot: null, snapshotCount: 0 });
  });

  await t.test("incomplete source POST rejects a client REPORT_READY bypass", async () => {
    const response = await snapshotCollectionRoute.POST(
      new Request(`http://localhost/api/candidates/${CANDIDATE_ID}/report-snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: CASE_ID, reportStatus: "REPORT_READY" }),
      }),
      { params: Promise.resolve({ candidateId: CANDIDATE_ID }) },
    );
    assert.equal(response.status, 409);
    assert.equal(readJson(paths.snapshots).length, 0);
    installReadyFixture();
  });

  await t.test("REPORT_READY POST ignores client report data and creates a server-materialized immutable snapshot", async () => {
    const response = await snapshotCollectionRoute.POST(
      new Request(`http://localhost/api/candidates/${CANDIDATE_ID}/report-snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: CASE_ID,
          materializedReport: { decision: { verdictLabel: "클라이언트 변조" } },
          verdict: "클라이언트 변조",
          economics: { monthlyBepSales: 1 },
        }),
      }),
      { params: Promise.resolve({ candidateId: CANDIDATE_ID }) },
    );
    assert.equal(response.status, 201);
    firstSnapshot = await response.json();
    assert.equal(firstSnapshot.reportStatusAtIssue, "REPORT_READY");
    assert.equal(firstSnapshot.immutable, true);
    assert.equal(firstSnapshot.materializedReport.meta.reportStatus, "REPORT_READY");
    assert.ok(firstSnapshot.materializedReport.consultation);
    assert.equal(firstSnapshot.materializedReport.consultation.candidateActual.askingTerms.monthlyRentWon, undefined);
    assert.equal(firstSnapshot.decisionId, "human-decision-report-smoke");
    assert.equal(firstSnapshot.readinessSnapshotId, "contract-readiness-report-smoke");
    assert.equal(firstSnapshot.materializedReport.decision.verdictLabel, "조건부 추천");
  });

  await t.test("stored Decision and Readiness basis is revalidated", () => {
    const basis = firstSnapshot.materializedReport.provenance.decisionBasisSources;
    assert.equal(basis.humanDecision.decisionId, firstSnapshot.decisionId);
    assert.equal(basis.humanDecision.readinessSnapshotId, firstSnapshot.readinessSnapshotId);
    assert.equal(basis.readinessSnapshot.readinessSnapshotId, firstSnapshot.readinessSnapshotId);
  });

  await t.test("decisionBasisSources and contextualSources are preserved", () => {
    assert.deepEqual(firstSnapshot.materializedReport.provenance.decisionBasisSources, {
      ...READY_REFS,
      readinessSnapshot: { readinessSnapshotId: "contract-readiness-report-smoke", savedAt: "2026-10-07T01:00:00.000Z" },
      humanDecision: {
        decisionId: "human-decision-report-smoke",
        decidedAt: "2026-10-07T01:00:00.000Z",
        readinessSnapshotId: "contract-readiness-report-smoke",
      },
    });
    assert.deepEqual(firstSnapshot.materializedReport.provenance.contextualSources, {
      location: null,
      competition: null,
      rentalMarket: null,
    });
  });

  await t.test("returned object mutation cannot change the persisted snapshot", async () => {
    firstSnapshot.materializedReport.candidateSummary.label = "변조된 이름";
    firstSnapshot.materializedReport.facility.hard.push({ label: "변조", reason: "변조" });
    firstSnapshot.materializedReport.lease.conditional.push({ label: "변조", reason: "변조" });
    firstSnapshot.materializedReport.economics.limitations.push("변조");
    firstSnapshot.materializedReport.decision.verdictLabel = "변조";
    const response = await snapshotItemRoute.GET(
      new Request(`http://localhost/api/candidates/${CANDIDATE_ID}/report-snapshots/${firstSnapshot.reportSnapshotId}?caseId=${CASE_ID}`),
      { params: Promise.resolve({ candidateId: CANDIDATE_ID, reportSnapshotId: firstSnapshot.reportSnapshotId }) },
    );
    assert.equal(response.status, 200);
    const reloaded = await response.json();
    assert.equal(reloaded.materializedReport.candidateSummary.label, "고객 리포트 UI Fixture 점포");
    assert.equal(reloaded.materializedReport.facility.hard.length, 0);
    assert.equal(reloaded.materializedReport.lease.conditional.length, 1);
    assert.equal(reloaded.materializedReport.lease.conditional.some((item) => item.label === "변조"), false);
    assert.equal(reloaded.materializedReport.economics.limitations.includes("변조"), false);
    assert.equal(reloaded.materializedReport.decision.verdictLabel, "조건부 추천");
    firstSnapshot = reloaded;
  });

  await t.test("Facility source change leaves the issued snapshot unchanged", async () => {
    writeJson(paths.facility, [{
      assessmentId: "facility-new",
      candidateId: CANDIDATE_ID,
      caseId: CASE_ID,
      checks: { electricity: { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" } },
      revisions: [{ revisionId: "facility-new-revision", checks: { electricity: { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" } }, recordedAt: "2026-10-08T01:00:00.000Z" }],
      createdAt: "2026-10-08T01:00:00.000Z",
      updatedAt: "2026-10-08T01:00:00.000Z",
    }]);
    const live = await getCandidateCustomerReport(CASE_ID, CANDIDATE_ID);
    const stored = await snapshotRepository.getCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID, firstSnapshot.reportSnapshotId);
    assert.equal(live.meta.reportStatus, "REPORT_REVIEW_REQUIRED");
    assert.equal(stored.materializedReport.meta.reportStatus, "REPORT_READY");
    assert.equal(stored.materializedReport.facility.status, "AVAILABLE");
    installReadyFixture();
  });

  await t.test("Lease source change leaves the issued snapshot unchanged", async () => {
    writeJson(paths.lease, [{
      assessmentId: "lease-new",
      candidateId: CANDIDATE_ID,
      caseId: CASE_ID,
      reviewedTerms: { monthlyRentWon: 9999999 },
      checks: { businessUseRestriction: { state: "UNACCEPTABLE", verificationStatus: "VERIFIED", sourceType: "DOCUMENT" } },
      revisions: [{ revisionId: "lease-new-revision", reviewedTerms: { monthlyRentWon: 9999999 }, checks: { businessUseRestriction: { state: "UNACCEPTABLE", verificationStatus: "VERIFIED", sourceType: "DOCUMENT" } }, recordedAt: "2026-10-08T02:00:00.000Z" }],
      createdAt: "2026-10-08T02:00:00.000Z",
      updatedAt: "2026-10-08T02:00:00.000Z",
    }]);
    const live = await getCandidateCustomerReport(CASE_ID, CANDIDATE_ID);
    const stored = await snapshotRepository.getCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID, firstSnapshot.reportSnapshotId);
    assert.equal(live.meta.reportStatus, "REPORT_REVIEW_REQUIRED");
    assert.equal(stored.materializedReport.lease.status, "AVAILABLE");
    installReadyFixture();
  });

  await t.test("Economic result mutation cannot change the issued materialized report", async () => {
    const stored = await snapshotRepository.getCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID, firstSnapshot.reportSnapshotId);
    const before = JSON.stringify(stored.materializedReport.economics);
    const registry = readJson(paths.analysisRuns);
    registry.runs.push({
      schemaVersion: "frameone.analysis-run-snapshot.v1",
      analysisRunId: "basic-location-run:11111111-1111-4111-8111-111111111111",
      targetSnapshot: {
        analysisRunId: "basic-location-run:11111111-1111-4111-8111-111111111111",
        label: "새 분석",
        address: "서울특별시 테스트 주소",
        latitude: 37.5,
        longitude: 127,
        radiusM: 300,
        source: "candidate_store",
        explorationSnapshot: { marketId: null, marketName: null, submarketId: null, submarketName: null, nodeId: null, nodeName: null },
        officialReference: null,
        createdAt: "2026-10-08T03:00:00.000Z",
        updatedAt: "2026-10-08T03:00:00.000Z"
      },
      createdAt: "2026-10-08T03:00:00.000Z",
      updatedAt: "2026-10-08T03:00:00.000Z",
      sections: { economic: { versions: [] } },
    });
    writeJson(paths.analysisRuns, registry);
    const after = await snapshotRepository.getCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID, firstSnapshot.reportSnapshotId);
    assert.equal(JSON.stringify(after.materializedReport.economics), before);
  });

  await t.test("a changed Human Decision affects a new live report, not the old snapshot", async () => {
    const decisions = readJson(paths.decisions);
    decisions.push({
      ...structuredClone(decisions[0]),
      decisionId: "human-decision-report-smoke-2",
      verdict: "RISK",
      rationale: "새로운 판단",
      support: { ...structuredClone(decisions[0].support), keyRisks: ["새 위험"] },
      decidedAt: "2026-10-09T01:00:00.000Z",
      previousDecisionId: decisions[0].decisionId,
    });
    writeJson(paths.decisions, decisions);
    const live = await getCandidateCustomerReport(CASE_ID, CANDIDATE_ID);
    const stored = await snapshotRepository.getCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID, firstSnapshot.reportSnapshotId);
    assert.equal(live.decision.verdictLabel, "위험");
    assert.equal(stored.materializedReport.decision.verdictLabel, "조건부 추천");
  });

  await t.test("issuing again appends and latestSnapshot advances", async () => {
    const second = await snapshotRepository.saveCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID);
    const view = await snapshotRepository.getCandidateCustomerReportSnapshotView(CANDIDATE_ID, CASE_ID);
    assert.notEqual(second.reportSnapshotId, firstSnapshot.reportSnapshotId);
    assert.equal(view.snapshotCount, 2);
    assert.equal(view.latestSnapshot.reportSnapshotId, second.reportSnapshotId);
    assert.equal(view.latestSnapshot.materializedReport.decision.verdictLabel, "위험");
    assert.equal(readJson(paths.snapshots).length, 2);
  });

  await t.test("REPORT_REVIEW_REQUIRED is rejected without appending", async () => {
    writeJson(paths.decisions, []);
    await assert.rejects(
      snapshotRepository.saveCandidateCustomerReportSnapshot(CANDIDATE_ID, CASE_ID),
      (error) => error instanceof snapshotRepository.CustomerReportSnapshotReferenceError && error.status === 409,
    );
    assert.equal(readJson(paths.snapshots).length, 2);
  });

  await t.test("invalid Candidate is rejected", async () => {
    await assert.rejects(
      snapshotRepository.getCandidateCustomerReportSnapshotView("candidate-missing", CASE_ID),
      (error) => error instanceof snapshotRepository.CustomerReportSnapshotReferenceError && error.status === 404,
    );
  });

  await t.test("Case ownership mismatch is rejected", async () => {
    await assert.rejects(
      snapshotRepository.getCandidateCustomerReportSnapshotView(CANDIDATE_ID, "case-other"),
      (error) => error instanceof snapshotRepository.CustomerReportSnapshotReferenceError && error.status === 404,
    );
  });

  await t.test("POST route ignores client-supplied report fields", () => {
    const source = fs.readFileSync(path.join(root, "app/api/candidates/[candidateId]/report-snapshots/route.ts"), "utf8");
    assert.match(source, /typeof body\.caseId === "string"/);
    assert.match(source, /saveCandidateCustomerReportSnapshot\(\(await params\)\.candidateId, caseId\)/);
    assert.equal(source.includes("body.report"), false);
    assert.equal(source.includes("body.materializedReport"), false);
  });

  await t.test("snapshot route renders only snapshot.materializedReport", () => {
    const source = fs.readFileSync(path.join(root, "app/cases/[caseId]/candidates/[candidateId]/report/[reportSnapshotId]/page.tsx"), "utf8");
    assert.match(source, /const report = snapshot\.materializedReport/);
    assert.match(source, /CandidateCustomerReportDocument report=\{report\}/);
    assert.equal(source.includes("getCandidateCustomerReport("), false);
  });

  await t.test("snapshot header preserves issue time and immutable notice", () => {
    const source = fs.readFileSync(path.join(root, "app/cases/[caseId]/candidates/[candidateId]/report/[reportSnapshotId]/page.tsx"), "utf8");
    assert.match(source, /발행일/);
    assert.match(source, /확정·보관된 고객용 리포트입니다/);
    assert.match(source, /report\.decision\.verdictLabel/);
  });

  await t.test("snapshot keeps disclaimer and estimate guidance in the shared report document", () => {
    const source = fs.readFileSync(path.join(root, "components/reports/CandidateCustomerReportDocument.tsx"), "utf8");
    assert.match(source, /report\.disclaimer/);
    assert.match(source, /입력 가정에 따른 추정치/);
    assert.match(source, /실제 매출이나 수익을 보장하지 않습니다/);
  });

  await t.test("Print/PDF button invokes window.print", () => {
    const source = fs.readFileSync(path.join(root, "components/reports/CandidateCustomerReportPrintButton.tsx"), "utf8");
    assert.match(source, /인쇄 \/ PDF 저장/);
    assert.match(source, /window\.print\(\)/);
  });

  await t.test("print stylesheet keeps A4 portrait and hides interactive controls", () => {
    const source = fs.readFileSync(path.join(root, "app/bakery-report-print.css"), "utf8");
    assert.match(source, /size: A4 portrait/);
    assert.match(source, /\.report-interactive/);
    assert.match(source, /break-inside: avoid/);
  });

  await t.test("live Preview remains server-assembled and exposes issue controls", () => {
    const source = fs.readFileSync(path.join(root, "app/cases/[caseId]/candidates/[candidateId]/report/page.tsx"), "utf8");
    assert.match(source, /getCandidateCustomerReport/);
    assert.match(source, /CandidateCustomerReportIssuePanel/);
    assert.match(source, /CandidateCustomerReportDocument/);
  });

  await t.test("snapshot persistence is append-only and exposes no PATCH or DELETE", () => {
    const repository = fs.readFileSync(path.join(root, "lib/reports/candidate-customer-report-snapshot-repository.ts"), "utf8");
    const collectionRoute = fs.readFileSync(path.join(root, "app/api/candidates/[candidateId]/report-snapshots/route.ts"), "utf8");
    const itemRoute = fs.readFileSync(path.join(root, "app/api/candidates/[candidateId]/report-snapshots/[reportSnapshotId]/route.ts"), "utf8");
    assert.match(repository, /snapshots\.push\(saved\)/);
    assert.equal(/export async function (PATCH|DELETE)/.test(collectionRoute), false);
    assert.equal(/export async function (PATCH|DELETE)/.test(itemRoute), false);
  });
});
