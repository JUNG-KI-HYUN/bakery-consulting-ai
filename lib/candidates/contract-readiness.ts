import { isCanonicalAnalysisRunId } from "../analysis-runs/analysis-run-snapshot";
import { calculateBakeryFacilityRiskSummary } from "./bakery-facility-risk";
import { calculateCandidateLeaseRiskSummary } from "./candidate-lease-risk";
import { sameEconomicVersionIdentity } from "./candidate-economic-selection-contract";
import {
  CONTRACT_READINESS_RULE_VERSION,
  CONTRACT_READINESS_SCHEMA_VERSION,
  ContractReadinessInputError,
  type ContractReadinessInput,
  type ContractReadinessIssue,
  type ContractReadinessResult,
  type ContractReadinessSourceReferences,
} from "./contract-readiness-contract";

function requireIdentity(value: string, label: string) {
  if (!value.trim()) throw new ContractReadinessInputError(`${label}이 비어 있습니다.`);
}

function requireTimestamp(value: string, label: string) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new ContractReadinessInputError(`${label}이 유효한 시각이 아닙니다.`);
  }
}

function issue(code: string, source: ContractReadinessIssue["source"], message: string): ContractReadinessIssue {
  return { code, source, message };
}

function addUnique(items: string[], value: string) {
  if (!items.includes(value)) items.push(value);
}

