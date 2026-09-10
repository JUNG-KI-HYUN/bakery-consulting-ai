export interface AnalysisPoint {
  latitude: number;
  longitude: number;
}

export interface ExecutedSpatialAnalysis {
  analysisPoint: AnalysisPoint;
  analysisRadiusMeters: 300 | 500;
}

export type OfficialMarketRelation = "INSIDE" | "RADIUS_OVERLAP" | "OUTSIDE" | "UNKNOWN";

export interface OfficialMarketSpatialInput {
  marketCode: string;
  marketName: string;
  geometry: unknown;
}

export interface OfficialMarketSpatialResult {
  marketCode: string;
  marketName: string;
  relation: OfficialMarketRelation;
  analysisRadiusMeters: number;
}

type Position = [number, number];
type Polygon = Position[][];

// Same spherical Earth radius as nearby-places. Local equirectangular projection
// centred on the analysis point: suitable for Seoul's 300/500m neighbourhoods,
// not cadastral surveying or a general-purpose/global GIS projection.
const METERS_PER_RADIAN = 6_371_000;
const RADIANS = Math.PI / 180;
// Outer AND hole boundary points within 1mm are INSIDE; circle tangency counts
// as overlap. This fixed numerical tolerance is not a proximity threshold.
const BOUNDARY_EPSILON_METERS = 0.001;

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) < 90;
}

function isRing(value: unknown): value is Position[] {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  const first = value[0], last = value[value.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return false;
  // Translate before summing to avoid cancellation for small WGS84 polygons.
  const twiceArea = value.slice(1).reduce((sum, b, index) => {
    const a = value[index];
    return sum + (a[0] - first[0]) * (b[1] - first[1]) - (b[0] - first[0]) * (a[1] - first[1]);
  }, 0);
  return Math.abs(twiceArea) > 0;
}

function isPolygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function readPolygons(geometry: unknown): Polygon[] | null {
  if (!geometry || typeof geometry !== "object") return null;
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown };
  if (type === "Polygon" && isPolygon(coordinates)) return [coordinates];
  if (type === "MultiPolygon" && Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isPolygon)) return coordinates;
  return null;
}

function distanceToSegment(a: Position, b: Position): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  // Clamping includes BOTH vertices, not just the first polygon vertex.
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared));
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}

function inspectRing(ring: Position[]) {
  let inside = false, distance = Infinity;
  for (let index = 1; index < ring.length; index++) {
    const a = ring[index - 1], b = ring[index];
    distance = Math.min(distance, distanceToSegment(a, b));
    if ((a[1] > 0) !== (b[1] > 0) && 0 < a[0] + (b[0] - a[0]) * -a[1] / (b[1] - a[1])) inside = !inside;
  }
  return { inside, distance };
}

export function classifyOfficialMarketRelation(
  point: AnalysisPoint,
  analysisRadiusMeters: number,
  geometry: unknown,
): OfficialMarketRelation {
  const polygons = readPolygons(geometry);
  if (!isPosition([point.longitude, point.latitude]) || !Number.isFinite(analysisRadiusMeters) || analysisRadiusMeters <= 0 || !polygons) return "UNKNOWN";
  const longitudeScale = Math.cos(point.latitude * RADIANS) * METERS_PER_RADIAN * RADIANS;
  const latitudeScale = METERS_PER_RADIAN * RADIANS;
  let overlaps = false;
  for (const polygon of polygons) {
    const rings = polygon.map((ring) => inspectRing(ring.map(([longitude, latitude]): Position => [
      (longitude - point.longitude) * longitudeScale,
      (latitude - point.latitude) * latitudeScale,
    ])));
    if (rings.some((ring) => ring.distance <= BOUNDARY_EPSILON_METERS) ||
      (rings[0].inside && !rings.slice(1).some((hole) => hole.inside))) return "INSIDE";
    if (rings.some((ring) => ring.distance <= analysisRadiusMeters + BOUNDARY_EPSILON_METERS)) overlaps = true;
  }
  return overlaps ? "RADIUS_OVERLAP" : "OUTSIDE";
}

export function findRelatedOfficialMarkets(
  analysis: ExecutedSpatialAnalysis | null,
  markets: readonly OfficialMarketSpatialInput[],
) {
  // No executed point is a neutral pre-analysis state, NOT UNKNOWN/OUTSIDE.
  if (!analysis) return null;
  const results: OfficialMarketSpatialResult[] = markets.map(({ marketCode, marketName, geometry }) => ({
    marketCode, marketName,
    relation: classifyOfficialMarketRelation(analysis.analysisPoint, analysis.analysisRadiusMeters, geometry),
    analysisRadiusMeters: analysis.analysisRadiusMeters,
  }));
  return {
    results,
    insideMarkets: results.filter((item) => item.relation === "INSIDE"),
    radiusOverlapMarkets: results.filter((item) => item.relation === "RADIUS_OVERLAP"),
    unknownMarkets: results.filter((item) => item.relation === "UNKNOWN"),
  };
}

export const OFFICIAL_MARKET_RELATION_LABELS: Record<OfficialMarketRelation, string> = {
  INSIDE: "공식상권 내부",
  RADIUS_OVERLAP: "분석반경 교차",
  OUTSIDE: "직접 관계 없음",
  UNKNOWN: "공간관계 확인 필요",
};

export function officialMarketRelationDescription(relation: OfficialMarketRelation, radius: number) {
  switch (relation) {
    case "INSIDE": return "현재 분석지점이 이 공식상권 내부에 있습니다.";
    case "RADIUS_OVERLAP": return `현재 분석지점은 공식상권 밖이지만 ${radius}m 분석반경과 이 공식상권이 겹칩니다. 주변 공식상권 참고자료이며 포함 상권을 뜻하지 않습니다.`;
    case "OUTSIDE": return `현재 분석지점 및 ${radius}m 반경과 직접 겹치지 않는 공식상권입니다. 별도 참고자료로만 확인하세요.`;
    case "UNKNOWN": return "공간관계 확인 필요: 공식상권 geometry 또는 계산 조건을 확인해 주세요.";
  }
}
