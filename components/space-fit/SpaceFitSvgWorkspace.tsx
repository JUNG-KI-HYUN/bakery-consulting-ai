"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EquipmentDefinition, EquipmentInstance } from "@/lib/equipment/types";
import { equipmentDataStatusLabel, equipmentFootprintRect } from "@/lib/equipment/placement";
import { snapToGridMm } from "@/lib/space-fit/geometry";
import { mmToSvg, pointMmToSvg, type ViewTransform } from "@/lib/space-fit/coords";
import { entranceToRect } from "@/lib/space-fit/element-geometry";
import { elementWarningCodes } from "@/lib/space-fit/editor-state";
import type { GeometryWarning } from "@/lib/space-fit/geometry";
import {
  clientPointerToDomainMm,
  dragGrabOffsetMm,
  isFreelyDraggableType,
  moveElementByPointerMm,
} from "@/lib/space-fit/pointer-drag";
import {
  applyPanDelta,
  composeViewportTransform,
  createFitViewportControls,
  resetViewportToFit,
  stepZoomIn,
  stepZoomOut,
  zoomFactorAt,
  type SpaceFitViewportControls,
} from "@/lib/space-fit/viewport";
import type { RoomElement, SpaceFitLayout } from "@/lib/space-fit/types";

const GRID_MM = 100;
const POINT_HIT_TARGET_PX = 44;

function elementFill(type: RoomElement["type"]): string {
  switch (type) {
    case "PILLAR":
      return "#64748b";
    case "RESTROOM":
      return "#94a3b8";
    case "ENTRANCE":
      return "#0B1220";
    case "ELECTRICAL_POINT":
      return "#ca8a04";
    case "WATER_POINT":
      return "#0284c7";
    case "DRAIN_POINT":
      return "#0f766e";
    case "EXHAUST_POINT":
      return "#c2410c";
  }
}

type ActiveGesture =
  | {
      kind: "drag";
      elementId: string;
      pointerId: number;
      grab: { offsetXMm: number; offsetYMm: number };
    }
  | {
      kind: "equipment-drag";
      equipmentInstanceId: string;
      pointerId: number;
      grab: { offsetXMm: number; offsetYMm: number };
    }
  | {
      kind: "pan";
      pointerId: number;
      lastClientX: number;
      lastClientY: number;
    };

