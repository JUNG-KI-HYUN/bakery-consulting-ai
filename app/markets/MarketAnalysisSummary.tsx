"use client";

import type { ReactNode } from "react";
import type { MarketAnalysisContext } from "@/lib/market-data/market-analysis-context";
import {
  buildMarketSummaryPresentation,
  type MarketAnalysisViewMode,
} from "@/lib/market-data/market-analysis-presentation";

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function TextList({ items, empty }: { items: readonly string[]; empty: string }) {
  return items.length ? (
    <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
      {items.map((item, index) => <li key={`${index}-${item}`} className="flex min-w-0 gap-2"><span aria-hidden="true" className="text-slate-400">•</span><span className="min-w-0 break-words">{item}</span></li>)}
    </ul>
  ) : <p className="mt-2 text-sm leading-6 text-slate-500">{empty}</p>;
}

function ViewModeToggle({ mode, onChange }: {
  mode: MarketAnalysisViewMode;
  onChange: (mode: MarketAnalysisViewMode) => void;
}) {
  return (
    <div role="group" aria-label="종합진단 보기" className="grid min-w-0 grid-cols-2 rounded-lg border border-slate-300 bg-white p-1 sm:w-auto">
      {(["customer", "staff"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`min-h-11 rounded-md px-3 py-2 text-sm font-bold transition-colors ${mode === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {value === "customer" ? "상담용 보기" : "직원용 상세"}
        </button>
      ))}
    </div>
  );
}

function RawValue({ value }: { value: unknown }) {
  const text = value === null || value === undefined || value === ""
    ? "미확인"
    : typeof value === "object" ? JSON.stringify(value) : String(value);
  return <span className="break-all font-mono text-xs text-slate-700">{text}</span>;
}

function RawField({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1"><RawValue value={value} /></dd></div>;
}

function RequestErrorField({
  label = "requestError",
  requestStatus,
  error,
}: {
  label?: string;
  requestStatus: unknown;
  error: unknown;
}) {
  return <RawField label={label} value={requestStatus === "success" && (error === null || error === undefined || error === "") ? "오류 없음" : error} />;
}

/** Context is the only source of displayed data. The callbacks change presentation or open existing controls. */
export default function MarketAnalysisSummary({
  context,
  onEditConditions,
  viewMode = "customer",
  onViewModeChange = () => {},
}: {
  context: MarketAnalysisContext | null;
  onEditConditions: () => void;
  viewMode?: MarketAnalysisViewMode;
  onViewModeChange?: (mode: MarketAnalysisViewMode) => void;
}) {
  const summary = buildMarketSummaryPresentation(context, viewMode);
  if (summary.status === "empty") return (
    <section aria-label="후보점포 종합 진단" className="m-4 min-w-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold text-slate-900">후보점포 종합 진단</h2>
        <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{summary.message}</p>
    </section>
  );

  return (
    <section aria-labelledby="market-analysis-summary-title" className="min-w-0 border-b border-slate-200 bg-slate-50">
      <header className="border-b border-blue-100 bg-blue-50 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="market-analysis-summary-title" className="text-xl font-bold tracking-tight text-slate-950">후보점포 종합 진단</h2>
            <p className="mt-2 break-words text-base font-semibold text-slate-900">{summary.target.address}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-slate-600">
              <p className="min-w-0 break-words">FRAMEONE {summary.target.frameone}</p>
              <p className="whitespace-nowrap">실행 반경 {summary.target.radius}</p>
              <p className="whitespace-nowrap">{summary.target.source}</p>
            </div>
          </div>
          <div className="grid shrink-0 gap-2 sm:min-w-80">
            <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
            <button type="button" onClick={onEditConditions} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">분석조건 변경</button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600">현재 확보된 자료의 요약입니다. 점포 계약에 대한 최종 판단은 포함하지 않습니다.</p>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <SummarySection title="분석 위치 요약">
          <dl className="mt-3 grid min-w-0 gap-4 md:grid-cols-3">
            {[["확인주소 / 위치", summary.target.address], ["실행 분석반경", summary.target.radius], ["FRAMEONE 주요상권", summary.target.frameone]].map(([label, value]) => (
              <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-500">FRAMEONE 주요상권은 내부 업무분류이며 서울시 공식상권과 동일한 경계가 아닙니다.</p>
        </SummarySection>

        <SummarySection title="주변 경쟁환경">
          <p className="mt-1 text-xs leading-5 text-slate-500">Kakao 장소검색 · {summary.target.radius} · {summary.nearby.status}</p>
          <dl className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
            {summary.nearby.categories.map((category) => (
              <div key={category.id} className="min-w-0 rounded-lg bg-slate-50 p-4">
                <dt className="text-sm text-slate-600">{category.label}</dt>
                <dd className="mt-2 break-words text-xl font-bold tabular-nums text-slate-950">{category.value}</dd>
                {category.detail ? <dd className="mt-1 text-xs text-slate-500">{category.detail}</dd> : null}
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-600">카카오 지도 검색결과이며 공식 사업체 수와 다를 수 있습니다.<br />카테고리 간 동일 점포가 중복될 수 있으므로 단순 합산하지 않습니다. 반환된 장소는 전체 검색결과 중 목록으로 받은 장소이며, 지도 표시는 업종 선택에 따라 달라집니다.</p>
        </SummarySection>

        <SummarySection title="서울시 공식상권 관계">
          <p className="mt-1 text-xs leading-5 text-slate-500">실행 지점·{summary.target.radius} 반경 기준 · {summary.spatial.status}</p>
          {summary.spatial.ready ? (
            <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
              <div className="min-w-0 rounded-lg bg-blue-50 p-4"><h4 className="text-sm font-bold text-slate-900">후보점포 포함 공식상권</h4><TextList items={summary.spatial.inside} empty="확인된 포함 공식상권 없음" /><p className="mt-2 text-xs leading-5 text-slate-600">분석지점이 실제 경계 안에 포함된 공식상권입니다.</p></div>
              <div className="min-w-0 rounded-lg bg-slate-50 p-4"><h4 className="text-sm font-bold text-slate-900">분석반경 교차 공식상권</h4><TextList items={summary.spatial.overlaps} empty="확인된 반경 교차 공식상권 없음" /><p className="mt-2 text-xs leading-5 text-slate-600">후보점포는 상권 밖에 있지만, 분석반경과 위 공식상권이 겹칩니다.</p></div>
            </div>
          ) : <p className="mt-3 text-sm text-slate-600">{summary.spatial.status}</p>}
          {summary.spatial.unknown.length > 0 ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">공간관계를 확인할 수 없습니다.</p><TextList items={summary.spatial.unknown} empty="" /></div> : null}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <h4 className="text-sm font-bold text-slate-900">{viewMode === "customer" ? "통계 참고 공식상권" : "직원 참고선택"}</h4>
            {summary.spatial.manual ? <><p className="mt-2 break-words text-sm font-semibold text-slate-800">{summary.spatial.manual.name} · {summary.spatial.manual.relation}</p><p className="mt-1 text-xs leading-5 text-slate-600">{summary.spatial.manual.description}</p></> : <p className="mt-2 text-sm text-slate-500">참고선택 상권 없음</p>}
          </div>
        </SummarySection>

        <SummarySection title="서울시 공식통계">
          <p className="mt-3 text-xs text-slate-500">통계 기준 공식상권</p>
          <p className="mt-1 break-words text-base font-bold text-slate-900">{summary.statistics.market}</p>
          <p className="mt-1 text-sm text-slate-600">{summary.statistics.period}</p>
          <p role="status" className="mt-2 text-sm font-semibold text-slate-700">{summary.statistics.status}</p>
          {summary.statistics.warning ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{summary.statistics.warning}</p> : null}
          <p className="mt-3 text-xs leading-5 text-slate-600">서울시 공식상권 단위의 추정통계입니다. 후보점포 자체의 예상매출이나 {summary.target.radius} 분석반경 통계가 아닙니다.</p>
          {summary.statistics.metrics.length > 0 ? <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.statistics.metrics.map((metric) => <div key={metric.metric} className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">{metric.label}</dt><dd className="mt-2 break-words text-lg font-bold tabular-nums text-slate-950">{metric.value}</dd></div>)}
          </dl> : null}
          <p className="mt-3 text-xs leading-5 text-slate-500">유사업종 점포 수·점포 수·프랜차이즈 점포 수는 서울시가 각각 제공한 지표이며 서로 더하지 않습니다. 통계 조회와 참고상권 변경은 아래 기존 지도·공식상권 영역에서 할 수 있습니다.</p>
        </SummarySection>

        <SummarySection title="데이터 상태 / 근거">
          <dl className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
            {summary.sources.map((source) => <div key={source.name} className="min-w-0 rounded-lg border border-slate-100 p-3"><dt className="text-sm font-semibold text-slate-800">{source.name}</dt><dd className="mt-1 break-words text-sm text-slate-700">{source.status}</dd><dd className="mt-1 break-words text-xs leading-5 text-slate-500">{source.scope}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-500">현장조사 데이터는 별도 단계에서 연결 예정입니다.</p>
          {summary.staffDetails ? (
            <div aria-label="직원용 검증정보" className="mt-5 border-t border-slate-200 pt-5">
              <h4 className="text-sm font-bold text-slate-950">직원용 검증정보</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">같은 분석 Context의 원본 식별자와 조회 상태입니다.</p>

              <div className="mt-4 space-y-4">
                <div className="min-w-0 rounded-lg bg-slate-50 p-4">
                  <h5 className="text-sm font-bold text-slate-800">실행 기준</h5>
                  <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <RawField label="Context schema" value={summary.staffDetails.schemaVersion} />
                    <RawField label="FRAMEONE Market ID" value={summary.staffDetails.target.frameoneMarketId} />
                    <RawField label="실행 source" value={summary.staffDetails.target.source} />
                    <RawField label="실행 latitude" value={summary.staffDetails.target.latitude} />
                    <RawField label="실행 longitude" value={summary.staffDetails.target.longitude} />
                    <RawField label="실행 radiusMeters" value={summary.staffDetails.target.executedRadiusMeters} />
                  </dl>
                </div>

                <div className="min-w-0 rounded-lg bg-slate-50 p-4">
                  <h5 className="text-sm font-bold text-slate-800">Kakao 요청 상태</h5>
                  <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                    <RawField label="requestStatus" value={summary.staffDetails.kakao.requestStatus} />
                    <RequestErrorField requestStatus={summary.staffDetails.kakao.requestStatus} error={summary.staffDetails.kakao.error} />
                  </dl>
                  <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
                    {summary.staffDetails.kakao.categories.map((category) => (
                      <dl key={category.id} className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
                        <RawField label="category" value={`${category.label} (${category.id})`} />
                        <div className="mt-2"><RawField label="status" value={category.status} /></div>
                        <div className="mt-2"><RawField label="totalCount" value={category.totalCount} /></div>
                        <div className="mt-2"><RawField label="returnedCount" value={category.returnedCount} /></div>
                        <div className="mt-2"><RequestErrorField label="error" requestStatus={category.status} error={category.error} /></div>
                      </dl>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-lg bg-slate-50 p-4">
                  <h5 className="text-sm font-bold text-slate-800">서울시 공식상권 원본 관계</h5>
                  <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                    <RawField label="requestStatus" value={summary.staffDetails.officialMarkets.requestStatus} />
                    <RequestErrorField requestStatus={summary.staffDetails.officialMarkets.requestStatus} error={summary.staffDetails.officialMarkets.error} />
                  </dl>
                  <div className="mt-3 space-y-2">
                    {summary.staffDetails.officialMarkets.relatedMarkets.map((market) => (
                      <dl key={`${market.marketCode}-${market.relation}`} className="grid min-w-0 gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
                        <RawField label="상권명" value={market.marketName} />
                        <RawField label="공식상권 코드" value={market.marketCode} />
                        <RawField label="relation" value={market.relation} />
                        <RawField label="radiusMeters" value={market.analysisRadiusMeters} />
                      </dl>
                    ))}
                    {summary.staffDetails.officialMarkets.relatedMarkets.length === 0 ? <p className="text-xs text-slate-500">원본 공간관계 결과 없음</p> : null}
                  </div>
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs font-bold text-blue-900">직원 수동 참고선택</p>
                    {summary.staffDetails.officialMarkets.manuallySelected ? (
                      <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <RawField label="selectionType" value={summary.staffDetails.officialMarkets.manuallySelected.selectionType} />
                        <RawField label="공식상권 코드" value={summary.staffDetails.officialMarkets.manuallySelected.marketCode} />
                        <RawField label="relation" value={summary.staffDetails.officialMarkets.manuallySelected.relation} />
                        <RawField label="radiusMeters" value={summary.staffDetails.officialMarkets.manuallySelected.analysisRadiusMeters} />
                      </dl>
                    ) : <p className="mt-2 text-xs text-slate-500">수동 참고선택 없음</p>}
                  </div>
                </div>

                <div className="min-w-0 rounded-lg bg-slate-50 p-4">
                  <h5 className="text-sm font-bold text-slate-800">서울시 공식통계 원본 상태</h5>
                  <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <RawField label="requestStatus" value={summary.staffDetails.publicData.requestStatus} />
                    <RawField label="dataStatus" value={summary.staffDetails.publicData.dataStatus} />
                    <RawField label="공식상권 코드" value={summary.staffDetails.publicData.officialMarketCode} />
                    <RawField label="quarterCode" value={summary.staffDetails.publicData.quarterCode} />
                    <RawField label="referencePeriod" value={summary.staffDetails.publicData.referencePeriod} />
                    <RawField label="industryCode" value={summary.staffDetails.publicData.industryCode} />
                    <RawField label="industryName" value={summary.staffDetails.publicData.industryName} />
                    <RequestErrorField requestStatus={summary.staffDetails.publicData.requestStatus} error={summary.staffDetails.publicData.error} />
                  </dl>
                  <div className="mt-3 space-y-2">
                    {summary.staffDetails.publicData.observations.map((observation, index) => (
                      <dl key={`${observation.sourceId}-${observation.metric}-${index}`} className="grid min-w-0 gap-2 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
                        <RawField label="sourceId" value={observation.sourceId} />
                        <RawField label="metric" value={observation.metric} />
                        <RawField label="dataStatus" value={observation.dataStatus} />
                        <RawField label="value / unit" value={`${observation.value ?? "null"} / ${observation.unit}`} />
                        <RawField label="geography" value={`${observation.geographyType} / ${observation.geographyId ?? "null"}`} />
                        <RawField label="geographyName" value={observation.geographyName} />
                        <RawField label="industry" value={`${observation.industryCode ?? "null"} / ${observation.industryName ?? "null"}`} />
                        <RawField label="metadata" value={observation.metadata} />
                      </dl>
                    ))}
                    {summary.staffDetails.publicData.observations.length === 0 ? <p className="text-xs text-slate-500">원본 통계 observation 없음</p> : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </SummarySection>

        <SummarySection title="현재 해석">
          <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-3">
            {[
              { title: "확인된 내용", items: summary.interpretation.confirmed, empty: "현재 확인된 포함 관계·공식통계가 없습니다." },
              { title: "참고할 내용", items: summary.interpretation.reference, empty: "현재 표시할 참고 내용이 없습니다." },
              { title: "추가 확인 필요", items: summary.interpretation.needsCheck, empty: "" },
            ].map((group) => <div key={group.title} className="min-w-0"><h4 className="text-sm font-bold text-slate-900">{group.title}</h4><TextList items={group.items} empty={group.empty} /></div>)}
          </div>
        </SummarySection>
      </div>
    </section>
  );
}
