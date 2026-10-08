import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];

loadModule.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { calculateContractReadiness } = loadModule(path.join(repositoryRoot, "lib/candidates/contract-readiness.ts"));
const { calculateBakeryFacilityRiskSummary } = loadModule(path.join(repositoryRoot, "lib/candidates/bakery-facility-risk.ts"));
const { calculateCandidateLeaseRiskSummary } = loadModule(path.join(repositoryRoot, "lib/candidates/candidate-lease-risk.ts"));

if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
else delete loadModule.extensions[".ts"];

const RUN_ID = "basic-location-run:11111111-1111-4111-8111-111111111111";
const OTHER_RUN_ID = "basic-location-run:22222222-2222-4222-8222-222222222222";
const AT = "2026-10-07T01:00:00.000Z";
const FACILITY_KEYS = [
  "electricity", "waterSupply", "drainage", "exhaust", "landlordConsent",
  "equipmentIngress", "manufacturingSpace", "drawingOrMeasurement", "fireEgress",
  "buildingUsePermit", "odorNoise",
];
const LEASE_KEYS = [
  "businessUseRestriction", "restorationScope", "requiredWorksConsent", "permitFailureCondition",
  "specialClauseStatus", "writtenConfirmationStatus", "repairResponsibility", "handoverCondition",
  "premiumComposition", "premiumPaymentTiming", "premiumLeaseCondition",
];

function target(analysisRunId = RUN_ID) {
  return {
    analysisRunId,
    label: "Fixture 후보",
    address: "서울시 테스트 주소",
    latitude: 37.5,
    longitude: 127.0,
    radiusM: 300,
    source: "candidate_store",
    explorationSnapshot: { source: "fixture" },
    officialReference: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function facility() {
  const checks = Object.fromEntries(FACILITY_KEYS.map((key) => [key, {
    state: "FEASIBLE",
    verificationStatus: "VERIFIED",
    sourceType: "FIELD",
    observedAt: AT,
  }]));
  return {
    assessmentId: "facility-assessment-fixture",
    candidateId: "candidate-a",
    caseId: "case-a",
    checks,
    revisions: [{ revisionId: "facility-revision-1", checks: structuredClone(checks), recordedAt: AT }],
    createdAt: AT,
    updatedAt: AT,
  };
}

function lease() {
  const checks = Object.fromEntries(LEASE_KEYS.map((key) => [key, {
    state: "ACCEPTABLE",
    verificationStatus: "VERIFIED",
    sourceType: "DOCUMENT",
    observedAt: AT,
  }]));
  const reviewedTerms = { monthlyRentWon: 4_000_000, maintenanceFeeWon: 300_000 };
  return {
    assessmentId: "lease-assessment-fixture",
    candidateId: "candidate-a",
    caseId: "case-a",
    reviewedTerms,
    checks,
    revisions: [{ revisionId: "lease-revision-1", reviewedTerms: structuredClone(reviewedTerms), checks: structuredClone(checks), recordedAt: AT }],
    createdAt: AT,
    updatedAt: AT,
  };
}

function economicVersion(analysisRunId = RUN_ID, generatedAt = AT) {
  return {
    generatedAt,
    binding: {
      analysisRunId,
      officialBenchmarkIdentity: null,
      rentalConfirmationId: null,
      assumptionRevision: 1,
    },
    result: {
      schemaVersion: "frameone.economic-feasibility.v1",
      inputs: { fixedMonthlyCosts: { rentMonthly: 4_000_000, managementFeeMonthly: 300_000 } },
      bep: { monthlyBepSales: 20_000_000, dailyBepSales: 800_000 },
      validation: { errors: [], warnings: [] },
      metadata: { engineVersion: "economic-feasibility-v1", generatedAt },
    },
  };
}

function analysisRun() {
  return {
    schemaVersion: "frameone.analysis-run-snapshot.v1",
    analysisRunId: RUN_ID,
    targetSnapshot: target(),
    createdAt: AT,
    updatedAt: AT,
    sections: { economic: { versions: [economicVersion()] } },
  };
}

function readyInput() {
  return {
    candidate: {
      candidateId: "candidate-a",
      caseId: "case-a",
      analysisLinks: [{ analysisRunId: RUN_ID, targetSnapshot: target(), linkedAt: AT }],
    },
    facilityAssessment: facility(),
    leaseAssessment: lease(),
    analysisRun: analysisRun(),
    evaluatedAt: AT,
  };
}

function calculate(mutator) {
  const input = readyInput();
  mutator?.(input);
  return calculateContractReadiness(input);
}

function economicSelection(overrides = {}) {
  return {
    schemaVersion: "frameone.candidate-economic-selection.v1",
    candidateId: "candidate-a",
    caseId: "case-a",
    analysisRunId: RUN_ID,
    generatedAt: AT,
    assumptionRevision: 1,
    engineVersion: "economic-feasibility-v1",
    selectedAt: AT,
    ...overrides,
  };
}

test("Facility Hard Blocker는 Contract Readiness를 BLOCKED로 유지한다", () => {
  const result = calculate((input) => {
    input.facilityAssessment.checks.electricity = { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" };
  });
  assert.equal(result.readinessStatus, "BLOCKED");
  assert.ok(result.blockingIssues.some((item) => item.code === "FACILITY_HARD_electricity"));
});

test("Lease Hard Issue는 Contract Readiness를 BLOCKED로 유지한다", () => {
  const result = calculate((input) => {
    input.leaseAssessment.checks.businessUseRestriction = { state: "UNACCEPTABLE", verificationStatus: "VERIFIED", sourceType: "DOCUMENT" };
  });
  assert.equal(result.readinessStatus, "BLOCKED");
  assert.ok(result.blockingIssues.some((item) => item.code === "LEASE_HARD_businessUseRestriction"));
});

test("Hard Issue와 미확인이 함께 있어도 BLOCKED가 우선한다", () => {
  const result = calculate((input) => {
    input.facilityAssessment.checks.exhaust = { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" };
    input.leaseAssessment.checks.restorationScope = { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" };
  });
  assert.equal(result.readinessStatus, "BLOCKED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "LEASE_UNRESOLVED_restorationScope"));
});

test("Conditional 항목은 REVIEW_REQUIRED이며 unresolved로 중복 집계하지 않는다", () => {
  const result = calculate((input) => {
    input.facilityAssessment.checks.drainage = { state: "CONDITIONAL", verificationStatus: "FIELD_CHECK_REQUIRED", note: "추가 실측 필요" };
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "FACILITY_CONDITIONAL_drainage"));
  assert.equal(result.evidenceGaps.some((item) => item.code === "FACILITY_UNRESOLVED_drainage"), false);
});

test("UNKNOWN은 Hard가 아니라 REVIEW_REQUIRED 근거공백이다", () => {
  const result = calculate((input) => {
    input.leaseAssessment.checks.specialClauseStatus = { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" };
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.equal(result.blockingIssues.length, 0);
  assert.ok(result.evidenceGaps.some((item) => item.code === "LEASE_UNRESOLVED_specialClauseStatus"));
});

test("Facility 또는 Lease Assessment 누락은 REVIEW_REQUIRED다", () => {
  const facilityMissing = calculate((input) => { input.facilityAssessment = null; });
  const leaseMissing = calculate((input) => { input.leaseAssessment = null; });
  assert.equal(facilityMissing.readinessStatus, "REVIEW_REQUIRED");
  assert.equal(leaseMissing.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(facilityMissing.evidenceGaps.some((item) => item.code === "FACILITY_ASSESSMENT_MISSING"));
  assert.ok(leaseMissing.evidenceGaps.some((item) => item.code === "LEASE_ASSESSMENT_MISSING"));
});

test("Candidate Analysis Run 연결 없음은 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => { input.candidate.analysisLinks = []; input.analysisRun = null; });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ANALYSIS_RUN_LINK_MISSING"));
});

test("persisted Analysis Run 조회 실패는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => { input.analysisRun = null; });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ANALYSIS_RUN_NOT_FOUND"));
});

test("Economic Snapshot 없음은 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => { input.analysisRun.sections.economic.versions = []; });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ECONOMIC_SNAPSHOT_MISSING"));
});

test("Economic validation 오류는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions[0].result.validation.errors = ["객단가 입력을 확인하세요."];
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "ECONOMIC_VALIDATION_ERROR"));
});

