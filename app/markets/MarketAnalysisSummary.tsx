"use client";

import type { ReactNode } from "react";
import type {
  P0BasicLocationPresentationMetricViewModel,
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
  if (unit === "percent" || unit === "%") return `${text}%`;
  if (unit === "m") return `${text}m`;
  if (unit === "places") return `${text}곳`;
  if (unit === "areas" || unit === "stores") return `${text}개`;
  if (unit === "people") return `${text}명`;
  if (unit === "count") return `${text}건`;
  return `${text} ${unit}`;
}

function presentationValue(
  metric: P0BasicLocationPresentationMetricViewModel,
  signed = false,
) {
  if (metric.value === null) return "자료 확인 필요";
  const displayed = displayValue(metric.value, metric.unit);
  return signed && typeof metric.value === "number" && metric.value > 0
    ? `+${displayed}`
    : displayed;
}

function referencePeriodLabel(referencePeriod: string | null) {
  if (!referencePeriod) return "기준기간 확인 필요";
  const quarter = /^(\d{4})-Q([1-4])$/.exec(referencePeriod);
  return quarter ? `${quarter[1]}년 ${quarter[2]}분기` : referencePeriod;
}

function statusLabel(status: P0BasicLocationResultViewModel["status"]) {
  if (status === "AVAILABLE") return "확인됨";
  if (status === "PARTIAL") return "일부 확인";
  if (status === "NEEDS_REVIEW") return "검토 필요";
  if (status === "NOT_AVAILABLE") return "자료 확인 필요";
  return "현재 분석 불가";
}

function PresentationMetricGrid({
  metrics,
  signed = false,
}: {
  metrics: readonly P0BasicLocationPresentationMetricViewModel[];
  signed?: boolean;
}) {
  return (
    <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <article key={metric.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold leading-5 text-slate-600">{metric.label}</p>
          <p className="mt-1.5 break-words text-lg font-bold tabular-nums text-slate-950">
            {presentationValue(metric, signed)}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">{metric.statusLabel}</p>
        </article>
      ))}
    </div>
  );
}

const DAY_LABELS = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
} as const;

