import type { AnalysisRunSnapshot } from "./run";
import {
  createAvailableResult,
  createGeometryBlockedResult,
  type BasicLocationAnalysisLayer,
  type BasicLocationAnalysisUnit,
  type BasicLocationCustomerDisplayPolicy,
  type BasicLocationLimitation,
  type BasicLocationResult,
  type BasicLocationResultValue,
} from "./results";

export interface FrameoneCanonicalDistrict {
  districtId: string;
  name: string;
}

export interface FrameoneCanonicalMarket {
  marketId: string;
  name: string;
  gu: string;
  bakeryMarketImportance: string;
  researchPriority: string;
  geometryStatus: string;
}

export interface FrameoneCanonicalSubmarket {
  parentMarketId: string;
  submarketId: string;
  name: string;
  administrativeDong: readonly string[] | null;
  status: string;
}

export interface FrameoneCanonicalNode {
  nodeId: string;
  parentSubmarketId: string;
  type: string;
  name: string;
  address: string | null;
}

export interface FrameoneCanonicalAdapterInput {
  snapshot: AnalysisRunSnapshot;
  district?: FrameoneCanonicalDistrict | null;
  market: FrameoneCanonicalMarket;
  submarket?: FrameoneCanonicalSubmarket | null;
  node?: FrameoneCanonicalNode | null;
  hierarchyVersion: string;
  hierarchyCheckedAt: string;
}

const TARGET_SOURCE = {
  sourceId: null,
  sourceName: "기초입지분석 실행 snapshot",
  sourceType: "ANALYSIS_INPUT",
} as const;

const FRAMEONE_SOURCE = {
  sourceId: null,
  sourceName: "FRAMEONE Market Hierarchy",
  sourceType: "FRAMEONE_CANONICAL",
} as const;

const TARGET_ADDRESS_LIMITATION = {
  code: "ANALYSIS_ADDRESS_NOT_BUILDING_VERIFICATION",
  message: "분석 실행 시 확인한 주소이며 후보건물의 동일성, 실제 점포 위치 또는 출입구를 검증한 결과가 아닙니다.",
  severity: "CAUTION",
} as const satisfies BasicLocationLimitation;

const FRAMEONE_NODE_LOCATION_LIMITATION = {
  code: "FRAMEONE_NODE_LOCATION_UNVERIFIED",
  message: "FRAMEONE Node는 내부 canonical 탐색 분류이며 현재 검증된 좌표나 geometry가 없어 실제 지점, 도보동선 또는 공간범위를 뜻하지 않습니다.",
  severity: "CAUTION",
} as const satisfies BasicLocationLimitation;

function requireNonEmpty(value: string, path: string) {
  if (value.trim().length === 0) throw new Error(`${path}가 비어 있습니다.`);
}

function availableResult(input: {
  snapshot: AnalysisRunSnapshot;
  analysisLayer: BasicLocationAnalysisLayer;
  analysisUnit: BasicLocationAnalysisUnit;
  metricKey: string;
  metricLabel: string;
  value: Exclude<BasicLocationResultValue, null>;
  unit?: string | null;
  customerDisplayPolicy: BasicLocationCustomerDisplayPolicy;
  source: typeof TARGET_SOURCE | typeof FRAMEONE_SOURCE;
  locator: string;
  sourceVersion?: string | null;
  referenceDate?: string | null;
  limitations?: readonly BasicLocationLimitation[];
  methodologyNote?: string | null;
}) {
  return createAvailableResult({
    analysisRunId: input.snapshot.analysisRunId,
    analysisLayer: input.analysisLayer,
    analysisUnit: input.analysisUnit,
    metricKey: input.metricKey,
    metricLabel: input.metricLabel,
    value: input.value,
    unit: input.unit ?? null,
    valueType: input.source.sourceType === "FRAMEONE_CANONICAL"
      ? "CANONICAL_VALUE"
      : "OBSERVED_SOURCE_VALUE",
    primarySource: input.source,
    sourceReferences: [{
      sourceId: input.source.sourceId,
      locator: input.locator,
      sourceVersion: input.sourceVersion ?? null,
    }],
    referenceDate: input.referenceDate === undefined
      ? input.snapshot.createdAt
      : input.referenceDate,
    referencePeriod: null,
    confidence: "HIGH",
    confidenceReasons: [{
      code: "EXECUTED_SNAPSHOT",
      message: "분석 실행 시점의 입력 또는 canonical 값을 그대로 보존했습니다.",
    }],
    limitations: [...(input.limitations ?? [])],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: input.customerDisplayPolicy,
    methodologyNote: input.methodologyNote ?? null,
    updatedAt: input.snapshot.createdAt,
  });
}

