import { notFound } from "next/navigation";
import { CandidateCustomerReportDocument } from "@/components/reports/CandidateCustomerReportDocument";
import { CandidateCustomerReportIssuePanel } from "@/components/reports/CandidateCustomerReportIssuePanel";
import { getCandidateCustomerReport } from "@/lib/reports/candidate-customer-report-service";
import { getCandidateCustomerReportSnapshotView } from "@/lib/reports/candidate-customer-report-snapshot-repository";

export const dynamic = "force-dynamic";

export default async function CandidateCustomerReportPage({
  params,
}: {
  params: Promise<{ caseId: string; candidateId: string }>;
}) {
  const { caseId, candidateId } = await params;
  const report = await getCandidateCustomerReport(caseId, candidateId);
  if (!report) notFound();
  const snapshotView = await getCandidateCustomerReportSnapshotView(candidateId, caseId);
  const latest = snapshotView.latestSnapshot;
  return (
    <>
      <CandidateCustomerReportIssuePanel
        caseId={caseId}
        candidateId={candidateId}
        reportStatus={report.meta.reportStatus}
        reviewReasons={report.meta.reviewReasons}
        initialLatestSnapshot={latest ? {
          reportSnapshotId: latest.reportSnapshotId,
          issuedAt: latest.issuedAt,
          verdictLabel: latest.materializedReport.decision.verdictLabel,
        } : null}
        initialSnapshotCount={snapshotView.snapshotCount}
      />
      <CandidateCustomerReportDocument report={report} />
    </>
  );
}
