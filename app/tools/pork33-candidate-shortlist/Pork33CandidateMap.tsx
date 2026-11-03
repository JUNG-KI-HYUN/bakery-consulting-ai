"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

export type Pork33MapPoint = {
  candidateStoreId: string; label: string; lat: number; lng: number; selected: boolean;
  address?: string; apartmentArea?: string; area?: string; rent?: string; mainApartment?: string;
};
type LatLng = object;
interface MapInstance { setCenter(point: LatLng): void; relayout(): void; setBounds(bounds: object): void }
interface Overlay { setMap(map: MapInstance | null): void }
type Marker = Overlay;
interface MapsApi {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => { extend(point: LatLng): void };
  Map: new (element: HTMLElement, options: { center: LatLng; level: number }) => MapInstance;
  Marker: new (options: { map: MapInstance; position: LatLng; title: string }) => Marker;
  CustomOverlay: new (options: { map: MapInstance; position: LatLng; content: HTMLElement; yAnchor: number }) => Overlay;
  event: { addListener(target: Marker, eventName: "click", callback: () => void): void };
}
interface KakaoWindow extends Window { kakao?: { maps?: MapsApi } }

export function Pork33CandidateMap({ points, onSelectCandidate }: { points: Pork33MapPoint[]; onSelectCandidate?(candidateStoreId: string): void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(points.find((point) => point.selected)?.candidateStoreId ?? "");
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim() ?? "";

  const selectPoint = useCallback((point: Pork33MapPoint, maps?: MapsApi) => {
    setActiveId(point.candidateStoreId);
    onSelectCandidate?.(point.candidateStoreId);
    if (maps && mapRef.current) mapRef.current.setCenter(new maps.LatLng(point.lat, point.lng));
  }, [onSelectCandidate]);

  const renderPoints = useCallback(() => {
    const maps = (window as KakaoWindow).kakao?.maps;
    const container = containerRef.current;
    if (!maps || !container || points.length === 0) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    const selected = points.find((point) => point.selected) ?? points[0];
    const center = new maps.LatLng(selected.lat, selected.lng);
    const map = mapRef.current ?? new maps.Map(container, { center, level: 5 });
    mapRef.current = map;
    const bounds = new maps.LatLngBounds();
    for (const point of points) {
      const position = new maps.LatLng(point.lat, point.lng);
      bounds.extend(position);
      const marker = new maps.Marker({ map, position, title: `${point.label} · ${point.candidateStoreId}` });
      const label = document.createElement("button");
      label.type = "button";
      label.textContent = point.label;
      label.setAttribute("aria-label", `${point.label} 상세 선택`);
      label.style.cssText = `border:1px solid ${point.selected ? "#b45309" : "#334155"};border-radius:999px;background:${point.selected ? "#f59e0b" : "#fff"};color:#0f172a;padding:3px 7px;font:700 11px Malgun Gothic;box-shadow:0 1px 4px #0003;cursor:pointer;`;
      label.addEventListener("click", () => selectPoint(point, maps));
      const overlay = new maps.CustomOverlay({ map, position, content: label, yAnchor: 2.25 });
      maps.event.addListener(marker, "click", () => selectPoint(point, maps));
      overlaysRef.current.push(marker, overlay);
    }
    map.setBounds(bounds);
    if (points.length === 1) map.setCenter(center);
    map.relayout();
    setActiveId((current) => points.some((point) => point.candidateStoreId === current) ? current : selected.candidateStoreId);
  }, [points, selectPoint]);

  const initialize = useCallback(() => {
    const maps = (window as KakaoWindow).kakao?.maps;
    if (!maps) { setError("Kakao SDK가 초기화되지 않았습니다. JavaScript 키와 등록 도메인을 확인하세요."); return; }
    maps.load(() => { setSdkReady(true); setError(""); });
  }, []);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => { if ((window as KakaoWindow).kakao?.maps) initialize(); }, 0);
    const timer = window.setTimeout(() => { if (!(window as KakaoWindow).kakao?.maps) setError("Kakao 지도 응답이 없습니다. JavaScript 키·localhost 등록·인앱 브라우저 접근을 확인하세요."); }, 10_000);
    return () => { window.clearTimeout(readyTimer); window.clearTimeout(timer); };
  }, [initialize]);
  useEffect(() => { if (sdkReady) renderPoints(); }, [renderPoints, sdkReady]);

  if (!mapKey) return <MapEmpty text="NEXT_PUBLIC_KAKAO_MAP_KEY 설정이 필요합니다." />;
  if (points.length === 0) return <MapEmpty text="검증된 좌표가 없습니다. 지도 위치 확인이 필요합니다." />;
  const active = points.find((point) => point.candidateStoreId === activeId) ?? points.find((point) => point.selected) ?? points[0];

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-600"><span>실제 좌표 Marker {points.length}개 · Candidate ID 연결</span><span>가짜 좌표 미사용</span></div>
    <div className="relative bg-slate-100" style={{ height: 420 }}>
      <div ref={containerRef} className="absolute inset-0" aria-label="PORK33 Candidate Kakao 지도" />
      {(!sdkReady || error) && <div className="absolute inset-0 grid place-items-center bg-slate-100/90 p-6 text-center text-sm text-slate-600">{error || "Kakao 지도 불러오는 중…"}</div>}
    </div>
    {active && <div className="border-t border-slate-200 p-3 text-xs"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{active.label}</strong><span>{active.apartmentArea}</span><span>{active.area}</span><span>월세 {active.rent}</span></div><p className="mt-1 text-slate-600">{active.address}</p>{active.mainApartment && <p className="mt-1 text-slate-600">주요 배후 아파트 · {active.mainApartment}</p>}<button className="mt-2 font-bold text-amber-700" type="button" onClick={() => selectPoint(active)}>Candidate 상세 보기</button></div>}
    <Script id="pork33-shortlist-kakao-sdk" src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(mapKey)}&autoload=false`} strategy="afterInteractive" onLoad={initialize} onReady={initialize} onError={() => setError("Kakao SDK를 불러오지 못했습니다. JavaScript 키와 등록 도메인을 확인하세요.")} />
  </div>;
}

function MapEmpty({ text }: { text: string }) { return <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600" style={{ height: 420 }}>{text}</div>; }
