"use client";

import { ConsultationInput, StoreType } from "@/lib/diagnosis/types";

const storeTypes: StoreType[] = ["판매형", "제조형", "카페형", "배달병행형"];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function ConsultationForm({
  value,
  onChange,
}: {
  value: ConsultationInput;
  onChange: (next: ConsultationInput) => void;
}) {
  const update = <K extends keyof ConsultationInput>(
    key: K,
    next: ConsultationInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 1</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">상담 정보</h2>
      <p className="mt-1 text-sm text-[#334155]">
        창업자의 예산과 매장 방향을 먼저 확인합니다.
      </p>
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        계약 전에 먼저 확인해볼게요.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="고객명">
          <input
            className="input"
            value={value.customerName}
            onChange={(e) => update("customerName", e.target.value)}
          />
        </Field>
        <Field label="연락처">
          <input
            className="input"
            value={value.contact}
            onChange={(e) => update("contact", e.target.value)}
          />
        </Field>
        <Field label="창업예산 (원)">
          <input
            className="input"
            type="number"
            value={value.startupBudget}
            onChange={(e) => update("startupBudget", Number(e.target.value))}
          />
        </Field>
        <Field label="희망지역">
          <input
            className="input"
            value={value.preferredArea}
            onChange={(e) => update("preferredArea", e.target.value)}
          />
        </Field>
        <Field label="창업경험">
          <select
            className="input"
            value={value.hasExperience ? "yes" : "no"}
            onChange={(e) => update("hasExperience", e.target.value === "yes")}
          >
            <option value="no">창업경험 없음</option>
            <option value="yes">창업경험 있음</option>
          </select>
        </Field>
        <Field label="희망 매장형태">
          <select
            className="input"
            value={value.storeType}
            onChange={(e) => update("storeType", e.target.value as StoreType)}
          >
            {storeTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="상담 메모">
        <textarea
          className="input mt-1 min-h-24"
          value={value.memo}
          onChange={(e) => update("memo", e.target.value)}
        />
      </Field>
    </section>
  );
}
