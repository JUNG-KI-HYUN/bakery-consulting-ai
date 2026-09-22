import Link from "next/link";
import { analyzeRentalMarket } from "@/lib/research/rental-market-analysis";
import { listResearchRecords } from "@/lib/research/research-repository";
import EconomicFeasibilityClient from "./EconomicFeasibilityClient";

export const dynamic = "force-dynamic";

function referenceDateInKorea() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function EconomicFeasibilityPage() {
  const records = await listResearchRecords();
  const rentalMarketResult = analyzeRentalMarket(records, { referenceDate: referenceDateInKorea() });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563EB]">Economic Feasibility V1</p>
          <h2 className="mt-1 text-2xl font-bold text-[#0B1220]">사업성·BEP·월세상한 분석</h2>
          <p className="mt-2 text-sm text-slate-600">상담자가 입력한 사업계획을 동일한 계산 엔진으로 비교합니다.</p>
        </div>
        <Link href="/markets" className="btn-outline">상권분석으로 돌아가기</Link>
      </header>
      <EconomicFeasibilityClient rentalMarketResult={rentalMarketResult} />
    </div>
  );
}
