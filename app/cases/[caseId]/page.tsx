import { notFound } from "next/navigation";
import { CaseDetailClient } from "@/components/cases/CaseDetailClient";
import { getCase } from "@/lib/cases/case-repository";
import { getAnalysisRunSnapshot } from "@/lib/analysis-runs/analysis-run-repository";
import { activeTargetFromSnapshot } from "@/lib/analysis-runs/analysis-run-snapshot";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const record = await getCase(caseId);
  if (!record) notFound();
  const latestRunId = record.analysisRunIds.at(-1) ?? null;
  const latestRun = latestRunId ? await getAnalysisRunSnapshot(latestRunId) : null;
  return (
    <CaseDetailClient
      initialRecord={record}
      latestAnalysisTarget={latestRun ? activeTargetFromSnapshot(latestRun.targetSnapshot) : null}
    />
  );
}