test("Economic Run binding 불일치는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions[0].binding.analysisRunId = OTHER_RUN_ID;
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "ECONOMIC_RUN_BINDING_MISMATCH"));
});

test("다른 Candidate 또는 Case의 Assessment 결합을 거부한다", () => {
  assert.throws(() => calculate((input) => { input.facilityAssessment.candidateId = "candidate-b"; }), /다른 Candidate/);
  assert.throws(() => calculate((input) => { input.leaseAssessment.caseId = "case-b"; }), /다른 Candidate/);
});

test("모든 필수 근거가 검증되면 READY다", () => {
  const result = calculate();
  assert.equal(result.readinessStatus, "READY");
  assert.deepEqual(result.blockingIssues, []);
  assert.deepEqual(result.reviewIssues, []);
  assert.deepEqual(result.evidenceGaps, []);
  assert.deepEqual(result.sourceReferences.economic, {
    analysisRunId: RUN_ID,
    generatedAt: AT,
    assumptionRevision: 1,
    engineVersion: "economic-feasibility-v1",
  });
});

test("READY는 저장된 계약승인이나 최종 Verdict를 생성하지 않는다", () => {
  const result = calculate();
  assert.equal(Object.hasOwn(result, "verdict"), false);
  assert.equal(Object.hasOwn(result, "approved"), false);
  assert.equal(Object.hasOwn(result, "decisionId"), false);
});

