"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fitRoomToViewport, mmToSvg, pointMmToSvg } from "@/lib/space-fit/coords";
import { entranceToRect } from "@/lib/space-fit/element-geometry";
import type { GeometryWarning } from "@/lib/space-fit/geometry";
import type { RoomElement, SpaceFitLayout } from "@/lib/space-fit/types";

const GRID_MM = 100;

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

export function SpaceFitSvgWorkspace({
  layout,
  selectedElementId,
  onSelectElement,
}: {
  layout: SpaceFitLayout;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 480 });

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

  const transform = useMemo(
    () =>
      fitRoomToViewport(
        layout.room.widthMm,
        layout.room.depthMm,
        size.width,
        size.height,
        28,
      ),
    [layout.room.widthMm, layout.room.depthMm, size.width, size.height],
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

  return (
    <div ref={containerRef} className="h-full min-h-[320px] w-full bg-[#EEF2F6]">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label="SPACE FIT 평면"
        onClick={() => onSelectElement(null)}
      >
        <rect
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
          />
        ))}
        {layout.elements.map((element) => {
          const selected = element.elementId === selectedElementId;
          if (
            element.type === "ELECTRICAL_POINT" ||
            element.type === "WATER_POINT" ||
            element.type === "DRAIN_POINT" ||
            element.type === "EXHAUST_POINT"
          ) {
            const p = pointMmToSvg({ xMm: element.xMm, yMm: element.yMm }, transform);
            const r = Math.max(4, mmToSvg(80, transform.scale) / 2);
            return (
              <circle
                key={element.elementId}
                cx={p.xPx}
                cy={p.yPx}
                r={r}
                fill={elementFill(element.type)}
                stroke={selected ? "#0B1220" : "#ffffff"}
                strokeWidth={selected ? 3 : 1}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectElement(element.elementId);
                }}
              />
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
          return (
            <rect
              key={element.elementId}
              x={topLeft.xPx}
              y={topLeft.yPx}
              width={mmToSvg(rect.widthMm, transform.scale)}
              height={mmToSvg(rect.heightMm, transform.scale)}
              fill={elementFill(element.type)}
              fillOpacity={element.type === "ENTRANCE" ? 0.85 : 0.55}
              stroke={selected ? "#0B1220" : "#334155"}
              strokeWidth={selected ? 3 : 1}
              onClick={(event) => {
                event.stopPropagation();
                onSelectElement(element.elementId);
              }}
            />
          );
        })}
      </svg>
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
