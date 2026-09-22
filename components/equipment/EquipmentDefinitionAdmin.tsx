"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_DATA_STATUSES,
  EQUIPMENT_SOURCE_TYPES,
  type EquipmentDefinition,
} from "@/lib/equipment/types";

/**
 * 내부 개발용 EquipmentDefinition 관리.
 * 상담 고객용 UI가 아니다. 장비 배치(SVG)는 Phase 5D.
 */
export function EquipmentDefinitionAdmin() {
  const [definitions, setDefinitions] = useState<EquipmentDefinition[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    category: "OTHER",
    name: "",
    manufacturer: "",
    model: "",
    dataStatus: "NEEDS_REVIEW",
    widthMm: "",
    depthMm: "",
    heightMm: "",
    widthUnknown: false,
    depthUnknown: false,
    heightUnknown: false,
    rotationAllowed: "",
    electricalRequired: "",
    powerKw: "",
    sourceType: "",
    sourceLabel: "",
    sourceReference: "",
    verifiedAt: "",
    verifiedBy: "",
    limitation: "",
  });

  async function reload() {
    const response = await fetch("/api/equipment/definitions");
    const body = (await response.json()) as { definitions?: EquipmentDefinition[] };
    setDefinitions(body.definitions ?? []);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/equipment/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          name: form.name,
          manufacturer: form.manufacturer || undefined,
          model: form.model || undefined,
          dataStatus: form.dataStatus,
          widthMm: form.widthUnknown ? undefined : form.widthMm,
          depthMm: form.depthUnknown ? undefined : form.depthMm,
          heightMm: form.heightUnknown ? undefined : form.heightMm,
          widthStatus: form.widthUnknown ? "UNKNOWN" : undefined,
          depthStatus: form.depthUnknown ? "UNKNOWN" : undefined,
          heightStatus: form.heightUnknown ? "UNKNOWN" : undefined,
          rotationAllowed:
            form.rotationAllowed === "true"
              ? true
              : form.rotationAllowed === "false"
                ? false
                : undefined,
          electricalRequired:
            form.electricalRequired === "true"
              ? true
              : form.electricalRequired === "false"
                ? false
                : form.electricalRequired === "UNKNOWN"
                  ? "UNKNOWN"
                  : undefined,
          powerKw: form.powerKw === "" ? undefined : Number(form.powerKw),
          sourceType: form.sourceType || undefined,
          sourceLabel: form.sourceLabel || undefined,
          sourceReference: form.sourceReference || undefined,
          verifiedAt: form.verifiedAt || undefined,
          sourceVerifiedAt: form.verifiedAt || undefined,
          verifiedBy: form.verifiedBy || undefined,
          limitation: form.limitation || undefined,
        }),
      });
      const body = (await response.json()) as { message?: string; definition?: EquipmentDefinition };
      if (!response.ok) {
        setMessage(body.message ?? "저장 실패");
        return;
      }
      setMessage(`저장됨: ${body.definition?.equipmentDefinitionId ?? ""}`);
      setForm((prev) => ({ ...prev, name: "" }));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-[#0B1220]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500">
            FRAMEONE INTERNAL
          </p>
          <h1 className="text-xl font-bold">Equipment Definition</h1>
          <p className="mt-1 text-sm text-slate-600">
            카탈로그 사양·dataStatus·source만 관리합니다. 배치·적합성 판정은 포함하지 않습니다.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold"
        >
          홈
        </Link>
      </header>

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold">Definition 생성</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs text-slate-600">category</span>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {EQUIPMENT_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">dataStatus</span>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.dataStatus}
              onChange={(event) => setForm({ ...form, dataStatus: event.target.value })}
            >
              {EQUIPMENT_DATA_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs text-slate-600">name</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">manufacturer (optional)</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.manufacturer}
              onChange={(event) => setForm({ ...form, manufacturer: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">model (optional)</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
            />
          </label>
          <DimensionField
            label="widthMm"
            value={form.widthMm}
            unknown={form.widthUnknown}
            onValue={(widthMm) => setForm({ ...form, widthMm })}
            onUnknown={(widthUnknown) => setForm({ ...form, widthUnknown })}
          />
          <DimensionField
            label="depthMm"
            value={form.depthMm}
            unknown={form.depthUnknown}
            onValue={(depthMm) => setForm({ ...form, depthMm })}
            onUnknown={(depthUnknown) => setForm({ ...form, depthUnknown })}
          />
          <DimensionField
            label="heightMm"
            value={form.heightMm}
            unknown={form.heightUnknown}
            onValue={(heightMm) => setForm({ ...form, heightMm })}
            onUnknown={(heightUnknown) => setForm({ ...form, heightUnknown })}
          />
          <label className="block text-sm">
            <span className="text-xs text-slate-600">rotationAllowed</span>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.rotationAllowed}
              onChange={(event) => setForm({ ...form, rotationAllowed: event.target.value })}
            >
              <option value="">미확인</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">electrical required</span>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.electricalRequired}
              onChange={(event) => setForm({ ...form, electricalRequired: event.target.value })}
            >
              <option value="">미입력</option>
              <option value="true">true</option>
              <option value="false">false</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">powerKw (optional)</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              inputMode="decimal"
              value={form.powerKw}
              onChange={(event) => setForm({ ...form, powerKw: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">sourceType</span>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.sourceType}
              onChange={(event) => setForm({ ...form, sourceType: event.target.value })}
            >
              <option value="">없음</option>
              {EQUIPMENT_SOURCE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">sourceLabel</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.sourceLabel}
              onChange={(event) => setForm({ ...form, sourceLabel: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">sourceReference</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.sourceReference}
              onChange={(event) => setForm({ ...form, sourceReference: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-600">verifiedAt (VERIFIED 필수)</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              placeholder="ISO datetime"
              value={form.verifiedAt}
              onChange={(event) => setForm({ ...form, verifiedAt: event.target.value })}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs text-slate-600">limitation</span>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={form.limitation}
              onChange={(event) => setForm({ ...form, limitation: event.target.value })}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg border border-[#0B1220] bg-[#0B1220] px-4 text-sm font-semibold text-white"
        >
          {busy ? "저장 중…" : "Definition 저장"}
        </button>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">저장된 Definition</h2>
          <button
            type="button"
            onClick={() => void reload()}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
          >
            목록 불러오기
          </button>
        </div>
        {definitions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            아직 없거나 불러오지 않았습니다. [목록 불러오기]를 누르세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {definitions.map((item) => (
              <li
                key={item.equipmentDefinitionId}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <p className="font-semibold">
                  [{item.dataStatus}] {item.name}
                </p>
                <p className="text-xs text-slate-600">
                  {item.category} · {item.equipmentDefinitionId}
                </p>
                <p className="text-xs text-slate-600">
                  source: {item.source?.sourceType ?? "없음"}
                  {item.verifiedAt ? ` · verifiedAt ${item.verifiedAt}` : ""}
                </p>
                <p className="text-xs text-slate-600">
                  W{" "}
                  {item.dimensions.widthMm?.status === "KNOWN"
                    ? `${item.dimensions.widthMm.mm}mm`
                    : item.dimensions.widthMm?.status === "UNKNOWN"
                      ? "UNKNOWN"
                      : "미입력"}{" "}
                  / D{" "}
                  {item.dimensions.depthMm?.status === "KNOWN"
                    ? `${item.dimensions.depthMm.mm}mm`
                    : item.dimensions.depthMm?.status === "UNKNOWN"
                      ? "UNKNOWN"
                      : "미입력"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DimensionField({
  label,
  value,
  unknown,
  onValue,
  onUnknown,
}: {
  label: string;
  value: string;
  unknown: boolean;
  onValue: (value: string) => void;
  onUnknown: (unknown: boolean) => void;
}) {
  return (
    <div className="text-sm">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          className="min-h-11 w-full rounded-lg border border-slate-300 px-2"
          inputMode="numeric"
          value={value}
          disabled={unknown}
          onChange={(event) => onValue(event.target.value)}
        />
        <label className="flex min-h-11 items-center gap-1 whitespace-nowrap text-xs">
          <input
            type="checkbox"
            checked={unknown}
            onChange={(event) => onUnknown(event.target.checked)}
          />
          UNKNOWN
        </label>
      </div>
    </div>
  );
}
