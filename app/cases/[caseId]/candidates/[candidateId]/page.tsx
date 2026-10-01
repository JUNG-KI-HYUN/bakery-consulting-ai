import { notFound } from "next/navigation";
import { CandidateStoreDetailClient } from "@/components/candidates/CandidateStoreDetailClient";
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
  return <CandidateStoreDetailClient initialRecord={candidate} caseName={caseRecord.name} />;
}
