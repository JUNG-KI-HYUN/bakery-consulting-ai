import type { BakeryOfficialMarketTrend } from "@/lib/market-data/services/bakery-official-market";

function formatQuarter(referencePeriod: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(referencePeriod);
  return match ? `${match[1]}년 ${match[2]}분기` : referencePeriod;
}

function formatCurrency(value: number | null) {
  return value === null ? "자료 없음" : `${value.toLocaleString("ko-KR")}원`;
}

function formatCount(value: number | null) {
  return value === null ? "자료 없음" : `${value.toLocaleString("ko-KR")}개`;
}

function formatChange(value: number | null, suffix: string) {
  if (value === null || !Number.isFinite(value)) {
    return "계산 불가";
  }
  const prefix = value > 0 ? "↑ " : value < 0 ? "↓ " : "→ ";
  return `${prefix}${Math.abs(value).toLocaleString("ko-KR", {
    maximumFractionDigits: suffix === "%" ? 1 : 0,
  })}${suffix}`;
}

export default function OfficialMarketTrend({
  trend,
}: {
  trend: BakeryOfficialMarketTrend;
}) {
  return (
    <section className="rounded-xl border border-blue-100 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h5 className="text-sm font-bold text-slate-950">
            서울 공식상권 추정통계 추이
          </h5>
          <p className="mt-1 text-xs font-semibold text-slate-700">
            {trend.officialMarketName ?? "상권명 정보 없음"}
          </p>
        </div>
        <p className="text-[10px] font-semibold text-slate-500">
          {trend.latestReferencePeriod
            ? `최근 기준 ${formatQuarter(trend.latestReferencePeriod)}`
            : "확인 가능한 분기 없음"}
        </p>
      </div>

      {trend.periods.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[620px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold text-slate-600">
              <tr>
                <th className="px-3 py-2">분기</th>
                <th className="px-3 py-2 text-right">공식상권 추정매출</th>
                <th className="px-3 py-2 text-right">전분기 대비</th>
                <th className="px-3 py-2 text-right">공식 점포수</th>
                <th className="px-3 py-2 text-right">증감</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trend.periods.map((period) => (
                <tr key={period.quarterCode} className="text-slate-800">
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {formatQuarter(period.referencePeriod)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {formatCurrency(period.estimatedSalesAmount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {formatChange(period.salesQoqRate, "%")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {formatCount(period.storeCount)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {formatChange(period.storeCountDelta, "개")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600">
          확인 가능한 분기 데이터가 없습니다.
        </p>
      )}

      <p className="mt-3 text-[10px] leading-5 text-slate-500">
        서울시 공식상권 기준 추정통계입니다. 분석지점의 예상매출을 의미하지 않습니다.
        <br />
        공식상권 점포 통계이며 Kakao 반경검색 결과와 기준이 다릅니다.
      </p>
    </section>
  );
}
