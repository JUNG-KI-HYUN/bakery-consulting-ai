import { notFound } from "next/navigation";
import { CandidateStoreDetailClient } from "@/components/candidates/CandidateStoreDetailClient";
import { getBakeryFacilityAssessment } from "@/lib/candidates/bakery-facility-assessment-repository";
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
  const facilityAssessment = await getBakeryFacilityAssessment(candidate.candidateId, caseRecord.caseId);
  return <CandidateStoreDetailClient initialRecord={candidate} initialFacilityAssessment={facilityAssessment} caseName={caseRecord.name} />;
}