export function adaptAnalysisTargetResults(snapshot: AnalysisRunSnapshot): BasicLocationResult[] {
  const radiusType = snapshot.target.radiusMeters === 300 ? "RADIUS_300M" : "RADIUS_500M";
  const analysisUnit: BasicLocationAnalysisUnit = {
    type: radiusType,
    id: `${snapshot.analysisRunId}:target`,
    label: `분석 반경 ${snapshot.target.radiusMeters}m`,
  };
  const base = {
    snapshot,
    analysisLayer: "DATA_EVIDENCE" as const,
    analysisUnit,
    customerDisplayPolicy: "INTERNAL_ONLY" as const,
    source: TARGET_SOURCE,
    locator: snapshot.analysisRunId,
  };
  const results = [
    availableResult({ ...base, metricKey: "analysis.target.latitude", metricLabel: "분석 기준 위도", value: snapshot.target.latitude, unit: "degree" }),
    availableResult({ ...base, metricKey: "analysis.target.longitude", metricLabel: "분석 기준 경도", value: snapshot.target.longitude, unit: "degree" }),
    availableResult({ ...base, metricKey: "analysis.target.radius_meters", metricLabel: "분석 반경", value: snapshot.target.radiusMeters, unit: "m" }),
    availableResult({ ...base, metricKey: "analysis.target.source", metricLabel: "분석 위치 선택 방식", value: snapshot.target.source }),
  ];
  if (snapshot.target.confirmedAddress) {
    results.push(availableResult({
      ...base,
      metricKey: "analysis.target.confirmed_address",
      metricLabel: "확인된 분석 주소",
      value: snapshot.target.confirmedAddress,
      customerDisplayPolicy: "CUSTOMER_WITH_NOTE",
      limitations: [TARGET_ADDRESS_LIMITATION],
      methodologyNote: "주소는 분석 위치 식별 보조정보이며 실제 점포 출입구와 다를 수 있습니다.",
    }));
  }
  return results;
}

function canonicalResult(
  input: FrameoneCanonicalAdapterInput,
  analysisUnit: BasicLocationAnalysisUnit,
  metricKey: string,
  metricLabel: string,
  value: Exclude<BasicLocationResultValue, null>,
  customerDisplayPolicy: BasicLocationCustomerDisplayPolicy,
  limitations: readonly BasicLocationLimitation[] = [],
) {
  return availableResult({
    snapshot: input.snapshot,
    analysisLayer: "MARKET_IDENTITY",
    analysisUnit,
    metricKey,
    metricLabel,
    value,
    customerDisplayPolicy,
    source: FRAMEONE_SOURCE,
    locator: "data/seoul-market/v1.1-final/MARKET_HIERARCHY.json",
    sourceVersion: input.hierarchyVersion,
    referenceDate: input.hierarchyCheckedAt,
    limitations,
    methodologyNote: "FRAMEONE 내부 canonical 분류이며 서울시 공식상권 분류가 아닙니다.",
  });
}