export function SpaceFitSvgWorkspace({
  layout,
  definitions,
  selectedElementId,
  selectedEquipmentInstanceId,
  warnings,
  placementActive,
  onSelectElement,
  onSelectEquipment,
  onElementMoved,
  onDragPreview,
  onEquipmentMoved,
  onEquipmentDragPreview,
  onPlaceAt,
  viewportControls,
  onViewportControlsChange,
}: {
  layout: SpaceFitLayout;
  definitions: ReadonlyMap<string, EquipmentDefinition>;
  selectedElementId: string | null;
  selectedEquipmentInstanceId: string | null;
  warnings: readonly GeometryWarning[];
  placementActive: boolean;
  onSelectElement: (elementId: string | null) => void;
  onSelectEquipment: (equipmentInstanceId: string | null) => void;
  onElementMoved: (element: RoomElement) => void;
  onDragPreview: (element: RoomElement | null) => void;
  onEquipmentMoved: (instance: EquipmentInstance) => void;
  onEquipmentDragPreview: (instance: EquipmentInstance | null) => void;
  onPlaceAt: (xMm: number, yMm: number) => void;
  viewportControls: Omit<
    SpaceFitViewportControls,
    "fit" | "viewportWidthPx" | "viewportHeightPx"
  >;
  onViewportControlsChange: (next: {
    zoomIndex: number;
    panXPx: number;
    panYPx: number;
  }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 640, height: 480 });
  const [gesture, setGesture] = useState<ActiveGesture | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(240, Math.floor(rect.width)),
        height: Math.max(240, Math.floor(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const controls = useMemo(() => {
    return createFitViewportControls({
      roomWidthMm: layout.room.widthMm,
      roomDepthMm: layout.room.depthMm,
      viewportWidthPx: size.width,
      viewportHeightPx: size.height,
      zoomIndex: viewportControls.zoomIndex,
      panXPx: viewportControls.panXPx,
      panYPx: viewportControls.panYPx,
    });
  }, [
    layout.room.widthMm,
    layout.room.depthMm,
    size.width,
    size.height,
    viewportControls.zoomIndex,
    viewportControls.panXPx,
    viewportControls.panYPx,
  ]);

  const transform: ViewTransform = useMemo(
    () => composeViewportTransform(controls),
    [controls],
  );

  const roomW = mmToSvg(layout.room.widthMm, transform.scale);
  const roomH = mmToSvg(layout.room.depthMm, transform.scale);

  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = 0; x <= layout.room.widthMm; x += GRID_MM) {
    const px = transform.offsetXPx + mmToSvg(x, transform.scale);
    gridLines.push({
      x1: px,
      y1: transform.offsetYPx,
      x2: px,
      y2: transform.offsetYPx + roomH,
    });
  }
  for (let y = 0; y <= layout.room.depthMm; y += GRID_MM) {
    const py = transform.offsetYPx + mmToSvg(y, transform.scale);
    gridLines.push({
      x1: transform.offsetXPx,
      y1: py,
      x2: transform.offsetXPx + roomW,
      y2: py,
    });
  }

  function pointerToMm(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const svgRect = svg.getBoundingClientRect();
    return clientPointerToDomainMm({
      clientX,
      clientY,
      svgRect,
      viewBoxWidth: size.width,
      viewBoxHeight: size.height,
      transform,
    });
  }

  function handlePointerDownOnElement(
    event: ReactPointerEvent,
    element: RoomElement,
  ) {
    event.stopPropagation();
    event.preventDefault();
    onSelectEquipment(null);
    onSelectElement(element.elementId);
    if (!isFreelyDraggableType(element.type)) return;
    const pointerMm = pointerToMm(event.clientX, event.clientY);
    if (!pointerMm) return;
    const grab = dragGrabOffsetMm(element, pointerMm);
    if (!grab) return;
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: "drag",
      elementId: element.elementId,
      pointerId: event.pointerId,
      grab,
    });
    onDragPreview(element);
  }

  function handlePointerDownOnEquipment(
    event: ReactPointerEvent,
    instance: EquipmentInstance,
  ) {
    event.stopPropagation();
    event.preventDefault();
    onSelectElement(null);
    onSelectEquipment(instance.equipmentInstanceId);
    const pointerMm = pointerToMm(event.clientX, event.clientY);
    if (!pointerMm) return;
    const grab = {
      offsetXMm: pointerMm.xMm - instance.xMm,
      offsetYMm: pointerMm.yMm - instance.yMm,
    };
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: "equipment-drag",
      equipmentInstanceId: instance.equipmentInstanceId,
      pointerId: event.pointerId,
      grab,
    });
    onEquipmentDragPreview(instance);
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent) {
    const target = event.target as Element;
    const isPanSurface =
      target.getAttribute("data-pan-surface") === "true" ||
      target === event.currentTarget;
    if (!isPanSurface) return;
    event.preventDefault();

    if (placementActive) {
      const pointerMm = pointerToMm(event.clientX, event.clientY);
      if (!pointerMm) return;
      onPlaceAt(snapToGridMm(Math.max(0, pointerMm.xMm)), snapToGridMm(Math.max(0, pointerMm.yMm)));
      return;
    }

    onSelectElement(null);
    onSelectEquipment(null);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setGesture({
      kind: "pan",
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    });
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "pan") {
      const dx = event.clientX - gesture.lastClientX;
      const dy = event.clientY - gesture.lastClientY;
      const next = applyPanDelta(controls, dx, dy);
      onViewportControlsChange({
        zoomIndex: next.zoomIndex,
        panXPx: next.panXPx,
        panYPx: next.panYPx,
      });
      setGesture({
        ...gesture,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
      });
      return;
    }
    const pointerMm = pointerToMm(event.clientX, event.clientY);
    if (!pointerMm) return;
    if (gesture.kind === "drag") {
      const source =
        layout.elements.find((item) => item.elementId === gesture.elementId) ?? null;
      if (!source) return;
      const moved = moveElementByPointerMm(source, pointerMm, gesture.grab);
      if (moved) onDragPreview(moved);
      return;
    }
    const source =
      layout.equipmentInstances?.find(
        (item) => item.equipmentInstanceId === gesture.equipmentInstanceId,
      ) ?? null;
    if (!source) return;
    const xMm = snapToGridMm(Math.max(0, pointerMm.xMm - gesture.grab.offsetXMm));
    const yMm = snapToGridMm(Math.max(0, pointerMm.yMm - gesture.grab.offsetYMm));
    onEquipmentDragPreview(Object.freeze({ ...source, xMm, yMm }));
  }

  function handlePointerUp(event: ReactPointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "drag") {
      const current =
        layout.elements.find((item) => item.elementId === gesture.elementId) ?? null;
      if (current) onElementMoved(current);
      onDragPreview(null);
    } else if (gesture.kind === "equipment-drag") {
      const current =
        layout.equipmentInstances?.find(
          (item) => item.equipmentInstanceId === gesture.equipmentInstanceId,
        ) ?? null;
      if (current) onEquipmentMoved(current);
      onEquipmentDragPreview(null);
    }
    setGesture(null);
  }

  const zoomPercent = Math.round(zoomFactorAt(viewportControls.zoomIndex) * 100);

  return (
    <div className="flex h-full min-h-[320px] w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
          aria-label="축소"
          onClick={() =>
            onViewportControlsChange({
              zoomIndex: stepZoomOut(viewportControls.zoomIndex),
              panXPx: viewportControls.panXPx,
              panYPx: viewportControls.panYPx,
            })
          }
        >
          -
        </button>
        <span className="min-w-14 text-center text-sm font-semibold">{zoomPercent}%</span>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
          aria-label="확대"
          onClick={() =>
            onViewportControlsChange({
              zoomIndex: stepZoomIn(viewportControls.zoomIndex),
              panXPx: viewportControls.panXPx,
              panYPx: viewportControls.panYPx,
            })
          }
        >
          +
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
          onClick={() => {
            const reset = resetViewportToFit(controls);
            onViewportControlsChange({
              zoomIndex: reset.zoomIndex,
              panXPx: reset.panXPx,
              panYPx: reset.panYPx,
            });
          }}
        >
          전체 보기
        </button>
        <span className="text-xs text-slate-500">
          {placementActive
            ? "배치 모드: 평면 클릭"
            : "빈 공간 드래그 = 이동 · 요소/장비 = 선택"}
        </span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 bg-[#EEF2F6] touch-none">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="SPACE FIT 평면"
          className="h-full w-full touch-none"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <rect
            data-pan-surface="true"
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fill="#EEF2F6"
          />
          <rect
            data-pan-surface="true"
            x={transform.offsetXPx}
            y={transform.offsetYPx}
            width={roomW}
            height={roomH}
            fill="#ffffff"
            stroke="#0B1220"
            strokeWidth={2}
          />
          {gridLines.map((line, index) => (
            <line
              key={`g-${index}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#cbd5e1"
              strokeWidth={0.5}
              opacity={0.55}
              pointerEvents="none"
            />
          ))}
          {layout.elements.map((element) => {
            const selected = element.elementId === selectedElementId;
            const codes = elementWarningCodes(warnings, element.elementId);
            const warnLabel =
              codes.length > 0 ? codes.map((code) => code.replace(/_/g, " ")).join(" · ") : null;

            if (
              element.type === "ELECTRICAL_POINT" ||
              element.type === "WATER_POINT" ||
              element.type === "DRAIN_POINT" ||
              element.type === "EXHAUST_POINT"
            ) {
              const p = pointMmToSvg({ xMm: element.xMm, yMm: element.yMm }, transform);
              const visualR = Math.max(4, mmToSvg(80, transform.scale) / 2);
              const hitR = Math.max(visualR, POINT_HIT_TARGET_PX / 2);
              return (
                <g key={element.elementId}>
                  <circle
                    cx={p.xPx}
                    cy={p.yPx}
                    r={hitR}
                    fill="transparent"
                    onPointerDown={(event) => handlePointerDownOnElement(event, element)}
                  />
                  <circle
                    cx={p.xPx}
                    cy={p.yPx}
                    r={visualR}
                    fill={elementFill(element.type)}
                    stroke={selected ? "#0B1220" : "#ffffff"}
                    strokeWidth={selected ? 3 : 1}
                    pointerEvents="none"
                  />
                  {warnLabel ? (
                    <text
                      x={p.xPx}
                      y={p.yPx - hitR - 4}
                      textAnchor="middle"
                      className="fill-amber-800"
                      style={{ fontSize: 10, fontWeight: 700 }}
                      pointerEvents="none"
                    >
                      ! {warnLabel}
                    </text>
                  ) : null}
                </g>
              );
            }

            const rect =
              element.type === "ENTRANCE"
                ? entranceToRect(element, layout.room)
                : element.type === "PILLAR" || element.type === "RESTROOM"
                  ? {
                      xMm: element.xMm,
                      yMm: element.yMm,
                      widthMm: element.widthMm,
                      heightMm: element.heightMm,
                    }
                  : null;
            if (!rect) return null;
            const topLeft = pointMmToSvg({ xMm: rect.xMm, yMm: rect.yMm }, transform);
            const w = mmToSvg(rect.widthMm, transform.scale);
            const h = mmToSvg(rect.heightMm, transform.scale);
            return (
              <g key={element.elementId}>
                <rect
                  x={topLeft.xPx}
                  y={topLeft.yPx}
                  width={w}
                  height={h}
                  fill={elementFill(element.type)}
                  fillOpacity={element.type === "ENTRANCE" ? 0.85 : 0.55}
                  stroke={selected ? "#0B1220" : codes.length ? "#b45309" : "#334155"}
                  strokeWidth={selected ? 3 : 1}
                  onPointerDown={(event) => handlePointerDownOnElement(event, element)}
                />
                {warnLabel ? (
                  <text
                    x={topLeft.xPx + w / 2}
                    y={topLeft.yPx - 4}
                    textAnchor="middle"
                    className="fill-amber-800"
                    style={{ fontSize: 10, fontWeight: 700 }}
                    pointerEvents="none"
                  >
                    ! {warnLabel}
                  </text>
                ) : null}
              </g>
            );
          })}
          {(layout.equipmentInstances ?? []).map((instance) => {
            const definition = definitions.get(instance.equipmentDefinitionId);
            const selected = instance.equipmentInstanceId === selectedEquipmentInstanceId;
            const codes = elementWarningCodes(warnings, instance.equipmentInstanceId);
            const warnLabel =
              codes.length > 0 ? codes.map((code) => code.replace(/_/g, " ")).join(" · ") : null;
            if (!definition) {
              const p = pointMmToSvg({ xMm: instance.xMm, yMm: instance.yMm }, transform);
              return (
                <g key={instance.equipmentInstanceId}>
                  <text
                    x={p.xPx}
                    y={p.yPx}
                    style={{ fontSize: 11, fontWeight: 700 }}
                    className="fill-amber-900"
                    onPointerDown={(event) => handlePointerDownOnEquipment(event, instance)}
                  >
                    장비정보를 찾을 수 없음
                  </text>
                </g>
              );
            }
            const rect = equipmentFootprintRect(definition, instance);
            if (!rect) {
              const p = pointMmToSvg({ xMm: instance.xMm, yMm: instance.yMm }, transform);
              return (
                <g key={instance.equipmentInstanceId}>
                  <text
                    x={p.xPx}
                    y={p.yPx}
                    style={{ fontSize: 11, fontWeight: 700 }}
                    className="fill-amber-900"
                    onPointerDown={(event) => handlePointerDownOnEquipment(event, instance)}
                  >
                    footprint 불가
                  </text>
                </g>
              );
            }
            const topLeft = pointMmToSvg({ xMm: rect.xMm, yMm: rect.yMm }, transform);
            const w = mmToSvg(rect.widthMm, transform.scale);
            const h = mmToSvg(rect.heightMm, transform.scale);
            const sample = definition.dataStatus === "SAMPLE";
            return (
              <g key={instance.equipmentInstanceId}>
                <rect
                  x={topLeft.xPx}
                  y={topLeft.yPx}
                  width={w}
                  height={h}
                  fill="#1d4ed8"
                  fillOpacity={0.28}
                  stroke={selected ? "#0B1220" : codes.length ? "#b45309" : "#1e3a8a"}
                  strokeWidth={selected ? 3 : 1.5}
                  strokeDasharray={sample ? "6 4" : undefined}
                  onPointerDown={(event) => handlePointerDownOnEquipment(event, instance)}
                />
                <text
                  x={topLeft.xPx + 4}
                  y={topLeft.yPx + 14}
                  style={{ fontSize: 11, fontWeight: 700 }}
                  className="fill-slate-900"
                  pointerEvents="none"
                >
                  {definition.name}
                </text>
                <text
                  x={topLeft.xPx + 4}
                  y={topLeft.yPx + 28}
                  style={{ fontSize: 10, fontWeight: 600 }}
                  className="fill-amber-900"
                  pointerEvents="none"
                >
                  {equipmentDataStatusLabel(definition.dataStatus)} · {instance.rotationDeg}°
                </text>
                {warnLabel ? (
                  <text
                    x={topLeft.xPx + w / 2}
                    y={topLeft.yPx - 4}
                    textAnchor="middle"
                    className="fill-amber-800"
                    style={{ fontSize: 10, fontWeight: 700 }}
                    pointerEvents="none"
                  >
                    ! {warnLabel}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function GeometryWarningsPanel({ warnings }: { warnings: readonly GeometryWarning[] }) {
  if (warnings.length === 0) {
    return (
      <p className="text-sm text-slate-600">Geometry 경고 없음 (Risk/Verdict가 아닙니다).</p>
    );
  }
  return (
    <ul className="space-y-1 text-sm text-amber-950">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${warning.elementId ?? "x"}-${index}`}>
          <span className="font-semibold">{warning.code}</span> — {warning.message}
          {warning.elementId ? ` (${warning.elementId})` : ""}
        </li>
      ))}
    </ul>
  );
}
