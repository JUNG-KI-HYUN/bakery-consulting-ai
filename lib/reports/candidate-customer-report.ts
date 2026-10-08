import type { AnalysisRunSnapshot } from "../analysis-runs/analysis-run-snapshot";
import {
  BAKERY_FACILITY_CHECK_KEYS,
  BAKERY_FACILITY_CHECK_LABELS,
  type BakeryFacilityAssessment,
  type BakeryFacilityCheck,
} from "../candidates/bakery-facility-assessment-contract";
import { calculateBakeryFacilityRiskSummary } from "../candidates/bakery-facility-risk";
import type { CandidateStore } from "../candidates/candidate-contract";
import {
  CANDIDATE_LEASE_CHECK_KEYS,
  CANDIDATE_LEASE_CHECK_LABELS,
  type CandidateLeaseAssessment,
  type CandidateLeaseCheck,
} from "../candidates/candidate-lease-assessment-contract";
import { calculateCandidateLeaseRiskSummary } from "../candidates/candidate-lease-risk";
import {
  contractReadinessInputBinding,
  type CandidateContractReadinessSnapshot,
  type ContractReadinessResult,
  type ContractReadinessSourceReferences,
} from "../candidates/contract-readiness-contract";
import { hasCustomerUsableEconomicResults } from "../economic-feasibility/engine";
import {
  HUMAN_DECISION_VERDICT_LABELS,
  type CandidateHumanDecision,
} from "../candidates/human-decision-contract";
import type { CaseRecord } from "../cases/case-contract";

export const CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION = "frameone.candidate-customer-report.v1" as const;

export type CandidateCustomerReportStatus = "REPORT_READY" | "REPORT_REVIEW_REQUIRED";

export class CandidateCustomerReportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateCustomerReportInputError";
  }
}

type ReportMetric = {
  label: string;
  value: string | number | boolean | null;
  unit: string | null;
  status: string;
  referencePeriod: string | null;
  valueType: string | null;
};

type ReportRiskItem = { label: string; reason: string; nextAction?: string };

type ReportCheck = {
  label: string;
  stateLabel: string;
  verificationLabel: string;
  note: string | null;
  observedAt: string | null;
};

