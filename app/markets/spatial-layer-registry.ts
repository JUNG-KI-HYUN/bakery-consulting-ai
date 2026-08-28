export type SpatialLayerId =
  | "frameone-markets"
  | "frameone-submarkets"
  | "frameone-nodes"
  | "seoul-official-markets"
  | "seoul-admin-dongs"
  | "seoul-living-grid-250m";

export type SpatialLayerCategory = "frameone" | "official_reference";
export type SpatialLayerStatus = "text_only" | "validated";

export interface SpatialLayerDefinition {
  layerId: SpatialLayerId;
  label: string;
  category: SpatialLayerCategory;
  categoryLabel: string;
  source: string;
  sourceFile: string | null;
  dataUrl: string | null;
  featureCount: number;
  geometryAvailable: boolean;
  defaultVisible: boolean;
  status: SpatialLayerStatus;
  geometryVersion: string | null;
  outputCrs: "EPSG:4326" | null;
  boundaryConfirmationRequired: boolean;
  performanceNote: string | null;
  style: {
    fill: string;
    stroke: string;
    lineWidth: number;
  };
}

export const SPATIAL_LAYER_REGISTRY = [
  {
    layerId: "frameone-markets",
    label: "FRAMEONE 분석상권",
    category: "frameone",
    categoryLabel: "FRAMEONE 분석체계",
    source: "MARKET_HIERARCHY.json · FRAMEONE_MARKETS.geojson",
    sourceFile: null,
    dataUrl: null,
    featureCount: 156,
    geometryAvailable: false,
    defaultVisible: false,
    status: "text_only",
    geometryVersion: "FRAMEONE_v1.1_TEXT",
    outputCrs: null,
    boundaryConfirmationRequired: true,
    performanceNote: null,
    style: {
      fill: "rgba(245, 158, 11, 0.12)",
      stroke: "#d97706",
      lineWidth: 1.5,
    },
  },
  {
    layerId: "frameone-submarkets",
    label: "FRAMEONE 세부상권",
    category: "frameone",
    categoryLabel: "FRAMEONE 분석체계",
    source: "MARKET_HIERARCHY.json · FRAMEONE_SUBMARKETS.geojson",
    sourceFile: null,
    dataUrl: null,
    featureCount: 382,
    geometryAvailable: false,
    defaultVisible: false,
    status: "text_only",
    geometryVersion: null,
    outputCrs: null,
    boundaryConfirmationRequired: true,
    performanceNote: null,
    style: {
      fill: "rgba(249, 115, 22, 0.1)",
      stroke: "#ea580c",
      lineWidth: 1.25,
    },
  },
  {
    layerId: "frameone-nodes",
    label: "FRAMEONE Node",
    category: "frameone",
    categoryLabel: "FRAMEONE 분석체계",
    source: "MARKET_HIERARCHY.json · NODES.geojson",
    sourceFile: null,
    dataUrl: null,
    featureCount: 763,
    geometryAvailable: false,
    defaultVisible: false,
    status: "text_only",
    geometryVersion: null,
    outputCrs: null,
    boundaryConfirmationRequired: true,
    performanceNote: null,
    style: {
      fill: "rgba(251, 191, 36, 0.14)",
      stroke: "#b45309",
      lineWidth: 1,
    },
  },
  {
    layerId: "seoul-official-markets",
    label: "서울시 공식 참조상권",
    category: "official_reference",
    categoryLabel: "공식 공간 참조",
    source: "서울시 상권분석서비스 영역-상권 · SRC-SEOUL-OA-15560",
    sourceFile: "OFFICIAL_SEOUL_MARKETS.geojson",
    dataUrl: "/api/markets/spatial-layers/seoul-official-markets",
    featureCount: 1650,
    geometryAvailable: true,
    defaultVisible: true,
    status: "validated",
    geometryVersion: "SEOUL_MARKET_SHP_2023-10-20",
    outputCrs: "EPSG:4326",
    boundaryConfirmationRequired: false,
    performanceNote: null,
    style: {
      fill: "rgba(37, 99, 235, 0.12)",
      stroke: "#2563eb",
      lineWidth: 0.7,
    },
  },
  {
    layerId: "seoul-admin-dongs",
    label: "서울시 행정동",
    category: "official_reference",
    categoryLabel: "공식 공간 참조",
    source: "서울시 상권분석서비스 행정동 · SRC-SEOUL-OA-22160",
    sourceFile: "ADMIN_DONG.geojson",
    dataUrl: "/api/markets/spatial-layers/seoul-admin-dongs",
    featureCount: 425,
    geometryAvailable: true,
    defaultVisible: false,
    status: "validated",
    geometryVersion: "SEOUL_ADMIN_DONG_SHP_2023-10-20",
    outputCrs: "EPSG:4326",
    boundaryConfirmationRequired: false,
    performanceNote: "참조 GeoJSON의 행정동명·자치구명 속성은 비어 있음",
    style: {
      fill: "rgba(16, 185, 129, 0.05)",
      stroke: "#059669",
      lineWidth: 0.9,
    },
  },
  {
    layerId: "seoul-living-grid-250m",
    label: "생활인구 250m Grid",
    category: "official_reference",
    categoryLabel: "공식 공간 참조",
    source: "서울 생활인구 격자 · SRC-SEOUL-LIVING-GRID",
    sourceFile: "LIVING_GRID_250M.geojson",
    dataUrl: "/api/markets/spatial-layers/seoul-living-grid-250m",
    featureCount: 10125,
    geometryAvailable: true,
    defaultVisible: false,
    status: "validated",
    geometryVersion: "SEOUL_250M_GRID_SHP_2025-05-12",
    outputCrs: "EPSG:4326",
    boundaryConfirmationRequired: false,
    performanceNote: "초기 로딩 제외 · 사용자가 켤 때만 지연 로딩",
    style: {
      fill: "rgba(100, 116, 139, 0.025)",
      stroke: "rgba(71, 85, 105, 0.5)",
      lineWidth: 0.35,
    },
  },
] as const satisfies readonly SpatialLayerDefinition[];

export function getSpatialLayerDefinition(layerId: string) {
  return SPATIAL_LAYER_REGISTRY.find((layer) => layer.layerId === layerId);
}
