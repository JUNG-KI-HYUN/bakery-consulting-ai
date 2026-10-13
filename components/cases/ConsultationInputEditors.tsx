"use client";

import { useState, type FormEvent } from "react";
import type {
  CaseCustomerProfile,
  CaseFrameoneRecommendation,
  CaseRecord,
} from "@/lib/cases/case-contract";
import { WonInput } from "@/components/forms/WonInput";
import { formatWonInput, parseWonInput } from "@/lib/format/won";

type TriState = "" | "true" | "false";

interface CustomerFormValues {
  brandName: string;
  totalAvailableCapitalWon: string;
  preferredArea: string;
  preferredAreaMinPyeong: string;
  preferredAreaMaxPyeong: string;
  ownerWorksInStore: TriState;
  ownerRoles: string;
  conceptPreference: string;
  directManufacturing: TriState;
  coffeeSales: TriState;
  hallPreference: string;
  deliveryPreference: string;
  employeePlan: string;
  targetMonthlyOwnerIncomeWon: string;
  loanPreference: string;
  equipmentSupportNeeded: string;
  taxLaborPmNeeded: string;
  longTermPlan: string;
}

interface RecommendationFormValues {
  recommendedConcept: string;
  recommendedMonthlyRentMaxWon: string;
  recommendedAreaMinPyeong: string;
  recommendedAreaMaxPyeong: string;
  recommendedSeatMin: string;
  recommendedSeatMax: string;
  staffingRecommendation: string;
  operatingReserveWon: string;
  preOpeningInvestmentLimitWon: string;
  depositBudgetWon: string;
  equipmentBudgetWon: string;
  fitoutBudgetWon: string;
  openingCostBudgetWon: string;
  premiumBudgetWon: string;
  premiumPolicy: string;
  facilityStrategy: string;
  recommendationNotes: string;
}

function triState(value: boolean | undefined): TriState {
  return value === undefined ? "" : value ? "true" : "false";
}

function optionalBoolean(value: TriState) {
  return value === "" ? undefined : value === "true";
}

