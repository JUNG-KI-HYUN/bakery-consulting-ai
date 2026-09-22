"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMeasurementMmDisplay } from "@/lib/field/space-equipment";
import { buildSpaceFitContextNotes } from "@/lib/space-fit/context-notes";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import { snapToGridMm } from "@/lib/space-fit/geometry";
import {
  createEntranceElement,
  createFacilityPointElement,
  createPillarElement,
  createRestroomElement,
  type RoomElement,
  type RoomElementType,
  type RoomWall,
  type SpaceFitLayout,
} from "@/lib/space-fit/types";
import type { GeometryWarning } from "@/lib/space-fit/geometry";
import type { MeasurementSet } from "@/lib/field/measurement";
import type {
  DeliveryPathObservation,
  ProductionSalesSpaceObservation,
} from "@/lib/field/space-equipment";
import {
  GeometryWarningsPanel,
  SpaceFitSvgWorkspace,
} from "@/components/space-fit/SpaceFitSvgWorkspace";

type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

const ELEMENT_LABELS: Record<RoomElementType, string> = {
  ENTRANCE: "출입구",
  PILLAR: "기둥",
  ELECTRICAL_POINT: "전기점",
  WATER_POINT: "급수점",
  DRAIN_POINT: "배수점",
  EXHAUST_POINT: "배기점",
  RESTROOM: "화장실",
};

function parseIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || !Number.isFinite(n)) return null;
  return n;
}

