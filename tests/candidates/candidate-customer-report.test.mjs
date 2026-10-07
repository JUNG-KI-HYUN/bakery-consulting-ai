import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { assembleCandidateCustomerReport, CandidateCustomerReportInputError } = loadModule(path.join(root, "lib/reports/candidate-customer-report.ts"));
if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
else delete loadModule.extensions[".ts"];

const AT = "2026-10-07T01:00:00.000Z";
const RUN_ID = "basic-location-run:11111111-1111-4111-8111-111111111111";
const FACILITY_KEYS = ["electricity", "waterSupply", "drainage", "exhaust", "landlordConsent", "equipmentIngress", "manufacturingSpace", "drawingOrMeasurement", "fireEgress", "buildingUsePermit", "odorNoise"];
const LEASE_KEYS = ["businessUseRestriction", "restorationScope", "requiredWorksConsent", "permitFailureCondition", "specialClauseStatus", "writtenConfirmationStatus", "repairResponsibility", "handoverCondition", "premiumComposition", "premiumPaymentTiming", "premiumLeaseCondition"];

function sourceReferences() {
  return {
    facility: { assessmentId: "facility-1", revisionId: "facility-revision-1", recordedAt: AT, updatedAt: AT },
    lease: { assessmentId: "lease-1", revisionId: "lease-revision-1", recordedAt: AT, updatedAt: AT },
    analysisRun: { analysisRunId: RUN_ID, linkedAt: AT, snapshotUpdatedAt: AT },
    economic: { analysisRunId: RUN_ID, generatedAt: AT, assumptionRevision: 2, engineVersion: "economic-feasibility-v1" },
  };
}

function targetSnapshot() {
  return {
    analysisRunId: RUN_ID,
    label: "테스트 후보점포",
    address: "서울시 테스트 주소",
    latitude: 37.5,
    longitude: 127,
    radiusM: 300,
    source: "candidate_store",
    explorationSnapshot: { marketId: null, marketName: null, submarketId: null, submarketName: null, nodeId: null, nodeName: null },
    officialReference: { marketCode: "OFFICIAL-1", marketName: "공식 테스트상권", spatialRelation: "RADIUS_OVERLAP", selectionMethod: "MANUAL", selectedAt: AT },
    createdAt: AT,
    updatedAt: AT,
  };
}

function economicResult() {
  const scenario = (monthlySales, profit) => ({ monthlySales, estimatedOperatingProfit: profit, rentBurdenRate: 0.1 });
  return {
    schemaVersion: "frameone.economic-feasibility.v1",
    inputs: {
      expectedTicket: 10000,
      operatingDaysPerMonth: 25,
      fixedMonthlyCosts: { rentMonthly: 4000000, managementFeeMonthly: 300000, laborMonthly: 8000000 },
    },
    scenarios: {
      conservative: scenario(30000000, 1000000),
      base: scenario(40000000, 3000000),
      upside: scenario(50000000, 5000000),
    },
    bep: { monthlyBepSales: 28000000, dailyBepSales: 1120000, requiredDailyTransactionsForBep: 112 },
    officialBenchmark: { status: "AVAILABLE", label: "공식상권 제과점 점포당 참고매출", value: 99000000, period: "2026 Q2", limitation: "공식상권 전체 참고값이며 후보점포 예상매출이 아닙니다." },
    limitations: ["입력 가정에 따른 추정치입니다."],
    metadata: { engineVersion: "economic-feasibility-v1", generatedAt: AT },
  };
}