test("Contract Readiness 계산은 기존 Facility와 Lease rule 및 입력을 변경하지 않는다", () => {
  const input = readyInput();
  input.facilityAssessment.checks.electricity = { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" };
  input.leaseAssessment.checks.restorationScope = { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" };
  const before = structuredClone(input);
  const facilitySummary = calculateBakeryFacilityRiskSummary(input.facilityAssessment);
  const leaseSummary = calculateCandidateLeaseRiskSummary(input.leaseAssessment);
  calculateContractReadiness(input);
  assert.equal(facilitySummary.hardBlockers.length, 1);
  assert.equal(leaseSummary.unresolvedChecks.some((item) => item.key === "restorationScope"), true);
  assert.deepEqual(input, before);
});

test("동일 입력과 주입된 평가시각은 동일 판정과 사유를 만든다", () => {
  assert.deepEqual(calculateContractReadiness(readyInput()), calculateContractReadiness(readyInput()));
});

test("여러 Analysis Run 연결은 임의 최신 선택 없이 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.candidate.analysisLinks.push({ analysisRunId: OTHER_RUN_ID, targetSnapshot: target(OTHER_RUN_ID), linkedAt: AT });
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "ANALYSIS_RUN_SELECTION_AMBIGUOUS"));
  assert.equal(result.sourceReferences.economic, null);
});

test("검토 임대료와 Economic 가정 불일치는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.leaseAssessment.reviewedTerms.monthlyRentWon = 4_500_000;
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "ECONOMIC_RENT_MISMATCH"));
});

test("최신 Assessment revision과 현재값 불일치는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.leaseAssessment.reviewedTerms.monthlyRentWon = 4_500_000;
    input.analysisRun.sections.economic.versions[0].result.inputs.fixedMonthlyCosts.rentMonthly = 4_500_000;
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "LEASE_REVISION_MISMATCH"));
});

test("BEP를 확인할 수 없는 Economic 결과는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions[0].result.bep.monthlyBepSales = null;
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ECONOMIC_BEP_NOT_AVAILABLE"));
});

test("Economic version이 복수이면 자동 선택 없이 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions.push(economicVersion());
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ECONOMIC_VERSION_SELECTION_REQUIRED"));
  assert.equal(result.sourceReferences.economic, null);
});

test("복수 Economic version의 마지막 값이 정상이어도 자동 READY로 전환하지 않는다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions[0].result.validation.errors = ["이 version은 사용할 수 없습니다."];
    input.analysisRun.sections.economic.versions.push(economicVersion());
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ECONOMIC_VERSION_SELECTION_REQUIRED"));
  assert.equal(result.reviewIssues.some((item) => item.code === "ECONOMIC_VALIDATION_ERROR"), false);
  assert.equal(result.sourceReferences.economic, null);
});

test("복수 Economic version에 더 최신 generatedAt이 있어도 자동 선택하지 않는다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions.push(economicVersion(RUN_ID, "2026-10-08T01:00:00.000Z"));
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.evidenceGaps.some((item) => item.code === "ECONOMIC_VERSION_SELECTION_REQUIRED"));
  assert.equal(result.sourceReferences.economic, null);
});

test("복수 Economic version에서 명시적으로 선택한 version만 계약판정 근거로 사용한다", () => {
  const later = "2026-10-08T01:00:00.000Z";
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions.push(economicVersion(RUN_ID, later));
    input.economicSelection = economicSelection();
  });
  assert.equal(result.readinessStatus, "READY");
  assert.equal(result.sourceReferences.economic.generatedAt, AT);
});

test("현재 Analysis Run에 없는 Economic 선택 identity는 REVIEW_REQUIRED다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions.push(economicVersion(RUN_ID, "2026-10-08T01:00:00.000Z"));
    input.economicSelection = economicSelection({ generatedAt: "2026-10-09T01:00:00.000Z" });
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "ECONOMIC_VERSION_SELECTION_INVALID"));
  assert.equal(result.sourceReferences.economic, null);
});

test("다른 Analysis Run 또는 Candidate의 Economic 선택은 REVIEW_REQUIRED다", () => {
  const wrongRun = calculate((input) => {
    input.analysisRun.sections.economic.versions.push(economicVersion(RUN_ID, "2026-10-08T01:00:00.000Z"));
    input.economicSelection = economicSelection({ analysisRunId: OTHER_RUN_ID });
  });
  const wrongCandidate = calculate((input) => {
    input.analysisRun.sections.economic.versions.push(economicVersion(RUN_ID, "2026-10-08T01:00:00.000Z"));
    input.economicSelection = economicSelection({ candidateId: "candidate-b" });
  });
  assert.ok(wrongRun.reviewIssues.some((item) => item.code === "ECONOMIC_SELECTION_RUN_MISMATCH"));
  assert.ok(wrongCandidate.reviewIssues.some((item) => item.code === "ECONOMIC_SELECTION_OWNERSHIP_MISMATCH"));
});

test("명시적으로 선택된 Economic version도 기존 validation을 통과해야 한다", () => {
  const result = calculate((input) => {
    input.analysisRun.sections.economic.versions[0].result.validation.errors = ["선택된 version 입력 오류"];
    input.analysisRun.sections.economic.versions.push(economicVersion(RUN_ID, "2026-10-08T01:00:00.000Z"));
    input.economicSelection = economicSelection();
  });
  assert.equal(result.readinessStatus, "REVIEW_REQUIRED");
  assert.ok(result.reviewIssues.some((item) => item.code === "ECONOMIC_VALIDATION_ERROR"));
});
