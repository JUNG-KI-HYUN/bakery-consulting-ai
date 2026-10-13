import Link from "next/link";
import {
  isValidEconomicVersion,
} from "@/lib/economic-feasibility/version-selection";
import type { BoundEconomicResult } from "@/lib/economic-feasibility/workspace-binding";

function koreaDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function money(value: number | null) {
  return value === null ? "계산 불가" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function EconomicVersionSelector({
  versions,
  selectedGeneratedAt,
  selectionRequired,
  selectionHrefs,
}: {
  versions: BoundEconomicResult[];
  selectedGeneratedAt: string | null;
  selectionRequired: boolean;
  selectionHrefs: Record<string, string>;
}) {
  if (versions.length === 0) return null;
  return (
    <section className="panel-card p-5 md:p-6" aria-labelledby="economic-version-recovery-title">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-bold tracking-[0.14em] text-[#2563EB]">ECONOMIC HISTORY</p>
        <h3 id="economic-version-recovery-title" className="mt-1 text-lg font-bold">사업계획 버전 선택</h3>
        <p className="mt-2 text-sm text-slate-600">최신 저장본이 유효하지 않으면 과거 저장본을 자동 적용하지 않습니다. 사용할 유효한 버전을 직접 선택해 주세요.</p>
        {selectionRequired ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">사업계획 버전 선택 필요</p> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {versions.map((version) => {
          const valid = isValidEconomicVersion(version);
          const selected = version.generatedAt === selectedGeneratedAt;
          return (
            <article key={version.generatedAt} className={`rounded-xl border p-4 ${selected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">생성 {koreaDateTime(version.generatedAt)}</p>
                  <p className="mt-1 text-xs text-slate-500">가정 revision {version.binding.assumptionRevision} · {version.result.metadata.engineVersion}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${valid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                  {valid ? "VALID" : "INVALID"}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">기준 월매출</dt><dd className="mt-1 font-semibold">{money(version.result.scenarios.base.monthlySales)}</dd></div>
                <div><dt className="text-slate-500">월 BEP</dt><dd className="mt-1 font-semibold">{money(version.result.bep.monthlyBepSales)}</dd></div>
              </dl>
              {!valid ? (
                <div className="mt-3 text-xs font-semibold text-amber-900">
                  <p>유효하지 않은 과거 저장본</p>
                  {version.result.validation.errors.map((error) => <p key={error}>• {error}</p>)}
                </div>
              ) : null}
              {valid ? (
                <Link href={selectionHrefs[version.generatedAt]} scroll={false} className={`btn-outline mt-4 inline-flex ${selected ? "pointer-events-none opacity-60" : ""}`} aria-disabled={selected}>
                  {selected ? "현재 표시 버전" : "이 버전 복원"}
                </Link>
              ) : (
                <button type="button" disabled className="btn-outline mt-4 opacity-50">유효하지 않아 선택 불가</button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