function makeInput() {
  const refs = sourceReferences();
  const facilityChecks = Object.fromEntries(FACILITY_KEYS.map((key) => [key, { state: "FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" }]));
  const leaseChecks = Object.fromEntries(LEASE_KEYS.map((key) => [key, { state: "ACCEPTABLE", verificationStatus: "VERIFIED", sourceType: "DOCUMENT" }]));
  const readinessSnapshot = {
    readinessSnapshotId: "readiness-1",
    candidateId: "candidate-1",
    caseId: "case-1",
    schemaVersion: "frameone.contract-readiness.v1",
    ruleVersion: "contract-readiness-v1",
    result: { readinessStatus: "READY", blockingIssues: [], reviewIssues: [], evidenceGaps: [], nextActions: ["계약서 최종 확인"] },
    inputBinding: { facilityAssessmentId: "facility-1", facilityUpdatedAt: AT, leaseAssessmentId: "lease-1", leaseUpdatedAt: AT, analysisRunId: RUN_ID, economicGeneratedAt: AT, economicEngineVersion: "economic-feasibility-v1", economicAssumptionRevision: 2 },
    sourceReferences: refs,
    evaluatedAt: AT,
    savedAt: AT,
    createsVerdict: false,
    createsApproval: false,
  };
  return {
    caseRecord: { caseId: "case-1", name: "테스트 Case" },
    candidate: {
      candidateId: "candidate-1",
      caseId: "case-1",
      label: "테스트 후보점포",
      address: "서울시 테스트 주소",
      propertyFacts: { parkingStatus: "UNKNOWN" },
      currentAskingTerms: {},
      status: "REVIEWING",
      source: "MARKET_ANALYSIS",
      analysisLinks: [{ analysisRunId: RUN_ID, targetSnapshot: targetSnapshot(), linkedAt: AT }],
      createdAt: AT,
      updatedAt: AT,
    },
    decision: {
      decisionId: "decision-1",
      candidateId: "candidate-1",
      caseId: "case-1",
      schemaVersion: "frameone.candidate-human-decision.v1",
      basis: { readinessSnapshotId: "readiness-1", readinessStatus: "READY", readinessSavedAt: AT, readinessInputBinding: structuredClone(readinessSnapshot.inputBinding) },
      verdict: "CONDITIONAL_RECOMMEND",
      rationale: "확인된 조건을 완료한 뒤 계약을 진행할 수 있습니다.",
      support: {
        positiveFactors: ["입지 근거 확인"],
        keyRisks: ["배기 서면확인 필요"],
        unresolvedConditions: ["임대인 확인 전"],
        conditionsBeforeProceeding: ["배기 공사 동의서 확보"],
        landlordConfirmations: ["배기 공사 동의"],
        expertConfirmations: ["전기 용량 검토"],
        nextActions: ["서면 동의 확보"],
      },
      reviewerName: "담당자",
      decidedAt: AT,
      previousDecisionId: null,
      createsAutomaticRecommendation: false,
      decidedByHuman: true,
    },
    readinessSnapshot,
    currentReadiness: { candidateId: "candidate-1", caseId: "case-1", sourceReferences: structuredClone(refs) },
    facilityAssessment: {
      assessmentId: "facility-1", candidateId: "candidate-1", caseId: "case-1", checks: facilityChecks,
      revisions: [{ revisionId: "facility-revision-1", checks: structuredClone(facilityChecks), recordedAt: AT }], createdAt: AT, updatedAt: AT,
    },
    leaseAssessment: {
      assessmentId: "lease-1", candidateId: "candidate-1", caseId: "case-1",
      reviewedTerms: { depositWon: 50000000, monthlyRentWon: 4000000, maintenanceFeeWon: 300000 }, checks: leaseChecks,
      revisions: [{ revisionId: "lease-revision-1", reviewedTerms: { depositWon: 50000000, monthlyRentWon: 4000000, maintenanceFeeWon: 300000 }, checks: leaseChecks, recordedAt: AT }], createdAt: AT, updatedAt: AT,
    },
    analysisRun: {
      schemaVersion: "frameone.analysis-run-snapshot.v1", analysisRunId: RUN_ID, targetSnapshot: targetSnapshot(), createdAt: AT, updatedAt: AT,
      sections: {
        location: { versions: [{ generatedAt: AT, binding: { analysisRunId: RUN_ID, officialMarketCode: "OFFICIAL-1" }, result: { presentation: { summary: { confirmedFeatures: [{ message: "테스트 입지 특징" }] }, evidence: { kakao: { metrics: [] }, officialStats: null }, limitations: [] } } }] },
        competition: { transientDetailRestore: "REQUERY_REQUIRED", versions: [{ generatedAt: AT, binding: { analysisRunId: RUN_ID }, result: { kakaoObservation: { uniqueObservedCandidateCount: 7 }, officialAreaReference: { storeCount: 12, referencePeriod: "2026 Q2" }, distanceBands: [{ band: "0-100m", candidateCount: 2 }], warnings: ["전수조사가 아닙니다."] } }] },
        rental: { versions: [{ generatedAt: AT, binding: { analysisRunId: RUN_ID }, result: { analysis: { referenceDate: "2026-10-01", sampleCount: 3, sampleSufficiency: "REFERENCE_ONLY", deposit: { median: 50000000, min: 40000000, max: 60000000 }, rent: { median: 4000000, min: 3500000, max: 4500000 }, managementFee: { median: 300000, min: 200000, max: 400000 }, limitations: ["표본 참고용"] } } }] },
        economic: { versions: [{ generatedAt: AT, binding: { analysisRunId: RUN_ID, assumptionRevision: 2 }, result: economicResult() }] },
      },
    },
    generatedAt: AT,
  };
}