function optionalNumber(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function customerFormValues(record: CaseRecord): CustomerFormValues {
  const profile = record.customerProfile;
  return {
    brandName: profile?.brandName ?? "",
    totalAvailableCapitalWon: formatWonInput(profile?.totalAvailableCapitalWon),
    preferredArea: record.preferredArea ?? "",
    preferredAreaMinPyeong: profile?.preferredAreaMinPyeong?.toString() ?? "",
    preferredAreaMaxPyeong: profile?.preferredAreaMaxPyeong?.toString() ?? "",
    ownerWorksInStore: triState(profile?.ownerWorksInStore),
    ownerRoles: profile?.ownerRoles?.join(", ") ?? "",
    conceptPreference: profile?.conceptPreference ?? "",
    directManufacturing: triState(profile?.directManufacturing),
    coffeeSales: triState(profile?.coffeeSales),
    hallPreference: profile?.hallPreference ?? "",
    deliveryPreference: profile?.deliveryPreference ?? "",
    employeePlan: profile?.employeePlan ?? "",
    targetMonthlyOwnerIncomeWon: formatWonInput(profile?.targetMonthlyOwnerIncomeWon),
    loanPreference: profile?.loanPreference ?? "",
    equipmentSupportNeeded: profile?.equipmentSupportNeeded ?? "",
    taxLaborPmNeeded: profile?.taxLaborPmNeeded ?? "",
    longTermPlan: profile?.longTermPlan ?? "",
  };
}

function recommendationFormValues(recommendation?: CaseFrameoneRecommendation): RecommendationFormValues {
  const capitalPlan = recommendation?.capitalPlan;
  return {
    recommendedConcept: recommendation?.recommendedConcept ?? "",
    recommendedMonthlyRentMaxWon: formatWonInput(recommendation?.recommendedMonthlyRentMaxWon),
    recommendedAreaMinPyeong: recommendation?.recommendedAreaMinPyeong?.toString() ?? "",
    recommendedAreaMaxPyeong: recommendation?.recommendedAreaMaxPyeong?.toString() ?? "",
    recommendedSeatMin: recommendation?.recommendedSeatMin?.toString() ?? "",
    recommendedSeatMax: recommendation?.recommendedSeatMax?.toString() ?? "",
    staffingRecommendation: recommendation?.staffingRecommendation ?? "",
    operatingReserveWon: formatWonInput(capitalPlan?.operatingReserveWon),
    preOpeningInvestmentLimitWon: formatWonInput(capitalPlan?.preOpeningInvestmentLimitWon),
    depositBudgetWon: formatWonInput(capitalPlan?.depositBudgetWon),
    equipmentBudgetWon: formatWonInput(capitalPlan?.equipmentBudgetWon),
    fitoutBudgetWon: formatWonInput(capitalPlan?.fitoutBudgetWon),
    openingCostBudgetWon: formatWonInput(capitalPlan?.openingCostBudgetWon),
    premiumBudgetWon: formatWonInput(capitalPlan?.premiumBudgetWon),
    premiumPolicy: recommendation?.premiumPolicy ?? "",
    facilityStrategy: recommendation?.facilityStrategy ?? "",
    recommendationNotes: recommendation?.recommendationNotes ?? "",
  };
}

async function patchCase(caseId: string, body: object) {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as CaseRecord | { message?: string };
  if (!response.ok || !("caseId" in result)) {
    throw new Error("message" in result && result.message ? result.message : "Case를 수정하지 못했습니다.");
  }
  return result;
}

function TriStateField({ label, value, onChange }: { label: string; value: TriState; onChange: (value: TriState) => void }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value as TriState)}>
        <option value="">미입력</option>
        <option value="true">예</option>
        <option value="false">아니오</option>
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <label className={multiline ? "block sm:col-span-2" : "block"}>
      <span className="field-label">{label}</span>
      {multiline
        ? <textarea className="input min-h-24" value={value} onChange={(event) => onChange(event.target.value)} maxLength={1000} placeholder={placeholder} />
        : <input className="input" value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} placeholder={placeholder} autoComplete="off" />}
    </label>
  );
}

function NumberField({ label, value, onChange, step = "1", description }: { label: string; value: string; onChange: (value: string) => void; step?: string; description?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="input" type="number" min="0" step={step} inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} placeholder="미입력" />
      {description ? <span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span> : null}
    </label>
  );
}

