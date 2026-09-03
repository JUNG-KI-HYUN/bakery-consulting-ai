import type { EvidenceCoverageResult, EvidenceCoverageSummary } from "@/lib/evidence/coverage";
import { getVerificationLabel } from "@/lib/evidence/presentation";
import type { VerificationStatus } from "@/lib/evidence/types";

function CoverageMeter({ label, summary }: { label: string; summary: EvidenceCoverageSummary }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-[#0B1220]">{summary.coveragePercent}%</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.coveragePercent}
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${summary.coveragePercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{summary.fieldCount}개 항목 기준</p>
    </div>
  );
}

function FieldStatus({ status }: { status: VerificationStatus | null }) {
  return (
    <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
      {status === null ? "근거 없음" : getVerificationLabel(status)}
    </span>
  );
}

/** 직원 상담 상세용 읽기 전용 요약. 정책 계산은 호출부에서 수행하고 여기서는 결과만 표시한다. */
export function DataConfidencePanel({ coverage }: { coverage: EvidenceCoverageResult }) {
  const unresolvedFields = coverage.fields.filter(
    (field) => coverage.criticalUnresolvedFields.includes(field.fieldPath),
  );
  const statusCounts = (Object.entries(coverage.fieldsByStatus) as [VerificationStatus, string[]][])
    .map(([status, paths]) => ({ label: getVerificationLabel(status), count: paths.length }));
  const counts = [...statusCounts, { label: "근거 없음", count: coverage.missingEvidenceFields.length }];
  const allEvidenceMissing = coverage.totalCoverage.fieldCount > 0 &&
    coverage.missingEvidenceFields.length === coverage.totalCoverage.fieldCount;

  return (
    <section aria-label="자료 확인도" className="panel-card no-print min-w-0 rounded-2xl p-5">
      <h2 className="text-lg font-bold text-[#0B1220]">자료 확인도</h2>
      <p className="mt-1 text-sm text-slate-600">현재 점포 판단에 필요한 시설 자료의 확인 상태입니다.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CoverageMeter label="전체 자료 확인도" summary={coverage.totalCoverage} />
        <CoverageMeter label="핵심 자료 확인도" summary={coverage.criticalCoverage} />
      </div>

      <dl aria-label="항목별 확인상태 집계" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map(({ label, count }) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{count}개</dd>
          </div>
        ))}
      </dl>

      {allEvidenceMissing && (
        <p className="mt-3 text-sm text-slate-600">아직 이 확인항목에 기록된 근거가 없습니다.</p>
      )}

      {coverage.hasCriticalUnresolved && (
        <div aria-label="핵심 확인 필요" className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-bold text-blue-900">핵심 확인 필요 {coverage.criticalUnresolvedFields.length}개</h3>
          <ul className="mt-3 space-y-2">
            {unresolvedFields.map((field) => (
              <li key={field.fieldPath} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm text-slate-800">{field.label}</span>
                <FieldStatus status={field.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-4 border-t border-slate-200 pt-3">
        <summary className="w-fit cursor-pointer rounded px-1 py-1 text-sm font-semibold text-blue-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          {coverage.totalCoverage.fieldCount}개 확인항목 보기
        </summary>
        <ul className="mt-2 divide-y divide-slate-100">
          {coverage.fields.map((field) => (
            <li key={field.fieldPath} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm text-slate-800">{field.label}</span>
                <FieldStatus status={field.status} />
              </div>
              {!field.critical && (
                <p className="mt-1 text-xs text-slate-500">전체 자료에 포함 · 기본 핵심 확인항목 아님</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 break-all text-xs text-slate-500">계산 기준: {coverage.policyVersion}</p>
      </details>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        자료 확인도는 판단자료의 확인 상태를 나타내며, 최종 계약판정은 별도로 검토합니다.
      </p>
    </section>
  );
}
