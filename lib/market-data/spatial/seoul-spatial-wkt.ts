export type SeoulSpatialSourceId =
  | "SRC-SEOUL-PEDESTRIAN-NETWORK"
  | "SRC-SEOUL-CROSSWALK";

export type SupportedWktGeometryType = "POINT" | "LINESTRING";

export type WktParseFailureReason =
  | "MISSING_WKT"
  | "UNSUPPORTED_GEOMETRY_TYPE"
  | "MALFORMED_WKT"
  | "INVALID_NUMBER"
  | "INVALID_COORDINATE_COUNT"
  | "OUT_OF_WGS84_RANGE";

export type SpatialPrimitiveFailureReason =
  | WktParseFailureReason
  | "UNSUPPORTED_ROW_TYPE"
  | "INVALID_PRIMITIVE_ID"
  | "UNEXPECTED_COUNTERPART_WKT"
  | "WKT_TYPE_MISMATCH";

export type SpatialQualityFlag =
  | "COUNTERPART_ID_SENTINEL_ZERO"
  | "OUTSIDE_SEOUL_REFERENCE_RANGE";

export interface Wgs84Coordinate {
  longitude: number;
  latitude: number;
}

interface ParsedWktBase {
  success: true;
  rawWkt: string;
  coordinateRangeValid: true;
  qualityFlags: SpatialQualityFlag[];
}

export interface ParsedPointWkt extends ParsedWktBase {
  geometryType: "POINT";
  coordinate: Wgs84Coordinate;
}

export interface ParsedLineStringWkt extends ParsedWktBase {
  geometryType: "LINESTRING";
  coordinates: Wgs84Coordinate[];
}

export interface FailedWktParse {
  success: false;
  rawWkt: string | null;
  reason: WktParseFailureReason;
  detectedGeometryType: string | null;
}

export type WktParseResult =
  | ParsedPointWkt
  | ParsedLineStringWkt
  | FailedWktParse;

export interface SeoulSpatialPrimitiveRow {
  nodeType: string | null;
  nodeWkt: string | null;
  nodeId: string | null;
  nodeTypeCode: string | null;
  linkWkt: string | null;
  linkId: string | null;
  linkTypeCode: string | null;
  beginningLinkId: string | null;
  endLinkId: string | null;
  linkLength: number | null;
  districtCode: string | null;
  districtName: string | null;
  administrativeDongCode: string | null;
  administrativeDongName: string | null;
}

export interface SpatialPrimitiveLocator {
  normalizedFile: string;
  lineNumber: number;
}

export interface SpatialPrimitiveContext {
  sourceId: SeoulSpatialSourceId;
  snapshotId: string;
  sourceBasis: string;
  locator?: SpatialPrimitiveLocator;
}

export interface SpatialPrimitiveProvenance extends SpatialPrimitiveContext {
  districtCode: string | null;
  districtName: string | null;
  administrativeDongCode: string | null;
  administrativeDongName: string | null;
  rawIds: {
    nodeId: string | null;
    linkId: string | null;
  };
}

interface SpatialPrimitiveBase {
  evidenceLevel: "E1";
  provenance: SpatialPrimitiveProvenance;
  rawWkt: string;
  qualityFlags: SpatialQualityFlag[];
}

export interface SpatialNodePrimitive extends SpatialPrimitiveBase {
  kind: "NODE";
  nodeId: string;
  sourceNodeType: string;
  sourceNodeTypeCode: string | null;
  geometryType: "POINT";
  coordinate: Wgs84Coordinate;
}

export interface SpatialLinkPrimitive extends SpatialPrimitiveBase {
  kind: "LINK";
  linkId: string;
  sourceLinkType: string;
  sourceLinkTypeCode: string | null;
  sourceLength: number | null;
  sourceBeginLinkageId: string | null;
  sourceEndLinkageId: string | null;
  geometryType: "LINESTRING";
  coordinates: Wgs84Coordinate[];
}

export type SeoulSpatialPrimitive =
  | SpatialNodePrimitive
  | SpatialLinkPrimitive;

export interface FailedPrimitiveConversion {
  success: false;
  reason: SpatialPrimitiveFailureReason;
  rawWkt: string | null;
}

