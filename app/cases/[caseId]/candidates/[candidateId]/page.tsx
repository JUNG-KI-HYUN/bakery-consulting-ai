import { notFound } from "next/navigation";
import { CandidateStoreDetailClient } from "@/components/candidates/CandidateStoreDetailClient";
import { getBakeryFacilityAssessment } from "@/lib/candidates/bakery-facility-assessment-repository";
import { getCandidateLeaseAssessment } from "@/lib/candidates/candidate-lease-assessment-repository";
import { getCandidateStore } from "@/lib/candidates/candidate-repository";
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
  const [facilityAssessment, leaseAssessment] = await Promise.all([
    getBakeryFacilityAssessment(candidate.candidateId, caseRecord.caseId),
    getCandidateLeaseAssessment(candidate.candidateId, caseRecord.caseId),
  ]);
  return <CandidateStoreDetailClient initialRecord={candidate} initialFacilityAssessment={facilityAssessment} initialLeaseAssessment={leaseAssessment} caseName={caseRecord.name} />;
}
