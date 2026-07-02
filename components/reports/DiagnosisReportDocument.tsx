import { DiagnosisResult } from "@/lib/diagnosis/types";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { InteriorSketchReportSection } from "./InteriorSketchReportSection";

export function DiagnosisReportDocument({ result }: { result: DiagnosisResult }) {
  const risks = result.sections.keyRisks ?? [];
  const topRisks = risks.slice(0, 5);
  const monthlyBreakEven = Number.isFinite(result.breakEvenResult?.breakEvenSales)
    ? Math.round(result.breakEvenResult.breakEvenSales).toLocaleString()
    : "확인 필요";
  const monthlyProfit = Number.isFinite(result.breakEvenResult?.estimatedMonthlyNetProfit)
    ? Math.round(result.breakEvenResult.estimatedMonthlyNetProfit).toLocaleString()
    : "확인 필요";
  const rentBurdenRate = Number.isFinite(result.breakEvenResult?.rentBurdenRate)
    ? `${result.breakEvenResult.rentBurdenRate.toFixed(1)}%`
    : "확인 필요";
  const recoveryMonths =
    typeof result.breakEvenResult?.premiumRecoveryMonths === "number"
      ? `${result.breakEvenResult.premiumRecoveryMonths.toFixed(1)}개월`
      : "확인 필요";

  const riskStatus = (text: string) => {
    if (/위험|불가|초과/.test(text)) return "위험";
    if (/보류|주의|불확실/.test(text)) return "주의";
    if (/확인/.test(text)) return "확인 필요";
    return "양호";
  };

  const riskStatusClass: Record<string, string> = {
    위험: "bg-red-100 text-red-700 border-red-200",
    주의: "bg-amber-100 text-amber-700 border-amber-200",
    "확인 필요": "bg-slate-100 text-slate-700 border-slate-200",
    양호: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  return (
    <article className="report-doc space-y-6 text-[#0B1220]">
      <section className="print-card rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#FFF7ED] p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
          FrameOne Bakery Consulting AI
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          이 점포, 계약해도 괜찮을까요?
        </h1>
        <p className="mt-2 text-sm text-[#334155]">
          {result.sections.candidateSummary || "계약 전 핵심 항목을 먼저 점검해보는 리포트입니다."}
        </p>
        <p className="mt-3 text-sm font-medium text-[#0B1220]">
          AI가 먼저 정리하고, 전문가가 최종 확인합니다.
        </p>
        <div className="mt-4">
          <RiskVerdictBadge verdict={result.verdict} />
        </div>
      </section>

      <section className="print-card grid gap-3 md:grid-cols-4">
        {[
          {
            title: "계약 판단",
            status: result.verdict,
            desc: "현재 입력값 기준 1차 판단입니다.",
          },
          {
            title: "시설 리스크",
            status:
              topRisks.find((r) => /전기|배기|급배수|소방|위생|인허가/.test(r))
                ? "확인 필요"
                : "양호",
            desc: "전기·배기·급배수·소방·위생은 전문가 확인 필요",
          },
          {
            title: "월세 부담",
            status: rentBurdenRate === "확인 필요" ? "확인 필요" : "주의",
            desc: `월세 부담률(추정치): ${rentBurdenRate}`,
          },
          {
            title: "공간 활용",
            status: result.sections.interiorCheckRequired ? "확인 필요" : "양호",
            desc: "정식 설계 전 1차 스케치 의견입니다.",
          },
        ].map((card) => (
          <article key={card.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{card.title}</p>
            <p className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStatusClass[card.status] ?? riskStatusClass["확인 필요"]}`}>
              {card.status}
            </p>
            <p className="mt-2 text-sm text-slate-700">{card.desc}</p>
          </article>
        ))}
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">핵심 리스크 TOP 5</h2>
        <p className="mt-1 text-sm text-slate-600">
          좋아 보이는 점포도 계약 전 확인할 게 많습니다. 확인 전에는 계약을 서두르지 않는 것이 안전합니다.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(topRisks.length > 0 ? topRisks : ["핵심 리스크 정보가 부족하여 확인 필요"]).map((item) => {
            const status = riskStatus(item);
            return (
              <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className={`mr-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${riskStatusClass[status]}`}>
                  {status}
                </span>
                {item}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          베이커리는 시설에서 많이 막힙니다. 전기·배기·급배수·소방·위생·인허가 항목은 전문가 확인 필요입니다.
        </p>
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">시설·장비 체크 요약</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            ["전기/배기/급배수", "확인 필요", "전문가 확인 필요"],
            ["소방/위생/인허가", "확인 필요", "전문가 확인 필요"],
            ["제조공간/장비 반입", "주의", result.sections.layoutFeasibilityAnalysis || "확인 필요"],
            ["쇼케이스/판매 동선", "주의", result.sections.equipmentPlacementIdea || "확인 필요"],
          ].map(([name, status, desc]) => (
            <article key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">{name}</p>
              <p className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${riskStatusClass[status]}`}>
                {status}
              </p>
              <p className="mt-1 text-sm text-slate-700">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">손익분기점 요약 (추정치)</h2>
        <p className="mt-1 text-sm text-slate-600">
          이 월세를 매달 버틸 수 있을지 계산해봅니다. 현재 입력값 기준 추정치입니다.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">손익분기 매출(추정치)</p>
            <p className="mt-1 font-semibold">{monthlyBreakEven}원</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">월순이익(추정치)</p>
            <p className="mt-1 font-semibold">{monthlyProfit}원</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">월세 부담률(추정치)</p>
            <p className="mt-1 font-semibold">{rentBurdenRate}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-3">
            <p className="text-xs text-slate-500">권리금 회수 예상기간(추정치)</p>
            <p className="mt-1 font-semibold">{recoveryMonths}</p>
          </article>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          실제 매출은 입지, 상품력, 운영 역량, 마케팅 실행에 따라 달라질 수 있습니다.
        </p>
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">손님이 왜 이 빵집을 기억해야 할까요?</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">브랜드 콘셉트/스토리</p>
            <p className="mt-1 text-sm">{result.sections.brandStoryDirection || "확인 필요"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">대표 고객층/시그니처</p>
            <p className="mt-1 text-sm">{result.sections.reviewAndRegularCustomerStrategy || "확인 필요"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">지역 키워드</p>
            <p className="mt-1 text-sm">{result.sections.localKeywordStrategy || "확인 필요"}</p>
          </article>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {[
            ["1개월차", "네이버 플레이스 세팅, 오픈 이벤트, 초기 리뷰 확보"],
            ["2개월차", "블로그 콘텐츠, 지역 키워드 노출, 메뉴 사진 강화"],
            ["3개월차", "단골 확보, 리뷰 이벤트, 시그니처 메뉴 홍보"],
          ].map(([month, plan]) => (
            <article key={month} className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <p className="text-xs font-semibold text-blue-700">{month}</p>
              <p className="mt-1 text-sm text-slate-700">{plan}</p>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          오픈 후 3개월은 고객이 이 매장을 기억하게 만드는 시간입니다.
        </p>
      </section>

      <InteriorSketchReportSection result={result} />

      <section className="print-card">
        <h2 className="font-semibold">최종 판단</h2>
        <p className="mt-1 text-sm">{result.sections.finalJudgment}</p>
      </section>
      <section className="print-card">
        <h2 className="font-semibold">계약 전 확인 질문</h2>
        <ul className="mt-1 text-sm">
          {result.sections.preContractQuestions.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </section>
      <section className="print-card rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p>본 리포트는 창업 성공을 보장하지 않습니다.</p>
        <p className="mt-1">본 리포트는 계약 전 의사결정을 돕기 위한 참고 자료입니다.</p>
        <p className="mt-1">
          매출, 수익, 권리금 회수기간은 입력값 기준 추정치이며 보장하지 않습니다.
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
