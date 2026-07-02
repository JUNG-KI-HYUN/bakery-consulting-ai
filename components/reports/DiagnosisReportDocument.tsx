import { DiagnosisResult } from "@/lib/diagnosis/types";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { InteriorSketchReportSection } from "./InteriorSketchReportSection";

export function DiagnosisReportDocument({ result }: { result: DiagnosisResult }) {
  return (
    <article className="report-doc space-y-6 text-[#0B1220]">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#FFF7ED] p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
          FrameOne Bakery Consulting AI
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          베이커리 창업 점포진단 리포트
        </h1>
        <p className="mt-2 text-sm text-[#334155]">
          계약 전 확인해야 할 입지·시설·손익 리스크를 정리한 참고용 진단자료
        </p>
        <p className="mt-3 text-sm font-medium text-[#0B1220]">
          좋은 창업은 감이 아니라 검증에서 시작됩니다.
        </p>
        <div className="mt-4">
          <RiskVerdictBadge verdict={result.verdict} />
        </div>
      </section>

      <section>
        <h2 className="font-semibold">후보 점포 요약</h2>
        <p className="mt-1 text-sm">{result.sections.candidateSummary}</p>
      </section>
      <section>
        <h2 className="font-semibold">핵심 리스크</h2>
        <ul className="mt-1 text-sm">
          {result.sections.keyRisks.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">입지 분석</h2>
        <p className="mt-1 text-sm">{result.sections.locationAnalysis}</p>
      </section>
      <section>
        <h2 className="font-semibold">임대차 조건 분석</h2>
        <p className="mt-1 text-sm">{result.sections.leaseAnalysis}</p>
      </section>
      <section>
        <h2 className="font-semibold">시설·장비 리스크</h2>
        <p className="mt-1 text-sm">{result.sections.facilityRiskAnalysis}</p>
      </section>
      <section>
        <h2 className="font-semibold">도면 기반 매장세팅 검토</h2>
        <p className="mt-1 text-sm">{result.sections.layoutFeasibilityAnalysis}</p>
      </section>
      <section>
        <h2 className="font-semibold">손익분기점 분석</h2>
        <p className="mt-1 text-sm">{result.sections.breakEvenAnalysis}</p>
      </section>
      <section>
        <h2 className="font-semibold">오픈 후 3개월 마케팅 플랜</h2>
        <p className="mt-1 text-sm">{result.sections.marketingPotentialAnalysis}</p>
      </section>
      <section>
        <h2 className="font-semibold">브랜드 스토리텔링 방향</h2>
        <p className="mt-1 text-sm">{result.sections.brandStoryDirection}</p>
      </section>
      <section>
        <h2 className="font-semibold">대표 고객층 및 시그니처 메뉴 제안</h2>
        <p className="mt-1 text-sm">{result.sections.reviewAndRegularCustomerStrategy}</p>
      </section>
      <section>
        <h2 className="font-semibold">지역 키워드 콘텐츠 전략</h2>
        <p className="mt-1 text-sm">{result.sections.localKeywordStrategy}</p>
      </section>
      <section>
        <h2 className="font-semibold">오픈 후 3개월 마케팅 플랜 (실행안)</h2>
        <p className="mt-1 text-sm">{result.sections.threeMonthMarketingPlan}</p>
      </section>
      <section>
        <h2 className="font-semibold">리뷰·단골 확보 전략</h2>
        <p className="mt-1 text-sm">{result.sections.marketingPotential}</p>
      </section>
      <InteriorSketchReportSection result={result} />
      <section>
        <h2 className="font-semibold">최종 판단</h2>
        <p className="mt-1 text-sm">{result.sections.finalJudgment}</p>
      </section>
      <section>
        <h2 className="font-semibold">계약 전 확인 질문</h2>
        <ul className="mt-1 text-sm">
          {result.sections.preContractQuestions.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p>본 리포트는 창업 성공을 보장하지 않습니다.</p>
        <p className="mt-1">
          매출·수익·권리금 회수기간은 추정치이며, 실제 결과와 다를 수 있습니다.
        </p>
        <p className="mt-1">
          본 마케팅 플랜은 매출을 보장하지 않으며, 오픈 초기 고객 유입 가능성을
          높이기 위한 실행 참고안입니다.
        </p>
        <p className="mt-1">
          법률·세무·인허가·위생·소방·전기·배기·급배수는 반드시 전문가 확인이
          필요합니다.
        </p>
        <p className="mt-1">
          이 리포트는 계약 전 의사결정을 돕는 참고자료입니다.
        </p>
      </section>
    </article>
  );
}
