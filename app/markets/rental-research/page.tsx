import Link from "next/link";
import { analyzeRentalMarket, freshnessAt } from "@/lib/research/rental-market-analysis";
import { listResearchRecords } from "@/lib/research/research-repository";
import type { LeaseResearchRecord, NumericSummary, ResearchSourceType } from "@/lib/research/types";

export const dynamic = "force-dynamic";

const sourceLabels: Record<ResearchSourceType, string> = {
  ONLINE_LISTING: "온라인 광고",
  BROKER_CONFIRMED: "중개 확인",
  LANDLORD_CONFIRMED: "임대인 확인",
  FIELD_CONFIRMED: "현장 확인",
  ACTUAL_CONTRACT: "실제 계약자료",
  UNKNOWN: "출처 미확인",
};

const freshnessLabels = {
  CURRENT_30D: "30일 이내",
  RECENT_90D: "31~90일",
  AGED_180D: "91~180일",
  STALE: "180일 초과",
};

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

function formatKoreanMoney(value: number | null) {
  if (value === null) return "미확인";
  if (value >= 100_000_000) {
    const eok = Math.floor(value / 100_000_000);
    const remainder = value % 100_000_000;
    return remainder === 0 ? `${eok.toLocaleString("ko-KR")}억원` : `${eok}억 ${(remainder / 10_000).toLocaleString("ko-KR")}만원`;
  }
  return value % 10_000 === 0 ? `${(value / 10_000).toLocaleString("ko-KR")}만원` : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function Money({ value }: { value: number | null }) {
  return value === null ? <span>미확인</span> : (
    <span>{Math.round(value).toLocaleString("ko-KR")}원 <span className="text-slate-400">/ {formatKoreanMoney(value)}</span></span>
  );
}

function SummaryCard({ title, summary }: { title: string; summary: NumericSummary }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-lg font-bold text-[#0B1220]"><Money value={summary.median} /></p>
      <p className="mt-2 text-xs text-slate-500">
        범위 <Money value={summary.min} /> ~ <Money value={summary.max} /> · 값 있는 표본 {summary.sampleCount}건
      </p>
    </article>
  );
}

function RecordCard({ record, referenceDate }: { record: LeaseResearchRecord; referenceDate: string }) {
  const currentFreshness = freshnessAt(record.source.collectedAt, referenceDate);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[#0B1220]">{record.property.address ?? record.property.addressRaw ?? "주소 미확인"}</h3>
          <p className="mt-1 text-xs text-slate-500">{record.property.floor ? `${record.property.floor}층` : "층 미확인"} · {record.source.sourceName}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{record.quality.verificationStatus}</span>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-400">전용 / 계약</dt><dd className="mt-1 font-semibold">{record.property.exclusiveAreaPyeong ?? "-"}평 / {record.property.contractAreaPyeong ?? "-"}평</dd></div>
        <div><dt className="text-slate-400">보증금</dt><dd className="mt-1 font-semibold"><Money value={record.lease.depositAmount} /></dd></div>
        <div><dt className="text-slate-400">월세</dt><dd className="mt-1 font-semibold"><Money value={record.lease.rentAmount} /></dd></div>
        <div><dt className="text-slate-400">관리비</dt><dd className="mt-1 font-semibold">{record.lease.managementFeeStatus === "NONE" ? "0원 / 없음" : <Money value={record.lease.managementFeeAmount} />}</dd></div>
        <div><dt className="text-slate-400">권리금</dt><dd className="mt-1 font-semibold">{record.lease.premiumStatus === "NEGOTIABLE" ? "협의" : <Money value={record.lease.premiumAmount} />}</dd></div>
        <div><dt className="text-slate-400">출처 유형</dt><dd className="mt-1 font-semibold">{sourceLabels[record.source.sourceType]}</dd></div>
        <div><dt className="text-slate-400">수집일 / 신선도</dt><dd className="mt-1 font-semibold">{record.source.collectedAt.slice(0, 10)} · {freshnessLabels[currentFreshness]}</dd></div>
        <div><dt className="text-slate-400">경고</dt><dd className="mt-1 font-semibold">{record.quality.warnings.length ? record.quality.warnings.join(" · ") : "없음"}</dd></div>
      </dl>
    </article>
  );
}

export default async function RentalResearchPage() {
  const records = await listResearchRecords();
  const referenceDate = referenceDateInKorea();
  const result = analyzeRentalMarket(records, { referenceDate });
  const sortedRecords = [...records].sort((left, right) => right.source.collectedAt.localeCompare(left.source.collectedAt));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563EB]">Rental Research</p>
          <h2 className="mt-1 text-2xl font-bold text-[#0B1220]">임대 조사자료와 시장 참고</h2>
          <p className="mt-2 text-sm text-slate-600">FRAMEONE 서버에 명시적으로 저장한 조사자료만 표시합니다.</p>
        </div>
        <div className="flex gap-2"><Link href="/markets/economic-feasibility" className="btn-outline">사업성 분석</Link><Link href="/markets" className="btn-outline">상권분석으로 돌아가기</Link></div>
      </header>

      <section className="panel-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">임대시장 참고</p>
            <h3 className="mt-1 text-xl font-bold text-[#0B1220]">FRAMEONE 확인 표본 {result.sampleCount}건</h3>
            <p className="mt-1 text-xs font-semibold text-amber-700">
              {result.sampleSufficiency === "INSUFFICIENT_REFERENCE_ONLY" ? "표본 부족 — 참고용" : "조사표본 참고용"}
            </p>
          </div>
          <p className="text-xs text-slate-500">기준일 {result.referenceDate}</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <SummaryCard title="월세 조사표본 중앙값" summary={result.rent} />
          <SummaryCard title="보증금 조사표본 중앙값" summary={result.deposit} />
          <SummaryCard title="관리비 조사표본 중앙값" summary={result.managementFee} />
          <SummaryCard title="전용평당 월세 조사표본 중앙값" summary={result.rentPerExclusivePyeong} />
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">출처 구성</p>
          <p className="mt-1">{Object.entries(result.sourceComposition).length
            ? Object.entries(result.sourceComposition).map(([source, count]) => `${sourceLabels[source as ResearchSourceType]} ${count}건`).join(" · ")
            : "확정 표본 없음"}</p>
          <p className="mt-2">{result.limitations.join(" ")}</p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Repository</p><h3 className="mt-1 text-lg font-bold">저장된 임대 조사자료</h3></div>
          <p className="text-sm font-bold text-slate-700">{sortedRecords.length}건</p>
        </div>
        {sortedRecords.length ? sortedRecords.map((record) => <RecordCard key={record.recordId} record={record} referenceDate={referenceDate} />) : (
          <div className="panel-card p-10 text-center text-sm text-slate-500">FRAMEONE 서버에 저장된 조사자료가 없습니다.</div>
        )}
      </section>
    </div>
  );
}