function LivingPopulationEvidence({
  evidence,
}: {
  evidence: P0BasicLocationViewModel["presentation"]["evidence"]["livingPopulation"];
}) {
  const knownValues = evidence.hourlyProfile.flatMap((hour) =>
    hour.population === null ? [] : [hour.population],
  );
  const maximum = knownValues.length > 0 ? Math.max(...knownValues) : 0;
  const limitedValue = evidence.summary?.status === "PARTIAL"
    ? "부분자료로 확인 제한"
    : "자료 확인 필요";
  const formatPeople = (value: number | null) => value === null
    ? limitedValue
    : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}명`;
  const summaryCards = [
    {
      id: "mean",
      label: "24시간 평균",
      value: formatPeople(evidence.summary?.dailyMeanPopulation ?? null),
    },
    {
      id: "peak",
      label: "관측 최대",
      value: evidence.summary?.observedPeakPopulation === null || evidence.summary?.observedPeakPopulation === undefined
        ? limitedValue
        : `${evidence.summary.observedPeakHour}시 · ${formatPeople(evidence.summary.observedPeakPopulation)}`,
    },
    {
      id: "minimum",
      label: "관측 최소",
      value: evidence.summary?.observedMinimumPopulation === null || evidence.summary?.observedMinimumPopulation === undefined
        ? limitedValue
        : `${evidence.summary.observedMinimumHour}시 · ${formatPeople(evidence.summary.observedMinimumPopulation)}`,
    },
  ];

  return (
    <section aria-label="반경 생활인구 수요 참고" className="py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-950">반경 생활인구 수요 참고</h4>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {evidence.statusLabel}
        </span>
      </div>
      {evidence.requestStatus === "loading" ? (
        <p role="status" className="mt-3 text-sm leading-6 text-slate-600">생활인구 자료를 분석하고 있습니다.</p>
      ) : evidence.requestStatus === "error" ? (
        <p role="status" className="mt-3 text-sm leading-6 text-slate-600">생활인구 자료를 현재 불러오지 못했습니다. 다른 근거 분석은 계속 확인할 수 있습니다.</p>
      ) : evidence.requestStatus !== "success" || !evidence.summary ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">생활인구 분석 결과가 아직 없습니다.</p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {evidence.sourceName ?? "서울 생활인구 250m Grid"} · {evidence.referenceDate ?? "기준일 확인 필요"}
            {evidence.dayOfWeek ? `(${DAY_LABELS[evidence.dayOfWeek]})` : ""} · {evidence.radiusMeters ?? "선택"}m 반경
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {summaryCards.map((card) => (
              <div key={card.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <dt className="text-xs font-semibold text-slate-600">{card.label}</dt>
                <dd className="mt-1 text-sm font-bold tabular-nums text-slate-950">{card.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4" aria-label="24시간 생활인구 프로필">
            <p className="text-xs font-bold text-blue-900">24시간 Profile</p>
            <div className="mt-2 grid h-32 items-end gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2 pt-3" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {evidence.hourlyProfile.map((hour) => {
                const height = hour.population === null || maximum <= 0
                  ? 4
                  : Math.max(8, (hour.population / maximum) * 100);
                const state = hour.population === null
                  ? "확인 제한"
                  : hour.status === "PARTIAL" ? "부분자료" : "확인";
                return (
                  <div key={hour.hour} className="flex h-full min-w-0 flex-col justify-end" title={`${hour.hour}시 · ${formatPeople(hour.population)} · ${state}`}>
                    <div
                      className={`w-full rounded-t-sm ${hour.population === null ? "bg-slate-300" : hour.status === "PARTIAL" ? "bg-amber-400" : "bg-blue-500"}`}
                      style={{ height: `${height}%` }}
                      role="img"
                      aria-label={`${hour.hour}시 생활인구 ${formatPeople(hour.population)}, ${state}`}
                    />
                    <span className="mt-1 text-center text-[8px] leading-3 text-slate-500">
                      {Number(hour.hour) % 3 === 0 ? hour.hour : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
            <p>※ {evidence.referenceDate}({evidence.dayOfWeek ? DAY_LABELS[evidence.dayOfWeek] : "요일 확인 필요"}) 단일 날짜 기준 생활인구 추정치입니다.</p>
            <p>※ 생활인구는 통계적 추정자료이며 실제 방문객 또는 매장 고객 수와 동일하지 않습니다.</p>
            <p>※ 반경 경계의 250m 격자는 중심점 기준으로 포함됩니다.</p>
          </div>
        </>
      )}
    </section>
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
        {result.methodologyNote ? <div className="sm:col-span-2 xl:col-span-3"><dt className="text-slate-500">분석방법</dt><dd className="mt-1 break-words font-mono text-[11px] text-slate-600">{result.methodologyNote}</dd></div> : null}
        {result.missingReason ? <div><dt className="text-slate-500">Missing reason</dt><dd className="mt-1 text-slate-700">{result.missingReason}</dd></div> : null}
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
  const { presentation } = viewModel;
  const { evidence } = presentation;
  const headerLocation = [
    presentation.header.marketName,
    presentation.header.submarketName,
  ].filter((value): value is string => Boolean(value)).join(" · ") || "분석 위치";
  const headerTarget = presentation.header.confirmedAddress
    ? `${presentation.header.targetSourceLabel} · ${presentation.header.confirmedAddress}`
    : presentation.header.targetSourceLabel;
  const evidenceById = new Map(
    viewModel.dataEvidence.map((result) => [result.resultId, result]),
  );
  const hasKakaoEvidence = evidence.kakao.metrics.some(
    (metric) => metric.basisResultIds.length > 0,
  );
  const hasOfficialRelationEvidence = evidence.officialRelation.basisResultIds.length > 0;

  return (
    <section aria-labelledby="market-analysis-summary-title" className="min-w-0 border-b border-slate-200 bg-slate-50">
      <div aria-label="기초입지 고객 요약">
        <header className="border-b border-blue-100 bg-blue-50 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">FRAMEONE 기초입지 분석</p>
              <h2 id="market-analysis-summary-title" className="mt-1.5 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                {headerLocation} / {presentation.header.radiusMeters ? `${presentation.header.radiusMeters}m` : "분석 반경 확인 필요"}
              </h2>
              <p className="mt-2 break-words text-sm leading-6 text-slate-600">{headerTarget}</p>
              {presentation.header.confirmedAddress ? (
                <p className="mt-1 text-xs leading-5 text-slate-500">분석 위치를 확인한 주소이며 후보건물 검증주소를 의미하지 않습니다.</p>
              ) : null}
            </div>
            <button type="button" onClick={onEditConditions} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              분석조건 변경
            </button>
          </div>
          {contextStale ? (
            <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">
              현재 선택한 FRAMEONE 상권이 실행 시점과 다릅니다. 아래 결과는 이전 분석 실행 기준으로 고정되어 있으며, 현재 선택을 반영하려면 다시 분석해야 합니다.
            </p>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {presentation.statusCards.map((card) => (
              <div key={card.id} className="min-w-0 rounded-lg border border-blue-100 bg-white/85 px-3 py-2.5">
                <dt className="text-[11px] font-semibold text-slate-500">{card.label}</dt>
                <dd className="mt-1 break-words text-sm font-bold leading-5 text-slate-950">{card.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="p-4 sm:p-5">
          <SummarySection title="기초입지 요약" description="현재 확인한 사실과 후속 분석 범위를 구분했습니다.">
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <article className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                <h4 className="text-sm font-bold text-blue-950">현재 확인된 특징</h4>
                {presentation.summary.confirmedFeatures.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-800">
                    {presentation.summary.confirmedFeatures.map((feature) => (
                      <li key={feature.id} className="flex gap-2">
                        <span aria-hidden="true" className="text-blue-500">•</span>
                        <span className="min-w-0 break-words">{feature.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">현재 고객용으로 확인된 기초근거가 없습니다.</p>
                )}
              </article>

              <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-bold text-slate-950">현재 판단할 수 없는 부분</h4>
                <dl className="mt-3 space-y-2">
                  {presentation.summary.unavailableNow.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm leading-5">
                      <dt className="min-w-0 text-slate-700">{item.label}</dt>
                      <dd className="shrink-0 text-right text-xs font-semibold text-slate-500">{item.stateLabel}</dd>
                    </div>
                  ))}
                </dl>
              </article>

            </div>
          </SummarySection>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <SummarySection title="상권 데이터 근거" description="현재 위치에서 확인 가능한 주변 업종 관측과 서울시 공식상권 참고자료입니다.">
          <div className="mt-4 divide-y divide-slate-200">
            <section aria-label={`${analysisContext.target.radiusMeters ?? "선택"}m Kakao 장소검색`} className="pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-950">
                  {analysisContext.target.radiusMeters ?? "선택"}m Kakao 장소검색
                </h4>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  {evidence.kakao.statusLabel}
                </span>
              </div>
              <PresentationMetricGrid metrics={evidence.kakao.metrics} />
              {hasKakaoEvidence ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  ※ Kakao 장소검색 반환결과이며 실제 전체 경쟁점 전수자료가 아닙니다. 카테고리별 값과 중복 제거 장소는 합산하지 않으며, 실제 장소 상세는 ‘경쟁 환경’ 탭에서 확인합니다.
                </p>
              ) : null}
            </section>

            <LivingPopulationEvidence evidence={evidence.livingPopulation} />

            <section aria-label="서울시 공식상권" className="py-5">
              <h4 className="text-sm font-bold text-slate-950">서울시 공식상권</h4>
              {evidence.officialRelation.available ? (
                <dl className="mt-3 grid items-start gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                    <dt className="text-xs font-semibold text-slate-600">분석지점 포함</dt>
                    <dd className="mt-1 text-xl font-bold tabular-nums text-slate-950">{evidence.officialRelation.included.length}개</dd>
                    <dd className="mt-1 text-sm leading-6 text-slate-700">
                      {evidence.officialRelation.included.length > 0
                        ? evidence.officialRelation.included.map((area) => area.name).join(" · ")
                        : "포함된 공식상권 없음"}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                    <dt className="text-xs font-semibold text-slate-600">{analysisContext.target.radiusMeters ?? "분석"}m 반경 교차</dt>
                    <dd className="mt-1 text-xl font-bold tabular-nums text-slate-950">{evidence.officialRelation.overlapping.length}개</dd>
                    {evidence.officialRelation.overlapping.length > 0 ? (
                      <details className="mt-2 rounded-lg border border-blue-100 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-blue-800">
                          교차 공식상권 {evidence.officialRelation.overlapping.length}개 보기
                        </summary>
                        <ul className="grid gap-x-4 gap-y-1 border-t border-blue-100 px-3 py-2 text-xs leading-5 text-slate-700 sm:grid-cols-2 xl:grid-cols-3">
                          {evidence.officialRelation.overlapping.map((area) => (
                            <li key={area.basisResultIds.join(":")}>• {area.name}</li>
                          ))}
                        </ul>
                      </details>
                    ) : <p className="mt-1 text-sm text-slate-600">교차한 공식상권 없음</p>}
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-500">현재 서울시 공식상권과의 공간관계를 확인할 수 없습니다.</p>
              )}
              {hasOfficialRelationEvidence && !evidence.officialStats ? (
                <p className="mt-3 text-xs leading-5 text-blue-900">
                  서울시 공식상권은 현재 300m/500m 분석반경 및 FRAMEONE 주요상권과 서로 다른 공간단위입니다.
                </p>
              ) : null}
            </section>

            {evidence.officialStats ? (
              <section aria-label="선택 공식상권 통계" className="py-5">
                <h4 className="text-sm font-bold text-slate-950">선택 공식상권 통계</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  서울시 공식상권 · {evidence.officialStats.marketName} · {referencePeriodLabel(evidence.officialStats.referencePeriod)}
                </p>
                {evidence.officialStats.sales.length > 0 ? (
                  <div className="mt-4">
                    <h5 className="text-xs font-bold text-blue-900">서울시 공식상권 추정매출</h5>
                    <PresentationMetricGrid metrics={evidence.officialStats.sales} />
                  </div>
                ) : null}
                {evidence.officialStats.stores.length > 0 ? (
                  <div className="mt-4">
                    <h5 className="text-xs font-bold text-blue-900">서울시 공식상권 점포 통계</h5>
                    <PresentationMetricGrid metrics={evidence.officialStats.stores} />
                  </div>
                ) : null}
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  ※ 서울시 공식상권 전체 범위의 통계이며 현재 {analysisContext.target.radiusMeters ?? "300m/500m"} 반경 또는 특정 후보점포의 실적이 아닙니다. Kakao 장소검색 값과 합산하지 않습니다.
                </p>
              </section>
            ) : null}

            <section aria-label="상권 변화 참고" className="pt-5">
              <h4 className="text-sm font-bold text-slate-950">상권 변화 참고</h4>
              {evidence.trend ? (
                <>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    서울시 공식상권 · {evidence.trend.marketName} · {referencePeriodLabel(evidence.trend.referencePeriod)}
                  </p>
                  <PresentationMetricGrid metrics={evidence.trend.metrics} signed />
                  <p className="mt-3 text-xs leading-5 text-slate-500">분기 변화 자료이며 상권의 성장·쇠퇴 또는 출점 적합성을 판정하지 않습니다.</p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-500">비교 가능한 분기 변화 자료가 없습니다.</p>
              )}
            </section>
          </div>
        </SummarySection>

        {presentation.limitations.length > 0 ? (
          <SummarySection title="확인 필요 / 분석 한계" description="이번 분석에서 제외했거나 추가 확인이 필요한 범위입니다.">
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {presentation.limitations.map((group) => (
                <section key={group.id} aria-label={group.title} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <h4 className="text-sm font-bold text-slate-900">{group.title}</h4>
                  <ul className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <li key={item.id} className="rounded-lg bg-white px-3 py-2.5 text-sm leading-5 text-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-slate-900">{item.label}</p>
                          <span className="shrink-0 text-[11px] font-bold text-slate-500">{item.stateLabel}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </SummarySection>
        ) : null}

        <SummarySection title="다음 조사 단계" description="현장에서 확인할 사항과 이어서 분석할 데이터를 구분했습니다.">
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {presentation.fieldActions.length > 0 ? (
              <section aria-label="현장에서 확인할 사항">
                <h4 className="text-sm font-bold text-slate-950">현장에서 확인할 사항</h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {presentation.fieldActions.map((group) => (
                    <article key={group.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <h5 className="text-xs font-bold text-blue-900">{group.title}</h5>
                      <ul className="mt-1.5 space-y-1 text-sm leading-5 text-slate-700">
                        {group.actions.map((action) => <li key={action.id}>{action.message}</li>)}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            <section aria-label="다음 데이터 분석">
              <h4 className="text-sm font-bold text-slate-950">다음 데이터 분석</h4>
              <ul className="mt-2 space-y-2">
                {presentation.summary.nextAnalysis.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm leading-5 text-slate-800">
                    <span className="min-w-0">{item.label}</span>
                    <span className="shrink-0 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-800">{item.statusLabel}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </SummarySection>

        <SummarySection title="데이터 근거" description="상세 메타데이터는 직원 확인용으로 접어서 보관합니다.">
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-800">데이터 근거 <span className="text-lg font-bold tabular-nums text-slate-950">{presentation.audit.totalCount}건</span></p>
            <dl className="flex flex-wrap gap-2">
              {presentation.audit.groups.map((group) => (
                <div key={group.id} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                  <dt className="inline font-semibold">{group.label}</dt><dd className="ml-1 inline tabular-nums">{group.resultIds.length}</dd>
                </div>
              ))}
            </dl>
          </div>
          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">직원용 상세 근거 보기</summary>
            <div className="space-y-4 border-t border-slate-200 p-3">
              <p className="break-all rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-slate-500">
                Analysis Run ID · {viewModel.analysisRunId}
              </p>
              {presentation.audit.groups.map((group) => (
                <section key={group.id} aria-label={`${group.label} 상세 근거`}>
                  <h4 className="text-xs font-bold text-slate-700">{group.label} · {group.resultIds.length}건</h4>
                  <div className="mt-2 space-y-2">
                    {group.resultIds.map((resultId) => {
                      const result = evidenceById.get(resultId);
                      return result ? <EvidenceDetails key={result.resultId} result={result} /> : null;
                    })}
                  </div>
                </section>
              ))}
            </div>
          </details>
        </SummarySection>
      </div>
    </section>
  );
}
