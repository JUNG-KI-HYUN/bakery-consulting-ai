"use client";

import Script from "next/script";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type KakaoMapStatus = "loading" | "ready" | "error";
type NearbySearchStatus = "idle" | "loading" | "success" | "error";
type NearbyCategoryId = "bakery" | "confectionery" | "cafe";
type SearchMethod = "keyword" | "category";
type RadiusM = 300 | 500;

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

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoMapInstance {
  getCenter(): KakaoLatLng;
  relayout(): void;
}

interface KakaoPolygonInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoCircleInstance {
  setMap(map: KakaoMapInstance | null): void;
  setPosition(position: KakaoLatLng): void;
  setRadius(radius: number): void;
}

interface KakaoMarkerInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoInfoWindowInstance {
  close(): void;
  open(map: KakaoMapInstance, marker: KakaoMarkerInstance): void;
  setContent(content: Node | string): void;
}

interface KakaoPlaceDocument {
  id?: string;
  place_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  distance?: string;
}

interface KakaoPlacesSearchOptions {
  location: KakaoLatLng;
  radius: number;
  size: number;
  sort: unknown;
}

type KakaoPlacesSearchCallback = (
  result: KakaoPlaceDocument[],
  status: string,
) => void;

interface KakaoPlacesService {
  categorySearch(
    code: string,
    callback: KakaoPlacesSearchCallback,
    options: KakaoPlacesSearchOptions,
  ): void;
  keywordSearch(
    keyword: string,
    callback: KakaoPlacesSearchCallback,
    options: KakaoPlacesSearchOptions,
  ): void;
}