export function adaptFrameoneCanonicalResults(input: FrameoneCanonicalAdapterInput): BasicLocationResult[] {
  const { snapshot, district, market, submarket, node } = input;
  requireNonEmpty(input.hierarchyVersion, "hierarchyVersion");
  requireNonEmpty(input.hierarchyCheckedAt, "hierarchyCheckedAt");
  if (snapshot.frameone.marketId !== market.marketId || snapshot.frameone.marketName !== market.name) {
    throw new Error("실행 snapshot과 Market canonical record가 일치하지 않습니다.");
  }
  if (district && (
    snapshot.frameone.districtId !== district.districtId ||
    snapshot.frameone.districtName !== district.name
  )) {
    throw new Error("실행 snapshot과 District canonical record가 일치하지 않습니다.");
  }
  if (snapshot.frameone.submarketId !== null && !submarket) {
    throw new Error("선택된 Submarket canonical record가 필요합니다.");
  }
  if (submarket && (
    snapshot.frameone.submarketId !== submarket.submarketId ||
    snapshot.frameone.submarketName !== submarket.name ||
    submarket.parentMarketId !== market.marketId
  )) {
    throw new Error("실행 snapshot과 Submarket canonical hierarchy가 일치하지 않습니다.");
  }
  if (node && (!submarket || snapshot.frameone.nodeId !== node.nodeId || node.parentSubmarketId !== submarket.submarketId)) {
    throw new Error("실행 snapshot과 Node canonical hierarchy가 일치하지 않습니다.");
  }
  if (snapshot.frameone.nodeId !== null && !node) {
    throw new Error("선택된 Node canonical record가 필요합니다.");
  }

  const marketUnit: BasicLocationAnalysisUnit = {
    type: "FRAMEONE_MARKET",
    id: market.marketId,
    label: market.name,
  };
  const results: BasicLocationResult[] = [
    canonicalResult(input, marketUnit, "frameone.market.id", "FRAMEONE Market ID", market.marketId, "INTERNAL_ONLY"),
    canonicalResult(input, marketUnit, "frameone.market.name", "FRAMEONE 주요상권", market.name, "CUSTOMER_READY"),
    canonicalResult(input, marketUnit, "frameone.market.district_name", "자치구", market.gu, "CUSTOMER_READY"),
    canonicalResult(input, marketUnit, "frameone.market.bakery_importance", "베이커리 상권 중요도", market.bakeryMarketImportance, "INTERNAL_ONLY"),
    canonicalResult(input, marketUnit, "frameone.market.research_priority", "조사 우선순위", market.researchPriority, "INTERNAL_ONLY"),
    canonicalResult(input, marketUnit, "frameone.market.geometry_status", "FRAMEONE Market geometry 상태", market.geometryStatus, "INTERNAL_ONLY"),
  ];

  if (district) {
    results.push(canonicalResult(input, marketUnit, "frameone.district.id", "FRAMEONE District ID", district.districtId, "INTERNAL_ONLY"));
    results.push(canonicalResult(input, marketUnit, "frameone.district.name", "FRAMEONE District", district.name, "CUSTOMER_READY"));
  }

  if (submarket) {
    const submarketUnit: BasicLocationAnalysisUnit = {
      type: "FRAMEONE_SUBMARKET",
      id: submarket.submarketId,
      label: submarket.name,
    };
    results.push(
      canonicalResult(input, submarketUnit, "frameone.submarket.id", "FRAMEONE Submarket ID", submarket.submarketId, "INTERNAL_ONLY"),
      canonicalResult(input, submarketUnit, "frameone.submarket.name", "FRAMEONE 하위상권", submarket.name, "CUSTOMER_READY"),
      canonicalResult(input, submarketUnit, "frameone.submarket.parent_market_id", "상위 FRAMEONE Market ID", submarket.parentMarketId, "INTERNAL_ONLY"),
      canonicalResult(input, submarketUnit, "frameone.submarket.geometry_status", "FRAMEONE Submarket geometry 상태", submarket.status, "INTERNAL_ONLY"),
    );
    if (submarket.administrativeDong !== null) {
      results.push(canonicalResult(
        input,
        submarketUnit,
        "frameone.submarket.administrative_dongs",
        "연결 검토 행정동",
        [...submarket.administrativeDong],
        "INTERNAL_ONLY",
      ));
    }
  }

  if (node) {
    const nodeUnit: BasicLocationAnalysisUnit = {
      type: "FRAMEONE_NODE",
      id: node.nodeId,
      label: node.name,
    };
    results.push(
      canonicalResult(input, nodeUnit, "frameone.node.id", "FRAMEONE Node ID", node.nodeId, "INTERNAL_ONLY"),
      canonicalResult(input, nodeUnit, "frameone.node.name", "FRAMEONE Node", node.name, "CUSTOMER_READY"),
      canonicalResult(
        input,
        nodeUnit,
        "frameone.node.type",
        "FRAMEONE Node 유형",
        node.type,
        "CUSTOMER_WITH_NOTE",
        [FRAMEONE_NODE_LOCATION_LIMITATION],
      ),
      canonicalResult(input, nodeUnit, "frameone.node.parent_submarket_id", "상위 FRAMEONE Submarket ID", node.parentSubmarketId, "INTERNAL_ONLY"),
    );
    if (node.address) {
      results.push(canonicalResult(
        input,
        nodeUnit,
        "frameone.node.address",
        "FRAMEONE Node 주소",
        node.address,
        "CUSTOMER_WITH_NOTE",
        [FRAMEONE_NODE_LOCATION_LIMITATION],
      ));
    }
  }

  return results;
}