export interface CandidateCustomerReport {
  meta: {
    schemaVersion: typeof CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION;
    reportStatus: CandidateCustomerReportStatus;
    reviewReasons: string[];
    caseId: string;
    candidateId: string;
    generatedAt: string;
    decisionId: string | null;
    readinessSnapshotId: string | null;
    basisAt: string | null;
    decisionStale: boolean;
  };
  candidateSummary: {
    caseName: string;
    label: string;
    address: string | null;
    unit: string | null;
    floor: string | null;
    exclusiveAreaSqm: number | null;
    frontageM: number | null;
    parkingStatus: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN" | null;
    parkingNote: string | null;
  };
  executiveSummary: {
    verdictLabel: string;
    readinessStatus: string;
    keyRisks: string[];
    conditionsBeforeProceeding: string[];
    monthlyBepSales: number | null;
    baseMonthlySalesEstimate: number | null;
  };
  locationMarket: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    analysisTarget: { label: string | null; address: string | null; radiusM: number } | null;
    officialMarket: { name: string; code: string; relation: string } | null;
    generatedAt: string | null;
    features: string[];
    metrics: ReportMetric[];
    limitations: string[];
  };
  competition: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    generatedAt: string | null;
    observationScope: string | null;
    uniqueObservedCandidateCount: number | null;
    officialStoreCount: number | null;
    officialReferencePeriod: string | null;
    distanceBands: Array<{ label: string; count: number }>;
    warnings: string[];
  };
  rentalMarket: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    generatedAt: string | null;
    referenceDate: string | null;
    sampleCount: number | null;
    sampleSufficiency: string | null;
    deposit: { median: number | null; min: number | null; max: number | null } | null;
    rent: { median: number | null; min: number | null; max: number | null } | null;
    maintenanceFee: { median: number | null; min: number | null; max: number | null } | null;
    limitations: string[];
  };
  lease: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    assessmentId: string | null;
    revisionId: string | null;
    basisAt: string | null;
    reviewedTerms: CandidateLeaseAssessment["reviewedTerms"] | null;
    hard: ReportRiskItem[];
    conditional: ReportRiskItem[];
    unresolved: ReportRiskItem[];
    verifiedCount: number;
    checks: ReportCheck[];
  };
  facility: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    assessmentId: string | null;
    revisionId: string | null;
    basisAt: string | null;
    hard: ReportRiskItem[];
    conditional: ReportRiskItem[];
    unresolved: ReportRiskItem[];
    verifiedCount: number;
    checks: ReportCheck[];
  };
  economics: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    generatedAt: string | null;
    engineVersion: string | null;
    assumptionRevision: number | null;
    assumptions: Array<{ label: string; value: number; unit: string }>;
    scenarios: Array<{ label: string; monthlySales: number | null; estimatedOperatingProfit: number | null; rentBurdenRate: number | null }>;
    bep: { monthlyBepSales: number | null; dailyBepSales: number | null; requiredDailyTransactions: number | null } | null;
    officialBenchmark: { label: string; value: number | null; period: string | null; limitation: string } | null;
    limitations: string[];
  };
  readiness: {
    status: string;
    blockingIssues: string[];
    reviewIssues: string[];
    evidenceGaps: string[];
    nextActions: string[];
    evaluatedAt: string | null;
    savedAt: string | null;
  };
  decision: {
    status: "AVAILABLE" | "NOT_AVAILABLE";
    verdict: CandidateHumanDecision["verdict"] | null;
    verdictLabel: string;
    rationale: string | null;
    positiveFactors: string[];
    keyRisks: string[];
    unresolvedConditions: string[];
    conditionsBeforeProceeding: string[];
    landlordConfirmations: string[];
    expertConfirmations: string[];
    nextActions: string[];
    reviewerName: string | null;
    decidedAt: string | null;
  };
  provenance: {
    decisionBasisSources: {
      facility: ContractReadinessSourceReferences["facility"];
      lease: ContractReadinessSourceReferences["lease"];
      analysisRun: ContractReadinessSourceReferences["analysisRun"];
      economic: ContractReadinessSourceReferences["economic"];
      readinessSnapshot: { readinessSnapshotId: string; savedAt: string } | null;
      humanDecision: { decisionId: string; decidedAt: string; readinessSnapshotId: string } | null;
    };
    contextualSources: {
      location: { analysisRunId: string; generatedAt: string } | null;
      competition: { analysisRunId: string; generatedAt: string } | null;
      rentalMarket: { analysisRunId: string; generatedAt: string } | null;
    };
  };
  disclaimer: string[];
}

export interface CandidateCustomerReportInput {
  caseRecord: CaseRecord;
  candidate: CandidateStore;
  decision: CandidateHumanDecision | null;
  readinessSnapshot: CandidateContractReadinessSnapshot | null;
  currentReadiness: ContractReadinessResult;
  facilityAssessment: BakeryFacilityAssessment | null;
  leaseAssessment: CandidateLeaseAssessment | null;
  analysisRun: AnalysisRunSnapshot | null;
  generatedAt: string;
}

