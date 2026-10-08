"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateEconomicFeasibility } from "@/lib/economic-feasibility/engine";
import type { EconomicPlanInput, EconomicScenarioResult } from "@/lib/economic-feasibility/types";
import type { BakeryOfficialMarketData } from "@/lib/market-data/services/bakery-official-market";
import type { ActiveAnalysisTarget } from "@/lib/market-data/basic-location/run";
import type { RentalMarketResult, RentalScopeConfirmation } from "@/lib/research/types";
import {
  createRentalScopeConfirmation,
  isRentalScopeConfirmationCurrent,
} from "@/lib/research/rental-scope";
import {
  economicResultStatus,
  officialBenchmarkIdentity,
  type BoundEconomicResult,
  type EconomicResultBinding,
} from "@/lib/economic-feasibility/workspace-binding";
import { AnalysisTargetHeader } from "../AnalysisWorkflow";
import { persistAnalysisRunSection } from "@/lib/analysis-runs/analysis-run-client";

const ECONOMIC_WORKSPACE_SESSION_KEY = "frameone:economic-workspace:v1";

const initialPlan: EconomicPlanInput = {
  expectedTicket: 0,
  operatingDaysPerMonth: 0,
  salesScenario: {
    conservativeDailyTransactions: 0,
    baseDailyTransactions: 0,
    upsideDailyTransactions: 0,
  },
  variableCostRates: {
    materialCostRate: 0,
    packagingCostRate: 0,
    cardFeeRate: 0,
    deliveryVariableRate: 0,
    otherVariableRate: 0,
  },
  fixedMonthlyCosts: {
    laborMonthly: 0,
    rentMonthly: 0,
    managementFeeMonthly: 0,
    utilitiesMonthly: 0,
    marketingMonthly: 0,
    posAccountingMonthly: 0,
    insuranceMonthly: 0,
    otherFixedMonthly: 0,
    deliveryFixedMonthly: 0,
  },
  rentPlanning: { targetRentBurdenRate: 0 },
};

const moneyFields: Array<[keyof EconomicPlanInput["fixedMonthlyCosts"], string]> = [
  ["laborMonthly", "월 인건비"],
  ["rentMonthly", "월세"],
  ["managementFeeMonthly", "월 관리비"],
  ["utilitiesMonthly", "월 공과금"],
  ["marketingMonthly", "월 마케팅비"],
  ["posAccountingMonthly", "POS·회계비"],
  ["insuranceMonthly", "월 보험료 입력값"],
  ["otherFixedMonthly", "기타 고정비"],
  ["deliveryFixedMonthly", "배달 고정비(선택)"],
];

const rateFields: Array<[keyof EconomicPlanInput["variableCostRates"], string]> = [
  ["materialCostRate", "원재료비율"],
  ["packagingCostRate", "포장비율"],
  ["cardFeeRate", "카드수수료율"],
  ["deliveryVariableRate", "배달 변동비율"],
  ["otherVariableRate", "기타 변동비율"],
];

function numericValue(value: string) {
  return value === "" ? 0 : Number(value);
}

