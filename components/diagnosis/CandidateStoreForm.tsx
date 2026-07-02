"use client";

import { CandidateStoreInput } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function CandidateStoreForm({
  value,
  onChange,
}: {
  value: CandidateStoreInput;
  onChange: (next: CandidateStoreInput) => void;
}) {
  const update = <K extends keyof CandidateStoreInput>(
    key: K,
    next: CandidateStoreInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 2</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">후보 점포</h2>
      <p className="mt-1 text-sm text-[#334155]">
        좋아 보이는 점포도 계약 전 확인할 게 많습니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="주소" className="md:col-span-2">
          <input
            className="input"
            value={value.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </Field>
        <Field label="보증금 (원)">
          <input
            className="input"
            type="number"
            value={value.deposit}
            onChange={(e) => update("deposit", Number(e.target.value))}
          />
        </Field>
        <Field label="월세 (원)">
          <input
            className="input"
            type="number"
            value={value.rent}
            onChange={(e) => update("rent", Number(e.target.value))}
          />
        </Field>
        <Field label="관리비 (원)">
          <input
            className="input"
            type="number"
            value={value.maintenanceFee}
            onChange={(e) => update("maintenanceFee", Number(e.target.value))}
          />
        </Field>
        <Field label="권리금 (원)">
          <input
            className="input"
            type="number"
            value={value.premium}
            onChange={(e) => update("premium", Number(e.target.value))}
          />
        </Field>
        <Field label="전용면적 (㎡)">
          <input
            className="input"
            type="number"
            value={value.exclusiveArea}
            onChange={(e) => update("exclusiveArea", Number(e.target.value))}
          />
        </Field>
        <Field label="층수">
          <input
            className="input"
            value={value.floor}
            onChange={(e) => update("floor", e.target.value)}
          />
        </Field>
        <Field label="전면 길이 (m)">
          <input
            className="input"
            type="number"
            value={value.frontage}
            onChange={(e) => update("frontage", Number(e.target.value))}
          />
        </Field>
        <Field label="출입구 위치">
          <input
            className="input"
            value={value.entrancePosition}
            onChange={(e) => update("entrancePosition", e.target.value)}
          />
        </Field>
        <Field label="간판 노출">
          <input
            className="input"
            value={value.signExposure}
            onChange={(e) => update("signExposure", e.target.value)}
          />
        </Field>
        <Field label="주차 가능 여부">
          <select
            className="input"
            value={value.parkingAvailable ? "yes" : "no"}
            onChange={(e) =>
              update("parkingAvailable", e.target.value === "yes")
            }
          >
            <option value="no">주차 불가</option>
            <option value="yes">주차 가능</option>
          </select>
        </Field>
        <Field label="기존 업종">
          <input
            className="input"
            value={value.previousBusiness}
            onChange={(e) => update("previousBusiness", e.target.value)}
          />
        </Field>
        <Field label="계약기간">
          <input
            className="input"
            value={value.contractPeriod}
            onChange={(e) => update("contractPeriod", e.target.value)}
          />
        </Field>
        <Field label="업종 제한">
          <input
            className="input"
            value={value.businessRestriction}
            onChange={(e) => update("businessRestriction", e.target.value)}
          />
        </Field>
        <Field label="원상복구 범위">
          <input
            className="input"
            value={value.restorationScope}
            onChange={(e) => update("restorationScope", e.target.value)}
          />
        </Field>
        <Field label="특약 필요사항" className="md:col-span-2">
          <input
            className="input"
            value={value.specialTerms}
            onChange={(e) => update("specialTerms", e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}