test("valid Decision assembles a REPORT_READY customer report", () => {
  const report = assembleCandidateCustomerReport(makeInput());
  assert.equal(report.meta.reportStatus, "REPORT_READY");
  assert.equal(report.meta.decisionId, "decision-1");
});

test("missing Decision requires report review", () => {
  const input = makeInput(); input.decision = null;
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.meta.reportStatus, "REPORT_REVIEW_REQUIRED");
  assert.match(report.meta.reviewReasons.join(" "), /최종 판단/);
});

test("stale Decision requires report review", () => {
  const input = makeInput(); input.currentReadiness.sourceReferences.facility.updatedAt = "2026-10-08T01:00:00.000Z";
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.meta.decisionStale, true);
  assert.match(report.meta.reviewReasons.join(" "), /근거자료가 변경/);
});

test("Candidate and Case mismatch is rejected", () => {
  const input = makeInput(); input.candidate.caseId = "case-other";
  assert.throws(() => assembleCandidateCustomerReport(input), CandidateCustomerReportInputError);
});

test("readiness snapshot binding remains the report basis", () => {
  const report = assembleCandidateCustomerReport(makeInput());
  assert.equal(report.provenance.decisionBasisSources.readinessSnapshot.readinessSnapshotId, "readiness-1");
  assert.equal(report.readiness.status, "READY");
});

test("explicit Decision basis sources stay separate from contextual sources", () => {
  const report = assembleCandidateCustomerReport(makeInput());
  const basis = report.provenance.decisionBasisSources;
  assert.equal(basis.facility.revisionId, "facility-revision-1");
  assert.equal(basis.lease.revisionId, "lease-revision-1");
  assert.equal(basis.analysisRun.analysisRunId, RUN_ID);
  assert.equal(basis.economic.analysisRunId, RUN_ID);
  assert.equal(basis.readinessSnapshot.readinessSnapshotId, "readiness-1");
  assert.equal(basis.humanDecision.decisionId, "decision-1");
  assert.equal("location" in basis, false);
  assert.equal("competition" in basis, false);
  assert.equal("rentalMarket" in basis, false);
});

test("Location, Competition, and Rental Market are contextual sources", () => {
  const contextual = assembleCandidateCustomerReport(makeInput()).provenance.contextualSources;
  assert.deepEqual(contextual.location, { analysisRunId: RUN_ID, generatedAt: AT });
  assert.deepEqual(contextual.competition, { analysisRunId: RUN_ID, generatedAt: AT });
  assert.deepEqual(contextual.rentalMarket, { analysisRunId: RUN_ID, generatedAt: AT });
});

test("Decision and readiness input binding mismatch requires review", () => {
  const input = makeInput(); input.decision.basis.readinessInputBinding.facilityUpdatedAt = "2026-10-08T01:00:00.000Z";
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.meta.reportStatus, "REPORT_REVIEW_REQUIRED");
  assert.match(report.meta.reviewReasons.join(" "), /input binding/);
});

