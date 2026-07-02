"use client";

import { FacilityCheckInput } from "@/lib/diagnosis/types";

const tri = ["가능", "불확실", "불가"] as const;

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

export function FacilityCheckForm({
  value,
  onChange,
}: {
  value: FacilityCheckInput;
  onChange: (next: FacilityCheckInput) => void;
}) {
  const update = <K extends keyof FacilityCheckInput>(
    key: K,
    next: FacilityCheckInput[K],
  ) => onChange({ ...value, [key]: next });

  const triSelect = (key: keyof FacilityCheckInput, label: string) => (
    <Field label={label}>
      <select
        className="input"
        value={String(value[key])}
        onChange={(e) =>
          update(
            key,
            e.target.value as FacilityCheckInput[keyof FacilityCheckInput],
          )
        }
      >
        {tri.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 3</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">시설·장비 체크</h2>
      <p className="mt-1 text-sm text-[#334155]">
        베이커리는 시설에서 많이 막힙니다. 전기·배기·급배수부터 봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        상권이 좋아도, 전기·배기·급배수가 막히면 계약은 보류입니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="전기 용량">
          <input
            className="input"
            value={value.electricCapacity}
            onChange={(e) => update("electricCapacity", e.target.value)}
          />
        </Field>
        <Field label="천장고">
          <input
            className="input"
            value={value.ceilingHeight}
            onChange={(e) => update("ceilingHeight", e.target.value)}
          />
        </Field>
        <Field label="화장실">
          <input
            className="input"
            value={value.restroom}
            onChange={(e) => update("restroom", e.target.value)}
          />
        </Field>
        <Field label="기둥 위치">
          <input
            className="input"
            value={value.pillarLocation}
            onChange={(e) => update("pillarLocation", e.target.value)}
          />
        </Field>
        {triSelect("electricExpansionPossible", "전기 증설 가능 여부")}
        {triSelect("plumbingPossible", "급배수 가능 여부")}
        {triSelect("exhaustPossible", "배기 가능 여부")}
        {triSelect("ovenMovePossible", "오븐 반입 가능성")}
        {triSelect("mixerMovePossible", "믹서 반입 가능성")}
        {triSelect("prooferPlacementPossible", "발효기 배치 가능성")}
        {triSelect("coldStoragePlacementPossible", "냉장·냉동고 배치 가능성")}
        {triSelect("showcasePlacementPossible", "쇼케이스 배치 가능성")}
        {triSelect("productionSpaceSecured", "제조공간 확보 가능성")}
        {triSelect("salesSpaceSecured", "판매공간 확보 가능성")}
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.fireSafetyChecked}
            onChange={(e) => update("fireSafetyChecked", e.target.checked)}
          />
          소방 확인 여부
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.drawingConfirmed}
            onChange={(e) => update("drawingConfirmed", e.target.checked)}
          />
          도면 또는 현장사진 확인 여부
        </label>
      </div>
    </section>
  );
}
