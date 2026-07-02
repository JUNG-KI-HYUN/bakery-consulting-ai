import Link from "next/link";
import { DiagnosisResult } from "@/lib/diagnosis/types";
import { DiagnosisReportDocument } from "./DiagnosisReportDocument";
import { PrintButton } from "./PrintButton";

export function DiagnosisReportPreview({ result }: { result: DiagnosisResult }) {
  return (
    <section className="panel-card space-y-4 rounded-2xl p-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1220]">
            고객용 리포트 미리보기
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            PDF 인쇄는 리포트 화면에서 가능합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/consultations/${result.id}`}
            className="btn-secondary"
          >
            상담 상세로 돌아가기
          </Link>
          <PrintButton />
        </div>
      </div>
      <DiagnosisReportDocument result={result} />
    </section>
  );
}
