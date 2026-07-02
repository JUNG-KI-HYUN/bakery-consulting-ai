import { notFound } from "next/navigation";
import { DiagnosisReportPreview } from "@/components/reports/DiagnosisReportPreview";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { mockAiDiagnosis } from "@/lib/diagnosis/mockAiDiagnosis";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getConsultationById(id);
  if (!record) return notFound();
  const diagnosis = mockAiDiagnosis(record);
  return <DiagnosisReportPreview result={diagnosis} />;
}
