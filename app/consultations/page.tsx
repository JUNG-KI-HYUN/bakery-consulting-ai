import Link from "next/link";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { getConsultations } from "@/lib/diagnosis/diagnosis-service";
import { mockAiDiagnosis } from "@/lib/diagnosis/mockAiDiagnosis";

export default async function ConsultationsPage() {
  const list = await getConsultations();

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-2xl p-5">
        <h2 className="text-xl font-bold text-[#0B1220]">상담 목록</h2>
        <p className="mt-2 text-sm text-[#334155]">
          후보 점포별 진단 현황을 확인하고, 고객용 리포트로 바로 연결합니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          좋은 창업은 감이 아니라, 계약 전 검증에서 시작됩니다.
        </p>
        <Link href="/consultations/new" className="btn-primary mt-4">
          AI 점포진단 시작하기
        </Link>
      </section>

      <p className="text-xs text-amber-700">
        ※ 샘플 데이터는 실제 주소/매출 정보가 아닙니다.
      </p>

      <div className="space-y-4">
        {list.map((item) => {
          const diagnosis = mockAiDiagnosis(item);
          return (
            <article
              key={item.consultation.id}
              className="panel-card rounded-2xl p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {item.consultation.sampleData && (
                    <span className="badge-sample">샘플 데이터</span>
                  )}
                  <h3 className="mt-2 text-lg font-bold text-[#0B1220]">
                    {item.consultation.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.candidateStore.address}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      희망지역: {item.consultation.preferredArea}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      매장형태: {item.consultation.storeType}
                    </span>
                  </div>
                </div>
                <RiskVerdictBadge verdict={diagnosis.verdict} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/consultations/${item.consultation.id}`}
                  className="btn-primary"
                >
                  상세 보기
                </Link>
                <Link
                  href={`/reports/${item.consultation.id}`}
                  className="btn-outline"
                >
                  리포트 보기
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
