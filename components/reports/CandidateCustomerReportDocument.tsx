import Link from "next/link";
import type { CandidateCustomerReport } from "@/lib/reports/candidate-customer-report";

function dateTime(value: string | null) {
  if (!value) return "자료 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function money(value: number | null | undefined) {
  return value === null || value === undefined ? "확인 필요" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function number(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "확인 필요" : `${value.toLocaleString("ko-KR")}${suffix}`;
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "확인 필요" : `${(value * 100).toFixed(1)}%`;
}

function range(min: number | undefined, max: number | undefined, suffix: string) {
  return min === undefined && max === undefined ? "확인 필요" : `${min ?? "확인 필요"}~${max ?? "확인 필요"}${suffix}`;
}

function availability(status: "AVAILABLE" | "NOT_AVAILABLE") {
  return status === "AVAILABLE" ? "참고자료 있음" : "자료 없음";
}

function officialRelation(value: string | undefined) {
  if (value === "INSIDE") return "분석점이 공식상권 내부";
  if (value === "RADIUS_OVERLAP") return "분석반경과 공식상권 중첩";
  return "확인 필요";
}

function sampleSufficiency(value: string | null) {
  if (value === "REFERENCE_ONLY") return "참고용 표본";
  if (value === "INSUFFICIENT_REFERENCE_ONLY") return "표본 부족 · 참고용";
  return "확인 필요";
}

function vatTreatment(value: string | undefined) {
  if (value === "INCLUDED") return "부가세 포함";
  if (value === "SEPARATE") return "부가세 별도";
  if (value === "EXEMPT") return "면세로 확인";
  if (value === "UNKNOWN") return "미확인";
  return "확인 필요";
}

function valueType(value: string | null) {
  if (!value) return null;
  if (value === "ACTUAL") return "실제값";
  if (value === "ESTIMATED" || value.includes("ESTIMATE")) return "추정값";
  if (value === "UNKNOWN") return "확인 필요";
  return "참고값";
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" | "warning" | "safe" }) {
  const styles = {
    neutral: "border-stone-200 bg-stone-100 text-stone-700",
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    safe: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${styles[tone]}`}>{children}</span>;
}

function Empty({ children = "자료 없음 또는 분석 미실행" }: { children?: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">{children}</p>;
}

function ContextualSourceNotice() {
  return <p className="mb-4 rounded-lg bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600">판단 시점 기준 참고자료 · 해당 판단 시점 이전에 저장된 분석자료</p>;
}

function Section({ number, title, basis, children }: { number: string; title: string; basis?: string | null; children: React.ReactNode }) {
  return (
    <section className="print-card rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#8b6f38]">SECTION {number}</p>
          <h2 className="mt-1 text-xl font-bold text-stone-950">{title}</h2>
        </div>
        {basis ? <p className="text-xs text-stone-500">기준 {basis}</p> : null}
      </div>
      {children}
    </section>
  );
}

function BulletList({ items, empty = "자료 없음" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return <ul className="space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 text-sm leading-6 text-stone-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a58547]" />{item}</li>)}</ul>;
}

function RiskGroup({ title, items, tone }: { title: string; items: Array<{ label: string; reason: string; nextAction?: string }>; tone: "danger" | "warning" | "neutral" }) {
  const styles = {
    danger: "border-red-200 bg-red-50/60",
    warning: "border-amber-200 bg-amber-50/60",
    neutral: "border-stone-200 bg-stone-50",
  };
  return (
    <article className={`rounded-lg border p-4 ${styles[tone]}`}>
      <h3 className="text-sm font-bold text-stone-950">{title} · {items.length}</h3>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((item) => <li key={`${item.label}-${item.reason}`} className="text-sm"><p className="font-semibold text-stone-900">{item.label}</p><p className="mt-1 leading-6 text-stone-600">{item.reason}</p>{item.nextAction ? <p className="mt-1 text-xs font-semibold text-[#725823]">다음 행동: {item.nextAction}</p> : null}</li>)}</ul> : <p className="mt-2 text-sm text-stone-500">해당 항목 없음</p>}
    </article>
  );
}

function CheckGrid({ checks }: { checks: CandidateCustomerReport["facility"]["checks"] }) {
  return <div className="mt-4 grid gap-2 sm:grid-cols-2">{checks.map((check) => <article key={check.label} className="rounded-lg border border-stone-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-stone-900">{check.label}</p><StatusPill tone={check.stateLabel === "불가" || check.stateLabel === "수용 곤란" ? "danger" : check.stateLabel === "조건부" || check.stateLabel === "확인 필요" ? "warning" : "safe"}>{check.stateLabel}</StatusPill></div><p className="mt-2 text-xs font-semibold text-stone-500">{check.verificationLabel}</p>{check.note ? <p className="mt-2 text-sm leading-6 text-stone-700">{check.note}</p> : null}</article>)}</div>;
}

function KeyValueGrid({ items }: { items: Array<{ label: string; value: React.ReactNode; note?: string }> }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{items.map((item) => <article key={item.label} className="rounded-lg border border-stone-200 bg-stone-50 p-3"><p className="text-xs font-semibold text-stone-500">{item.label}</p><p className="mt-1 break-words text-sm font-bold text-stone-950">{item.value}</p>{item.note ? <p className="mt-1 text-xs leading-5 text-stone-500">{item.note}</p> : null}</article>)}</div>;
}

export function CandidateCustomerReportDocument({ report }: { report: CandidateCustomerReport }) {
  const ready = report.meta.reportStatus === "REPORT_READY";
  const verdictTone = report.decision.verdict === "RISK" ? "danger" : report.decision.verdict === "RECOMMEND" ? "safe" : "warning";
  const parking = report.candidateSummary.parkingStatus === "AVAILABLE" ? "가능" : report.candidateSummary.parkingStatus === "UNAVAILABLE" ? "불가" : "확인 필요";
  const leaseTerms = report.lease.reviewedTerms;
  const consultation = report.consultation;
  const customer = consultation?.customer;
  const recommendation = consultation?.frameone;
  const capitalPlan = recommendation?.capitalPlan;
  const actualTerms = consultation?.candidateActual.askingTerms;

  return (
    <article className="report-doc mx-auto max-w-[1080px] space-y-5 pb-12 text-stone-900">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/cases/${encodeURIComponent(report.meta.caseId)}/candidates/${encodeURIComponent(report.meta.candidateId)}`} className="btn-outline">후보점포로 돌아가기</Link>
        <p className="text-xs text-stone-500">브라우저 인쇄 기능에서 A4 미리보기를 확인할 수 있습니다.</p>
      </div>

      <section className="print-card overflow-hidden rounded-2xl border border-stone-300 bg-white">
        <div className="border-b border-[#d8c59b] bg-[#1d1d1b] px-5 py-6 text-white sm:px-8 sm:py-9">
          <p className="text-xs font-bold tracking-[0.2em] text-[#d6bd83]">FRAMEONE STORE DEVELOPMENT REPORT</p>
          <h1 className="mt-5 break-words text-3xl font-bold sm:text-4xl">후보점포 진단 리포트</h1>
          <p className="mt-3 break-words text-lg text-stone-300">{report.candidateSummary.label}</p>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:p-8">
          <div>
            <p className="break-words text-sm leading-6 text-stone-600">{report.candidateSummary.address ?? "주소 확인 필요"}{report.candidateSummary.unit ? ` · ${report.candidateSummary.unit}` : ""}</p>
            <p className="mt-2 text-xs text-stone-500">{report.candidateSummary.caseName} · 리포트 생성 {dateTime(report.meta.generatedAt)}</p>
          </div>
          <div className="sm:text-right"><StatusPill tone={ready ? "safe" : "warning"}>{report.meta.reportStatus}</StatusPill><p className="mt-2 text-xs text-stone-500">근거 기준 {dateTime(report.meta.basisAt)}</p></div>
        </div>
      </section>

      {!ready ? <section className="print-card rounded-xl border-2 border-amber-300 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">현재 자료 변경으로 최종 고객용 리포트 확정 전 재검토가 필요합니다.</h2><ul className="mt-3 space-y-1 text-sm text-amber-900">{report.meta.reviewReasons.map((reason) => <li key={reason}>- {reason}</li>)}</ul></section> : null}

      <Section number="01" title="후보점포 요약">
        <KeyValueGrid items={[
          { label: "층", value: report.candidateSummary.floor ?? "확인 필요" },
          { label: "전용면적", value: report.candidateSummary.exclusiveAreaSqm === null ? "확인 필요" : `${report.candidateSummary.exclusiveAreaSqm.toLocaleString("ko-KR")}㎡` },
          { label: "전면", value: report.candidateSummary.frontageM === null ? "확인 필요" : `${report.candidateSummary.frontageM.toLocaleString("ko-KR")}m` },
          { label: "주차", value: parking, note: report.candidateSummary.parkingNote ?? undefined },
        ]} />
      </Section>

      {consultation ? <Section number="A–D" title="상담 기준과 자금계획">
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-sky-200 p-4"><h3 className="font-bold">A. 고객 목표 및 상담정보</h3><p className="mt-1 text-xs text-stone-500">고객이 상담 과정에서 제공한 정보입니다.</p><dl className="mt-4 space-y-2 text-sm"><div><dt className="text-stone-500">브랜드</dt><dd className="font-semibold">{customer?.brandName ?? "확인 필요"}</dd></div><div><dt className="text-stone-500">총 가용자본</dt><dd className="font-semibold">{money(customer?.totalAvailableCapitalWon)}</dd></div><div><dt className="text-stone-500">희망면적</dt><dd className="font-semibold">{range(customer?.preferredAreaMinPyeong, customer?.preferredAreaMaxPyeong, "평")}</dd></div><div><dt className="text-stone-500">목표 월 세전 영업이익</dt><dd className="font-semibold">{money(customer?.targetMonthlyOwnerIncomeWon)}</dd></div></dl></article>
          <article className="rounded-xl border border-amber-200 p-4"><h3 className="font-bold">B. FRAMEONE 권장조건</h3><p className="mt-1 text-xs text-stone-500">상담자가 제안한 검토 기준이며 자동 추천 결과가 아닙니다.</p><dl className="mt-4 space-y-2 text-sm"><div><dt className="text-stone-500">사업모델</dt><dd className="font-semibold">{recommendation?.recommendedConcept ?? "확인 필요"}</dd></div><div><dt className="text-stone-500">탐색면적</dt><dd className="font-semibold">{range(recommendation?.recommendedAreaMinPyeong, recommendation?.recommendedAreaMaxPyeong, "평")}</dd></div><div><dt className="text-stone-500">좌석</dt><dd className="font-semibold">{range(recommendation?.recommendedSeatMin, recommendation?.recommendedSeatMax, "석 검토")}</dd></div><div><dt className="text-stone-500">권리금 정책</dt><dd className="font-semibold">{recommendation?.premiumPolicy ?? "확인 필요"}</dd></div></dl></article>
          <article className="rounded-xl border border-emerald-200 p-4"><h3 className="font-bold">C. 후보점포 실제조건</h3><p className="mt-1 text-xs text-stone-500">후보점포에서 확인하거나 제공받은 조건입니다.</p><dl className="mt-4 space-y-2 text-sm"><div><dt className="text-stone-500">전용면적</dt><dd className="font-semibold">{consultation.candidateActual.exclusiveAreaSqm === null ? "확인 필요" : `${(consultation.candidateActual.exclusiveAreaSqm / 3.305785).toFixed(1)}평`}</dd></div><div><dt className="text-stone-500">보증금</dt><dd className="font-semibold">{money(actualTerms?.depositWon)}</dd></div><div><dt className="text-stone-500">월세 / 관리비</dt><dd className="font-semibold">{money(actualTerms?.monthlyRentWon)} / {money(actualTerms?.maintenanceFeeWon)}</dd></div><div><dt className="text-stone-500">권리금</dt><dd className="font-semibold">{money(actualTerms?.premiumWon)}</dd></div></dl></article>
        </div>
        <div className="mt-5"><h3 className="mb-3 text-sm font-bold">D. 자금계획 비교</h3><KeyValueGrid items={[
          { label: "총 가용자본", value: money(customer?.totalAvailableCapitalWon) },
          { label: "보존 운전자금", value: money(capitalPlan?.operatingReserveWon) },
          { label: "개점 전 투자한도", value: money(capitalPlan?.preOpeningInvestmentLimitWon) },
          { label: "보증금 예산", value: money(capitalPlan?.depositBudgetWon) },
          { label: "장비 예산", value: money(capitalPlan?.equipmentBudgetWon) },
          { label: "인테리어·설비", value: money(capitalPlan?.fitoutBudgetWon) },
          { label: "초도재료·집기·기타", value: money(capitalPlan?.openingCostBudgetWon) },
          { label: "권리금 예산", value: money(capitalPlan?.premiumBudgetWon) },
        ]} /></div>
      </Section> : null}

      <Section number="02" title="Executive Summary" basis={dateTime(report.meta.basisAt)}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-semibold text-stone-500">FRAMEONE 최종 판단</p><div className="mt-3"><StatusPill tone={verdictTone}>{report.executiveSummary.verdictLabel}</StatusPill></div></article>
          <article className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-semibold text-stone-500">Contract Readiness</p><p className="mt-3 font-bold">{report.executiveSummary.readinessStatus}</p></article>
          <article className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-semibold text-stone-500">기준 검증 시나리오 월매출</p><p className="mt-3 font-bold">{money(report.executiveSummary.baseMonthlySalesEstimate)}</p><p className="mt-1 text-xs text-stone-500">입력 가정 기반 매출 시뮬레이션</p></article>
          <article className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-semibold text-stone-500">월 손익분기 매출</p><p className="mt-3 font-bold">{money(report.executiveSummary.monthlyBepSales)}</p><p className="mt-1 text-xs text-stone-500">입력 가정 기반 추정치</p></article>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h3 className="mb-3 text-sm font-bold">핵심 리스크</h3><BulletList items={report.executiveSummary.keyRisks} empty="기록된 핵심 리스크 없음" /></div><div><h3 className="mb-3 text-sm font-bold">계약 전 핵심 완료조건</h3><BulletList items={report.executiveSummary.conditionsBeforeProceeding} empty="기록된 완료조건 없음" /></div></div>
      </Section>

      <Section number="03" title="핵심 리스크">
        <div className="grid gap-3 lg:grid-cols-2"><RiskGroup title="시설 Hard Blocker" items={report.facility.hard} tone="danger" /><RiskGroup title="임대차 Hard Issue" items={report.lease.hard} tone="danger" /></div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2"><RiskGroup title="시설 조건부" items={report.facility.conditional} tone="warning" /><RiskGroup title="임대차 조건부" items={report.lease.conditional} tone="warning" /></div>
      </Section>

      <Section number="04" title="입지·상권" basis={dateTime(report.locationMarket.generatedAt)}>
        <ContextualSourceNotice />
        {report.locationMarket.status === "NOT_AVAILABLE" ? <Empty /> : <><KeyValueGrid items={[
          { label: "분석대상", value: report.locationMarket.analysisTarget?.label ?? report.locationMarket.analysisTarget?.address ?? "확인 필요" },
          { label: "분석 반경", value: report.locationMarket.analysisTarget ? `${report.locationMarket.analysisTarget.radiusM}m` : "확인 필요" },
          { label: "공식상권", value: report.locationMarket.officialMarket?.name ?? "연결 없음" },
          { label: "공식상권 관계", value: officialRelation(report.locationMarket.officialMarket?.relation) },
        ]} />{report.locationMarket.features.length ? <div className="mt-5"><h3 className="mb-3 text-sm font-bold">확인된 입지 특징</h3><BulletList items={report.locationMarket.features} /></div> : null}{report.locationMarket.metrics.length ? <div className="mt-5 grid gap-2 sm:grid-cols-2">{report.locationMarket.metrics.map((metric, index) => <article key={`${index}-${metric.label}`} className="rounded-lg border border-stone-200 p-3"><p className="text-xs font-semibold text-stone-500">{metric.label}</p><p className="mt-1 font-bold">{metric.value === null ? "확인 필요" : `${String(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`}</p><p className="mt-1 text-xs text-stone-500">{metric.status}{metric.referencePeriod ? ` · ${metric.referencePeriod}` : ""}{valueType(metric.valueType) ? ` · ${valueType(metric.valueType)}` : ""}</p></article>)}</div> : null}{report.locationMarket.limitations.length ? <div className="mt-5"><h3 className="mb-3 text-sm font-bold">해석 시 주의</h3><BulletList items={report.locationMarket.limitations} /></div> : null}</>}
      </Section>

      <Section number="05" title="경쟁환경" basis={dateTime(report.competition.generatedAt)}>
        <ContextualSourceNotice />
        {report.competition.status === "NOT_AVAILABLE" ? <Empty /> : <><KeyValueGrid items={[
          { label: "Kakao 관측 후보", value: number(report.competition.uniqueObservedCandidateCount, "개"), note: "검색 관측이며 전수조사가 아닙니다." },
          { label: "공식상권 제과점 점포", value: number(report.competition.officialStoreCount, "개"), note: report.competition.officialReferencePeriod ?? "기준기간 확인 필요" },
          { label: "관측 범위", value: report.competition.observationScope ?? "확인 필요" },
          { label: "근거상태", value: availability(report.competition.status) },
        ]} /><div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{report.competition.distanceBands.map((band) => <article key={band.label} className="rounded-lg border border-stone-200 bg-stone-50 p-3"><p className="text-xs text-stone-500">{band.label}</p><p className="mt-1 font-bold">{band.count}개</p></article>)}</div><div className="mt-5"><h3 className="mb-3 text-sm font-bold">한계 및 확인사항</h3><BulletList items={report.competition.warnings} /></div></>}
      </Section>

      <Section number="06" title="임대시장" basis={report.rentalMarket.referenceDate ?? dateTime(report.rentalMarket.generatedAt)}>
        <ContextualSourceNotice />
        {report.rentalMarket.status === "NOT_AVAILABLE" ? <Empty /> : <><KeyValueGrid items={[
          { label: "확인 표본", value: number(report.rentalMarket.sampleCount, "건") },
          { label: "표본 상태", value: sampleSufficiency(report.rentalMarket.sampleSufficiency) },
          { label: "보증금 중앙값", value: money(report.rentalMarket.deposit?.median) },
          { label: "월세 중앙값", value: money(report.rentalMarket.rent?.median) },
          { label: "관리비 중앙값", value: money(report.rentalMarket.maintenanceFee?.median) },
        ]} /><p className="mt-4 text-xs leading-5 text-stone-500">임대시장 값은 확인된 표본의 참고 통계이며 해당 후보점포의 적정 임대료를 확정하지 않습니다.</p>{report.rentalMarket.limitations.length ? <div className="mt-4"><BulletList items={report.rentalMarket.limitations} /></div> : null}</>}
      </Section>

      <Section number="07" title="임대차 조건 검토" basis={dateTime(report.lease.basisAt)}>
        {report.lease.status === "NOT_AVAILABLE" ? <Empty /> : <><KeyValueGrid items={[
          { label: "보증금", value: money(leaseTerms?.depositWon) },
          { label: "월세", value: money(leaseTerms?.monthlyRentWon) },
          { label: "관리비", value: money(leaseTerms?.maintenanceFeeWon) },
          { label: "권리금", value: money(leaseTerms?.premiumWon) },
          { label: "계약기간", value: leaseTerms?.leaseTermMonths === undefined ? "확인 필요" : `${leaseTerms.leaseTermMonths}개월` },
          { label: "렌트프리", value: leaseTerms?.rentFreeMonths === undefined ? "확인 필요" : `${leaseTerms.rentFreeMonths}개월` },
          { label: "부가세", value: vatTreatment(leaseTerms?.vatTreatment) },
          { label: "인도일", value: leaseTerms?.handoverDate ?? "확인 필요" },
        ]} /><div className="mt-4 grid gap-3 lg:grid-cols-3"><RiskGroup title="Hard" items={report.lease.hard} tone="danger" /><RiskGroup title="조건부" items={report.lease.conditional} tone="warning" /><RiskGroup title="확인 필요" items={report.lease.unresolved} tone="neutral" /></div><CheckGrid checks={report.lease.checks} /></>}
      </Section>

      <Section number="08" title="시설·베이커리 적합성" basis={dateTime(report.facility.basisAt)}>
        {report.facility.status === "NOT_AVAILABLE" ? <Empty /> : <><div className="grid gap-3 lg:grid-cols-3"><RiskGroup title="Hard Blocker" items={report.facility.hard} tone="danger" /><RiskGroup title="조건부" items={report.facility.conditional} tone="warning" /><RiskGroup title="확인 필요" items={report.facility.unresolved} tone="neutral" /></div><CheckGrid checks={report.facility.checks} /><p className="mt-4 text-xs leading-5 text-stone-500">전기·배기·급배수·소방·위생·건축물 용도 및 인허가 관련 항목은 계약·공사 전에 전문가와 관할기관의 최종 확인이 필요합니다.</p></>}
      </Section>

      <Section number="09" title="사업성 / BEP" basis={dateTime(report.economics.generatedAt)}>
        <p className="mb-3 text-xs text-stone-500">사업성 수치는 입력 가정에 따른 추정치이며 실제 매출이나 수익을 보장하지 않습니다.</p>
        {report.economics.status === "NOT_AVAILABLE" ? <Empty>경제성 필수 입력값이 확인되지 않았거나 Decision 기준 계산 결과를 조회하지 못해 현재 손익분기점을 계산할 수 없습니다.</Empty> : <><div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">아래 결제건수는 상권에서 실제 발생할 것으로 예측한 수요가 아니라, 현재 사업비용 구조를 검토하기 위한 시나리오 입력값입니다. 매출·수익·손익분기점은 입력 가정 기반 시뮬레이션이며 실제 결과를 보장하지 않습니다.</div><div className="mt-4"><h3 className="mb-3 text-sm font-bold">입력 가정</h3><KeyValueGrid items={report.economics.assumptions.map((item) => ({ label: item.label, value: `${item.value.toLocaleString("ko-KR")} ${item.unit}` }))} /></div><div className="mt-5"><h3 className="mb-3 text-sm font-bold">검증 시나리오</h3><div className="grid gap-3 md:grid-cols-3">{report.economics.scenarios.map((scenario) => <article key={scenario.label} className="rounded-lg border border-stone-200 p-4"><p className="font-bold">{scenario.label}</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-stone-500">입력 가정 기반 월매출</dt><dd className="font-semibold">{money(scenario.monthlySales)}</dd></div><div className="flex justify-between gap-3"><dt className="text-stone-500">영업이익 시뮬레이션</dt><dd className="font-semibold">{money(scenario.estimatedOperatingProfit)}</dd></div><div className="flex justify-between gap-3"><dt className="text-stone-500">월세 부담률</dt><dd className="font-semibold">{percent(scenario.rentBurdenRate)}</dd></div></dl></article>)}</div></div><div className="mt-5"><h3 className="mb-3 text-sm font-bold">필요 수요</h3><KeyValueGrid items={[
          { label: "월 손익분기 매출", value: money(report.economics.bep?.monthlyBepSales) },
          { label: "일 손익분기 매출", value: money(report.economics.bep?.dailyBepSales) },
          { label: "BEP 필요 일 결제건수", value: number(report.economics.bep?.requiredDailyTransactions, "건") },
          { label: "목표 월 세전 영업이익", value: money(report.economics.requiredDemand?.targetMonthlyOwnerIncomeWon) },
          { label: "목표소득 달성 필요 월매출", value: money(report.economics.requiredDemand?.requiredMonthlySales) },
          { label: "목표소득 달성 필요 일 결제건수", value: number(report.economics.requiredDemand?.requiredDailyTransactions, "건") },
          { label: "시장수요 충족 가능성", value: "추가 분석 필요", note: "검증된 시장수요 예측 엔진 결과가 아닙니다." },
          { label: "계산 버전", value: report.economics.engineVersion ?? "확인 필요", note: `가정 revision ${report.economics.assumptionRevision ?? "확인 필요"}` },
        ]} /></div>{report.economics.officialBenchmark ? <article className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold text-blue-950">공식상권 참고값 — 후보점포 예상매출과 별도</p><p className="mt-2 text-sm text-blue-900">{report.economics.officialBenchmark.label}: {money(report.economics.officialBenchmark.value)}{report.economics.officialBenchmark.period ? ` · ${report.economics.officialBenchmark.period}` : ""}</p><p className="mt-2 text-xs leading-5 text-blue-800">{report.economics.officialBenchmark.limitation}</p></article> : null}</>}
      </Section>

      <Section number="10" title="Contract Readiness" basis={dateTime(report.readiness.savedAt)}>
        <div className="mb-4"><StatusPill tone={report.readiness.status === "READY" ? "safe" : report.readiness.status === "BLOCKED" ? "danger" : "warning"}>{report.readiness.status}</StatusPill></div><div className="grid gap-4 lg:grid-cols-2"><div><h3 className="mb-3 text-sm font-bold">차단요인</h3><BulletList items={report.readiness.blockingIssues} empty="기록된 차단요인 없음" /></div><div><h3 className="mb-3 text-sm font-bold">검토사항</h3><BulletList items={report.readiness.reviewIssues} empty="기록된 검토사항 없음" /></div><div><h3 className="mb-3 text-sm font-bold">Evidence gaps</h3><BulletList items={report.readiness.evidenceGaps} empty="기록된 Evidence gap 없음" /></div><div><h3 className="mb-3 text-sm font-bold">다음 행동</h3><BulletList items={report.readiness.nextActions} empty="기록된 다음 행동 없음" /></div></div>
      </Section>

      <Section number="11" title="FRAMEONE 최종 판단" basis={dateTime(report.decision.decidedAt)}>
        {report.decision.status === "NOT_AVAILABLE" ? <Empty>최종 판단이 아직 기록되지 않았습니다.</Empty> : <><div className="flex flex-wrap items-center gap-3"><StatusPill tone={verdictTone}>{report.decision.verdictLabel}</StatusPill><p className="text-xs text-stone-500">담당자 {report.decision.reviewerName}</p></div><p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7 text-stone-900">{report.decision.rationale}</p><div className="mt-5 grid gap-4 lg:grid-cols-3"><div><h3 className="mb-3 text-sm font-bold">긍정요인</h3><BulletList items={report.decision.positiveFactors} /></div><div><h3 className="mb-3 text-sm font-bold">핵심위험</h3><BulletList items={report.decision.keyRisks} /></div><div><h3 className="mb-3 text-sm font-bold">미확인 사항</h3><BulletList items={report.decision.unresolvedConditions} /></div></div></>}
      </Section>

      <Section number="12" title="계약 전 완료조건"><BulletList items={report.decision.conditionsBeforeProceeding} empty="기록된 계약 전 완료조건 없음" /></Section>
      <Section number="13" title="임대인 확인사항"><BulletList items={report.decision.landlordConfirmations} empty="기록된 임대인 확인사항 없음" /></Section>
      <Section number="14" title="전문가 확인사항"><BulletList items={report.decision.expertConfirmations} empty="기록된 전문가 확인사항 없음" /></Section>
      <Section number="15" title="다음 실행 순서"><BulletList items={report.decision.nextActions.length ? report.decision.nextActions : report.readiness.nextActions} empty="기록된 다음 실행 없음" /></Section>

      <Section number="16" title="분석기준 · 근거 · Disclaimer" basis={dateTime(report.meta.basisAt)}>
        <h3 className="text-sm font-bold text-stone-950">Decision Basis Sources</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">Human Decision · Readiness Snapshot</p><p className="mt-1 text-sm font-bold">{report.provenance.decisionBasisSources.humanDecision && report.provenance.decisionBasisSources.readinessSnapshot ? "명시적 binding 확인" : "확인 필요"}</p></article>
          <article className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">Facility · Lease</p><p className="mt-1 text-sm font-bold">{report.provenance.decisionBasisSources.facility || report.provenance.decisionBasisSources.lease ? "Readiness Snapshot binding 기준" : "자료 없음"}</p></article>
          <article className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">Analysis Run · Economic</p><p className="mt-1 text-sm font-bold">{report.provenance.decisionBasisSources.economic ? `${report.provenance.decisionBasisSources.economic.engineVersion} · revision ${report.provenance.decisionBasisSources.economic.assumptionRevision}` : report.provenance.decisionBasisSources.analysisRun ? "Analysis Run binding 기준" : "자료 없음"}</p></article>
        </div>
        <h3 className="mt-5 text-sm font-bold text-stone-950">Contextual Sources</h3>
        <p className="mt-1 text-xs leading-5 text-stone-500">Location · Competition · Rental Market은 판단 시점 기준 참고자료이며 Human Decision에 직접 binding된 근거가 아닙니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <article className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">Location</p><p className="mt-1 text-sm font-bold">{report.provenance.contextualSources.location ? dateTime(report.provenance.contextualSources.location.generatedAt) : "자료 없음"}</p></article>
          <article className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">Competition</p><p className="mt-1 text-sm font-bold">{report.provenance.contextualSources.competition ? dateTime(report.provenance.contextualSources.competition.generatedAt) : "자료 없음"}</p></article>
          <article className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">Rental Market</p><p className="mt-1 text-sm font-bold">{report.provenance.contextualSources.rentalMarket ? dateTime(report.provenance.contextualSources.rentalMarket.generatedAt) : "자료 없음"}</p></article>
        </div>
        <div className="mt-5 rounded-lg border border-stone-300 bg-stone-50 p-4"><BulletList items={report.disclaimer} /></div>
      </Section>
    </article>
  );
}
