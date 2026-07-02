"use client";

import { BreakEvenInput, BreakEvenResult } from "@/lib/diagnosis/types";

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

const fields: [keyof BreakEvenInput, string][] = [
  ["expectedUnitPrice", "예상 객단가 (원)"],
  ["expectedDailyVisitors", "예상 일 방문객 (명)"],
  ["expectedDailySales", "예상 일매출 (원)"],
  ["expectedMonthlySales", "예상 월매출 (원)"],
  ["materialCostRate", "원재료비율 (예: 0.34)"],
  ["laborCost", "인건비 (원)"],
  ["rent", "월세 (원)"],
  ["maintenanceFee", "관리비 (원)"],
  ["cardFeeRate", "카드수수료율 (예: 0.03)"],
  ["deliveryFeeRate", "배달수수료율 (예: 0.04)"],
  ["adCost", "광고비 (원)"],
  ["otherFixedCost", "기타 고정비 (원)"],
  ["premium", "권리금 (원)"],
];

export function BreakEvenForm({
  value,
  result,
  onChange,
}: {
  value: BreakEvenInput;
  result?: BreakEvenResult;
  onChange: (next: BreakEvenInput) => void;
}) {
  const update = <K extends keyof BreakEvenInput>(
    key: K,
    next: BreakEvenInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 4</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">
        손익분기점 (추정/참고값)
      </h2>
      <p className="mt-1 text-sm text-[#334155]">
        이 월세를 매달 버틸 수 있을지 계산해봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        예상 매출보다 먼저 확인해야 할 것은 버틸 수 있는 비용 구조입니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className="input"
              type="number"
              value={value[key]}
              onChange={(e) => update(key, Number(e.target.value))}
            />
          </Field>
        ))}
      </div>
      {result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-[#0B1220]">추정 결과 (참고값)</p>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <p>월세 부담률(추정): {result.rentBurdenRate.toFixed(2)}%</p>
            <p>
              총 고정비(추정):{" "}
              {Math.round(result.totalFixedCost).toLocaleString()}원
            </p>
            <p>
              손익분기 매출(추정):{" "}
              {Math.round(result.breakEvenSales).toLocaleString()}원
            </p>
            <p>
              월순이익(추정):{" "}
              {Math.round(result.estimatedMonthlyNetProfit).toLocaleString()}원
            </p>
            <p className="md:col-span-2">
              권리금 회수 예상기간(참고값):{" "}
              {result.premiumRecoveryMonths
                ? `${result.premiumRecoveryMonths.toFixed(1)}개월`
                : "적자 또는 0원으로 산정 불가"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