function sameSnapshot(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function calculateContractReadiness(input: ContractReadinessInput): ContractReadinessResult {
  const { candidate, facilityAssessment, leaseAssessment, analysisRun } = input;
  requireIdentity(candidate.candidateId, "candidateId");
  requireIdentity(candidate.caseId, "caseId");
  requireTimestamp(input.evaluatedAt, "evaluatedAt");

  if (facilityAssessment && (facilityAssessment.candidateId !== candidate.candidateId || facilityAssessment.caseId !== candidate.caseId)) {
    throw new ContractReadinessInputError("다른 Candidate 또는 Case의 Facility Assessment를 결합할 수 없습니다.");
  }
  if (leaseAssessment && (leaseAssessment.candidateId !== candidate.candidateId || leaseAssessment.caseId !== candidate.caseId)) {
    throw new ContractReadinessInputError("다른 Candidate 또는 Case의 Lease Assessment를 결합할 수 없습니다.");
  }

  const blockingIssues: ContractReadinessIssue[] = [];
  const reviewIssues: ContractReadinessIssue[] = [];
  const evidenceGaps: ContractReadinessIssue[] = [];
  const nextActions: string[] = [];
  const sourceReferences: ContractReadinessSourceReferences = {
    facility: null,
    lease: null,
    analysisRun: null,
    economic: null,
  };

  if (!facilityAssessment) {
    evidenceGaps.push(issue("FACILITY_ASSESSMENT_MISSING", "FACILITY", "시설 검토가 없습니다."));
    addUnique(nextActions, "시설 검토를 생성하고 필수 항목을 확인합니다.");
  } else {
    const revision = facilityAssessment.revisions.at(-1);
    if (!revision) {
      evidenceGaps.push(issue("FACILITY_REVISION_MISSING", "FACILITY", "시설 검토의 기준 revision을 확인할 수 없습니다."));
      addUnique(nextActions, "시설 검토 revision을 확인합니다.");
    } else {
      sourceReferences.facility = {
        assessmentId: facilityAssessment.assessmentId,
        revisionId: revision.revisionId,
        recordedAt: revision.recordedAt,
        updatedAt: facilityAssessment.updatedAt,
      };
      if (!sameSnapshot(revision.checks, facilityAssessment.checks)) {
        reviewIssues.push(issue("FACILITY_REVISION_MISMATCH", "FACILITY", "현재 시설 검토값과 최신 revision이 일치하지 않습니다."));
        addUnique(nextActions, "시설 검토값과 최신 revision을 확인합니다.");
      }
    }
    const summary = calculateBakeryFacilityRiskSummary(facilityAssessment);
    for (const item of summary.hardBlockers) {
      blockingIssues.push(issue(`FACILITY_HARD_${item.key}`, "FACILITY", `${item.label}: ${item.reason}`));
    }
    for (const item of summary.conditionalBlockers) {
      reviewIssues.push(issue(`FACILITY_CONDITIONAL_${item.key}`, "FACILITY", `${item.label}: ${item.reason}`));
      if (item.nextAction) addUnique(nextActions, item.nextAction);
    }
    for (const item of summary.unresolvedChecks) {
      evidenceGaps.push(issue(`FACILITY_UNRESOLVED_${item.key}`, "FACILITY", `${item.label}: ${item.reason}`));
      if (item.nextAction) addUnique(nextActions, item.nextAction);
    }
  }

  if (!leaseAssessment) {
    evidenceGaps.push(issue("LEASE_ASSESSMENT_MISSING", "LEASE", "임대차 검토가 없습니다."));
    addUnique(nextActions, "임대차 검토를 생성하고 계약 전 확인항목을 검토합니다.");
  } else {
    const revision = leaseAssessment.revisions.at(-1);
    if (!revision) {
      evidenceGaps.push(issue("LEASE_REVISION_MISSING", "LEASE", "임대차 검토의 기준 revision을 확인할 수 없습니다."));
      addUnique(nextActions, "임대차 검토 revision을 확인합니다.");
    } else {
      sourceReferences.lease = {
        assessmentId: leaseAssessment.assessmentId,
        revisionId: revision.revisionId,
        recordedAt: revision.recordedAt,
        updatedAt: leaseAssessment.updatedAt,
      };
      if (!sameSnapshot(revision.reviewedTerms, leaseAssessment.reviewedTerms) || !sameSnapshot(revision.checks, leaseAssessment.checks)) {
        reviewIssues.push(issue("LEASE_REVISION_MISMATCH", "LEASE", "현재 임대차 검토값과 최신 revision이 일치하지 않습니다."));
        addUnique(nextActions, "임대차 검토값과 최신 revision을 확인합니다.");
      }
    }
    const summary = calculateCandidateLeaseRiskSummary(leaseAssessment);
    for (const item of summary.hardIssues) {
      blockingIssues.push(issue(`LEASE_HARD_${item.key}`, "LEASE", `${item.label}: ${item.reason}`));
    }
    for (const item of summary.conditionalIssues) {
      reviewIssues.push(issue(`LEASE_CONDITIONAL_${item.key}`, "LEASE", `${item.label}: ${item.reason}`));
      if (item.nextAction) addUnique(nextActions, item.nextAction);
    }
    for (const item of summary.unresolvedChecks) {
      evidenceGaps.push(issue(`LEASE_UNRESOLVED_${item.key}`, "LEASE", `${item.label}: ${item.reason}`));
      if (item.nextAction) addUnique(nextActions, item.nextAction);
    }
  }

  const selectedLink = candidate.analysisLinks.length === 1 ? candidate.analysisLinks[0] : null;
  if (candidate.analysisLinks.length === 0) {
    evidenceGaps.push(issue("ANALYSIS_RUN_LINK_MISSING", "ANALYSIS_RUN", "Candidate에 연결된 Analysis Run이 없습니다."));
    addUnique(nextActions, "Candidate에 저장된 Analysis Run을 연결합니다.");
  } else if (candidate.analysisLinks.length > 1) {
    reviewIssues.push(issue("ANALYSIS_RUN_SELECTION_AMBIGUOUS", "ANALYSIS_RUN", "연결된 Analysis Run이 여러 개이며 현재 선택 기준이 없습니다."));
    addUnique(nextActions, "계약 검토에 사용할 Analysis Run을 명시적으로 선택합니다.");
  } else if (!isCanonicalAnalysisRunId(selectedLink?.analysisRunId)) {
    evidenceGaps.push(issue("ANALYSIS_RUN_ID_INVALID", "ANALYSIS_RUN", "연결된 Analysis Run ID가 canonical 형식이 아닙니다."));
    addUnique(nextActions, "유효한 canonical Analysis Run 연결을 확인합니다.");
  }

  if (selectedLink && isCanonicalAnalysisRunId(selectedLink.analysisRunId)) {
    if (!analysisRun) {
      evidenceGaps.push(issue("ANALYSIS_RUN_NOT_FOUND", "ANALYSIS_RUN", "연결된 persisted Analysis Run을 조회하지 못했습니다."));
      addUnique(nextActions, "연결된 Analysis Run snapshot의 저장 상태를 확인합니다.");
    } else if (
      analysisRun.analysisRunId !== selectedLink.analysisRunId
      || analysisRun.targetSnapshot.analysisRunId !== selectedLink.analysisRunId
    ) {
      reviewIssues.push(issue("ANALYSIS_RUN_BINDING_MISMATCH", "ANALYSIS_RUN", "Candidate 연결과 persisted Analysis Run identity가 일치하지 않습니다."));
      addUnique(nextActions, "Candidate와 Analysis Run 연결 identity를 검토합니다.");
    } else {
      sourceReferences.analysisRun = {
        analysisRunId: analysisRun.analysisRunId,
        linkedAt: selectedLink.linkedAt,
        snapshotUpdatedAt: analysisRun.updatedAt,
      };
      if (!sameSnapshot(selectedLink.targetSnapshot, analysisRun.targetSnapshot)) {
        reviewIssues.push(issue("ANALYSIS_RUN_TARGET_VERSION_MISMATCH", "ANALYSIS_RUN", "Candidate 연결 당시 target snapshot과 현재 persisted snapshot이 일치하지 않습니다."));
        addUnique(nextActions, "Analysis Run target 버전과 Candidate 연결 기준을 검토합니다.");
      }

      const economicVersions = analysisRun.sections.economic?.versions ?? [];
      let economic = economicVersions.length === 1 ? economicVersions[0] : null;
      if (economicVersions.length === 0) {
        evidenceGaps.push(issue("ECONOMIC_SNAPSHOT_MISSING", "ECONOMIC", "persisted Economic Snapshot이 없습니다."));
        addUnique(nextActions, "연결된 Analysis Run의 경제성 분석 결과를 저장합니다.");
      } else if (economicVersions.length > 1) {
        const selection = input.economicSelection;
        if (!selection) {
          evidenceGaps.push(issue("ECONOMIC_VERSION_SELECTION_REQUIRED", "ECONOMIC", "Economic version이 여러 개이며 계약 검토에 사용할 version이 선택되지 않았습니다."));
          addUnique(nextActions, "계약 검토에 사용할 Economic version을 명시적으로 선택합니다.");
        } else if (selection.candidateId !== candidate.candidateId || selection.caseId !== candidate.caseId) {
          reviewIssues.push(issue("ECONOMIC_SELECTION_OWNERSHIP_MISMATCH", "ECONOMIC", "Economic version 선택의 Candidate 또는 Case 귀속이 일치하지 않습니다."));
          addUnique(nextActions, "Economic version 선택의 Candidate와 Case 귀속을 확인합니다.");
        } else if (selection.analysisRunId !== analysisRun.analysisRunId) {
          reviewIssues.push(issue("ECONOMIC_SELECTION_RUN_MISMATCH", "ECONOMIC", "Economic version 선택의 Analysis Run이 현재 연결과 일치하지 않습니다."));
          addUnique(nextActions, "현재 Analysis Run에 속한 Economic version을 다시 선택합니다.");
        } else {
          const matches = economicVersions.filter((version) => sameEconomicVersionIdentity({
            analysisRunId: version.binding.analysisRunId,
            generatedAt: version.generatedAt,
            assumptionRevision: version.binding.assumptionRevision,
            engineVersion: version.result.metadata.engineVersion,
          }, selection));
          if (matches.length !== 1) {
            reviewIssues.push(issue("ECONOMIC_VERSION_SELECTION_INVALID", "ECONOMIC", "선택한 Economic version identity가 현재 Analysis Run에서 유일하게 확인되지 않습니다."));
            addUnique(nextActions, "현재 Analysis Run에 존재하는 Economic version을 다시 선택합니다.");
          } else {
            economic = matches[0];
          }
        }
      }
      if (economic) {
        sourceReferences.economic = {
          analysisRunId: economic.binding.analysisRunId,
          generatedAt: economic.generatedAt,
          assumptionRevision: economic.binding.assumptionRevision,
          engineVersion: economic.result.metadata.engineVersion,
        };
        if (economic.binding.analysisRunId !== analysisRun.analysisRunId) {
          reviewIssues.push(issue("ECONOMIC_RUN_BINDING_MISMATCH", "ECONOMIC", "Economic Snapshot의 Analysis Run binding이 일치하지 않습니다."));
          addUnique(nextActions, "Economic Snapshot의 Analysis Run binding을 검토합니다.");
        }
        const expectedOfficialCode = analysisRun.targetSnapshot.officialReference?.marketCode ?? null;
        const economicOfficialCode = economic.binding.officialBenchmarkIdentity?.officialMarketCode ?? null;
        if (economicOfficialCode !== null && economicOfficialCode !== expectedOfficialCode) {
          reviewIssues.push(issue("ECONOMIC_OFFICIAL_BINDING_MISMATCH", "ECONOMIC", "Economic Snapshot의 공식상권 기준이 Analysis Run과 일치하지 않습니다."));
          addUnique(nextActions, "Economic Snapshot의 공식상권 기준을 검토합니다.");
        }
        if (!Number.isInteger(economic.binding.assumptionRevision) || economic.binding.assumptionRevision < 0) {
          reviewIssues.push(issue("ECONOMIC_ASSUMPTION_REVISION_INVALID", "ECONOMIC", "Economic 가정 revision이 유효하지 않습니다."));
          addUnique(nextActions, "Economic 가정 revision을 확인합니다.");
        }
        if (economic.generatedAt !== economic.result.metadata.generatedAt) {
          reviewIssues.push(issue("ECONOMIC_GENERATED_AT_MISMATCH", "ECONOMIC", "Economic Snapshot과 계산결과의 기준시각이 일치하지 않습니다."));
          addUnique(nextActions, "Economic 결과의 생성시각과 snapshot 기준을 검토합니다.");
        }
        if (economic.result.schemaVersion !== "frameone.economic-feasibility.v1" || economic.result.metadata.engineVersion !== "economic-feasibility-v1") {
          reviewIssues.push(issue("ECONOMIC_RESULT_VERSION_INVALID", "ECONOMIC", "Economic 결과 schema 또는 engine version을 확인할 수 없습니다."));
          addUnique(nextActions, "Economic 결과 버전을 확인합니다.");
        }
        for (const message of economic.result.validation.errors) {
          reviewIssues.push(issue("ECONOMIC_VALIDATION_ERROR", "ECONOMIC", message));
        }
        if (economic.result.validation.errors.length > 0) {
          addUnique(nextActions, "Economic 입력 오류를 해소하고 결과를 다시 검증합니다.");
        }
        if (economic.result.bep.monthlyBepSales === null || economic.result.bep.dailyBepSales === null) {
          evidenceGaps.push(issue("ECONOMIC_BEP_NOT_AVAILABLE", "ECONOMIC", "저장된 Economic 결과에서 BEP를 확인할 수 없습니다."));
          addUnique(nextActions, "Economic 입력을 확인하여 BEP가 계산 가능한지 검토합니다.");
        }
        if (leaseAssessment) {
          const rent = leaseAssessment.reviewedTerms.monthlyRentWon;
          const managementFee = leaseAssessment.reviewedTerms.maintenanceFeeWon;
          if (rent === undefined) {
            evidenceGaps.push(issue("LEASE_RENT_NOT_REVIEWED", "LEASE", "검토된 월세가 없어 Economic 임대료 가정과 대조할 수 없습니다."));
            addUnique(nextActions, "검토된 월세를 확인합니다.");
          } else if (rent !== economic.result.inputs.fixedMonthlyCosts.rentMonthly) {
            reviewIssues.push(issue("ECONOMIC_RENT_MISMATCH", "ECONOMIC", "검토된 월세와 Economic 임대료 가정이 일치하지 않습니다."));
            addUnique(nextActions, "검토된 월세와 Economic 임대료 가정을 일치시킵니다.");
          }
          if (managementFee === undefined) {
            evidenceGaps.push(issue("LEASE_MANAGEMENT_FEE_NOT_REVIEWED", "LEASE", "검토된 관리비가 없어 Economic 관리비 가정과 대조할 수 없습니다."));
            addUnique(nextActions, "검토된 관리비를 확인합니다.");
          } else if (managementFee !== economic.result.inputs.fixedMonthlyCosts.managementFeeMonthly) {
            reviewIssues.push(issue("ECONOMIC_MANAGEMENT_FEE_MISMATCH", "ECONOMIC", "검토된 관리비와 Economic 관리비 가정이 일치하지 않습니다."));
            addUnique(nextActions, "검토된 관리비와 Economic 관리비 가정을 일치시킵니다.");
          }
        }
      }
    }
  }

  const readinessStatus = blockingIssues.length > 0
    ? "BLOCKED"
    : reviewIssues.length > 0 || evidenceGaps.length > 0
      ? "REVIEW_REQUIRED"
      : "READY";

  return {
    schemaVersion: CONTRACT_READINESS_SCHEMA_VERSION,
    ruleVersion: CONTRACT_READINESS_RULE_VERSION,
    candidateId: candidate.candidateId,
    caseId: candidate.caseId,
    readinessStatus,
    blockingIssues,
    reviewIssues,
    evidenceGaps,
    nextActions,
    sourceReferences,
    evaluatedAt: new Date(input.evaluatedAt).toISOString(),
  };
}
