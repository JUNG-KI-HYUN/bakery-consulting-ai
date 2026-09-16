"use client";

import type { ReactNode } from "react";
import type {
  P0BasicLocationResultViewModel,
  P0BasicLocationViewModel,
} from "@/lib/market-data/basic-location/view-model";

function SummarySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
      {children}
    </section>
  );
}

function displayValue(
  value: P0BasicLocationResultViewModel["value"],
  unit: string | null,
) {
  if (value === null) return "값 없음";
  const text = Array.isArray(value)
    ? value.join(" · ")
    : typeof value === "number"
      ? new Intl.NumberFormat("ko-KR").format(value)
      : String(value);
  if (!unit) return text;
  if (unit === "KRW") return `${text}원`;
  if (unit === "percent") return `${text}%`;
  if (unit === "m") return `${text}m`;
  if (unit === "places") return `${text}곳`;
  if (unit === "count") return `${text}건`;
  return `${text} ${unit}`;
}

function statusLabel(status: P0BasicLocationResultViewModel["status"]) {
  if (status === "AVAILABLE") return "확인됨";
  if (status === "PARTIAL") return "일부 확인";
  if (status === "NEEDS_REVIEW") return "검토 필요";
  if (status === "NOT_AVAILABLE") return "자료 확인 필요";
  return "현재 분석 불가";
}