function Money({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span>계산 불가</span>;
  const rounded = Math.round(value);
  return <span>{rounded.toLocaleString("ko-KR")}원 <span className="text-slate-400">/ {(rounded / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원</span></span>;
}

function Percent({ value }: { value: number | null }) {
  return <span>{value === null || !Number.isFinite(value) ? "계산 불가" : `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`}</span>;
}

function NumberInput({ label, value, onChange, suffix = "원", step = 1 }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <input className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none" type="number" min="0" step={step} value={value || ""} onChange={(event) => onChange(numericValue(event.target.value))} />
        <span className="text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-[#0B1220]">{children}</dd></div>;
}

function ScenarioCard({ title, scenario, rent, labor }: { title: string; scenario: EconomicScenarioResult; rent: number; labor: number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-base font-bold text-[#0B1220]">{title}</h4>
      <p className="mt-1 text-xs text-slate-500">사용자 입력 {scenario.dailyTransactions.toLocaleString("ko-KR")}건/일 · 입력값 기준 추정</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Metric label="추정 월매출"><Money value={scenario.monthlySales} /></Metric>
        <Metric label="일매출"><Money value={scenario.dailySales} /></Metric>
        <Metric label="원재료비"><Money value={scenario.materialCost} /></Metric>
        <Metric label="인건비"><Money value={scenario.totalFixedCost === null ? null : labor} /></Metric>
        <Metric label="월세"><Money value={rent} /></Metric>
        <Metric label="총비용"><Money value={scenario.totalCost} /></Metric>
        <Metric label="추정 영업이익 · 입력값 기준"><Money value={scenario.estimatedOperatingProfit} /></Metric>
        <Metric label="영업이익률"><Percent value={scenario.operatingMargin} /></Metric>
        <Metric label="월세 부담률"><Percent value={scenario.rentBurdenRate} /></Metric>
        <Metric label="점유비율"><Percent value={scenario.occupancyCostRate} /></Metric>
        <Metric label="인건비율"><Percent value={scenario.laborRate} /></Metric>
        <Metric label="원재료비율"><Percent value={scenario.materialRate} /></Metric>
        <Metric label="Prime Cost"><Percent value={scenario.primeCostRate} /></Metric>
      </dl>
    </article>
  );
}

function relationLabel(value: "BELOW_OR_EQUAL" | "ABOVE" | "NOT_AVAILABLE") {
  if (value === "BELOW_OR_EQUAL") return "상한 이하";
  if (value === "ABOVE") return "상한 초과";
  return "비교자료 없음";
}

export default function EconomicFeasibilityClient({
  activeTarget,
  rentalMarketResult,
  officialMarketData,
  officialStatus,
  initialEconomicResult,
  initialRentalConfirmation,
}: {
  activeTarget: ActiveAnalysisTarget | null;
  rentalMarketResult: RentalMarketResult;
  officialMarketData: BakeryOfficialMarketData | null;
  officialStatus: string;
  initialEconomicResult: BoundEconomicResult | null;
  initialRentalConfirmation: RentalScopeConfirmation | null;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [assumptionRevision, setAssumptionRevision] = useState(0);
  const [rentalConfirmation, setRentalConfirmation] = useState<RentalScopeConfirmation | null>(initialRentalConfirmation);
  const [rentalScopeBasis, setRentalScopeBasis] = useState(initialRentalConfirmation?.basis ?? "");
  const [hydrated, setHydrated] = useState(false);
  const benchmarkIdentity = useMemo(
    () => officialBenchmarkIdentity(officialMarketData),
    [officialMarketData],
  );
  const rentalConfirmationCurrent = isRentalScopeConfirmationCurrent(
    rentalConfirmation,
    {
      analysisRunId: activeTarget?.analysisRunId,
      officialMarketCode: activeTarget?.officialReference?.marketCode,
      selectedRecordIds: rentalMarketResult.selectedRecordIds,
    },
  );
  const expectedBinding = useMemo<EconomicResultBinding | null>(() =>
    activeTarget
      ? {
          analysisRunId: activeTarget.analysisRunId,
          officialBenchmarkIdentity: benchmarkIdentity,
          rentalConfirmationId: rentalConfirmationCurrent
            ? rentalConfirmation?.confirmationId ?? null
            : null,
          assumptionRevision,
        }
      : null,
  [activeTarget, assumptionRevision, benchmarkIdentity, rentalConfirmation?.confirmationId, rentalConfirmationCurrent]);

  const calculateBoundResult = useCallback((
    nextPlan: EconomicPlanInput,
    nextRevision: number,
    confirmation: RentalScopeConfirmation | null,
  ): BoundEconomicResult | null => {
    if (!activeTarget) return null;
    const confirmed = isRentalScopeConfirmationCurrent(confirmation, {
      analysisRunId: activeTarget.analysisRunId,
      officialMarketCode: activeTarget.officialReference?.marketCode,
      selectedRecordIds: rentalMarketResult.selectedRecordIds,
    }) ? confirmation : null;
    const generatedAt = new Date().toISOString();
    const binding: EconomicResultBinding = {
      analysisRunId: activeTarget.analysisRunId,
      officialBenchmarkIdentity: benchmarkIdentity,
      rentalConfirmationId: confirmed?.confirmationId ?? null,
      assumptionRevision: nextRevision,
    };
    return {
      generatedAt,
      binding,
      result: calculateEconomicFeasibility({
        plan: nextPlan,
        officialMarketData,
        rentalMarketResult,
        rentalMarketScopeConfirmation: officialMarketData && confirmed
          ? {
              status: "CONFIRMED",
              officialAreaId: officialMarketData.officialMarketCode,
              selectedRecordIds: confirmed.selectedRecordIds,
              basis: confirmed.basis,
            }
          : null,
        generatedAt,
      }),
    };
  }, [activeTarget, benchmarkIdentity, officialMarketData, rentalMarketResult]);

  const [calculation, setCalculation] = useState<BoundEconomicResult | null>(() => {
    if (initialEconomicResult) return initialEconomicResult;
    if (!activeTarget) return null;
    const generatedAt = new Date().toISOString();
    return {
          generatedAt,
          binding: {
            analysisRunId: activeTarget.analysisRunId,
            officialBenchmarkIdentity: officialBenchmarkIdentity(officialMarketData),
            rentalConfirmationId: null,
            assumptionRevision: 0,
          },
          result: calculateEconomicFeasibility({
            plan: initialPlan,
            officialMarketData,
            rentalMarketResult,
            rentalMarketScopeConfirmation: null,
            generatedAt,
          }),
        };
  });

  const runAndPersistCalculation = useCallback(() => {
    const next = calculateBoundResult(plan, assumptionRevision, rentalConfirmation);
    setCalculation(next);
    if (next && activeTarget) {
      void persistAnalysisRunSection({ section: "economic", target: activeTarget, result: next }).catch(() => undefined);
    }
  }, [activeTarget, assumptionRevision, calculateBoundResult, plan, rentalConfirmation]);

  const updateRentalConfirmation = useCallback((checked: boolean) => {
    if (!checked || !activeTarget) {
      setRentalConfirmation(null);
      return;
    }
    const confirmation = createRentalScopeConfirmation({
      analysisRunId: activeTarget.analysisRunId,
      officialMarketCode: activeTarget.officialReference?.marketCode ?? null,
      method: "MANUAL_ADDRESS_REVIEW",
      selectedRecordIds: rentalMarketResult.selectedRecordIds,
      basis: rentalScopeBasis,
    });
    setRentalConfirmation(confirmation);
    void persistAnalysisRunSection({
      section: "rental",
      target: activeTarget,
      generatedAt: confirmation.confirmedAt,
      confirmation,
      result: rentalMarketResult,
    }).catch(() => undefined);
  }, [activeTarget, rentalMarketResult, rentalScopeBasis]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(ECONOMIC_WORKSPACE_SESSION_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as {
            plan?: EconomicPlanInput;
            assumptionRevision?: number;
            rentalScopeBasis?: string;
            rentalConfirmation?: RentalScopeConfirmation | null;
            calculation?: BoundEconomicResult | null;
          };
          if (stored.plan && typeof stored.plan === "object") setPlan(stored.plan);
          if (Number.isInteger(stored.assumptionRevision) && stored.assumptionRevision! >= 0) setAssumptionRevision(stored.assumptionRevision!);
          if (typeof stored.rentalScopeBasis === "string") setRentalScopeBasis(stored.rentalScopeBasis);
          const storedConfirmation = stored.rentalConfirmation ?? null;
          setRentalConfirmation(isRentalScopeConfirmationCurrent(storedConfirmation, {
            analysisRunId: activeTarget?.analysisRunId,
            officialMarketCode: activeTarget?.officialReference?.marketCode,
            selectedRecordIds: rentalMarketResult.selectedRecordIds,
          }) ? storedConfirmation : null);
          if (stored.calculation) setCalculation(stored.calculation);
        }
      } catch {
        // Invalid tab-scoped data is ignored; no persistent data is changed.
      } finally {
        setHydrated(true);
      }
    });
    return () => { active = false; };
  }, [activeTarget?.analysisRunId, activeTarget?.officialReference?.marketCode, rentalMarketResult.selectedRecordIds]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(ECONOMIC_WORKSPACE_SESSION_KEY, JSON.stringify({
        plan,
        assumptionRevision,
        rentalScopeBasis,
        rentalConfirmation,
        calculation,
      }));
    } catch {
      // The server-side Analysis Run snapshot remains available when the
      // browser's tab-scoped storage quota is exhausted.
    }
  }, [assumptionRevision, calculation, hydrated, plan, rentalConfirmation, rentalScopeBasis]);

  const updatePlan = useCallback((updater: (current: EconomicPlanInput) => EconomicPlanInput) => {
    setPlan((current) => updater(current));
    setAssumptionRevision((current) => current + 1);
  }, []);
  const resultStatus = economicResultStatus(calculation, expectedBinding);
  const result = calculation?.result ?? calculateEconomicFeasibility({
    plan,
    officialMarketData,
    rentalMarketResult,
    rentalMarketScopeConfirmation: null,
    generatedAt: new Date().toISOString(),
  });

  const fixed = plan.fixedMonthlyCosts;
  const benchmark = result.officialBenchmark;
  const rental = result.rentalMarketReference;
  const benchmarkBindingCurrent = JSON.stringify(calculation?.binding.officialBenchmarkIdentity ?? null) ===
    JSON.stringify(expectedBinding?.officialBenchmarkIdentity ?? null);
  const rentalBindingCurrent = (calculation?.binding.rentalConfirmationId ?? null) ===
    (expectedBinding?.rentalConfirmationId ?? null);

  return (
    <div className="space-y-6">
      <AnalysisTargetHeader target={activeTarget} status={resultStatus} officialReferencePeriod={officialMarketData?.referencePeriod ?? null} />
      {resultStatus !== "CURRENT" ? (
        <section className="panel-card border-amber-300 bg-amber-50 p-4" role="status">
          <p className="text-sm font-bold text-amber-950">{resultStatus === "STALE" ? "다시 분석 필요" : "아직 계산하지 않음"}</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">{resultStatus === "STALE" ? "이 결과는 이전 분석대상 또는 이전 조건으로 생성되었습니다. 입력한 사업계획은 현재 탭에서 그대로 이어집니다." : "분석대상을 확정한 뒤 현재 조건으로 계산해 주세요."}</p>
          <button type="button" disabled={!activeTarget} onClick={runAndPersistCalculation} className="mt-3 min-h-11 rounded-lg bg-amber-900 px-4 text-sm font-bold text-white disabled:opacity-50">현재 조건으로 다시 계산</button>
        </section>
      ) : (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-900">현재 분석대상·공식자료·임대 확인범위·사업계획 입력과 일치하는 결과입니다.</p>
          <button type="button" onClick={runAndPersistCalculation} className="btn-outline">현재 조건으로 다시 계산</button>
        </section>
      )}
      {calculation && activeTarget && calculation.binding.analysisRunId !== activeTarget.analysisRunId ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold text-blue-900">
          이전 분석대상에서 입력한 사업계획을 이어 사용 중입니다. 현재 대상의 임대조건과 공식 참고자료를 확인한 뒤 다시 계산해 주세요.
        </p>
      ) : null}
      <section className="panel-card p-5 md:p-6">
        <h3 className="text-lg font-bold">사업계획 입력</h3>
        <p className="mt-1 text-xs text-slate-500">모든 금액은 원, 비율은 화면에서 %로 입력합니다. 일 결제건수는 시장 수요예측값이 아니라 사업비용 구조를 검토하기 위한 검증 시나리오 입력값입니다.</p>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberInput label="예상 객단가" value={plan.expectedTicket} onChange={(value) => updatePlan((current) => ({ ...current, expectedTicket: value }))} />
            <NumberInput label="월 영업일" suffix="일" value={plan.operatingDaysPerMonth} onChange={(value) => updatePlan((current) => ({ ...current, operatingDaysPerMonth: value }))} />
            {(["conservativeDailyTransactions", "baseDailyTransactions", "upsideDailyTransactions"] as const).map((field, index) => (
              <NumberInput key={field} label={`${["보수", "기준", "상향"][index]} 일 결제건수`} suffix="건" value={plan.salesScenario[field]} onChange={(value) => updatePlan((current) => ({ ...current, salesScenario: { ...current.salesScenario, [field]: value } }))} />
            ))}
            <NumberInput label="사용자 설정 목표 월세부담률" suffix="%" step={0.1} value={plan.rentPlanning.targetRentBurdenRate * 100} onChange={(value) => updatePlan((current) => ({ ...current, rentPlanning: { targetRentBurdenRate: value / 100 } }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {rateFields.map(([field, label]) => <NumberInput key={field} label={label} suffix="%" step={0.1} value={plan.variableCostRates[field] * 100} onChange={(value) => updatePlan((current) => ({ ...current, variableCostRates: { ...current.variableCostRates, [field]: value / 100 } }))} />)}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {moneyFields.map(([field, label]) => <NumberInput key={field} label={label} value={plan.fixedMonthlyCosts[field] ?? 0} onChange={(value) => updatePlan((current) => ({ ...current, fixedMonthlyCosts: { ...current.fixedMonthlyCosts, [field]: value } }))} />)}
        </div>
        {(result.validation.errors.length > 0 || result.validation.warnings.length > 0) && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs text-amber-900">
            {[...result.validation.errors, ...result.validation.warnings].map((message) => <p key={message}>• {message}</p>)}
          </div>
        )}
      </section>

      <section className="panel-card p-5 md:p-6">
        <h3 className="text-lg font-bold">공식상권 참고자료 연결</h3>
        <p className="mt-3 text-sm font-semibold text-slate-700">{officialStatus}</p>
        <p className="mt-2 text-xs text-slate-500">현재 분석대상의 공식통계 참고상권을 사용하며, 매출·점포 자료가 함께 존재하는 최신 공통 분기를 자동 적용합니다.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl bg-[#0B1220] p-4 text-white"><p className="text-xs text-slate-300">기준 검증 시나리오 월매출</p><p className="mt-2 font-bold"><Money value={result.scenarios.base.monthlySales} /></p><p className="mt-1 text-xs text-slate-300">입력 가정 기반 매출 시뮬레이션</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">손익분기매출</p><p className="mt-2 font-bold"><Money value={result.bep.monthlyBepSales} /></p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">BEP 필요 일매출</p><p className="mt-2 font-bold"><Money value={result.bep.dailyBepSales} /></p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">BEP 필요 일결제건수</p><p className="mt-2 font-bold">{result.bep.requiredDailyTransactionsForBep === null ? "계산 불가" : `${result.bep.requiredDailyTransactionsForBep.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}건 (운영 참고 ${Math.ceil(result.bep.requiredDailyTransactionsForBep)}건)`}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">기준 월세 부담률</p><p className="mt-2 font-bold"><Percent value={result.scenarios.base.rentBurdenRate} /></p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">추정 영업이익 · 입력값 기준</p><p className="mt-2 font-bold"><Money value={result.scenarios.base.estimatedOperatingProfit} /></p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">사용자 설정 기준 월세상한</p><p className="mt-2 font-bold"><Money value={result.rentCeiling.baseRentCeiling} /></p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">손익분기 매출 대비 여유</p><p className="mt-2 font-bold"><Money value={result.bep.baseBufferAmount} /> <span className="block text-xs text-slate-500"><Percent value={result.bep.baseBufferRate} /></span></p></article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ScenarioCard title="보수" scenario={result.scenarios.conservative} rent={fixed.rentMonthly} labor={fixed.laborMonthly} />
        <ScenarioCard title="기준" scenario={result.scenarios.base} rent={fixed.rentMonthly} labor={fixed.laborMonthly} />
        <ScenarioCard title="상향" scenario={result.scenarios.upside} rent={fixed.rentMonthly} labor={fixed.laborMonthly} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel-card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Official benchmark</p>
          <h3 className="mt-1 text-lg font-bold">공식상권 제과점 점포당 참고매출</h3>
          {!benchmarkBindingCurrent ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">현재 공식통계 참고상권·분기와 다른 이전 benchmark는 표시하지 않습니다. 다시 계산해 주세요.</p>
          ) : (
            <><p className="mt-4 text-xl font-bold"><Money value={benchmark.value} /></p>{benchmark.status === "AVAILABLE" ? <p className="mt-2 text-xs text-slate-500">{benchmark.source.join(" · ")} · {benchmark.officialAreaName} · {benchmark.period} · {benchmark.industry.name} · {benchmark.totalSalesLabel} <Money value={benchmark.totalSales} /> ÷ 점포 {benchmark.storeCount}개</p> : <p className="mt-2 text-sm font-semibold text-amber-700">확인 가능한 공식자료가 부족합니다. {benchmark.unavailableReasons.join(" ")}</p>}</>
          )}
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">후보점포 예상매출이 아니라 공식상권 참고지표입니다. 동일 공식상권·동일 기준분기·동일 업종의 월 추정매출 통계를 점포수로 나눕니다.</p>
        </article>
        <article className="panel-card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Rental comparison</p>
          <h3 className="mt-1 text-lg font-bold">FRAMEONE 확인 표본 · 광고·확인자료 기준</h3>
          {!rentalBindingCurrent ? (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">현재 분석대상과 임대 표본의 비교범위를 다시 확인해야 합니다. 이전 범위의 비교값은 표시하지 않습니다.</div>
          ) : rental.status !== "AVAILABLE" ? (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">{rental.status === "NEEDS_CONFIRMATION" ? "현재 임대 조사표본의 분석범위가 선택한 상권과 연결되지 않아 자동 비교하지 않습니다." : rental.scope.reason}</div>
          ) : (
            <><p className="mt-1 text-xs font-semibold text-amber-700">{rental.sampleSufficiency === "INSUFFICIENT_REFERENCE_ONLY" ? "표본 부족 — 참고용" : "조사표본 참고용"}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Metric label={`확인 표본 ${rental.sampleCount}건 · 월세 중앙값 · ${relationLabel(rental.medianRentToCeiling)}`}><Money value={rental.medianRent} /></Metric><Metric label="월세 범위"><Money value={rental.minRent} /> ~ <Money value={rental.maxRent} /></Metric><Metric label={`사업계획 월세 · ${relationLabel(rental.plannedRentToCeiling)}`}><Money value={rental.plannedRent} /></Metric><Metric label="BASE 사용자 기준 월세상한"><Money value={rental.baseRentCeiling} /></Metric></dl><p className="mt-4 text-xs text-slate-500">{rental.limitation}</p></>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="block text-xs font-semibold text-slate-600">범위 확인 근거<input className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={rentalScopeBasis} onChange={(event) => { setRentalScopeBasis(event.target.value); setRentalConfirmation(null); }} placeholder="예: 대상 표본 주소를 선택 공식상권과 수동 대조" /></label>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600"><input className="mt-0.5" type="checkbox" disabled={!activeTarget || !officialMarketData || !rentalScopeBasis.trim()} checked={rentalConfirmationCurrent} onChange={(event) => updateRentalConfirmation(event.target.checked)} /><span>현재 선택된 표본 전체를 주소 기준으로 수동 대조해 현재 분석대상 비교범위로 확인했습니다.</span></label>
          </div>
        </article>
      </section>

      <section className="panel-card p-5 md:p-6">
        <h3 className="text-lg font-bold">민감도 분석</h3>
        <p className="mt-1 text-xs text-slate-500">BASE에서 각 충격만 독립 적용한 계산이며 미래예측이 아닙니다.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {result.stressTests.map((stress) => <article key={stress.key} className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold">{stress.label}</h4><dl className="mt-3 space-y-2 text-sm"><Metric label="추정 영업이익"><Money value={stress.estimatedOperatingProfit} /></Metric><Metric label="영업이익 변화액"><Money value={stress.operatingProfitChange} /></Metric><Metric label="영업이익률"><Percent value={stress.operatingMargin} /></Metric></dl></article>)}
        </div>
      </section>

      <section className="rounded-xl bg-slate-50 p-5 text-xs leading-6 text-slate-600">
        {result.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
      </section>
    </div>
  );
}