const GEOMETRY_BLOCKING_LIMITATION = {
  code: "GEOMETRY_UNCONFIRMED",
  message: "검증된 FRAMEONE geometry가 없어 공간집계를 수행하지 않았습니다.",
  severity: "BLOCKING",
} as const;

function blockedResult(
  snapshot: AnalysisRunSnapshot,
  analysisLayer: BasicLocationAnalysisLayer,
  analysisUnit: BasicLocationAnalysisUnit,
  metricKey: string,
  metricLabel: string,
) {
  return createGeometryBlockedResult({
    analysisRunId: snapshot.analysisRunId,
    analysisLayer,
    analysisUnit,
    metricKey,
    metricLabel,
    unit: metricKey.includes("living_population") ? "people" : null,
    primarySource: null,
    sourceReferences: [],
    referenceDate: snapshot.createdAt,
    referencePeriod: null,
    limitations: [GEOMETRY_BLOCKING_LIMITATION],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: "공식상권 또는 행정동 Polygon으로 FRAMEONE geometry를 대체하지 않습니다.",
    updatedAt: snapshot.createdAt,
  });
}

export function buildGeometryDependentBlockedResults(snapshot: AnalysisRunSnapshot): BasicLocationResult[] {
  const marketUnit: BasicLocationAnalysisUnit = {
    type: "FRAMEONE_MARKET",
    id: snapshot.frameone.marketId,
    label: snapshot.frameone.marketName,
  };
  const results = [
    blockedResult(snapshot, "DEMAND", marketUnit, "living_population.market_aggregation", "Market 생활인구 공간집계"),
    blockedResult(snapshot, "DATA_EVIDENCE", marketUnit, "frameone.market.verified_spatial_assignment", "Market 검증 공간귀속"),
  ];

  if (snapshot.frameone.submarketId && snapshot.frameone.submarketName) {
    const submarketUnit: BasicLocationAnalysisUnit = {
      type: "FRAMEONE_SUBMARKET",
      id: snapshot.frameone.submarketId,
      label: snapshot.frameone.submarketName,
    };
    results.push(
      blockedResult(snapshot, "DEMAND", submarketUnit, "living_population.submarket_aggregation", "Submarket 생활인구 공간집계"),
      blockedResult(snapshot, "DATA_EVIDENCE", submarketUnit, "frameone.submarket.verified_spatial_assignment", "Submarket 검증 공간귀속"),
    );
  }

  return results;
}
