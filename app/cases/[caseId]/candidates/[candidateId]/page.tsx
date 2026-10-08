import { notFound } from "next/navigation";
import { CandidateStoreDetailClient } from "@/components/candidates/CandidateStoreDetailClient";
import { getBakeryFacilityAssessment } from "@/lib/candidates/bakery-facility-assessment-repository";
import { getCandidateLeaseAssessment } from "@/lib/candidates/candidate-lease-assessment-repository";
import { getCandidateStore } from "@/lib/candidates/candidate-repository";
import { getCandidateContractReadinessView } from "@/lib/candidates/contract-readiness-repository";
import { getCandidateHumanDecisionView } from "@/lib/candidates/human-decision-repository";
import { getCandidateEconomicSelectionView } from "@/lib/candidates/candidate-economic-selection-repository";
import { getCase } from "@/lib/cases/case-repository";

export const dynamic = "force-dynamic";

export default async function CandidateStoreDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; candidateId: string }>;
}) {
  const { caseId, candidateId } = await params;
  const [caseRecord, candidate] = await Promise.all([
    getCase(caseId),
    getCandidateStore(candidateId),
  ]);
  if (!caseRecord || !candidate || candidate.caseId !== caseRecord.caseId) notFound();
  const [facilityAssessment, leaseAssessment, economicSelectionView, readinessView, decisionView] = await Promise.all([
    getBakeryFacilityAssessment(candidate.candidateId, caseRecord.caseId),
    getCandidateLeaseAssessment(candidate.candidateId, caseRecord.caseId),
    getCandidateEconomicSelectionView(candidate.candidateId, caseRecord.caseId),
    getCandidateContractReadinessView(candidate.candidateId, caseRecord.caseId),
    getCandidateHumanDecisionView(candidate.candidateId, caseRecord.caseId),
  ]);
  return <CandidateStoreDetailClient initialRecord={candidate} initialFacilityAssessment={facilityAssessment} initialLeaseAssessment={leaseAssessment} initialEconomicSelectionView={economicSelectionView} initialReadinessView={readinessView} initialDecisionView={decisionView} caseName={caseRecord.name} />;
}