test("Economic source binding selects the exact stored version", () => {
  const input = makeInput();
  input.analysisRun.sections.economic.versions.push({ generatedAt: "2026-10-08T01:00:00.000Z", binding: { analysisRunId: RUN_ID, assumptionRevision: 3 }, result: { ...economicResult(), metadata: { engineVersion: "economic-feasibility-v1", generatedAt: "2026-10-08T01:00:00.000Z" } } });
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.economics.assumptionRevision, 2);
  assert.equal(report.economics.generatedAt, AT);
});

test("Facility source uses the revision bound by readiness", () => {
  const input = makeInput();
  input.facilityAssessment.checks.electricity = { state: "NOT_FEASIBLE", verificationStatus: "VERIFIED", sourceType: "FIELD" };
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.facility.hard.length, 0);
  assert.equal(report.facility.revisionId, "facility-revision-1");
});

test("Lease source uses the revision bound by readiness", () => {
  const input = makeInput(); input.leaseAssessment.reviewedTerms.monthlyRentWon = 9999999;
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.lease.reviewedTerms.monthlyRentWon, 4000000);
  assert.equal(report.lease.revisionId, "lease-revision-1");
});

test("context generated after the Decision basis time does not replace past context", () => {
  const input = makeInput();
  input.analysisRun.sections.competition.versions[0].generatedAt = "2026-10-06T01:00:00.000Z";
  const future = structuredClone(input.analysisRun.sections.competition.versions[0]);
  future.generatedAt = "2026-10-08T01:00:00.000Z";
  future.result.kakaoObservation.uniqueObservedCandidateCount = 99;
  input.analysisRun.sections.competition.versions.push(future);
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.competition.uniqueObservedCandidateCount, 7);
  assert.equal(report.provenance.contextualSources.competition.generatedAt, "2026-10-06T01:00:00.000Z");
});

test("context from another AnalysisRun is not mixed into the report", () => {
  const input = makeInput();
  const otherRunId = "basic-location-run:22222222-2222-4222-8222-222222222222";
  input.analysisRun.sections.location.versions[0].binding.analysisRunId = otherRunId;
  input.analysisRun.sections.competition.versions[0].binding.analysisRunId = otherRunId;
  input.analysisRun.sections.rental.versions[0].binding.analysisRunId = otherRunId;
  const report = assembleCandidateCustomerReport(input);
  assert.deepEqual(report.provenance.contextualSources, { location: null, competition: null, rentalMarket: null });
  assert.equal(report.locationMarket.status, "NOT_AVAILABLE");
  assert.equal(report.competition.status, "NOT_AVAILABLE");
  assert.equal(report.rentalMarket.status, "NOT_AVAILABLE");
  assert.equal(report.meta.reportStatus, "REPORT_READY");
});

test("context from an AnalysisRun outside the Candidate scope is not mixed", () => {
  const input = makeInput();
  input.candidate.analysisLinks = [];
  const report = assembleCandidateCustomerReport(input);
  assert.deepEqual(report.provenance.contextualSources, { location: null, competition: null, rentalMarket: null });
  assert.equal(report.meta.reportStatus, "REPORT_READY");
});

test("missing contextual data stays 자료 없음 without adding a report hard gate", () => {
  const input = makeInput();
  delete input.analysisRun.sections.location;
  delete input.analysisRun.sections.competition;
  delete input.analysisRun.sections.rental;
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.locationMarket.status, "NOT_AVAILABLE");
  assert.equal(report.competition.status, "NOT_AVAILABLE");
  assert.equal(report.rentalMarket.status, "NOT_AVAILABLE");
  assert.deepEqual(report.provenance.contextualSources, { location: null, competition: null, rentalMarket: null });
  assert.equal(report.meta.reportStatus, "REPORT_READY");
});

test("missing data stays absent instead of becoming invented numbers", () => {
  const input = makeInput();
  input.decision = null; input.readinessSnapshot = null; input.facilityAssessment = null; input.leaseAssessment = null; input.analysisRun = null; input.candidate.analysisLinks = [];
  input.currentReadiness.sourceReferences = { facility: null, lease: null, analysisRun: null, economic: null };
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.economics.bep, null);
  assert.equal(report.competition.uniqueObservedCandidateCount, null);
  assert.equal(report.rentalMarket.sampleCount, null);
});

