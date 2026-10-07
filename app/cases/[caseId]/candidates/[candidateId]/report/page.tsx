import { notFound } from "next/navigation";
import { CandidateCustomerReportDocument } from "@/components/reports/CandidateCustomerReportDocument";
import { getCandidateCustomerReport } from "@/lib/reports/candidate-customer-report-service";

export const dynamic = "force-dynamic";

export default async function CandidateCustomerReportPage({
  params,
}: {
  params: Promise<{ caseId: string; candidateId: string }>;
}) {
  const { caseId, candidateId } = await params;
  const report = await getCandidateCustomerReport(caseId, candidateId);
  if (!report) notFound();
  return <CandidateCustomerReportDocument report={report} />;
}
