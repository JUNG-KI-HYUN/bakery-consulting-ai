"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMeasurementMmDisplay } from "@/lib/field/space-equipment";
import {
  canPlaceEquipmentOnLayout,
  createPlacedEquipmentInstance,
  equipmentDataStatusLabel,
  moveEquipmentInstance,
  rotateEquipmentInstance,
} from "@/lib/equipment/placement";
import { getEquipmentFootprint } from "@/lib/equipment/footprint";
import {
  EQUIPMENT_CATEGORIES,
  type EquipmentCategory,
  type EquipmentDefinition,
  type EquipmentInstance,
} from "@/lib/equipment/types";
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
  createHistoryFromLayout,
  pushHistory,
  redoHistory,
  snapshotFromLayout,
  undoHistory,
  withLayoutDomain,
  withLayoutElements,
  withLayoutEquipment,
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

function formatDim(
  dimension: EquipmentDefinition["dimensions"]["widthMm"],
): string {
  if (!dimension) return "미입력";
  if (dimension.status === "UNKNOWN") return "UNKNOWN";
  return `${dimension.mm.toLocaleString("ko-KR")} mm`;
}

export function SpaceFitWorkspace({
  initialLayout,
  initialEquipmentDefinitions = [],
  fieldContext,
}: {
  initialLayout: SpaceFitLayout;
  initialWarnings?: readonly GeometryWarning[];
  initialEquipmentDefinitions?: readonly EquipmentDefinition[];
  fieldContext: {
    surveySequence: number | null;
    measurementSet: MeasurementSet | null;
    productionSalesSpace: ProductionSalesSpaceObservation | null;
    deliveryPath: DeliveryPathObservation | null;
  };
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(initialLayout);
  const [definitions, setDefinitions] = useState<EquipmentDefinition[]>([
    ...initialEquipmentDefinitions,
  ]);
  const [history, setHistory] = useState<SpaceFitHistoryState>(() =>
    createHistoryFromLayout(initialLayout),
  );
  const [dragPreview, setDragPreview] = useState<RoomElement | null>(null);
  const [equipmentPreview, setEquipmentPreview] = useState<EquipmentInstance | null>(
    null,
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [placeDefinitionId, setPlaceDefinitionId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | "ALL">("ALL");
  const [saveStatus, setSaveStatus] = useState<SpaceFitSaveUiStatus>("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewportUi, setViewportUi] = useState({
    zoomIndex: SPACE_FIT_DEFAULT_ZOOM_INDEX,
    panXPx: 0,
    panYPx: 0,
  });

  const definitionMap = useMemo(() => {
    const map = new Map<string, EquipmentDefinition>();
    for (const item of definitions) map.set(item.equipmentDefinitionId, item);
    return map;
  }, [definitions]);

  const displayLayout = useMemo(() => {
    let next = layout;
    if (dragPreview) next = replaceElement(next, dragPreview);
    if (equipmentPreview) {
      const instances = (next.equipmentInstances ?? []).map((item) =>
        item.equipmentInstanceId === equipmentPreview.equipmentInstanceId
          ? equipmentPreview
          : item,
      );
      next = withLayoutEquipment(next, instances);
    }
    return next;
  }, [layout, dragPreview, equipmentPreview]);

  const warnings = useMemo(
    () => validateLayoutGeometry(displayLayout, definitionMap),
    [displayLayout, definitionMap],
  );

  const selected = useMemo(
    () => layout.elements.find((item) => item.elementId === selectedElementId) ?? null,
    [layout.elements, selectedElementId],
  );
  const selectedEquipment = useMemo(
    () =>
      layout.equipmentInstances?.find(
        (item) => item.equipmentInstanceId === selectedEquipmentId,
      ) ?? null,
    [layout.equipmentInstances, selectedEquipmentId],
  );
  const selectedDefinition = selectedEquipment
    ? definitionMap.get(selectedEquipment.equipmentDefinitionId) ?? null
    : null;

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

  const libraryItems = useMemo(() => {
    return definitions.filter(
      (item) => categoryFilter === "ALL" || item.category === categoryFilter,
    );
  }, [definitions, categoryFilter]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function applyDomainLayout(nextLayout: SpaceFitLayout, recordHistory: boolean) {
    setLayout(nextLayout);
    if (recordHistory) {
      setHistory((prev) => pushHistory(prev, snapshotFromLayout(nextLayout)));
    } else {
      setHistory(createHistoryFromLayout(nextLayout));
    }
  }

  function commitElements(nextElements: readonly RoomElement[]) {
    const nextLayout = withLayoutElements(layout, nextElements);
    applyDomainLayout(nextLayout, true);
    setSaveStatus("dirty");
    setErrorMessage(null);
  }

  const save = useCallback(async () => {
    const currentWarnings = validateLayoutGeometry(layout, definitionMap);
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
        equipmentInstances: layout.equipmentInstances ?? [],
      }),
    });
    const body = (await response.json()) as {
      layout?: SpaceFitLayout;
      equipmentDefinitions?: EquipmentDefinition[];
      message?: string;
    };
    if (response.status === 409) {
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
    if (body.equipmentDefinitions) {
      setDefinitions((prev) => {
        const map = new Map(prev.map((item) => [item.equipmentDefinitionId, item]));
        for (const item of body.equipmentDefinitions ?? []) {
          map.set(item.equipmentDefinitionId, item);
        }
        return [...map.values()];
      });
    }
    setHistory(createHistoryFromLayout(body.layout));
    setSaveStatus("save_ok");
    router.refresh();
  }, [layout, definitionMap, router]);

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
    setSelectedEquipmentId(null);
  }

  function updateSelected(patch: Partial<RoomElement>) {
    if (!selected) return;
    applyDomainLayout(patchElement(layout, selected.elementId, patch), true);
    setSaveStatus("dirty");
    setErrorMessage(null);
  }

  function deleteSelected() {
    if (selected) {
      applyDomainLayout(removeElement(layout, selected.elementId), true);
      setSelectedElementId(null);
      setSaveStatus("dirty");
      return;
    }
    if (selectedEquipment) {
      const next = withLayoutEquipment(
        layout,
        (layout.equipmentInstances ?? []).filter(
          (item) => item.equipmentInstanceId !== selectedEquipment.equipmentInstanceId,
        ),
      );
      applyDomainLayout(next, true);
      setSelectedEquipmentId(null);
      setSaveStatus("dirty");
    }
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
    applyDomainLayout(replaceElement(layout, element), true);
    setSaveStatus("dirty");
  }

  function onEquipmentMoved(instance: EquipmentInstance) {
    setEquipmentPreview(null);
    const prev = layout.equipmentInstances?.find(
      (item) => item.equipmentInstanceId === instance.equipmentInstanceId,
    );
    if (prev && prev.xMm === instance.xMm && prev.yMm === instance.yMm) return;
    const next = withLayoutEquipment(
      layout,
      (layout.equipmentInstances ?? []).map((item) =>
        item.equipmentInstanceId === instance.equipmentInstanceId ? instance : item,
      ),
    );
    applyDomainLayout(next, true);
    setSaveStatus("dirty");
  }

  function startPlacement(definition: EquipmentDefinition) {
    const placeable = canPlaceEquipmentOnLayout(definition);
    if (!placeable.ok) {
      setErrorMessage(placeable.message);
      return;
    }
    setPlaceDefinitionId(definition.equipmentDefinitionId);
    setSelectedElementId(null);
    setSelectedEquipmentId(null);
    setErrorMessage(null);
  }

  function placeEquipmentAt(xMm: number, yMm: number) {
    if (!placeDefinitionId) return;
    const definition = definitionMap.get(placeDefinitionId);
    if (!definition) {
      setErrorMessage("장비정보를 찾을 수 없음");
      setPlaceDefinitionId(null);
      return;
    }
    const created = createPlacedEquipmentInstance({
      definition,
      layoutId: layout.layoutId,
      xMm,
      yMm,
      createdAt: new Date().toISOString(),
    });
    if (!created.ok) {
      setErrorMessage(created.message);
      return;
    }
    const next = withLayoutEquipment(layout, [
      ...(layout.equipmentInstances ?? []),
      created.instance,
    ]);
    applyDomainLayout(next, true);
    setSelectedEquipmentId(created.instance.equipmentInstanceId);
    setPlaceDefinitionId(null);
    setSaveStatus("dirty");
  }

  function rotateSelectedEquipment() {
    if (!selectedEquipment || !selectedDefinition) return;
    const rotated = rotateEquipmentInstance(selectedEquipment, selectedDefinition);
    if (!rotated.ok) {
      setErrorMessage(rotated.message);
      return;
    }
    const next = withLayoutEquipment(
      layout,
      (layout.equipmentInstances ?? []).map((item) =>
        item.equipmentInstanceId === rotated.instance.equipmentInstanceId
          ? rotated.instance
          : item,
      ),
    );
    applyDomainLayout(next, true);
    setSaveStatus("dirty");
  }

  function undo() {
    const next = undoHistory(history);
    if (!next) return;
    setHistory(next);
    setLayout(withLayoutDomain(layout, next.present));
    setSaveStatus("dirty");
  }

  function redo() {
    const next = redoHistory(history);
    if (!next) return;
    setHistory(next);
    setLayout(withLayoutDomain(layout, next.present));
    setSaveStatus("dirty");
  }

  function selectElement(id: string | null) {
    setSelectedElementId(id);
    if (id) setSelectedEquipmentId(null);
  }

  function selectEquipment(id: string | null) {
    setSelectedEquipmentId(id);
    if (id) setSelectedElementId(null);
  }

  const selectedWarn = selected
    ? elementWarningCodes(warnings, selected.elementId)
    : selectedEquipment
      ? elementWarningCodes(warnings, selectedEquipment.equipmentInstanceId)
      : [];

  const footprint =
    selectedEquipment && selectedDefinition
      ? getEquipmentFootprint(selectedDefinition, selectedEquipment.rotationDeg)
      : null;

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
              {placeDefinitionId ? " · 배치 모드: Canvas를 클릭하세요" : ""}
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
        <aside className="max-h-[42vh] shrink-0 space-y-4 overflow-auto border-b border-slate-200 bg-white p-4 lg:max-h-none lg:w-80 lg:border-r lg:border-b-0">
          <section>
            <h2 className="text-sm font-bold">공간 실측정보</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">가로</dt>
                <dd className="font-semibold">
                  {widthDisplay.kind === "known" ? widthDisplay.label : "확인되지 않음"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">깊이</dt>
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
            <h2 className="text-sm font-bold">구조 요소 추가</h2>
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
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">장비 Library</h2>
              <Link href="/equipment" className="text-xs font-semibold text-slate-600 underline">
                관리
              </Link>
            </div>
            <label className="mt-2 block text-xs text-slate-600">
              category
              <select
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value as EquipmentCategory | "ALL")
                }
              >
                <option value="ALL">ALL</option>
                {EQUIPMENT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            {libraryItems.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                등록된 Definition이 없습니다. /equipment 에서 추가하세요.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {libraryItems.map((item) => {
                  const placeable = canPlaceEquipmentOnLayout(item);
                  return (
                    <li
                      key={item.equipmentDefinitionId}
                      className="rounded-lg border border-slate-200 px-2 py-2 text-xs"
                    >
                      <p className="font-semibold text-sm">{item.name}</p>
                      <p className="text-slate-600">
                        {item.category}
                        {item.manufacturer ? ` · ${item.manufacturer}` : ""}
                        {item.model ? ` / ${item.model}` : ""}
                      </p>
                      <p className="font-semibold text-amber-900">
                        {equipmentDataStatusLabel(item.dataStatus)}
                      </p>
                      <p className="text-slate-600">
                        {formatDim(item.dimensions.widthMm)} ×{" "}
                        {formatDim(item.dimensions.depthMm)}
                      </p>
                      <button
                        type="button"
                        disabled={!placeable.ok}
                        onClick={() => startPlacement(item)}
                        className="mt-2 min-h-11 w-full rounded-lg border border-[#0B1220] bg-[#0B1220] px-2 font-semibold text-white disabled:opacity-40"
                      >
                        {placeable.ok ? "배치" : "치수 미확인"}
                      </button>
                      {!placeable.ok ? (
                        <p className="mt-1 text-amber-900">{placeable.message}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold">선택</h2>
            {!selected && !selectedEquipment ? (
              <p className="mt-2 text-sm text-slate-600">요소 또는 장비를 선택하세요.</p>
            ) : selected ? (
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
            ) : selectedEquipment ? (
              <div className="mt-2 space-y-2 text-sm">
                {selectedWarn.length > 0 ? (
                  <p className="text-xs font-semibold text-amber-800">
                    ! Geometry: {selectedWarn.join(", ")}
                  </p>
                ) : null}
                {selectedDefinition ? (
                  <>
                    <p className="font-semibold">{selectedDefinition.name}</p>
                    <p className="text-xs font-semibold text-amber-900">
                      {equipmentDataStatusLabel(selectedDefinition.dataStatus)}
                    </p>
                    <p className="text-xs text-slate-600">
                      {selectedDefinition.manufacturer ?? "제조사 미입력"}
                      {selectedDefinition.model ? ` / ${selectedDefinition.model}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      원본 규격은 장비 관리에서만 수정합니다.
                    </p>
                    <p>
                      rotation {selectedEquipment.rotationDeg}° · footprint{" "}
                      {footprint?.ok
                        ? `${footprint.widthMm}×${footprint.depthMm} mm`
                        : "계산 불가"}
                    </p>
                    {selectedDefinition.serviceClearance ? (
                      <p className="text-xs text-slate-600">
                        clearance F
                        {selectedDefinition.serviceClearance.frontMm ?? "확인 필요"} / B
                        {selectedDefinition.serviceClearance.backMm ?? "확인 필요"}
                      </p>
                    ) : null}
                    {selectedDefinition.minimumDeliveryWidthMm ? (
                      <p className="text-xs text-slate-600">
                        반입최소폭{" "}
                        {formatDim(selectedDefinition.minimumDeliveryWidthMm)} (비교
                        없음)
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="font-semibold text-amber-900">장비정보를 찾을 수 없음</p>
                )}
                <NumberField
                  label="xMm"
                  value={selectedEquipment.xMm}
                  onCommit={(value) => {
                    const moved = moveEquipmentInstance(
                      selectedEquipment,
                      snapToGridMm(Math.max(0, value)),
                      selectedEquipment.yMm,
                    );
                    onEquipmentMoved(moved);
                  }}
                />
                <NumberField
                  label="yMm"
                  value={selectedEquipment.yMm}
                  onCommit={(value) => {
                    const moved = moveEquipmentInstance(
                      selectedEquipment,
                      selectedEquipment.xMm,
                      snapToGridMm(Math.max(0, value)),
                    );
                    onEquipmentMoved(moved);
                  }}
                />
                <button
                  type="button"
                  onClick={rotateSelectedEquipment}
                  disabled={selectedDefinition?.rotationAllowed !== true}
                  className="min-h-11 w-full rounded-lg border border-slate-300 px-3 font-semibold disabled:opacity-40"
                >
                  90° 회전
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="min-h-11 w-full rounded-lg border border-red-300 bg-red-50 px-3 font-semibold text-red-800"
                >
                  삭제
                </button>
              </div>
            ) : null}
          </section>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 p-2 sm:p-3">
          <SpaceFitSvgWorkspace
            layout={displayLayout}
            definitions={definitionMap}
            selectedElementId={selectedElementId}
            selectedEquipmentInstanceId={selectedEquipmentId}
            warnings={warnings}
            placementActive={placeDefinitionId !== null}
            onSelectElement={selectElement}
            onSelectEquipment={selectEquipment}
            onElementMoved={onElementMoved}
            onDragPreview={setDragPreview}
            onEquipmentMoved={onEquipmentMoved}
            onEquipmentDragPreview={setEquipmentPreview}
            onPlaceAt={placeEquipmentAt}
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
