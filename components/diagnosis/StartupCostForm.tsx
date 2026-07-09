"use client";

import { StartupCostInput, StartupCostResult } from "@/lib/diagnosis/types";

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

function formatNumericDisplay(value: number): string {
  if (value === 0) return "";
  return Number(value).toLocaleString("ko-KR");
}

function parseNumericInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return 0;
  return Number(digits);
}

const fields: [keyof StartupCostInput, string][] = [
  ["interiorCost", "인테리어비 (원)"],
  ["productionEquipmentCost", "제조장비비 (원)"],
  ["salesEquipmentCost", "판매장비비 (원)"],
  ["signageCost", "간판비 (원)"],
  ["initialSuppliesCost", "초도물품비 (원)"],
  ["licenseRelatedCost", "인허가 관련비 (원)"],
  ["reserveCost", "예비비 (원)"],
];

export function StartupCostForm({
  value,
  result,
  deposit,
  premium,
  startupBudget,
  onChange,
}: {
  value: StartupCostInput;
  result?: StartupCostResult;
  deposit: number;
  premium: number;
  startupBudget: number;
  onChange: (next: StartupCostInput) => void;
}) {
  const update = <K extends keyof StartupCostInput>(
    key: K,
    next: StartupCostInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 5</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">창업비용 예상표</h2>
      <p className="mt-1 text-sm text-[#334155]">
        보증금·권리금과 함께 초기 투입 비용을 추정해봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        이 금액은 추정치이며 실제 비용은 시공사, 장비 견적, 현장 상황에 따라
        달라질 수 있습니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="보증금 (원, 후보 점포 입력값)">
          <input
            className="input"
            type="text"
            inputMode="numeric"
            value={formatNumericDisplay(deposit)}
            readOnly
          />
        </Field>
        <Field label="권리금 (원, 후보 점포 입력값)">
          <input
            className="input"
            type="text"
            inputMode="numeric"
            value={formatNumericDisplay(premium)}
            readOnly
          />
        </Field>
        <Field label="창업예산 (원, 상담 입력값)">
          <input
            className="input"
            type="text"
            inputMode="numeric"
            value={formatNumericDisplay(startupBudget)}
            readOnly
          />
        </Field>
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={formatNumericDisplay(value[key])}
              onChange={(e) => update(key, parseNumericInput(e.target.value))}
            />
            {key === "licenseRelatedCost" && (
              <p className="mt-1 text-xs text-amber-700">전문가 확인 필요</p>
            )}
          </Field>
        ))}
      </div>
      <p className="mt-2 text-xs text-amber-700">
        인허가·소방·전기 관련 항목은 전문가 확인 필요
      </p>
      {result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-[#0B1220]">추정 결과 (참고값)</p>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <p>
              총 창업비용(추정):{" "}
              {Math.round(result.totalCost).toLocaleString()}원
            </p>
            <p>
              예산 대비 차액:{" "}
              {Math.round(result.budgetDifference).toLocaleString()}원
            </p>
            <p>예산 초과율(추정): {result.budgetOverRatePercent.toFixed(2)}%</p>
            <p>예비비 비율(추정): {result.reserveRatePercent.toFixed(2)}%</p>
          </div>
        </div>
      )}
    </section>
  );
}
