"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type KakaoMapStatus = "loading" | "ready" | "error";

export type KakaoPolygonPosition = [number, number];
type KakaoPolygonRing = KakaoPolygonPosition[];
type KakaoPolygonCoordinates = KakaoPolygonRing[];

export type KakaoPolygonGeometry =
  | {
      type: "Polygon";
      coordinates: KakaoPolygonCoordinates;
    }
  | {
      type: "MultiPolygon";
      coordinates: KakaoPolygonCoordinates[];
    };

export interface KakaoOfficialMarketPolygon {
  featureIndex: number;
  officialMarketCode: string;
  geometry: KakaoPolygonGeometry;
}

interface KakaoMapInstance {
  relayout(): void;
}

interface KakaoPolygonInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoMapsApi {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => object;
  Map: new (
    container: HTMLElement,
    options: { center: object; level: number },
  ) => KakaoMapInstance;
  Polygon: new (options: {
    map: KakaoMapInstance;
    path: object[] | object[][];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoPolygonInstance;
  event: {
    addListener(
      target: KakaoPolygonInstance,
      type: "click",
      handler: () => void,
    ): void;
    removeListener(
      target: KakaoPolygonInstance,
      type: "click",
      handler: () => void,
    ): void;
  };
}

interface KakaoWindow extends Window {
  kakao?: {
    maps?: KakaoMapsApi;
  };
}

const SEOUL_CENTER = {
  latitude: 37.5665,
  longitude: 126.978,
};

function polygonsForGeometry(geometry: KakaoPolygonGeometry) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

function kakaoPathForPolygon(
  coordinates: KakaoPolygonCoordinates,
  kakaoMaps: KakaoMapsApi,
) {
  const rings = coordinates.map((ring) =>
    ring.map(
      ([longitude, latitude]) =>
        new kakaoMaps.LatLng(latitude, longitude),
    ),
  );

  return rings.length === 1 ? rings[0] : rings;
}

export default function KakaoBaseMap({
  officialMarketPolygons,
  selectedOfficialMarketCode,
  onSelectOfficialMarket,
}: {
  officialMarketPolygons: readonly KakaoOfficialMarketPolygon[];
  selectedOfficialMarketCode: string | null;
  onSelectOfficialMarket: (featureIndex: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMapInstance | null>(null);
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim() ?? "";
  const [status, setStatus] = useState<KakaoMapStatus>(
    mapKey ? "loading" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(
    mapKey
      ? ""
      : "NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않아 지도를 표시할 수 없습니다.",
  );

  const initializeMap = useCallback(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const container = containerRef.current;

    if (!kakaoMaps || !container) {
      setStatus("error");
      setErrorMessage("Kakao Maps SDK를 초기화할 수 없습니다.");
      return;
    }

    kakaoMaps.load(() => {
      if (!containerRef.current || mapInstanceRef.current) {
        return;
      }

      const center = new kakaoMaps.LatLng(
        SEOUL_CENTER.latitude,
        SEOUL_CENTER.longitude,
      );
      mapInstanceRef.current = new kakaoMaps.Map(containerRef.current, {
        center,
        level: 8,
      });
      setStatus("ready");
      setErrorMessage("");
    });
  }, []);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map) {
      return;
    }

    const overlays: Array<{
      polygon: KakaoPolygonInstance;
      clickHandler: () => void;
    }> = [];

    for (const feature of officialMarketPolygons) {
      for (const polygonCoordinates of polygonsForGeometry(feature.geometry)) {
        const selected =
          feature.officialMarketCode === selectedOfficialMarketCode;
        const polygon = new kakaoMaps.Polygon({
          map,
          path: kakaoPathForPolygon(polygonCoordinates, kakaoMaps),
          strokeWeight: selected ? 3 : 2,
          strokeColor: selected ? "#0f172a" : "#2563eb",
          strokeOpacity: selected ? 1 : 0.9,
          fillColor: selected ? "#f59e0b" : "#2563eb",
          fillOpacity: selected ? 0.32 : 0.16,
        });
        const clickHandler = () =>
          onSelectOfficialMarket(feature.featureIndex);
        kakaoMaps.event.addListener(polygon, "click", clickHandler);
        overlays.push({ polygon, clickHandler });
      }
    }

    return () => {
      for (const { polygon, clickHandler } of overlays) {
        kakaoMaps.event.removeListener(polygon, "click", clickHandler);
        polygon.setMap(null);
      }
    };
  }, [
    officialMarketPolygons,
    onSelectOfficialMarket,
    selectedOfficialMarketCode,
    status,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !container || !map) {
      return;
    }

    const observer = new ResizeObserver(() => map.relayout());
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  return (
    <div
      className="relative h-[400px] w-full overflow-hidden bg-slate-100 md:h-[500px]"
      aria-busy={status === "loading"}
    >
      <div
        ref={containerRef}
        aria-label="서울 중심 Kakao 기본 지도"
        className="absolute inset-0"
      />

      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/95 p-6 text-center">
          <p
            className={`max-w-md text-sm font-semibold ${
              status === "error" ? "text-red-700" : "text-slate-500"
            }`}
            role={status === "error" ? "alert" : "status"}
          >
            {status === "error" ? errorMessage : "Kakao 지도 불러오는 중…"}
          </p>
        </div>
      ) : null}

      {mapKey ? (
        <Script
          id="kakao-map-sdk"
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(mapKey)}&autoload=false`}
          strategy="afterInteractive"
          onReady={initializeMap}
          onError={() => {
            setStatus("error");
            setErrorMessage("Kakao Maps SDK 스크립트를 불러오지 못했습니다.");
          }}
        />
      ) : null}
    </div>
  );
}
