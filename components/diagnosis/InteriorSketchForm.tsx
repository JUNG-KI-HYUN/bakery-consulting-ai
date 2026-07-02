"use client";

import { InteriorSketchInput } from "@/lib/diagnosis/types";

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

const toneOptions = [
  "따뜻한 동네빵집",
  "프리미엄 베이커리",
  "미니멀 화이트",
  "우드&크림",
  "디저트 카페형",
];

const operationOptions = [
  "테이크아웃 중심",
  "홀 좌석 중심",
  "제조공간 중심",
  "선물·포장 중심",
  "배달 병행",
];

export function InteriorSketchForm({
  value,
  onChange,
}: {
  value: InteriorSketchInput;
  onChange: (next: InteriorSketchInput) => void;
}) {
  const update = <K extends keyof InteriorSketchInput>(
    key: K,
    next: InteriorSketchInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">공간 활용 스케치</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">공간 활용 스케치</h2>
      <p className="mt-1 text-sm text-[#334155]">
        정식 도면은 아니지만, 계약 전 제조공간·쇼케이스·카운터·홀 동선을 빠르게
        검토합니다.
      </p>
      <p className="mt-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-xs text-amber-900">
        정식 설계도가 아니라, 계약 전 가능성을 보는 간단 스케치입니다.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="선호 인테리어 톤">
          <select
            className="input"
            value={value.interiorTone}
            onChange={(e) => update("interiorTone", e.target.value)}
          >
            {toneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="매장 운영 방식">
          <select
            className="input"
            value={value.operationType}
            onChange={(e) => update("operationType", e.target.value)}
          >
            {operationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="쇼케이스 위치 아이디어">
          <input
            className="input"
            value={value.showcasePosition}
            onChange={(e) => update("showcasePosition", e.target.value)}
          />
        </Field>
        <Field label="카운터·픽업대 위치 아이디어">
          <input
            className="input"
            value={value.counterPosition}
            onChange={(e) => update("counterPosition", e.target.value)}
          />
        </Field>
        <Field label="제조공간 위치 아이디어">
          <input
            className="input"
            value={value.kitchenPosition}
            onChange={(e) => update("kitchenPosition", e.target.value)}
          />
        </Field>
        <Field label="홀 좌석 활용">
          <input
            className="input"
            value={value.hallUsage}
            onChange={(e) => update("hallUsage", e.target.value)}
          />
        </Field>
        <Field label="고객 동선 메모">
          <input
            className="input"
            value={value.customerFlow}
            onChange={(e) => update("customerFlow", e.target.value)}
          />
        </Field>
        <Field label="직원 동선 메모">
          <input
            className="input"
            value={value.staffFlow}
            onChange={(e) => update("staffFlow", e.target.value)}
          />
        </Field>
        <Field label="저비용 인테리어 아이디어">
          <textarea
            className="input min-h-20"
            value={value.lowCostIdeas}
            onChange={(e) => update("lowCostIdeas", e.target.value)}
          />
        </Field>
        <Field label="확인 필요사항">
          <textarea
            className="input min-h-20"
            value={value.checkRequired}
            onChange={(e) => update("checkRequired", e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}
