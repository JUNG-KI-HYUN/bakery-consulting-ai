import Link from "next/link";
import { DiagnosisResult } from "@/lib/diagnosis/types";
import { InteriorSketchBoard } from "./InteriorSketchBoard";
import { ChecklistSection } from "./ChecklistSection";
import { RiskVerdictBadge } from "./RiskVerdictBadge";

export function DiagnosisResultView({
  result,
  consultationId,
}: {
  result: DiagnosisResult;
  consultationId?: string;
}) {
  const reportId = consultationId ?? result.id;

  return (
    <section className="panel-card space-y-5 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#2563EB]">STEP 5</p>
          <h2 className="text-lg font-bold text-[#0B1220]">
            AI 1차 점포진단 결과
          </h2>
        </div>
        <RiskVerdictBadge verdict={result.verdict} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/reports/${reportId}`} className="btn-primary">
          고객용 리포트 보기
        </Link>
        <span className="text-xs text-slate-500">
          PDF 인쇄는 리포트 화면에서 가능합니다.
        </span>
      </div>

      <ChecklistSection
        title="핵심 리스크"
        items={result.sections.keyRisks}
        highlight
      />

      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-[#0B1220]">
          왜 이 판단이 나왔는지
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-[#334155]">
          {result.reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          AI는 리스크를 빠르게 정리하고, 전문가가 최종 판단합니다.
        </p>
      </article>

      <section className="space-y-3 rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
        <h3 className="text-base font-semibold text-[#0B1220]">공간 활용 1차 의견</h3>
        <p className="text-sm text-slate-700">
          이 공간은 테이크아웃 중심으로 쓰면 무리가 적어 보입니다. 홀 좌석을 많이
          넣기보다는 쇼케이스와 픽업 동선을 우선 보는 편이 안전합니다.
        </p>
        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <article className="card">
            <h4 className="font-semibold">추천 인테리어 톤</h4>
            <p className="mt-1">{result.sections.interiorToneSuggestion}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">장비 배치 방향</h4>
            <p className="mt-1">{result.sections.equipmentPlacementIdea}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">쇼케이스/카운터 배치 의견</h4>
            <p className="mt-1">{result.sections.layoutIdea}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">홀 공간 활용 의견</h4>
            <p className="mt-1">{result.sections.hallUsageIdea}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">고객 동선 의견</h4>
            <p className="mt-1">{result.sections.customerFlowOpinion}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">직원 동선 의견</h4>
            <p className="mt-1">{result.sections.staffFlowOpinion}</p>
          </article>
          <article className="card md:col-span-2">
            <h4 className="font-semibold">확인 필요사항</h4>
            <p className="mt-1">{result.sections.interiorCheckRequired}</p>
          </article>
        </div>
      </section>

      <InteriorSketchBoard
        sketch={{
          interiorTone: result.sections.interiorToneSuggestion,
          operationType: result.sections.layoutIdea,
          showcasePosition: result.sections.equipmentPlacementIdea,
          counterPosition: result.sections.layoutIdea,
          kitchenPosition: result.sections.equipmentPlacementIdea,
          hallUsage: result.sections.hallUsageIdea,
          customerFlow: result.sections.customerFlowOpinion,
          staffFlow: result.sections.staffFlowOpinion,
          lowCostIdeas: result.sections.lowCostInteriorIdeas,
          checkRequired: result.sections.interiorCheckRequired,
        }}
      />

      <ChecklistSection
        title="계약 전 확인 질문"
        items={result.sections.preContractQuestions}
      />

      <div className="grid gap-3 text-sm text-[#334155] md:grid-cols-2">
        <article className="card">
          <h3 className="font-semibold">후보 점포 요약</h3>
          <p className="mt-1">{result.sections.candidateSummary}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">입지 분석</h3>
          <p className="mt-1">{result.sections.locationAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">임대차 조건 분석</h3>
          <p className="mt-1">{result.sections.leaseAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">시설·인허가 리스크</h3>
          <p className="mt-1">{result.sections.facilityRiskAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">도면 기반 매장세팅 가능성</h3>
          <p className="mt-1">{result.sections.layoutFeasibilityAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">손익분기점 분석</h3>
          <p className="mt-1">{result.sections.breakEvenAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">오픈 후 마케팅 가능성</h3>
          <p className="mt-1">{result.sections.marketingPotentialAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">최종 판단</h3>
          <p className="mt-1">{result.sections.finalJudgment}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">브랜드 스토리텔링 진단</h3>
          <p className="mt-1">{result.sections.brandStoryDirection}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">콘텐츠 가능성</h3>
          <p className="mt-1">{result.sections.marketingPotential}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">오픈 후 3개월 마케팅 플랜</h3>
          <p className="mt-1">{result.sections.threeMonthMarketingPlan}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">지역 키워드 전략</h3>
          <p className="mt-1">{result.sections.localKeywordStrategy}</p>
        </article>
        <article className="card md:col-span-2">
          <h3 className="font-semibold">리뷰·단골 확보 전략</h3>
          <p className="mt-1">{result.sections.reviewAndRegularCustomerStrategy}</p>
        </article>
        <article className="card md:col-span-2">
          <h3 className="font-semibold">저비용 인테리어 아이디어</h3>
          <p className="mt-1">{result.sections.lowCostInteriorIdeas}</p>
        </article>
      </div>
    </section>
  );
}
