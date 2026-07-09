import Link from "next/link";
import { DiagnosisResult } from "@/lib/diagnosis/types";
import { InteriorSketchBoard } from "./InteriorSketchBoard";
import { ChecklistSection } from "./ChecklistSection";
import { RiskVerdictBadge } from "./RiskVerdictBadge";

function StartupCostSection({ result }: { result: DiagnosisResult }) {
  if (!result.startupCostResult || !result.startupCost) return null;

  const rows: [string, number, string?][] = [
    ["보증금", result.startupCostDeposit ?? 0],
    ["권리금", result.startupCostPremium ?? 0],
    ["인테리어비", result.startupCost.interiorCost],
    ["제조장비비", result.startupCost.productionEquipmentCost],
    ["판매장비비", result.startupCost.salesEquipmentCost],
    ["간판비", result.startupCost.signageCost],
    ["초도물품비", result.startupCost.initialSuppliesCost],
    ["인허가 관련비", result.startupCost.licenseRelatedCost, "전문가 확인 필요"],
    ["예비비", result.startupCost.reserveCost],
  ];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-[#0B1220]">창업비용 예상표</h3>
      <p className="text-sm text-slate-600">
        이 금액은 추정치이며 실제 비용은 시공사, 장비 견적, 현장 상황에 따라
        달라질 수 있습니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-4">항목</th>
              <th className="py-2 pr-4">금액(추정)</th>
              <th className="py-2">비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, amount, note]) => (
              <tr key={label} className="border-b border-slate-100">
                <td className="py-2 pr-4">{label}</td>
                <td className="py-2 pr-4">{Math.round(amount).toLocaleString()}원</td>
                <td className="py-2 text-xs text-amber-700">{note ?? ""}</td>
              </tr>
            ))}
            <tr className="font-semibold text-[#0B1220]">
              <td className="py-2 pr-4">총 창업비용(추정)</td>
              <td className="py-2 pr-4">
                {Math.round(result.startupCostResult.totalCost).toLocaleString()}원
              </td>
              <td className="py-2" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-1 text-sm text-slate-700 md:grid-cols-2">
        <p>창업예산: {(result.startupBudget ?? 0).toLocaleString()}원</p>
        <p>
          예산 대비 차액:{" "}
          {Math.round(result.startupCostResult.budgetDifference).toLocaleString()}원
        </p>
        <p>예산 초과율(추정): {result.startupCostResult.budgetOverRatePercent.toFixed(2)}%</p>
        <p>예비비 비율(추정): {result.startupCostResult.reserveRatePercent.toFixed(2)}%</p>
      </div>
      <p className="text-xs text-amber-700">
        인허가·소방·전기 관련 항목은 전문가 확인 필요
      </p>
    </section>
  );
}

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
          <p className="text-xs font-semibold text-[#2563EB]">진단 결과</p>
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
        <StartupCostSection result={result} />
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