function ResultCards({
  results,
  empty,
}: {
  results: readonly P0BasicLocationResultViewModel[];
  empty: string;
}) {
  if (results.length === 0) {
    return <p className="mt-3 text-sm leading-6 text-slate-500">{empty}</p>;
  }
  return (
    <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {results.map((result) => (
        <article key={result.resultId} className="min-w-0 rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-semibold leading-5 text-slate-600">
            {result.metricLabel}
          </p>
          <p className="mt-2 break-words text-lg font-bold tabular-nums text-slate-950">
            {displayValue(result.value, result.unit)}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            {result.analysisUnit.label} · {statusLabel(result.status)}
          </p>
          {result.limitations.length > 0 ? (
            <p className="mt-2 text-xs leading-5 text-amber-800">
              {result.limitations[0].message}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SignalList({
  items,
  empty,
}: {
  items: readonly { id: string; message: string }[];
  empty: string;
}) {
  return items.length > 0 ? (
    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 gap-2">
          <span aria-hidden="true" className="text-slate-400">•</span>
          <span className="min-w-0 break-words">{item.message}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-3 text-sm leading-6 text-slate-500">{empty}</p>
  );
}

function IdentityItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function EvidenceDetails({ result }: { result: P0BasicLocationResultViewModel }) {
  const reference = result.referencePeriod ?? result.referenceDate ?? "미확인";
  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-slate-800">
        {result.metricLabel} · {statusLabel(result.status)}
      </summary>
      <dl className="grid gap-3 border-t border-slate-100 p-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <div><dt className="text-slate-500">값</dt><dd className="mt-1 break-words font-semibold text-slate-800">{displayValue(result.value, result.unit)}</dd></div>
        <div><dt className="text-slate-500">공간단위</dt><dd className="mt-1 break-words text-slate-700">{result.analysisUnit.label} · {result.analysisUnit.type}</dd></div>
        <div><dt className="text-slate-500">Source</dt><dd className="mt-1 break-words text-slate-700">{result.primarySource?.sourceName ?? "Source 미연결"}</dd></div>
        <div><dt className="text-slate-500">기준시점</dt><dd className="mt-1 text-slate-700">{reference}</dd></div>
        <div><dt className="text-slate-500">상태 / 값 성격</dt><dd className="mt-1 text-slate-700">{result.status} · {result.valueType}</dd></div>
        <div><dt className="text-slate-500">Confidence</dt><dd className="mt-1 text-slate-700">{result.confidence}</dd></div>
        <div className="sm:col-span-2 xl:col-span-3"><dt className="text-slate-500">Result ID</dt><dd className="mt-1 break-all font-mono text-[11px] text-slate-600">{result.resultId}</dd></div>
        {result.limitations.length > 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <dt className="text-slate-500">Limitation</dt>
            <dd className="mt-1 space-y-1 text-amber-800">
              {result.limitations.map((limitation) => (
                <p key={`${limitation.code}-${limitation.message}`}>{limitation.message}</p>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

export default function MarketAnalysisSummary({
  viewModel,
  onEditConditions,
  contextStale = false,
}: {
  viewModel: P0BasicLocationViewModel | null;
  onEditConditions: () => void;
  contextStale?: boolean;
}) {
  if (!viewModel) {
    return (
      <section
        aria-label="기초입지 분석결과"
        className="m-4 min-w-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"
      >
        <h2 className="text-base font-bold text-slate-900">기초입지 분석결과</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          먼저 분석 설정에서 지도 분석지점과 반경을 선택하고 분석을 실행해 주세요.
        </p>
      </section>
    );
  }

  const { analysisContext } = viewModel;
  const radiusOfficialRelations = viewModel.availableEvidence.other.filter(
    (result) => result.metricKey.startsWith("official_commercial_area."),
  );
  const nearbyEvidence = [
    ...viewModel.availableEvidence.kakaoObserved,
    ...viewModel.availableEvidence.other.filter(
      (result) => !result.metricKey.startsWith("official_commercial_area."),
    ),
  ];
  const blockingLimitations = viewModel.limitations.results.filter(
    (item) => item.status === "BLOCKED",
  );
  const unavailableLimitations = viewModel.limitations.results.filter(
    (item) => item.status === "NOT_AVAILABLE" || item.valueType === "UNKNOWN",
  );
  const scopeLimitations = viewModel.limitations.results.filter(
    (item) =>
      item.status !== "BLOCKED" &&
      item.status !== "NOT_AVAILABLE" &&
      item.valueType !== "UNKNOWN",
  );
  const limitationGroups = [
    { title: "현재 분석 불가", items: blockingLimitations },
    { title: "자료 확인 필요", items: unavailableLimitations },
    { title: "데이터 범위 주의", items: scopeLimitations },
  ];
  const officialGroups = [
    {
      title: "공식상권 공간관계",
      results: [
        ...radiusOfficialRelations,
        ...viewModel.officialMarketReference.relation,
      ],
    },
    { title: "SALES · 공식상권 추정매출", results: viewModel.officialMarketReference.sales },
    { title: "STORES · 공식상권 점포 통계", results: viewModel.officialMarketReference.stores },
    { title: "Trend · 공식상권 분기 변화", results: viewModel.officialMarketReference.trend },
    { title: "기타 공식상권 근거", results: viewModel.officialMarketReference.other },
  ];

  return (
    <section aria-labelledby="market-analysis-summary-title" className="min-w-0 border-b border-slate-200 bg-slate-50">
      <header className="border-b border-blue-100 bg-blue-50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">P0 BASIC LOCATION</p>
            <h2 id="market-analysis-summary-title" className="mt-2 text-xl font-bold tracking-tight text-slate-950">기초입지 분석결과</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              현재 Run에서 확인된 근거와 해석, 데이터 한계, 현장 확인사항을 구분했습니다.
            </p>
          </div>
          <button type="button" onClick={onEditConditions} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            분석조건 변경
          </button>
        </div>
        {contextStale ? (
          <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">
            현재 선택한 FRAMEONE Context가 실행 시점과 다릅니다. 아래 결과는 이전 Run의 실행 Context로 고정되어 있으며, 현재 선택을 반영하려면 다시 분석해야 합니다.
          </p>
        ) : null}
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <SummarySection title="1. 분석 Context" description="분석을 실행한 위치·반경과 당시 FRAMEONE 선택값입니다.">
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <IdentityItem label="분석 기준 위치" value={analysisContext.target.latitude !== null && analysisContext.target.longitude !== null ? `${analysisContext.target.latitude}, ${analysisContext.target.longitude}` : null} />
            <IdentityItem label="분석 반경" value={analysisContext.target.radiusMeters ? `${analysisContext.target.radiusMeters}m` : null} />
            <IdentityItem label="Target source" value={analysisContext.target.source} />
            <IdentityItem label="분석 확인주소" value={analysisContext.target.confirmedAddress} />
            <IdentityItem label="실행 당시 Market" value={analysisContext.frameone.marketName} />
            <IdentityItem label="실행 당시 Submarket" value={analysisContext.frameone.submarketName} />
            <IdentityItem label="분석 실행상태" value="현재 Run 결과" />
          </dl>
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold">실행 식별정보</summary>
            <p className="mt-2 break-all font-mono">{viewModel.analysisRunId}</p>
          </details>
        </SummarySection>

        <SummarySection title="2. 현재 상권 / 공간단위" description="FRAMEONE은 내부 분석 분류체계이며 서울시 공식상권과 별도의 공간단위입니다.">
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <IdentityItem label="FRAMEONE District" value={analysisContext.frameone.districtName} />
            <IdentityItem label="FRAMEONE Market" value={analysisContext.frameone.marketName} />
            <IdentityItem label="FRAMEONE Submarket" value={analysisContext.frameone.submarketName} />
            <IdentityItem label="FRAMEONE Node" value={analysisContext.frameone.nodeName} />
          </dl>
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            FRAMEONE Market/Submarket/Node를 서울시 공식상권 경계로 해석하지 않습니다. Node가 표시되더라도 검증 좌표·실제 동선·공간범위를 뜻하지 않습니다.
          </p>
        </SummarySection>

        <SummarySection title="3. 현재 확인된 근거" description={`${analysisContext.target.radiusMeters ?? "선택"}m 반경 · Kakao 장소검색 관측입니다. 실제 전체 경쟁점 수가 아닙니다.`}>
          <ResultCards results={nearbyEvidence} empty="현재 표시할 반경 기반 장소검색 근거가 없습니다." />
          <p className="mt-3 text-xs leading-5 text-slate-500">
            카테고리별 반환건수와 중복정규화 반환건수는 원 Source 값을 그대로 표시하며 서로 합산하지 않습니다. 실제 장소목록은 ‘경쟁 환경’ 탭에서 확인합니다.
          </p>
        </SummarySection>

        <SummarySection title="4. 서울시 공식상권 참고자료" description="서울시 공식상권 전체 범위의 별도 통계이며 현재 300m/500m 반경 통계가 아닙니다.">
          <div className="mt-4 space-y-5">
            {officialGroups.map(({ title, results }) => results.length > 0 ? (
              <div key={title}>
                <h4 className="text-sm font-bold text-blue-900">{title}</h4>
                <ResultCards results={results} empty="" />
              </div>
            ) : null)}
            {officialGroups.every(({ results }) => results.length === 0) ? (
              <p className="text-sm leading-6 text-slate-500">현재 연결된 서울시 공식상권 참고자료가 없습니다.</p>
            ) : null}
          </div>
          <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            공식상권 SALES는 서울시 추정매출이며 후보점포 매출이 아닙니다. STORES는 공식상권 통계이며 Kakao 반환건수와 합산하지 않습니다.
          </p>
        </SummarySection>

        <SummarySection title="5. 현재 해석" description="Result ID에 근거한 deterministic Interpretation만 표시합니다.">
          {viewModel.currentInterpretation.summary ? (
            <p className="mt-4 rounded-lg bg-slate-900 p-4 text-sm font-semibold leading-6 text-white">
              {viewModel.currentInterpretation.summary.message}
            </p>
          ) : null}
          <div className="mt-4 grid gap-5 xl:grid-cols-3">
            <div><h4 className="text-sm font-bold text-slate-900">확인된 내용</h4><SignalList items={viewModel.currentInterpretation.confirmedSignals} empty="현재 확인된 내용이 없습니다." /></div>
            <div><h4 className="text-sm font-bold text-slate-900">참고 해석</h4><SignalList items={viewModel.currentInterpretation.referenceSignals} empty="현재 표시할 참고 해석이 없습니다." /></div>
            <div><h4 className="text-sm font-bold text-slate-900">데이터 해석 주의</h4><SignalList items={viewModel.currentInterpretation.riskSignals} empty="추가 표시할 해석 주의사항이 없습니다." /></div>
          </div>
        </SummarySection>

        <SummarySection title="6. 데이터 한계 / 분석 불가" description="값이 0인 상태와 자료 없음·분석 불가 상태를 구분합니다.">
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {limitationGroups.map(({ title, items }) => (
              <div key={title} className="min-w-0 rounded-lg border border-slate-200 p-4">
                <h4 className="text-sm font-bold text-slate-900">{title}</h4>
                {items.length > 0 ? (
                  <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                    {items.map((item) => (
                      <li key={item.resultId}>
                        <p className="font-semibold">{item.metricLabel}</p>
                        {item.limitations.map((limitation) => <p key={`${item.resultId}-${limitation.code}`} className="mt-1 text-xs leading-5 text-slate-600">{limitation.message}</p>)}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 text-sm text-slate-500">해당 항목 없음</p>}
              </div>
            ))}
          </div>
          {viewModel.limitations.unknowns.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h4 className="text-sm font-bold text-amber-950">현재 확인할 수 없는 내용</h4>
              <SignalList items={viewModel.limitations.unknowns} empty="" />
            </div>
          ) : null}
        </SummarySection>

        <SummarySection title="7. 현장 확인 필요사항" description="현재 Result와 limitation에서 전달된 확인항목만 표시합니다.">
          {viewModel.fieldHandoff.nextChecks.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {viewModel.fieldHandoff.nextChecks.map((item) => (
                <li key={item.id} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                  <span aria-hidden="true" className="mt-0.5 text-lg text-slate-400">□</span>
                  <span>{item.message}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-500">현재 전달된 현장 확인항목이 없습니다.</p>}
        </SummarySection>

        <SummarySection title="8. 데이터 근거" description="상담 화면에서는 접어서 표시하며 Source·기준시점·공간단위와 상태를 필요할 때 확인합니다.">
          <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
              Result 근거 {viewModel.dataEvidence.length}개 보기
            </summary>
            <div className="space-y-2 border-t border-slate-200 p-3">
              {viewModel.dataEvidence.map((result) => <EvidenceDetails key={result.resultId} result={result} />)}
            </div>
          </details>
        </SummarySection>
      </div>
    </section>
  );
}