export type SpatialPrimitiveConversionResult =
  | { success: true; primitive: SeoulSpatialPrimitive }
  | FailedPrimitiveConversion;

const NUMBER_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const SUPPORTED_TYPES = new Set<SupportedWktGeometryType>(["POINT", "LINESTRING"]);
const SEOUL_REFERENCE_RANGE = {
  minimumLongitude: 126,
  maximumLongitude: 128,
  minimumLatitude: 37,
  maximumLatitude: 38,
} as const;

function failedWkt(
  rawWkt: string | null,
  reason: WktParseFailureReason,
  detectedGeometryType: string | null,
): FailedWktParse {
  return { success: false, rawWkt, reason, detectedGeometryType };
}

function parseCoordinateTokens(
  coordinateText: string,
): Wgs84Coordinate | WktParseFailureReason {
  const tokens = coordinateText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return "INVALID_COORDINATE_COUNT";
  if (!tokens.every((token) => NUMBER_TOKEN.test(token))) return "INVALID_NUMBER";

  const longitude = Number(tokens[0]);
  const latitude = Number(tokens[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return "INVALID_NUMBER";
  }
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return "OUT_OF_WGS84_RANGE";
  }
  return { longitude, latitude };
}

function outsideSeoulReferenceRange(coordinate: Wgs84Coordinate): boolean {
  return coordinate.longitude < SEOUL_REFERENCE_RANGE.minimumLongitude ||
    coordinate.longitude > SEOUL_REFERENCE_RANGE.maximumLongitude ||
    coordinate.latitude < SEOUL_REFERENCE_RANGE.minimumLatitude ||
    coordinate.latitude > SEOUL_REFERENCE_RANGE.maximumLatitude;
}

export function parseSeoulSpatialWkt(
  input: string | null | undefined,
): WktParseResult {
  if (input === null || input === undefined || input.trim().length === 0) {
    return failedWkt(input ?? null, "MISSING_WKT", null);
  }

  const rawWkt = input;
  const trimmed = input.trim();
  const detectedGeometryType = trimmed.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? null;
  if (!detectedGeometryType || !SUPPORTED_TYPES.has(detectedGeometryType as SupportedWktGeometryType)) {
    return failedWkt(rawWkt, "UNSUPPORTED_GEOMETRY_TYPE", detectedGeometryType);
  }
  if (/^(?:POINT|LINESTRING)\s+(?:Z|M|ZM|EMPTY)\b/i.test(trimmed)) {
    return failedWkt(rawWkt, "UNSUPPORTED_GEOMETRY_TYPE", detectedGeometryType);
  }

  const bodyMatch = trimmed.match(/^(POINT|LINESTRING)\s*\(([\s\S]*)\)$/i);
  if (!bodyMatch) return failedWkt(rawWkt, "MALFORMED_WKT", detectedGeometryType);
  const geometryType = bodyMatch[1].toUpperCase() as SupportedWktGeometryType;
  const body = bodyMatch[2].trim();
  if (!body) {
    return failedWkt(rawWkt, "INVALID_COORDINATE_COUNT", geometryType);
  }
  if (body.includes("(") || body.includes(")")) {
    return failedWkt(rawWkt, "MALFORMED_WKT", geometryType);
  }

  const coordinateParts = body.split(",");
  if (geometryType === "POINT" && coordinateParts.length !== 1) {
    return failedWkt(rawWkt, "INVALID_COORDINATE_COUNT", geometryType);
  }
  if (geometryType === "LINESTRING" && coordinateParts.length < 2) {
    return failedWkt(rawWkt, "INVALID_COORDINATE_COUNT", geometryType);
  }

  const coordinates: Wgs84Coordinate[] = [];
  for (const coordinatePart of coordinateParts) {
    const coordinate = parseCoordinateTokens(coordinatePart);
    if (typeof coordinate === "string") {
      return failedWkt(rawWkt, coordinate, geometryType);
    }
    coordinates.push(coordinate);
  }

  const qualityFlags: SpatialQualityFlag[] = coordinates.some(outsideSeoulReferenceRange)
    ? ["OUTSIDE_SEOUL_REFERENCE_RANGE"]
    : [];
  if (geometryType === "POINT") {
    return {
      success: true,
      geometryType,
      rawWkt,
      coordinate: coordinates[0],
      coordinateRangeValid: true,
      qualityFlags,
    };
  }
  return {
    success: true,
    geometryType,
    rawWkt,
    coordinates,
    coordinateRangeValid: true,
    qualityFlags,
  };
}