test("UNKNOWN is displayed as 확인 필요", () => {
  const input = makeInput(); input.facilityAssessment.revisions[0].checks.electricity.state = "UNKNOWN";
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.facility.checks.find((item) => item.label === "전기").stateLabel, "확인 필요");
});

test("NOT_CHECKED is displayed as 미확인", () => {
  const input = makeInput(); input.facilityAssessment.revisions[0].checks.electricity.verificationStatus = "NOT_CHECKED";
  const report = assembleCandidateCustomerReport(input);
  assert.equal(report.facility.checks.find((item) => item.label === "전기").verificationLabel, "미확인");
});

test("official market sales reference is not candidate estimated sales", () => {
  const report = assembleCandidateCustomerReport(makeInput());
  assert.equal(report.economics.officialBenchmark.value, 99000000);
  assert.equal(report.executiveSummary.baseMonthlySalesEstimate, 40000000);
  assert.notEqual(report.economics.officialBenchmark.value, report.executiveSummary.baseMonthlySalesEstimate);
});

for (const [verdict, label] of [["RECOMMEND", "추천"], ["CONDITIONAL_RECOMMEND", "조건부 추천"], ["HOLD", "보류"], ["RISK", "위험"]]) {
  test(`final verdict ${verdict} is rendered as ${label}`, () => {
    const input = makeInput(); input.decision.verdict = verdict;
    assert.equal(assembleCandidateCustomerReport(input).decision.verdictLabel, label);
  });
}

test("decision rationale is preserved", () => {
  assert.match(assembleCandidateCustomerReport(makeInput()).decision.rationale, /조건을 완료/);
});

test("conditions before proceeding are preserved", () => {
  assert.deepEqual(assembleCandidateCustomerReport(makeInput()).decision.conditionsBeforeProceeding, ["배기 공사 동의서 확보"]);
});

test("required disclaimer is present", () => {
  const disclaimer = assembleCandidateCustomerReport(makeInput()).disclaimer.join(" ");
  assert.match(disclaimer, /실제 결과를 보장하지 않습니다/);
  assert.match(disclaimer, /전문가와 관할기관/);
});

test("report route renders the report service result", () => {
  const source = fs.readFileSync(path.join(root, "app/cases/[caseId]/candidates/[candidateId]/report/page.tsx"), "utf8");
  assert.match(source, /getCandidateCustomerReport/);
  assert.match(source, /CandidateCustomerReportDocument/);
  assert.match(source, /params: Promise/);
});

test("Candidate detail provides the customer report CTA", () => {
  const source = fs.readFileSync(path.join(root, "components/candidates/CandidateStoreDetailClient.tsx"), "utf8");
  assert.match(source, /고객 리포트 보기/);
  assert.match(source, /candidates\/\$\{encodeURIComponent\(record\.candidateId\)\}\/report/);
});

test("report implementation does not persist reports or invoke legacy diagnosis", () => {
  const service = fs.readFileSync(path.join(root, "lib/reports/candidate-customer-report-service.ts"), "utf8");
  const report = fs.readFileSync(path.join(root, "lib/reports/candidate-customer-report.ts"), "utf8");
  assert.equal(service.includes("writeFile"), false);
  assert.equal(report.includes("mockAiDiagnosis"), false);
  assert.equal(report.includes("calculateBreakEven"), false);
});

test("customer UI labels context as reference material, not direct Human Decision basis", () => {
  const source = fs.readFileSync(path.join(root, "components/reports/CandidateCustomerReportDocument.tsx"), "utf8");
  assert.match(source, /판단 시점 기준 참고자료/);
  assert.match(source, /해당 판단 시점 이전에 저장된 분석자료/);
  assert.match(source, /Human Decision에 직접 binding된 근거가 아닙니다/);
  assert.equal(source.includes("최종 판단 근거"), false);
  assert.equal(source.includes("계약 판단 확정 근거"), false);
});

test("customer report route is separated from the staff navigation shell", () => {
  const shell = fs.readFileSync(path.join(root, "components/app-shell/AppShell.tsx"), "utf8");
  assert.match(shell, /isCandidateCustomerReport/);
  assert.match(shell, /candidates\\\/\[\^\/\]\+\\\/report/);
});
