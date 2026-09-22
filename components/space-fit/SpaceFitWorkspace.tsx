"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMeasurementMmDisplay } from "@/lib/field/space-equipment";
import { buildSpaceFitContextNotes } from "@/lib/space-fit/context-notes";
import {
  canPersistLayout,
  elementWarningCodes,
  patchElement,
  removeElement,
  replaceElement,
  saveStatusLabel,
  summarizeGeometryWarnings,
  type SpaceFitSaveUiStatus,
} from "@/lib/space-fit/editor-state";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import { snapToGridMm } from "@/lib/space-fit/geometry";
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  withLayoutElements,
  type SpaceFitHistoryState,
} from "@/lib/space-fit/history";
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
import { SPACE_FIT_DEFAULT_ZOOM_INDEX } from "@/lib/space-fit/viewport";

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
  fieldContext,
}: {
  initialLayout: SpaceFitLayout;
  initialWarnings?: readonly GeometryWarning[];
  fieldContext: {
    surveySequence: number | null;
    measurementSet: MeasurementSet | null;
    productionSalesSpace: ProductionSalesSpaceObservation | null;
    deliveryPath: DeliveryPathObservation | null;
  };
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(initialLayout);
  const [history, setHistory] = useState<SpaceFitHistoryState>(() =>
    createHistory(initialLayout.elements),
  );
  const [dragPreview, setDragPreview] = useState<RoomElement | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SpaceFitSaveUiStatus>("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewportUi, setViewportUi] = useState({
    zoomIndex: SPACE_FIT_DEFAULT_ZOOM_INDEX,
    panXPx: 0,
    panYPx: 0,
  });

  const displayLayout = useMemo(() => {
    if (!dragPreview) return layout;
    return replaceElement(layout, dragPreview);
  }, [layout, dragPreview]);

  const warnings = useMemo(
    () => validateLayoutGeometry(displayLayout),
    [displayLayout],
  );

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

  const warningSummary = useMemo(() => summarizeGeometryWarnings(warnings), [warnings]);
  const measurement = fieldContext.measurementSet;
  const widthDisplay = formatMeasurementMmDisplay(measurement?.values.roomWidthMm);
  const depthDisplay = formatMeasurementMmDisplay(measurement?.values.roomDepthMm);
  const ceilingDisplay = formatMeasurementMmDisplay(measurement?.values.ceilingHeightMm);
  const dirty = saveStatus === "dirty" || saveStatus === "save_failed" || saveStatus === "conflict";

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function commitElements(nextElements: readonly RoomElement[], options?: { recordHistory?: boolean }) {
    const nextLayout = withLayoutElements(layout, nextElements);
    setLayout(nextLayout);
    if (options?.recordHistory !== false) {
      setHistory((prev) => pushHistory(prev, nextElements));
    }
    setSaveStatus("dirty");
    setErrorMessage(null);
  }

  function applyDomainLayout(nextLayout: SpaceFitLayout, recordHistory: boolean) {
    setLayout(nextLayout);
    if (recordHistory) {
      setHistory((prev) => pushHistory(prev, nextLayout.elements));
    } else {
      setHistory(createHistory(nextLayout.elements));
    }
  }

  const save = useCallback(async () => {
    const currentWarnings = validateLayoutGeometry(layout);
    if (!canPersistLayout(currentWarnings)) {
      setSaveStatus("save_failed");
      setErrorMessage("잘못된 요소가 있어 저장할 수 없습니다. 치수를 확인해 주세요.");
      return;
    }
    setSaveStatus("saving");
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
      // 로컬 변경을 서버 값으로 조용히 덮어쓰지 않는다.
      setSaveStatus("conflict");
      setErrorMessage(saveStatusLabel("conflict"));
      return;
    }
    if (!response.ok || !body.layout) {
      setSaveStatus("save_failed");
      setErrorMessage(body.message ?? "저장에 실패했습니다.");
      return;
    }
    setLayout(body.layout);
    setHistory(createHistory(body.layout.elements));
    setSaveStatus("save_ok");
    router.refresh();
  }, [layout, router]);

  function addElement(type: RoomElementType) {
    let next: RoomElement;
    switch (type) {
      case "PILLAR":
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
    commitElements([...layout.elements, next]);
    setSelectedElementId(next.elementId);
  }

  function updateSelected(patch: Partial<RoomElement>) {
    if (!selected) return;
    const nextLayout = patchElement(layout, selected.elementId, patch);
    applyDomainLayout(nextLayout, true);
    setSaveStatus("dirty");
    setErrorMessage(null);
  }

  function deleteSelected() {
    if (!selected) return;
    const nextLayout = removeElement(layout, selected.elementId);
    applyDomainLayout(nextLayout, true);
    setSelectedElementId(null);
    setSaveStatus("dirty");
    setErrorMessage(null);
  }

  function onElementMoved(element: RoomElement) {
    setDragPreview(null);
    const prev = layout.elements.find((item) => item.elementId === element.elementId);
    if (
      prev &&
      "xMm" in prev &&
      "xMm" in element &&
      prev.xMm === element.xMm &&
      prev.yMm === element.yMm
    ) {
      return;
    }
    const nextLayout = replaceElement(layout, element);
    applyDomainLayout(nextLayout, true);
    setSaveStatus("dirty");
    setErrorMessage(null);
  }

  function undo() {
    const next = undoHistory(history);
    if (!next) return;
    setHistory(next);
    setLayout(withLayoutElements(layout, next.present));
    setSaveStatus("dirty");
  }

  function redo() {
    const next = redoHistory(history);
    if (!next) return;
    setHistory(next);
    setLayout(withLayoutElements(layout, next.present));
    setSaveStatus("dirty");
  }

  const selectedWarn = selected
    ? elementWarningCodes(warnings, selected.elementId)
    : [];

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
              {saveStatusLabel(saveStatus === "save_ok" ? "saved" : saveStatus)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!historyCanUndo(history)}
              onClick={undo}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              실행 취소
            </button>
            <button
              type="button"
              disabled={!historyCanRedo(history)}
              onClick={redo}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              다시 실행
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saveStatus === "saving" || !canPersistLayout(warnings)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-500 bg-white px-3 text-sm font-semibold text-[#0B1220] disabled:opacity-40"
            >
              {saveStatus === "saving" ? "저장 중…" : "저장"}
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
        <aside className="max-h-[40vh] shrink-0 space-y-4 overflow-auto border-b border-slate-200 bg-white p-4 lg:max-h-none lg:w-80 lg:border-r lg:border-b-0">
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
            <p className="mt-2 text-xs text-slate-500">위치는 100mm grid. 출입구는 벽·오프셋으로만 편집.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold">선택 요소</h2>
            {!selected ? (
              <p className="mt-2 text-sm text-slate-600">요소를 선택하세요.</p>
            ) : (
              <>
                {selectedWarn.length > 0 ? (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    ! Geometry: {selectedWarn.join(", ")}
                  </p>
                ) : null}
                <ElementEditor
                  element={selected}
                  onChange={updateSelected}
                  onDelete={deleteSelected}
                />
              </>
            )}
          </section>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 p-2 sm:p-3">
          <SpaceFitSvgWorkspace
            layout={displayLayout}
            selectedElementId={selectedElementId}
            warnings={warnings}
            onSelectElement={setSelectedElementId}
            onElementMoved={onElementMoved}
            onDragPreview={setDragPreview}
            viewportControls={viewportUi}
            onViewportControlsChange={setViewportUi}
          />
        </main>

        <aside className="shrink-0 overflow-auto border-t border-slate-200 bg-white p-4 lg:w-72 lg:border-t-0 lg:border-l">
          <h2 className="text-sm font-bold">Geometry 요약</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li>영역이탈 {warningSummary.outOfBounds}</li>
            <li>겹침 {warningSummary.overlap}</li>
            <li>잘못된 요소 {warningSummary.invalid}</li>
          </ul>
          <p className="mt-2 text-xs text-slate-500">숫자는 Risk score가 아닙니다.</p>
          <h2 className="mt-4 text-sm font-bold">Geometry warnings</h2>
          <div className="mt-2">
            <GeometryWarningsPanel warnings={warnings} />
          </div>
          {errorMessage ? (
            <p className="mt-3 text-sm font-semibold text-red-700">{errorMessage}</p>
          ) : null}
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
