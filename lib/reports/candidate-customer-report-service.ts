import { getAnalysisRunSnapshot } from "../analysis-runs/analysis-run-repository";
import { getBakeryFacilityAssessment } from "../candidates/bakery-facility-assessment-repository";
import { getCandidateLeaseAssessment } from "../candidates/candidate-lease-assessment-repository";
import { getCandidateStore } from "../candidates/candidate-repository";
import {
  getCandidateContractReadinessSnapshot,
  getCandidateContractReadinessView,
} from "../candidates/contract-readiness-repository";
import { getCandidateHumanDecisionView } from "../candidates/human-decision-repository";
import { getCase } from "../cases/case-repository";
import {
  assembleCandidateCustomerReport,
  CandidateCustomerReportInputError,
} from "./candidate-customer-report";

export async function getCandidateCustomerReport(caseId: string, candidateId: string) {
  const [caseRecord, candidate] = await Promise.all([getCase(caseId), getCandidateStore(candidateId)]);
  if (!caseRecord || !candidate || candidate.caseId !== caseRecord.caseId) return null;

  const [decisionView, readinessView, facilityAssessment, leaseAssessment] = await Promise.all([
    getCandidateHumanDecisionView(candidateId, caseId),
    getCandidateContractReadinessView(candidateId, caseId),
    getBakeryFacilityAssessment(candidateId, caseId),
    getCandidateLeaseAssessment(candidateId, caseId),
  ]);
  const decision = decisionView.latestDecision;
  const readinessSnapshotId = decision?.basis.readinessSnapshotId
    ?? readinessView.latestSavedSnapshot?.readinessSnapshotId
    ?? null;
  const readinessSnapshot = readinessSnapshotId
    ? await getCandidateContractReadinessSnapshot(candidateId, caseId, readinessSnapshotId)
    : null;
  const analysisRunId = readinessSnapshot?.sourceReferences.analysisRun?.analysisRunId
    ?? (candidate.analysisLinks.length === 1 ? candidate.analysisLinks[0]?.analysisRunId ?? null : null);
  const analysisRun = analysisRunId ? await getAnalysisRunSnapshot(analysisRunId) : null;

  return assembleCandidateCustomerReport({
    caseRecord,
    candidate,
    decision,
    readinessSnapshot,
    currentReadiness: readinessView.currentEvaluation,
    facilityAssessment,
    leaseAssessment,
    analysisRun,
    generatedAt: new Date().toISOString(),
  });
}

export { CandidateCustomerReportInputError };