export function SpaceFitWorkspace({
  initialLayout,
  initialWarnings,
  fieldContext,
}: {
  initialLayout: SpaceFitLayout;
  initialWarnings: readonly GeometryWarning[];
  fieldContext: {
    surveySequence: number | null;
    measurementSet: MeasurementSet | null;
    productionSalesSpace: ProductionSalesSpaceObservation | null;
    deliveryPath: DeliveryPathObservation | null;
  };
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(initialLayout);
  const [warnings, setWarnings] = useState(initialWarnings);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => layout.elements.find((item) => item.elementId === selectedElementId) ?? null,
    [layout.elements, selectedElementId],
  );

  const contextNotes = useMemo(
    () =>
      buildSpaceFitContextNotes({
        productionSalesSpace: fieldContext.productionSalesSpace,
        deliveryPath: fieldContext.deliveryPath,
      }),
    [fieldContext.productionSalesSpace, fieldContext.deliveryPath],
  );

  const measurement = fieldContext.measurementSet;
  const widthDisplay = formatMeasurementMmDisplay(measurement?.values.roomWidthMm);
  const depthDisplay = formatMeasurementMmDisplay(measurement?.values.roomDepthMm);
  const ceilingDisplay = formatMeasurementMmDisplay(measurement?.values.ceilingHeightMm);

  const save = useCallback(async () => {
    setSaveState("saving");
    setErrorMessage(null);
    const response = await fetch(`/api/space-fit/${layout.layoutId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedLayoutVersion: layout.layoutVersion,
        elements: layout.elements,
      }),
    });
    const body = (await response.json()) as {
      layout?: SpaceFitLayout;
      geometryWarnings?: GeometryWarning[];
      message?: string;
      code?: string;
    };
    if (response.status === 409) {
      setSaveState("conflict");
      setErrorMessage(body.message ?? "VERSION_CONFLICT");
      return;
    }
    if (!response.ok || !body.layout) {
      setSaveState("error");
      setErrorMessage(body.message ?? "저장 실패");
      return;
    }
    setLayout(body.layout);
    setWarnings(body.geometryWarnings ?? []);
    setSaveState("saved");
    router.refresh();
  }, [layout, router]);

  function addElement(type: RoomElementType) {
    let next: RoomElement;
    switch (type) {
      case "PILLAR":
        // 가짜 기본 크기(400x400)를 Domain에 자동 저장하지 않음 — 직원이 mm를 입력해야 함.
        // 추가 직후 선택 패널에서 크기 입력을 강제하기 위해 최소 유효 치수 100mm만 둔다.
        next = createPillarElement({
          xMm: snapToGridMm(0),
          yMm: snapToGridMm(0),
          widthMm: snapToGridMm(100),
          heightMm: snapToGridMm(100),
        });
        break;
      case "RESTROOM":
        next = createRestroomElement({
          xMm: snapToGridMm(0),
          yMm: snapToGridMm(0),
          widthMm: snapToGridMm(100),
          heightMm: snapToGridMm(100),
        });
        break;
      case "ENTRANCE": {
        const entranceWidth =
          measurement?.values.entranceWidthMm?.status === "KNOWN"
            ? snapToGridMm(measurement.values.entranceWidthMm.mm)
            : snapToGridMm(100);
        next = createEntranceElement({
          wall: "BOTTOM",
          offsetMm: snapToGridMm(0),
          widthMm: Math.max(100, entranceWidth),
        });
        break;
      }
      default:
        next = createFacilityPointElement({
          type,
          xMm: snapToGridMm(0),
          yMm: snapToGridMm(0),
        });
        break;
    }
    setLayout((prev) => {
      const updated = Object.freeze({
        ...prev,
        elements: Object.freeze([...prev.elements, next]),
      });
      setWarnings(validateLayoutGeometry(updated));
      return updated;
    });
    setSelectedElementId(next.elementId);
    setSaveState("idle");
  }

  function updateSelected(patch: Partial<RoomElement>) {
    if (!selected) return;
    setLayout((prev) => {
      const elements = prev.elements.map((item) => {
        if (item.elementId !== selected.elementId) return item;
        return Object.freeze({ ...item, ...patch }) as RoomElement;
      });
      const updated = Object.freeze({ ...prev, elements: Object.freeze(elements) });
      setWarnings(validateLayoutGeometry(updated));
      return updated;
    });
    setSaveState("idle");
  }

  function deleteSelected() {
    if (!selected) return;
    setLayout((prev) => {
      const updated = Object.freeze({
        ...prev,
        elements: Object.freeze(
          prev.elements.filter((item) => item.elementId !== selected.elementId),
        ),
      });
      setWarnings(validateLayoutGeometry(updated));
      return updated;
    });
    setSelectedElementId(null);
    setSaveState("idle");
  }

  const saveLabel =
    saveState === "saving"
      ? "저장 중…"
      : saveState === "saved"
        ? "저장됨"
        : saveState === "conflict"
          ? "버전 충돌"
          : "저장";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F8FB] text-[#0B1220]">
      <header className="border-b border-slate-800 bg-[#0B1220] text-white">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-slate-300">
              FRAMEONE SPACE FIT
            </p>
            <h1 className="truncate text-base font-bold">
              조사 회차{" "}
              {fieldContext.surveySequence != null
                ? `#${fieldContext.surveySequence}`
                : "확인되지 않음"}
            </h1>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {layout.layoutId} · v{layout.layoutVersion} ·{" "}
              {saveState === "saved" ? "저장됨" : saveState === "conflict" ? "충돌" : "편집 중"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saveState === "saving"}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-500 bg-white px-3 text-sm font-semibold text-[#0B1220]"
            >
              {saveLabel}
            </button>
            {layout.consultationId ? (
              <Link
                href={`/consultations/${layout.consultationId}/field?surveyId=${layout.surveyId}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-3 text-sm font-semibold text-white"
              >
                FIELD로
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 space-y-4 overflow-auto border-b border-slate-200 bg-white p-4 lg:w-80 lg:border-r lg:border-b-0">
          <section>
            <h2 className="text-sm font-bold">공간 실측정보</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">매장 내부 가로</dt>
                <dd className="font-semibold">
                  {widthDisplay.kind === "known" ? widthDisplay.label : "확인되지 않음"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">매장 내부 깊이</dt>
                <dd className="font-semibold">
                  {depthDisplay.kind === "known" ? depthDisplay.label : "확인되지 않음"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">천장고</dt>
                <dd className="font-semibold">
                  {ceilingDisplay.kind === "known" ? ceilingDisplay.label : "확인되지 않음"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Room snapshot</dt>
                <dd className="font-semibold">
                  {layout.room.widthMm.toLocaleString("ko-KR")} ×{" "}
                  {layout.room.depthMm.toLocaleString("ko-KR")} mm
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">{contextNotes.manufacturingLabel}</p>
            <p className="text-xs text-slate-500">{contextNotes.deliveryLabel}</p>
          </section>

          <section>
            <h2 className="text-sm font-bold">요소 추가</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(ELEMENT_LABELS) as RoomElementType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addElement(type)}
                  className="min-h-11 rounded-lg border border-slate-300 bg-[#F8FAFC] px-2 text-xs font-semibold"
                >
                  {ELEMENT_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">좌표는 100mm grid에 맞춰집니다.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold">선택 요소</h2>
            {!selected ? (
              <p className="mt-2 text-sm text-slate-600">요소를 선택하세요.</p>
            ) : (
              <ElementEditor
                element={selected}
                onChange={updateSelected}
                onDelete={deleteSelected}
              />
            )}
          </section>
        </aside>

        <main className="min-h-0 flex-1 p-3">
          <SpaceFitSvgWorkspace
            layout={layout}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />
        </main>

        <aside className="shrink-0 overflow-auto border-t border-slate-200 bg-white p-4 lg:w-72 lg:border-t-0 lg:border-l">
          <h2 className="text-sm font-bold">Geometry warnings</h2>
          <div className="mt-2">
            <GeometryWarningsPanel warnings={warnings} />
          </div>
          {errorMessage ? (
            <p className="mt-3 text-sm font-semibold text-red-700">{errorMessage}</p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Geometry 경고는 Risk·Verdict가 아닙니다. 저장 후 서버에서 다시 검증됩니다.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ElementEditor({
  element,
  onChange,
  onDelete,
}: {
  element: RoomElement;
  onChange: (patch: Partial<RoomElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p className="font-semibold">
        {ELEMENT_LABELS[element.type]}{" "}
        <span className="text-xs font-normal text-slate-500">{element.elementId}</span>
      </p>
      {element.type === "ENTRANCE" ? (
        <>
          <label className="block">
            <span className="text-xs text-slate-600">벽</span>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
              value={element.wall}
              onChange={(event) =>
                onChange({ wall: event.target.value as RoomWall } as Partial<RoomElement>)
              }
            >
              <option value="TOP">TOP</option>
              <option value="RIGHT">RIGHT</option>
              <option value="BOTTOM">BOTTOM</option>
              <option value="LEFT">LEFT</option>
            </select>
          </label>
          <NumberField
            label="offsetMm"
            value={element.offsetMm}
            onCommit={(value) =>
              onChange({ offsetMm: snapToGridMm(Math.max(0, value)) } as Partial<RoomElement>)
            }
          />
          <NumberField
            label="widthMm"
            value={element.widthMm}
            onCommit={(value) =>
              onChange({ widthMm: snapToGridMm(Math.max(100, value)) } as Partial<RoomElement>)
            }
          />
        </>
      ) : element.type === "PILLAR" || element.type === "RESTROOM" ? (
        <>
          <NumberField
            label="xMm"
            value={element.xMm}
            onCommit={(value) =>
              onChange({ xMm: snapToGridMm(Math.max(0, value)) } as Partial<RoomElement>)
            }
          />
          <NumberField
            label="yMm"
            value={element.yMm}
            onCommit={(value) =>
              onChange({ yMm: snapToGridMm(Math.max(0, value)) } as Partial<RoomElement>)
            }
          />
          <NumberField
            label="widthMm"
            value={element.widthMm}
            onCommit={(value) =>
              onChange({ widthMm: snapToGridMm(Math.max(100, value)) } as Partial<RoomElement>)
            }
          />
          <NumberField
            label="heightMm"
            value={element.heightMm}
            onCommit={(value) =>
              onChange({ heightMm: snapToGridMm(Math.max(100, value)) } as Partial<RoomElement>)
            }
          />
        </>
      ) : (
        <>
          <NumberField
            label="xMm"
            value={element.xMm}
            onCommit={(value) =>
              onChange({ xMm: snapToGridMm(Math.max(0, value)) } as Partial<RoomElement>)
            }
          />
          <NumberField
            label="yMm"
            value={element.yMm}
            onCommit={(value) =>
              onChange({ yMm: snapToGridMm(Math.max(0, value)) } as Partial<RoomElement>)
            }
          />
        </>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="min-h-11 w-full rounded-lg border border-red-300 bg-red-50 px-3 font-semibold text-red-800"
      >
        삭제
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);
  return (
    <label className="block">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2"
        inputMode="numeric"
        value={display}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setDraft(String(value))}
        onBlur={() => {
          const parsed = parseIntOrNull(display);
          setDraft(null);
          if (parsed === null) return;
          onCommit(parsed);
        }}
      />
    </label>
  );
}
