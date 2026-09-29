import Link from "next/link";
import {
  activeAnalysisTargetHref,
  parseActiveAnalysisTarget,
} from "@/lib/market-data/competition-location";
import { revalidateActiveTargetOfficialReference } from "@/lib/market-data/official-market-reference.server";
import {
  getBakeryOfficialMarketData,
  type BakeryOfficialMarketData,
} from "@/lib/market-data/services/bakery-official-market";
import { analyzeRentalMarket } from "@/lib/research/rental-market-analysis";
import { listResearchRecords } from "@/lib/research/research-repository";
import {
  AnalysisWorkflow,
} from "../AnalysisWorkflow";
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

export default async function EconomicFeasibilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const activeTarget = await revalidateActiveTargetOfficialReference(
    parseActiveAnalysisTarget(await searchParams),
  );
  const records = await listResearchRecords();
  const rentalMarketResult = analyzeRentalMarket(records, { referenceDate: referenceDateInKorea() });
  let officialMarketData: BakeryOfficialMarketData | null = null;
  let officialStatus = "현재 분석대상에 연결된 공식통계 참고상권이 없습니다.";
  if (activeTarget?.officialReference) {
    try {
      officialMarketData = await getBakeryOfficialMarketData({
        marketCode: activeTarget.officialReference.marketCode,
      });
      officialStatus = `${activeTarget.officialReference.marketName} · ${officialMarketData.referencePeriod} 공통 최신 기준자료`;
    } catch (error) {
      officialStatus = error instanceof Error
        ? `공식상권 참고자료 확인 필요: ${error.message}`
        : "공식상권 참고자료를 불러오지 못했습니다.";
    }
  }

  return (
    <div className="space-y-6">
      <AnalysisWorkflow active="economic" target={activeTarget} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#2563EB]">사업성·손익</p>
          <h2 className="mt-1 text-2xl font-bold text-[#0B1220]">사업성·손익·월세상한 분석</h2>
          <p className="mt-2 text-sm text-slate-600">상담자가 입력한 사업계획을 동일한 계산 엔진으로 비교합니다.</p>
        </div>
        <Link href={activeAnalysisTargetHref("/markets", activeTarget)} className="btn-outline">상권분석으로 돌아가기</Link>
      </header>
      <EconomicFeasibilityClient
        activeTarget={activeTarget}
        rentalMarketResult={rentalMarketResult}
        officialMarketData={officialMarketData}
        officialStatus={officialStatus}
      />
    </div>
  );
}