function timestamp(value: string, label: string) {
  if (!Number.isFinite(Date.parse(value))) throw new CandidateCustomerReportInputError(`${label}이 유효하지 않습니다.`);
  return new Date(value).toISOString();
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function contextualVersionAtOrBefore<T extends { generatedAt: string; binding: { analysisRunId: string } }>(
  versions: T[],
  basisAt: string | null,
  analysisRunId: string | null,
) {
  if (!basisAt || !analysisRunId || !Number.isFinite(Date.parse(basisAt))) return null;
  return versions
    .filter((item) =>
      item.binding.analysisRunId === analysisRunId
      && Number.isFinite(Date.parse(item.generatedAt))
      && Date.parse(item.generatedAt) <= Date.parse(basisAt)
    )
    .sort((left, right) => Date.parse(left.generatedAt) - Date.parse(right.generatedAt))
    .at(-1) ?? null;
}

const FACILITY_STATE_LABELS: Record<BakeryFacilityCheck["state"], string> = {
  FEASIBLE: "확인 완료",
  CONDITIONAL: "조건부",
  NOT_FEASIBLE: "불가",
  UNKNOWN: "확인 필요",
};

const LEASE_STATE_LABELS: Record<CandidateLeaseCheck["state"], string> = {
  ACCEPTABLE: "확인 완료",
  CONDITIONAL: "조건부",
  UNACCEPTABLE: "수용 곤란",
  UNKNOWN: "확인 필요",
};

function verificationLabel(value: string) {
  if (value === "VERIFIED") return "확인 완료";
  if (value === "NOT_CHECKED") return "미확인";
  if (value === "NO_DATA") return "자료 없음";
  if (value === "FIELD_CHECK_REQUIRED") return "현장 확인 필요";
  if (value === "LANDLORD_CONFIRM_REQUIRED") return "임대인 확인 필요";
  if (value === "DOCUMENT_CONFIRM_REQUIRED") return "문서 확인 필요";
  if (value === "EXPERT_CONFIRM_REQUIRED") return "전문가 확인 필요";
  if (value === "AUTHORITY_CONFIRM_REQUIRED") return "관할기관 확인 필요";
  return "확인 필요";
}

function reportRiskItems(items: Array<{ label: string; reason: string; nextAction?: string }>) {
  return items.map((item) => ({ ...item }));
}

function reportMetricValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return null;
}