export function CustomerProfileEditor({ record, onSaved }: { record: CaseRecord; onSaved: (record: CaseRecord) => void }) {
  const [values, setValues] = useState(() => customerFormValues(record));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    const customerProfile: CaseCustomerProfile = {
      ...record.customerProfile,
      brandName: values.brandName,
      totalAvailableCapitalWon: parseWonInput(values.totalAvailableCapitalWon),
      preferredAreaMinPyeong: optionalNumber(values.preferredAreaMinPyeong),
      preferredAreaMaxPyeong: optionalNumber(values.preferredAreaMaxPyeong),
      ownerWorksInStore: optionalBoolean(values.ownerWorksInStore),
      ownerRoles: values.ownerRoles.split(",").map((item) => item.trim()).filter(Boolean),
      conceptPreference: values.conceptPreference,
      directManufacturing: optionalBoolean(values.directManufacturing),
      coffeeSales: optionalBoolean(values.coffeeSales),
      hallPreference: values.hallPreference,
      deliveryPreference: values.deliveryPreference,
      employeePlan: values.employeePlan,
      targetMonthlyOwnerIncomeWon: parseWonInput(values.targetMonthlyOwnerIncomeWon),
      loanPreference: values.loanPreference,
      equipmentSupportNeeded: values.equipmentSupportNeeded,
      taxLaborPmNeeded: values.taxLaborPmNeeded,
      longTermPlan: values.longTermPlan,
    };
    try {
      const saved = await patchCase(record.caseId, {
        preferredArea: values.preferredArea || null,
        customerProfile: customerProfile,
      });
      onSaved(saved);
      setValues(customerFormValues(saved));
      setMessage("고객 상담정보가 저장되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "고객 상담정보를 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <details className="mt-5 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
      <summary className="cursor-pointer text-sm font-bold text-sky-950">고객 상담정보 입력·수정</summary>
      <form className="mt-5" onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="브랜드명" value={values.brandName} onChange={(value) => update("brandName", value)} placeholder="Case 이름과 구분되는 실제 브랜드명" />
          <WonInput label="총 가용자본" value={values.totalAvailableCapitalWon} onChange={(value) => update("totalAvailableCapitalWon", value)} />
          <TextField label="희망지역" value={values.preferredArea} onChange={(value) => update("preferredArea", value)} placeholder="Case 기본정보의 희망지역과 동일한 값" />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="희망 최소면적 (평)" value={values.preferredAreaMinPyeong} onChange={(value) => update("preferredAreaMinPyeong", value)} step="0.1" />
            <NumberField label="희망 최대면적 (평)" value={values.preferredAreaMaxPyeong} onChange={(value) => update("preferredAreaMaxPyeong", value)} step="0.1" />
          </div>
          <TriStateField label="대표 직접근무 여부" value={values.ownerWorksInStore} onChange={(value) => update("ownerWorksInStore", value)} />
          <TextField label="대표 역할" value={values.ownerRoles} onChange={(value) => update("ownerRoles", value)} placeholder="예: 제조, 운영, 판매 (쉼표로 구분)" />
          <TextField label="희망 사업형태 / 메모" value={values.conceptPreference} onChange={(value) => update("conceptPreference", value)} multiline />
          <TriStateField label="직접 제조 여부" value={values.directManufacturing} onChange={(value) => update("directManufacturing", value)} />
          <TriStateField label="커피 판매 여부" value={values.coffeeSales} onChange={(value) => update("coffeeSales", value)} />
          <TextField label="홀 운영 희망" value={values.hallPreference} onChange={(value) => update("hallPreference", value)} />
          <TextField label="배달 계획" value={values.deliveryPreference} onChange={(value) => update("deliveryPreference", value)} />
          <TextField label="직원 계획" value={values.employeePlan} onChange={(value) => update("employeePlan", value)} />
          <WonInput label="목표 월 소득" value={values.targetMonthlyOwnerIncomeWon} onChange={(value) => update("targetMonthlyOwnerIncomeWon", value)} />
          <TextField label="대출 관련 고객 의향 / 메모" value={values.loanPreference} onChange={(value) => update("loanPreference", value)} />
          <TextField label="장비 지원 필요 여부" value={values.equipmentSupportNeeded} onChange={(value) => update("equipmentSupportNeeded", value)} />
          <TextField label="세무·노무 PM 필요 여부" value={values.taxLaborPmNeeded} onChange={(value) => update("taxLaborPmNeeded", value)} />
          <TextField label="장기 계획" value={values.longTermPlan} onChange={(value) => update("longTermPlan", value)} multiline />
        </div>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
        {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
        <button type="submit" className="btn-primary mt-5" disabled={pending}>{pending ? "저장 중…" : "고객 상담정보 저장"}</button>
      </form>
    </details>
  );
}

export function FrameoneRecommendationEditor({ record, onSaved }: { record: CaseRecord; onSaved: (record: CaseRecord) => void }) {
  const [values, setValues] = useState(() => recommendationFormValues(record.frameoneRecommendation));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof RecommendationFormValues>(key: K, value: RecommendationFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    const frameoneRecommendation: CaseFrameoneRecommendation = {
      ...record.frameoneRecommendation,
      recommendedConcept: values.recommendedConcept,
      recommendedMonthlyRentMaxWon: parseWonInput(values.recommendedMonthlyRentMaxWon),
      recommendedAreaMinPyeong: optionalNumber(values.recommendedAreaMinPyeong),
      recommendedAreaMaxPyeong: optionalNumber(values.recommendedAreaMaxPyeong),
      recommendedSeatMin: optionalNumber(values.recommendedSeatMin),
      recommendedSeatMax: optionalNumber(values.recommendedSeatMax),
      staffingRecommendation: values.staffingRecommendation,
      capitalPlan: {
        ...record.frameoneRecommendation?.capitalPlan,
        operatingReserveWon: parseWonInput(values.operatingReserveWon),
        preOpeningInvestmentLimitWon: parseWonInput(values.preOpeningInvestmentLimitWon),
        depositBudgetWon: parseWonInput(values.depositBudgetWon),
        equipmentBudgetWon: parseWonInput(values.equipmentBudgetWon),
        fitoutBudgetWon: parseWonInput(values.fitoutBudgetWon),
        openingCostBudgetWon: parseWonInput(values.openingCostBudgetWon),
        premiumBudgetWon: parseWonInput(values.premiumBudgetWon),
      },
      premiumPolicy: values.premiumPolicy,
      facilityStrategy: values.facilityStrategy,
      recommendationNotes: values.recommendationNotes,
    };
    try {
      const saved = await patchCase(record.caseId, { frameoneRecommendation: frameoneRecommendation });
      onSaved(saved);
      setValues(recommendationFormValues(saved.frameoneRecommendation));
      setMessage("FRAMEONE 권장안이 저장되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FRAMEONE 권장안을 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <details className="mt-5 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <summary className="cursor-pointer text-sm font-bold text-amber-950">FRAMEONE 권장안 입력·수정</summary>
      <form className="mt-5" onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="권장 사업모델" value={values.recommendedConcept} onChange={(value) => update("recommendedConcept", value)} multiline />
          <WonInput label="권장 월세 상한" value={values.recommendedMonthlyRentMaxWon} onChange={(value) => update("recommendedMonthlyRentMaxWon", value)} description="사업성·자본계획을 기준으로 상담자가 제안한 월세 검토 상한입니다." />
          <NumberField label="권장 최소 면적 (평)" value={values.recommendedAreaMinPyeong} onChange={(value) => update("recommendedAreaMinPyeong", value)} step="0.1" />
          <NumberField label="권장 최대 면적 (평)" value={values.recommendedAreaMaxPyeong} onChange={(value) => update("recommendedAreaMaxPyeong", value)} step="0.1" />
          <NumberField label="권장 최소 좌석" value={values.recommendedSeatMin} onChange={(value) => update("recommendedSeatMin", value)} />
          <NumberField label="권장 최대 좌석" value={values.recommendedSeatMax} onChange={(value) => update("recommendedSeatMax", value)} />
          <TextField label="권장 인력구조" value={values.staffingRecommendation} onChange={(value) => update("staffingRecommendation", value)} />
          <WonInput label="운전자금 보존 권장액" value={values.operatingReserveWon} onChange={(value) => update("operatingReserveWon", value)} />
          <WonInput label="개점 전 투자한도" value={values.preOpeningInvestmentLimitWon} onChange={(value) => update("preOpeningInvestmentLimitWon", value)} />
          <WonInput label="보증금 예산" value={values.depositBudgetWon} onChange={(value) => update("depositBudgetWon", value)} />
          <WonInput label="장비 예산" value={values.equipmentBudgetWon} onChange={(value) => update("equipmentBudgetWon", value)} />
          <WonInput label="인테리어 / 설비 예산" value={values.fitoutBudgetWon} onChange={(value) => update("fitoutBudgetWon", value)} />
          <WonInput label="초도재료 / 집기 / 기타 예산" value={values.openingCostBudgetWon} onChange={(value) => update("openingCostBudgetWon", value)} />
          <WonInput label="권리금 예산" value={values.premiumBudgetWon} onChange={(value) => update("premiumBudgetWon", value)} />
          <TextField label="권리금 정책" value={values.premiumPolicy} onChange={(value) => update("premiumPolicy", value)} />
          <TextField label="시설전략" value={values.facilityStrategy} onChange={(value) => update("facilityStrategy", value)} multiline />
          <TextField label="추가 권장 메모" value={values.recommendationNotes} onChange={(value) => update("recommendationNotes", value)} multiline />
        </div>
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
        {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
        <button type="submit" className="btn-primary mt-5" disabled={pending}>{pending ? "저장 중…" : "FRAMEONE 권장안 저장"}</button>
      </form>
    </details>
  );
}