function canonicalId(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized && normalized !== "0" ? normalized : null;
}

function isSentinelZero(value: string | null): boolean {
  return value?.trim() === "0";
}

function primitiveFailure(
  reason: SpatialPrimitiveFailureReason,
  rawWkt: string | null,
): FailedPrimitiveConversion {
  return { success: false, reason, rawWkt };
}

function provenance(
  row: SeoulSpatialPrimitiveRow,
  context: SpatialPrimitiveContext,
): SpatialPrimitiveProvenance {
  return {
    ...context,
    districtCode: row.districtCode,
    districtName: row.districtName,
    administrativeDongCode: row.administrativeDongCode,
    administrativeDongName: row.administrativeDongName,
    rawIds: { nodeId: row.nodeId, linkId: row.linkId },
  };
}

export function toSeoulSpatialPrimitive(
  row: SeoulSpatialPrimitiveRow,
  context: SpatialPrimitiveContext,
): SpatialPrimitiveConversionResult {
  const sourceRowType = row.nodeType?.trim().toUpperCase() ?? "";
  if (sourceRowType !== "NODE" && sourceRowType !== "LINK") {
    return primitiveFailure("UNSUPPORTED_ROW_TYPE", row.nodeWkt ?? row.linkWkt);
  }

  if (sourceRowType === "NODE") {
    if (row.linkWkt !== null && row.linkWkt.trim().length > 0) {
      return primitiveFailure("UNEXPECTED_COUNTERPART_WKT", row.linkWkt);
    }
    const nodeId = canonicalId(row.nodeId);
    if (!nodeId) return primitiveFailure("INVALID_PRIMITIVE_ID", row.nodeWkt);
    const parsed = parseSeoulSpatialWkt(row.nodeWkt);
    if (!parsed.success) return primitiveFailure(parsed.reason, parsed.rawWkt);
    if (parsed.geometryType !== "POINT") {
      return primitiveFailure("WKT_TYPE_MISMATCH", parsed.rawWkt);
    }
    return {
      success: true,
      primitive: {
        kind: "NODE",
        evidenceLevel: "E1",
        provenance: provenance(row, context),
        nodeId,
        sourceNodeType: sourceRowType,
        sourceNodeTypeCode: row.nodeTypeCode,
        rawWkt: parsed.rawWkt,
        geometryType: parsed.geometryType,
        coordinate: parsed.coordinate,
        qualityFlags: isSentinelZero(row.linkId)
          ? ["COUNTERPART_ID_SENTINEL_ZERO", ...parsed.qualityFlags]
          : parsed.qualityFlags,
      },
    };
  }

  if (row.nodeWkt !== null && row.nodeWkt.trim().length > 0) {
    return primitiveFailure("UNEXPECTED_COUNTERPART_WKT", row.nodeWkt);
  }
  const linkId = canonicalId(row.linkId);
  if (!linkId) return primitiveFailure("INVALID_PRIMITIVE_ID", row.linkWkt);
  const parsed = parseSeoulSpatialWkt(row.linkWkt);
  if (!parsed.success) return primitiveFailure(parsed.reason, parsed.rawWkt);
  if (parsed.geometryType !== "LINESTRING") {
    return primitiveFailure("WKT_TYPE_MISMATCH", parsed.rawWkt);
  }
  return {
    success: true,
    primitive: {
      kind: "LINK",
      evidenceLevel: "E1",
      provenance: provenance(row, context),
      linkId,
      sourceLinkType: sourceRowType,
      sourceLinkTypeCode: row.linkTypeCode,
      sourceLength: row.linkLength,
      sourceBeginLinkageId: row.beginningLinkId,
      sourceEndLinkageId: row.endLinkId,
      rawWkt: parsed.rawWkt,
      geometryType: parsed.geometryType,
      coordinates: parsed.coordinates,
      qualityFlags: isSentinelZero(row.nodeId)
        ? ["COUNTERPART_ID_SENTINEL_ZERO", ...parsed.qualityFlags]
        : parsed.qualityFlags,
    },
  };
}
