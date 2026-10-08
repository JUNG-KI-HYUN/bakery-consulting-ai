import { notFound } from "next/navigation";
import { CaseDetailClient } from "@/components/cases/CaseDetailClient";
import { getCase } from "@/lib/cases/case-repository";
import { getAnalysisRunSnapshot } from "@/lib/analysis-runs/analysis-run-repository";
import { activeTargetFromSnapshot } from "@/lib/analysis-runs/analysis-run-snapshot";
import { listCandidateStoresByCase } from "@/lib/candidates/candidate-repository";
import { listCandidateCustomerReportSnapshotsByCase } from "@/lib/reports/candidate-customer-report-snapshot-repository";

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
  const [latestRun, candidates, reportSnapshots] = await Promise.all([
    latestRunId ? getAnalysisRunSnapshot(latestRunId) : null,
    listCandidateStoresByCase(record.caseId),
    listCandidateCustomerReportSnapshotsByCase(record.caseId),
  ]);
  return (
    <CaseDetailClient
      initialRecord={record}
      initialCandidates={candidates}
      latestAnalysisTarget={latestRun ? activeTargetFromSnapshot(latestRun.targetSnapshot) : null}
      issuedReports={reportSnapshots.map((snapshot) => ({
        reportSnapshotId: snapshot.reportSnapshotId,
        candidateId: snapshot.candidateId,
        candidateLabel: snapshot.materializedReport.candidateSummary.label,
        verdictLabel: snapshot.materializedReport.decision.verdictLabel,
        issuedAt: snapshot.issuedAt,
      }))}
    />
  );
}