interface KakaoMapsApi {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMapInstance;
  Polygon: new (options: {
    map: KakaoMapInstance;
    path: KakaoLatLng[] | KakaoLatLng[][];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoPolygonInstance;
  Circle: new (options: {
    map: KakaoMapInstance;
    center: KakaoLatLng;
    radius: number;
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoCircleInstance;
  Marker: new (options: {
    map: KakaoMapInstance;
    position: KakaoLatLng;
    title?: string;
  }) => KakaoMarkerInstance;
  InfoWindow: new (options: {
    removable?: boolean;
    zIndex?: number;
  }) => KakaoInfoWindowInstance;
  services?: {
    Places: new () => KakaoPlacesService;
    SortBy: { DISTANCE: unknown };
    Status: { ERROR: string; OK: string; ZERO_RESULT: string };
  };
  event: {
    addListener(target: object, type: string, handler: () => void): void;
    removeListener(target: object, type: string, handler: () => void): void;
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

interface NearbyCategoryDefinition {
  id: NearbyCategoryId;
  label: string;
  searchMethod: SearchMethod;
  searchValue: string;
}

interface NearbyPlace {
  id: string;
  name: string;
  categoryId: NearbyCategoryId;
  categoryLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceM: number;
}

type NearbyPlacesByCategory = Record<NearbyCategoryId, NearbyPlace[]>;
type EnabledCategories = Record<NearbyCategoryId, boolean>;

const DEFAULT_RADIUS_M: RadiusM = 500;
const MAX_PER_CATEGORY = 15;
const NEARBY_CATEGORIES: readonly NearbyCategoryDefinition[] = [
  {
    id: "bakery",
    label: "베이커리",
    searchMethod: "keyword",
    searchValue: "베이커리",
  },
  {
    id: "confectionery",
    label: "제과점",
    searchMethod: "keyword",
    searchValue: "제과점",
  },
  {
    id: "cafe",
    label: "카페",
    searchMethod: "category",
    searchValue: "CE7",
  },
];

function emptyNearbyPlaces(): NearbyPlacesByCategory {
  return {
    bakery: [],
    confectionery: [],
    cafe: [],
  };
}

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

function distanceInMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

function mapPlaceDocument(
  document: KakaoPlaceDocument,
  category: NearbyCategoryDefinition,
  center: { latitude: number; longitude: number },
): NearbyPlace | null {
  const name = document.place_name?.trim();
  const latitude = Number(document.y);
  const longitude = Number(document.x);

  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const rawDistance = Number(document.distance);
  const distanceM = Number.isFinite(rawDistance)
    ? Math.round(rawDistance)
    : distanceInMeters(center, { latitude, longitude });

  return {
    id:
      document.id?.trim() ||
      `${category.id}|${name}|${latitude}|${longitude}`,
    name,
    categoryId: category.id,
    categoryLabel: category.label,
    address:
      document.road_address_name?.trim() ||
      document.address_name?.trim() ||
      "주소 정보 없음",
    latitude,
    longitude,
    distanceM,
  };
}

function searchNearbyCategory(
  kakaoMaps: KakaoMapsApi,
  category: NearbyCategoryDefinition,
  center: { latitude: number; longitude: number },
  radiusM: RadiusM,
) {
  return new Promise<NearbyPlace[]>((resolve, reject) => {
    const services = kakaoMaps.services;
    if (!services) {
      reject(new Error("Kakao 장소검색 서비스를 준비하지 못했습니다."));
      return;
    }

    const places = new services.Places();
    const location = new kakaoMaps.LatLng(center.latitude, center.longitude);
    const callback: KakaoPlacesSearchCallback = (documents, status) => {
      if (status === services.Status.ZERO_RESULT) {
        resolve([]);
        return;
      }
      if (status !== services.Status.OK) {
        reject(new Error(`${category.label} 검색에 실패했습니다.`));
        return;
      }

      const seen = new Set<string>();
      const results: NearbyPlace[] = [];
      for (const document of documents.slice(0, MAX_PER_CATEGORY)) {
        const place = mapPlaceDocument(document, category, center);
        if (!place || seen.has(place.id)) {
          continue;
        }
        seen.add(place.id);
        results.push(place);
      }
      resolve(results);
    };
    const options: KakaoPlacesSearchOptions = {
      location,
      radius: radiusM,
      size: MAX_PER_CATEGORY,
      sort: services.SortBy.DISTANCE,
    };

    if (category.searchMethod === "category") {
      places.categorySearch(category.searchValue, callback, options);
    } else {
      places.keywordSearch(category.searchValue, callback, options);
    }
  });
}

function formatDistance(distanceM: number) {
  return `${distanceM.toLocaleString("ko-KR")}m`;
}

function createPlaceInfoContent(place: NearbyPlace) {
  const container = document.createElement("div");
  container.style.width = "230px";
  container.style.padding = "12px";
  container.style.fontFamily = "sans-serif";
  container.style.lineHeight = "1.45";

  const name = document.createElement("strong");
  name.style.display = "block";
  name.style.fontSize = "14px";
  name.style.color = "#0f172a";
  name.textContent = place.name;

  const meta = document.createElement("span");
  meta.style.display = "block";
  meta.style.marginTop = "4px";
  meta.style.fontSize = "11px";
  meta.style.fontWeight = "700";
  meta.style.color = "#0369a1";
  meta.textContent = `${place.categoryLabel} · ${formatDistance(place.distanceM)}`;

  const address = document.createElement("span");
  address.style.display = "block";
  address.style.marginTop = "5px";
  address.style.fontSize = "11px";
  address.style.color = "#475569";
  address.textContent = place.address;

  container.append(name, meta, address);
  return container;
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
  const circleRef = useRef<KakaoCircleInstance | null>(null);
  const infoWindowRef = useRef<KakaoInfoWindowInstance | null>(null);
  const searchRequestIdRef = useRef(0);
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim() ?? "";
  const [status, setStatus] = useState<KakaoMapStatus>(
    mapKey ? "loading" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(
    mapKey
      ? ""
      : "NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않아 지도를 표시할 수 없습니다.",
  );
  const [radiusM, setRadiusM] = useState<RadiusM>(DEFAULT_RADIUS_M);
  const [searchCenter, setSearchCenter] = useState(SEOUL_CENTER);
  const [nearbyPlaces, setNearbyPlaces] =
    useState<NearbyPlacesByCategory>(emptyNearbyPlaces);
  const [enabledCategories, setEnabledCategories] =
    useState<EnabledCategories>({
      bakery: true,
      confectionery: true,
      cafe: true,
    });
  const [nearbySearchStatus, setNearbySearchStatus] =
    useState<NearbySearchStatus>("idle");
  const [nearbySearchError, setNearbySearchError] = useState("");
  const [selectedNearbyPlace, setSelectedNearbyPlace] =
    useState<NearbyPlace | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);

  const enabledPlaceCount = useMemo(
    () =>
      NEARBY_CATEGORIES.reduce(
        (total, category) =>
          total +
          (enabledCategories[category.id]
            ? nearbyPlaces[category.id].length
            : 0),
        0,
      ),
    [enabledCategories, nearbyPlaces],
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
        level: 5,
      });
      setStatus("ready");
      setErrorMessage("");
      if (!kakaoMaps.services) {
        setNearbySearchStatus("error");
        setNearbySearchError(
          "Kakao 장소검색 서비스를 준비하지 못했습니다. 지도는 계속 사용할 수 있습니다.",
        );
      }
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
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map) {
      return;
    }

    const circle = new kakaoMaps.Circle({
      map,
      center: map.getCenter(),
      radius: DEFAULT_RADIUS_M,
      strokeWeight: 2,
      strokeColor: "#ea580c",
      strokeOpacity: 0.95,
      fillColor: "#fb923c",
      fillOpacity: 0.13,
    });
    circleRef.current = circle;

    const handleCenterChanged = () => {
      circle.setPosition(map.getCenter());
    };
    const handleDragEnd = () => {
      const center = map.getCenter();
      setSearchCenter({
        latitude: center.getLat(),
        longitude: center.getLng(),
      });
    };

    kakaoMaps.event.addListener(map, "center_changed", handleCenterChanged);
    kakaoMaps.event.addListener(map, "dragend", handleDragEnd);

    return () => {
      kakaoMaps.event.removeListener(map, "center_changed", handleCenterChanged);
      kakaoMaps.event.removeListener(map, "dragend", handleDragEnd);
      circle.setMap(null);
      if (circleRef.current === circle) {
        circleRef.current = null;
      }
    };
  }, [status]);

  useEffect(() => {
    circleRef.current?.setRadius(radiusM);
  }, [radiusM, status]);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    if (
      status !== "ready" ||
      !kakaoMaps ||
      !mapInstanceRef.current ||
      !kakaoMaps.services
    ) {
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    let cancelled = false;
    setNearbySearchStatus("loading");
    setNearbySearchError("");
    setNearbyPlaces(emptyNearbyPlaces());
    setSelectedNearbyPlace(null);
    infoWindowRef.current?.close();

    void Promise.all(
      NEARBY_CATEGORIES.map(async (category) => {
        try {
          const places = await searchNearbyCategory(
            kakaoMaps,
            category,
            searchCenter,
            radiusM,
          );
          return { category, places, error: null };
        } catch (error) {
          return {
            category,
            places: [],
            error:
              error instanceof Error
                ? error.message
                : `${category.label} 검색에 실패했습니다.`,
          };
        }
      }),
    ).then((results) => {
      if (cancelled || requestId !== searchRequestIdRef.current) {
        return;
      }

      const nextPlaces = emptyNearbyPlaces();
      const errors: string[] = [];
      for (const result of results) {
        nextPlaces[result.category.id] = result.places;
        if (result.error) {
          errors.push(result.error);
        }
      }

      setNearbyPlaces(nextPlaces);
      if (errors.length > 0) {
        setNearbySearchStatus("error");
        setNearbySearchError(
          `${errors.join(" ")} 지도 이동·확대/축소는 계속 사용할 수 있습니다.`,
        );
      } else {
        setNearbySearchStatus("success");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [radiusM, searchCenter, searchRevision, status]);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map) {
      return;
    }

    const infoWindow =
      infoWindowRef.current ??
      new kakaoMaps.InfoWindow({ removable: true, zIndex: 10 });
    infoWindowRef.current = infoWindow;
    const markers: Array<{
      marker: KakaoMarkerInstance;
      clickHandler: () => void;
    }> = [];

    for (const category of NEARBY_CATEGORIES) {
      if (!enabledCategories[category.id]) {
        continue;
      }

      for (const place of nearbyPlaces[category.id]) {
        const marker = new kakaoMaps.Marker({
          map,
          position: new kakaoMaps.LatLng(place.latitude, place.longitude),
          title: `${place.name} · ${place.categoryLabel}`,
        });
        const clickHandler = () => {
          setSelectedNearbyPlace(place);
          infoWindow.setContent(createPlaceInfoContent(place));
          infoWindow.open(map, marker);
        };
        kakaoMaps.event.addListener(marker, "click", clickHandler);
        markers.push({ marker, clickHandler });
      }
    }

    return () => {
      infoWindow.close();
      for (const { marker, clickHandler } of markers) {
        kakaoMaps.event.removeListener(marker, "click", clickHandler);
        marker.setMap(null);
      }
    };
  }, [enabledCategories, nearbyPlaces, status]);

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

  function refreshNearbyPlaces() {
    const center = mapInstanceRef.current?.getCenter();
    if (center) {
      setSearchCenter({
        latitude: center.getLat(),
        longitude: center.getLng(),
      });
    }
    setSearchRevision((current) => current + 1);
  }

  function toggleCategory(categoryId: NearbyCategoryId) {
    if (
      enabledCategories[categoryId] &&
      selectedNearbyPlace?.categoryId === categoryId
    ) {
      setSelectedNearbyPlace(null);
      infoWindowRef.current?.close();
    }
    setEnabledCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-700">
            지도 중심 반경
          </span>
          {([300, 500] as const).map((radius) => (
            <button
              key={radius}
              type="button"
              onClick={() => setRadiusM(radius)}
              aria-pressed={radiusM === radius}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                radiusM === radius
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {radius}m
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {NEARBY_CATEGORIES.map((category) => {
            const enabled = enabledCategories[category.id];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                aria-pressed={enabled}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  enabled
                    ? "border-sky-600 bg-sky-50 text-sky-800"
                    : "border-slate-300 bg-white text-slate-400"
                }`}
              >
                {category.label} {enabled ? "ON" : "OFF"}
              </button>
            );
          })}
          <button
            type="button"
            onClick={refreshNearbyPlaces}
            disabled={status !== "ready" || nearbySearchStatus === "loading"}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            현재 중심 다시 검색
          </button>
        </div>
      </div>

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
            src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(mapKey)}&autoload=false&libraries=services`}
            strategy="afterInteractive"
            onReady={initializeMap}
            onError={() => {
              setStatus("error");
              setErrorMessage("Kakao Maps SDK 스크립트를 불러오지 못했습니다.");
            }}
          />
        ) : null}
      </div>

      <section
        className="border-t border-slate-200 bg-white px-4 py-4"
        aria-labelledby="nearby-place-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="nearby-place-title" className="text-sm font-bold text-slate-950">
              주변 장소
            </h3>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              카카오 지도 검색 기준 · 지도 중심 {radiusM}m · 업종별 최대 {MAX_PER_CATEGORY}곳 표시
            </p>
          </div>
          <span
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600"
            aria-live="polite"
          >
            {nearbySearchStatus === "loading"
              ? "주변 장소 검색 중…"
              : `지도 표시 ${enabledPlaceCount}곳`}
          </span>
        </div>

        {nearbySearchError ? (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
            role="status"
          >
            {nearbySearchError}
          </p>
        ) : null}

        {selectedNearbyPlace ? (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-xs font-bold text-slate-950">
              {selectedNearbyPlace.name}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-sky-800">
              {selectedNearbyPlace.categoryLabel} · {formatDistance(selectedNearbyPlace.distanceM)}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              {selectedNearbyPlace.address}
            </p>
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {NEARBY_CATEGORIES.map((category) => {
            const places = nearbyPlaces[category.id];
            const enabled = enabledCategories[category.id];
            return (
              <article
                key={category.id}
                className={`min-w-0 rounded-lg border p-3 ${
                  enabled
                    ? "border-slate-200 bg-slate-50/70"
                    : "border-slate-200 bg-slate-50 opacity-55"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    {category.label}
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500">
                    {places.length}곳 {enabled ? "표시" : "숨김"}
                  </span>
                </div>
                {places.length > 0 ? (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {places.map((place) => (
                      <li
                        key={place.id}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-[11px] font-bold text-slate-800">
                            {place.name}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-sky-700">
                            {formatDistance(place.distanceM)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-slate-500">
                          {place.address}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {nearbySearchStatus === "loading"
                      ? "검색 중…"
                      : "검색 결과 없음"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
