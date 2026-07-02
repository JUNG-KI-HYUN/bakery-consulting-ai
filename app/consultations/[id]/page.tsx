import Link from "next/link";
import { notFound } from "next/navigation";
import { DiagnosisResultView } from "@/components/diagnosis/DiagnosisResultView";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { DiagnosisReportPreview } from "@/components/reports/DiagnosisReportPreview";
import { mockAiDiagnosis } from "@/lib/diagnosis/mockAiDiagnosis";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getConsultationById(id);
  if (!record) return notFound();
  const diagnosis = mockAiDiagnosis(record);

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {record.consultation.sampleData && (
              <span className="badge-sample">샘플 데이터</span>
            )}
            <h2 className="mt-2 text-xl font-bold text-[#0B1220]">
              {record.consultation.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {record.candidateStore.address}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              이 리포트는 계약 전 의사결정을 돕는 참고자료입니다.
            </p>
          </div>
          <RiskVerdictBadge verdict={diagnosis.verdict} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/reports/${id}`} className="btn-primary">
            고객용 리포트 보기
          </Link>
        </div>
      </section>
      <DiagnosisResultView result={diagnosis} consultationId={id} />
      <DiagnosisReportPreview result={diagnosis} />
    </div>
  );
}
