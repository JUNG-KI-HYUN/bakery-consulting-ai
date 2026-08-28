import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSpatialLayerDefinition } from "@/app/markets/spatial-layer-registry";

export const runtime = "nodejs";

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: unknown;
    } | null;
    properties: Record<string, unknown>;
  }>;
}

const geoJsonCache = new Map<string, Promise<string>>();

function coordinatesAreWgs84(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    const longitude = value[0];
    const latitude = value[1];
    return (
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
    );
  }

  return value.every(coordinatesAreWgs84);
}

function validateReferenceGeoJson(
  text: string,
  expectedFeatureCount: number,
): GeoJsonFeatureCollection {
  const data = JSON.parse(text) as Partial<GeoJsonFeatureCollection>;

  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("GeoJSON FeatureCollection 형식이 아닙니다.");
  }

  if (data.features.length !== expectedFeatureCount) {
    throw new Error(
      `GeoJSON feature 개수가 레지스트리와 다릅니다: ${data.features.length}`,
    );
  }

  for (const feature of data.features) {
    if (
      feature.type !== "Feature" ||
      !feature.geometry ||
      !["Polygon", "MultiPolygon"].includes(feature.geometry.type) ||
      feature.properties?.status !== "validated" ||
      feature.properties?.output_crs !== "EPSG:4326" ||
      !coordinatesAreWgs84(feature.geometry.coordinates)
    ) {
      throw new Error(
        "검증되지 않았거나 EPSG:4326으로 확인할 수 없는 geometry가 있습니다.",
      );
    }
  }

  return data as GeoJsonFeatureCollection;
}

function loadValidatedGeoJson(
  layerId: string,
  sourceFile: string,
  expectedFeatureCount: number,
) {
  const cached = geoJsonCache.get(layerId);
  if (cached) {
    return cached;
  }

  const sourcePath = path.join(
    process.cwd(),
    "data",
    "seoul-market",
    "v1.1-final",
    "09_GEO",
    sourceFile,
  );
  const pending = readFile(sourcePath, "utf8").then((text) => {
    validateReferenceGeoJson(text, expectedFeatureCount);
    return text;
  });

  geoJsonCache.set(layerId, pending);
  pending.catch(() => geoJsonCache.delete(layerId));
  return pending;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ layerId: string }> },
) {
  const { layerId } = await params;
  const layer = getSpatialLayerDefinition(layerId);

  if (
    !layer ||
    !layer.geometryAvailable ||
    !layer.sourceFile ||
    layer.outputCrs !== "EPSG:4326"
  ) {
    return Response.json(
      { message: "렌더링 가능한 공식 참조 레이어가 아닙니다." },
      { status: 404 },
    );
  }

  try {
    const geoJson = await loadValidatedGeoJson(
      layer.layerId,
      layer.sourceFile,
      layer.featureCount,
    );

    return new Response(geoJson, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": "application/geo+json; charset=utf-8",
        "X-Frameone-Geometry-Status": layer.status,
        "X-Frameone-Geometry-Version": layer.geometryVersion ?? "unknown",
      },
    });
  } catch (error) {
    console.error(`[spatial-layer:${layerId}] GeoJSON 검증 실패`, error);
    return Response.json(
      { message: "공간 참조레이어를 안전하게 불러올 수 없습니다." },
      { status: 422 },
    );
  }
}