export function assembleCandidateCustomerReport(input: CandidateCustomerReportInput): CandidateCustomerReport {
  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  if (input.candidate.caseId !== input.caseRecord.caseId) {
    throw new CandidateCustomerReportInputError("다른 Case의 Candidate를 리포트에 결합할 수 없습니다.");
  }
  if (input.currentReadiness.caseId !== input.caseRecord.caseId || input.currentReadiness.candidateId !== input.candidate.candidateId) {
    throw new CandidateCustomerReportInputError("Contract Readiness의 Candidate/Case binding이 일치하지 않습니다.");
  }
  if (input.decision && (input.decision.caseId !== input.caseRecord.caseId || input.decision.candidateId !== input.candidate.candidateId)) {
    throw new CandidateCustomerReportInputError("Human Decision의 Candidate/Case binding이 일치하지 않습니다.");
  }
  if (input.readinessSnapshot && (input.readinessSnapshot.caseId !== input.caseRecord.caseId || input.readinessSnapshot.candidateId !== input.candidate.candidateId)) {
    throw new CandidateCustomerReportInputError("Readiness Snapshot의 Candidate/Case binding이 일치하지 않습니다.");
  }

  const reviewReasons: string[] = [];
  if (!input.decision) reviewReasons.push("FRAMEONE 최종 판단이 아직 기록되지 않았습니다.");
  if (!input.readinessSnapshot) reviewReasons.push("리포트 기준 Contract Readiness Snapshot을 조회하지 못했습니다.");
  if (input.decision && input.readinessSnapshot && input.decision.basis.readinessSnapshotId !== input.readinessSnapshot.readinessSnapshotId) {
    reviewReasons.push("Human Decision과 Contract Readiness Snapshot binding이 일치하지 않습니다.");
  }
  if (input.decision && input.readinessSnapshot && !same(input.decision.basis.readinessInputBinding, input.readinessSnapshot.inputBinding)) {
    reviewReasons.push("Human Decision과 Contract Readiness input binding이 일치하지 않습니다.");
  }

  const sourceReferences = input.readinessSnapshot?.sourceReferences ?? {
    facility: null,
    lease: null,
    analysisRun: null,
    economic: null,
  };
  if (input.readinessSnapshot && !same(
    input.readinessSnapshot.inputBinding,
    contractReadinessInputBinding(input.readinessSnapshot.sourceReferences),
  )) {
    reviewReasons.push("Contract Readiness Snapshot의 근거 연결정보가 일치하지 않습니다.");
  }
  const decisionStale = Boolean(input.decision && input.readinessSnapshot && !same(
    input.readinessSnapshot.sourceReferences,
    input.currentReadiness.sourceReferences,
  ));
  if (decisionStale) reviewReasons.push("최종 판단 이후 근거자료가 변경되었습니다.");

  if (!sourceReferences.facility) reviewReasons.push("시설 검토 기준이 저장되지 않았습니다.");
  const facilityRevision = sourceReferences.facility
    && input.facilityAssessment?.assessmentId === sourceReferences.facility.assessmentId
    && input.facilityAssessment.candidateId === input.candidate.candidateId
    && input.facilityAssessment.caseId === input.caseRecord.caseId
    ? input.facilityAssessment.revisions.find((item) =>
      item.revisionId === sourceReferences.facility?.revisionId
      && item.recordedAt === sourceReferences.facility.recordedAt
    ) ?? null
    : null;
  if (sourceReferences.facility && !facilityRevision) reviewReasons.push("Decision 기준 Facility revision을 조회하지 못했습니다.");
  const facilityBasis = facilityRevision ? { checks: facilityRevision.checks } : null;
  const facilitySummary = calculateBakeryFacilityRiskSummary(facilityBasis);

  if (!sourceReferences.lease) reviewReasons.push("임대차 검토 기준이 저장되지 않았습니다.");
  const leaseRevision = sourceReferences.lease
    && input.leaseAssessment?.assessmentId === sourceReferences.lease.assessmentId
    && input.leaseAssessment.candidateId === input.candidate.candidateId
    && input.leaseAssessment.caseId === input.caseRecord.caseId
    ? input.leaseAssessment.revisions.find((item) =>
      item.revisionId === sourceReferences.lease?.revisionId
      && item.recordedAt === sourceReferences.lease.recordedAt
    ) ?? null
    : null;
  if (sourceReferences.lease && !leaseRevision) reviewReasons.push("Decision 기준 Lease revision을 조회하지 못했습니다.");
  const leaseBasis = leaseRevision ? { checks: leaseRevision.checks, reviewedTerms: leaseRevision.reviewedTerms } : null;
  const leaseSummary = calculateCandidateLeaseRiskSummary(leaseBasis);

  if (!sourceReferences.analysisRun) reviewReasons.push("분석 실행 기준이 저장되지 않았습니다.");
  const analysisRunMatches = Boolean(
    sourceReferences.analysisRun
    && input.analysisRun?.analysisRunId === sourceReferences.analysisRun.analysisRunId
    && input.analysisRun.targetSnapshot.analysisRunId === sourceReferences.analysisRun.analysisRunId
    && input.analysisRun.updatedAt === sourceReferences.analysisRun.snapshotUpdatedAt
  );
  if (sourceReferences.analysisRun && !analysisRunMatches) reviewReasons.push("Decision 기준 Analysis Run을 조회하지 못했습니다.");
  const analysisRun = analysisRunMatches ? input.analysisRun : null;
  const basisAt = input.readinessSnapshot?.savedAt ?? null;
  const targetLink = sourceReferences.analysisRun
    ? input.candidate.analysisLinks.find((item) => item.analysisRunId === sourceReferences.analysisRun?.analysisRunId) ?? null
    : null;
  const contextualScopeMatches = Boolean(
    analysisRun
    && targetLink
    && targetLink.linkedAt === sourceReferences.analysisRun?.linkedAt
    && targetLink.targetSnapshot.analysisRunId === analysisRun.analysisRunId
    && analysisRun.targetSnapshot.analysisRunId === analysisRun.analysisRunId
    && same(targetLink.targetSnapshot, analysisRun.targetSnapshot)
  );
  if (analysisRunMatches && !contextualScopeMatches) {
    reviewReasons.push("후보점포와 Decision 기준 Analysis Run 연결을 확인할 수 없습니다.");
  }
  const contextualAnalysisRunId = contextualScopeMatches ? analysisRun?.analysisRunId ?? null : null;
  const target = contextualScopeMatches ? targetLink?.targetSnapshot ?? null : null;
  const locationVersion = contextualVersionAtOrBefore(
    analysisRun?.sections.location?.versions ?? [],
    basisAt,
    contextualAnalysisRunId,
  );
  const competitionVersion = contextualVersionAtOrBefore(
    analysisRun?.sections.competition?.versions ?? [],
    basisAt,
    contextualAnalysisRunId,
  );
  const rentalVersion = contextualVersionAtOrBefore(
    analysisRun?.sections.rental?.versions ?? [],
    basisAt,
    contextualAnalysisRunId,
  );
  if (!sourceReferences.economic) reviewReasons.push("경제성 계산 기준이 저장되지 않았습니다.");
  const matchingEconomicVersions = sourceReferences.economic && analysisRun
    ? analysisRun.sections.economic?.versions.filter((item) =>
      item.generatedAt === sourceReferences.economic?.generatedAt
      && item.binding.analysisRunId === sourceReferences.economic.analysisRunId
      && item.binding.assumptionRevision === sourceReferences.economic.assumptionRevision
      && item.result.metadata.engineVersion === sourceReferences.economic.engineVersion
      && item.result.metadata.generatedAt === sourceReferences.economic.generatedAt
    ) ?? []
    : [];
  const economicVersion = matchingEconomicVersions.length === 1 ? matchingEconomicVersions[0] : null;
  if (sourceReferences.economic && !economicVersion) reviewReasons.push("Decision 기준 Economic Snapshot을 조회하지 못했습니다.");
  const economicResult = economicVersion?.result ?? null;
  const economicUsable = economicResult ? hasCustomerUsableEconomicResults(economicResult) : false;
  if (economicResult && economicResult.validation.errors.length > 0) {
    reviewReasons.push("경제성 필수 입력값이 확인되지 않아 현재 손익분기점을 계산할 수 없습니다.");
  } else if (economicResult && !economicUsable) {
    reviewReasons.push("경제성 계산 결과에서 고객용 손익분기점을 확인할 수 없습니다.");
  }

  const locationPresentation = locationVersion?.result.presentation;
  const locationMetrics: ReportMetric[] = [
    ...(locationPresentation?.evidence.kakao.metrics ?? []),
    ...(locationPresentation?.evidence.officialStats?.sales ?? []),
    ...(locationPresentation?.evidence.officialStats?.stores ?? []),
  ].slice(0, 8).map((metric) => ({
    label: metric.label,
    value: reportMetricValue(metric.value),
    unit: metric.unit,
    status: metric.statusLabel,
    referencePeriod: metric.referencePeriod,
    valueType: metric.valueType,
  }));
  const locationLimitations = (locationPresentation?.limitations ?? []).flatMap((group) =>
    group.items.map((item) => `${item.label}: ${item.description}`),
  );

  const economic = economicUsable ? economicResult : null;
  const scenarioLabels = { conservative: "보수", base: "기준", upside: "상향" } as const;
  const assumptions = economic ? [
    { label: "객단가 가정", value: economic.inputs.expectedTicket, unit: "원" },
    { label: "월 영업일 가정", value: economic.inputs.operatingDaysPerMonth, unit: "일" },
    { label: "월세 가정", value: economic.inputs.fixedMonthlyCosts.rentMonthly, unit: "원/월" },
    { label: "관리비 가정", value: economic.inputs.fixedMonthlyCosts.managementFeeMonthly, unit: "원/월" },
    { label: "인건비 가정", value: economic.inputs.fixedMonthlyCosts.laborMonthly, unit: "원/월" },
  ] : [];
  const decision = input.decision;
  const readiness = input.readinessSnapshot;
  const decisionDetails: CandidateCustomerReport["decision"] = decision ? {
    status: "AVAILABLE",
    verdict: decision.verdict,
    verdictLabel: HUMAN_DECISION_VERDICT_LABELS[decision.verdict],
    rationale: decision.rationale,
    positiveFactors: [...decision.support.positiveFactors],
    keyRisks: [...decision.support.keyRisks],
    unresolvedConditions: [...decision.support.unresolvedConditions],
    conditionsBeforeProceeding: [...decision.support.conditionsBeforeProceeding],
    landlordConfirmations: [...decision.support.landlordConfirmations],
    expertConfirmations: [...decision.support.expertConfirmations],
    nextActions: [...decision.support.nextActions],
    reviewerName: decision.reviewerName,
    decidedAt: decision.decidedAt,
  } : {
    status: "NOT_AVAILABLE", verdict: null, verdictLabel: "최종 판단 없음", rationale: null,
    positiveFactors: [], keyRisks: [], unresolvedConditions: [], conditionsBeforeProceeding: [],
    landlordConfirmations: [], expertConfirmations: [], nextActions: [], reviewerName: null, decidedAt: null,
  };

  const readinessRisks = readiness
    ? [...readiness.result.blockingIssues, ...readiness.result.reviewIssues, ...readiness.result.evidenceGaps].map((item) => item.message)
    : [];
  const keyRisks = [...decisionDetails.keyRisks, ...readinessRisks]
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 5);

  return {
    meta: {
      schemaVersion: CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION,
      reportStatus: reviewReasons.length === 0 ? "REPORT_READY" : "REPORT_REVIEW_REQUIRED",
      reviewReasons,
      caseId: input.caseRecord.caseId,
      candidateId: input.candidate.candidateId,
      generatedAt,
      decisionId: decision?.decisionId ?? null,
      readinessSnapshotId: readiness?.readinessSnapshotId ?? null,
      basisAt,
      decisionStale,
    },
    candidateSummary: {
      caseName: input.caseRecord.name,
      label: input.candidate.label,
      address: input.candidate.address ?? null,
      unit: input.candidate.unit ?? null,
      floor: input.candidate.propertyFacts.floor ?? null,
      exclusiveAreaSqm: input.candidate.propertyFacts.exclusiveAreaSqm ?? null,
      frontageM: input.candidate.propertyFacts.frontageM ?? null,
      parkingStatus: input.candidate.propertyFacts.parkingStatus ?? null,
      parkingNote: input.candidate.propertyFacts.parkingNote ?? null,
    },
    executiveSummary: {
      verdictLabel: decisionDetails.verdictLabel,
      readinessStatus: readiness?.result.readinessStatus ?? "자료 없음",
      keyRisks,
      conditionsBeforeProceeding: [...decisionDetails.conditionsBeforeProceeding],
      monthlyBepSales: economic?.bep.monthlyBepSales ?? null,
      baseMonthlySalesEstimate: economic?.scenarios.base.monthlySales ?? null,
    },
    locationMarket: {
      status: locationVersion && target ? "AVAILABLE" : "NOT_AVAILABLE",
      analysisTarget: locationVersion && target ? { label: target.label, address: target.address, radiusM: target.radiusM } : null,
      officialMarket: locationVersion && target?.officialReference ? {
        name: target.officialReference.marketName,
        code: target.officialReference.marketCode,
        relation: target.officialReference.spatialRelation,
      } : null,
      generatedAt: locationVersion?.generatedAt ?? null,
      features: (locationPresentation?.summary.confirmedFeatures ?? []).map((item) => item.message),
      metrics: locationMetrics,
      limitations: locationLimitations,
    },
    competition: competitionVersion ? {
      status: "AVAILABLE",
      generatedAt: competitionVersion.generatedAt,
      observationScope: "Kakao 지정 중심점·반경 검색 관측이며 전수조사가 아닙니다.",
      uniqueObservedCandidateCount: competitionVersion.result.kakaoObservation.uniqueObservedCandidateCount,
      officialStoreCount: competitionVersion.result.officialAreaReference.storeCount,
      officialReferencePeriod: competitionVersion.result.officialAreaReference.referencePeriod,
      distanceBands: competitionVersion.result.distanceBands.map((item) => ({ label: item.band, count: item.candidateCount })),
      warnings: [...competitionVersion.result.warnings],
    } : {
      status: "NOT_AVAILABLE", generatedAt: null, observationScope: null, uniqueObservedCandidateCount: null,
      officialStoreCount: null, officialReferencePeriod: null, distanceBands: [], warnings: [],
    },
    rentalMarket: rentalVersion ? {
      status: "AVAILABLE",
      generatedAt: rentalVersion.generatedAt,
      referenceDate: rentalVersion.result.analysis.referenceDate,
      sampleCount: rentalVersion.result.analysis.sampleCount,
      sampleSufficiency: rentalVersion.result.analysis.sampleSufficiency,
      deposit: { ...rentalVersion.result.analysis.deposit },
      rent: { ...rentalVersion.result.analysis.rent },
      maintenanceFee: { ...rentalVersion.result.analysis.managementFee },
      limitations: [...rentalVersion.result.analysis.limitations],
    } : {
      status: "NOT_AVAILABLE", generatedAt: null, referenceDate: null, sampleCount: null,
      sampleSufficiency: null, deposit: null, rent: null, maintenanceFee: null, limitations: [],
    },
    lease: {
      status: leaseRevision ? "AVAILABLE" : "NOT_AVAILABLE",
      assessmentId: sourceReferences.lease?.assessmentId ?? null,
      revisionId: leaseRevision?.revisionId ?? null,
      basisAt: leaseRevision?.recordedAt ?? null,
      reviewedTerms: leaseRevision ? { ...leaseRevision.reviewedTerms } : null,
      hard: reportRiskItems(leaseSummary.hardIssues),
      conditional: reportRiskItems(leaseSummary.conditionalIssues),
      unresolved: reportRiskItems(leaseSummary.unresolvedChecks),
      verifiedCount: leaseSummary.verifiedCount,
      checks: CANDIDATE_LEASE_CHECK_KEYS.map((key) => {
        const check = leaseRevision?.checks[key];
        return {
          label: CANDIDATE_LEASE_CHECK_LABELS[key],
          stateLabel: check ? LEASE_STATE_LABELS[check.state] : "확인 필요",
          verificationLabel: check ? verificationLabel(check.verificationStatus) : "자료 없음",
          note: check?.note ?? null,
          observedAt: check?.observedAt ?? null,
        };
      }),
    },
    facility: {
      status: facilityRevision ? "AVAILABLE" : "NOT_AVAILABLE",
      assessmentId: sourceReferences.facility?.assessmentId ?? null,
      revisionId: facilityRevision?.revisionId ?? null,
      basisAt: facilityRevision?.recordedAt ?? null,
      hard: reportRiskItems(facilitySummary.hardBlockers),
      conditional: reportRiskItems(facilitySummary.conditionalBlockers),
      unresolved: reportRiskItems(facilitySummary.unresolvedChecks),
      verifiedCount: facilitySummary.verifiedCount,
      checks: BAKERY_FACILITY_CHECK_KEYS.map((key) => {
        const check = facilityRevision?.checks[key];
        return {
          label: BAKERY_FACILITY_CHECK_LABELS[key],
          stateLabel: check ? FACILITY_STATE_LABELS[check.state] : "확인 필요",
          verificationLabel: check ? verificationLabel(check.verificationStatus) : "자료 없음",
          note: check?.note ?? null,
          observedAt: check?.observedAt ?? null,
        };
      }),
    },
    economics: economic && sourceReferences.economic ? {
      status: "AVAILABLE",
      generatedAt: economicVersion?.generatedAt ?? null,
      engineVersion: sourceReferences.economic.engineVersion,
      assumptionRevision: sourceReferences.economic.assumptionRevision,
      assumptions,
      scenarios: (Object.keys(scenarioLabels) as Array<keyof typeof scenarioLabels>).map((key) => ({
        label: scenarioLabels[key],
        monthlySales: economic.scenarios[key].monthlySales,
        estimatedOperatingProfit: economic.scenarios[key].estimatedOperatingProfit,
        rentBurdenRate: economic.scenarios[key].rentBurdenRate,
      })),
      bep: {
        monthlyBepSales: economic.bep.monthlyBepSales,
        dailyBepSales: economic.bep.dailyBepSales,
        requiredDailyTransactions: economic.bep.requiredDailyTransactionsForBep,
      },
      officialBenchmark: economic.officialBenchmark.status === "AVAILABLE" ? {
        label: economic.officialBenchmark.label,
        value: economic.officialBenchmark.value,
        period: economic.officialBenchmark.period,
        limitation: economic.officialBenchmark.limitation,
      } : null,
      limitations: [...economic.limitations],
    } : {
      status: "NOT_AVAILABLE", generatedAt: null, engineVersion: null, assumptionRevision: null,
      assumptions: [], scenarios: [], bep: null, officialBenchmark: null, limitations: [],
    },
    readiness: {
      status: readiness?.result.readinessStatus ?? "자료 없음",
      blockingIssues: readiness?.result.blockingIssues.map((item) => item.message) ?? [],
      reviewIssues: readiness?.result.reviewIssues.map((item) => item.message) ?? [],
      evidenceGaps: readiness?.result.evidenceGaps.map((item) => item.message) ?? [],
      nextActions: readiness ? [...readiness.result.nextActions] : [],
      evaluatedAt: readiness?.evaluatedAt ?? null,
      savedAt: readiness?.savedAt ?? null,
    },
    decision: decisionDetails,
    provenance: {
      decisionBasisSources: {
        facility: sourceReferences.facility ? { ...sourceReferences.facility } : null,
        lease: sourceReferences.lease ? { ...sourceReferences.lease } : null,
        analysisRun: sourceReferences.analysisRun ? { ...sourceReferences.analysisRun } : null,
        economic: sourceReferences.economic ? { ...sourceReferences.economic } : null,
        readinessSnapshot: readiness ? {
          readinessSnapshotId: readiness.readinessSnapshotId,
          savedAt: readiness.savedAt,
        } : null,
        humanDecision: decision ? {
          decisionId: decision.decisionId,
          decidedAt: decision.decidedAt,
          readinessSnapshotId: decision.basis.readinessSnapshotId,
        } : null,
      },
      contextualSources: {
        location: locationVersion && contextualAnalysisRunId
          ? { analysisRunId: contextualAnalysisRunId, generatedAt: locationVersion.generatedAt }
          : null,
        competition: competitionVersion && contextualAnalysisRunId
          ? { analysisRunId: contextualAnalysisRunId, generatedAt: competitionVersion.generatedAt }
          : null,
        rentalMarket: rentalVersion && contextualAnalysisRunId
          ? { analysisRunId: contextualAnalysisRunId, generatedAt: rentalVersion.generatedAt }
          : null,
      },
    },
    disclaimer: [
      "본 리포트는 제공된 자료와 확인된 근거를 바탕으로 한 점포개발 및 사업성 검토자료입니다.",
      "매출·수익·손익분기점 등은 가정과 입력자료에 따른 추정치이며 실제 결과를 보장하지 않습니다.",
      "법률·세무·인허가·건축물 용도·위생·소방·전기·배기·급배수 등은 계약 또는 공사 전에 관련 전문가와 관할기관의 최종 확인이 필요합니다.",
    ],
  };
}
