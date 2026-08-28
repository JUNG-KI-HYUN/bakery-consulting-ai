import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const pilotDirectory = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(pilotDirectory, "..");
const geoDirectory = join(dataRoot, "09_GEO");
const programDirectory = join(dataRoot, "08_PROGRAM");

const outputJsonPath = join(pilotDirectory, "PILOT_25_SPATIAL_READINESS.json");
const outputReportPath = join(pilotDirectory, "PILOT_25_SPATIAL_READINESS_REPORT.md");
const shouldWrite = process.argv.includes("--write");

const sourcePaths = {
  hierarchy: join(dataRoot, "MARKET_HIERARCHY.json"),
  pilotDefinition: join(dataRoot, "PILOT_25_MARKETS.md"),
  pilotDefinitionCopy: join(pilotDirectory, "PILOT_25_MARKETS.md"),
  programMarkets: join(programDirectory, "markets.v1.1.json"),
  programMarketGeoJson: join(programDirectory, "markets.v1.geojson"),
  frameoneMarkets: join(geoDirectory, "FRAMEONE_MARKETS.geojson"),
  frameoneSubmarkets: join(geoDirectory, "FRAMEONE_SUBMARKETS.geojson"),
  nodes: join(geoDirectory, "NODES.geojson"),
  officialMarkets: join(geoDirectory, "OFFICIAL_SEOUL_MARKETS.geojson"),
  administrativeDongs: join(geoDirectory, "ADMIN_DONG.geojson"),
  livingGrid: join(geoDirectory, "LIVING_GRID_250M.geojson"),
  administrativeDongCrosswalk: join(
    geoDirectory,
    "MARKET_ADMIN_DONG_CROSSWALK.csv",
  ),
  officialMarketCrosswalk: join(
    geoDirectory,
    "MARKET_OFFICIAL_CROSSWALK.csv",
  ),
  livingGridCrosswalk: join(
    geoDirectory,
    "MARKET_LIVING_GRID_CROSSWALK.csv",
  ),
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function relativeSourcePath(path) {
  return relative(pilotDirectory, path).replaceAll("\\", "/");
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function nullableText(value) {
  return isBlank(value) ? null : String(value).trim();
}

function nullableNumber(value) {
  if (isBlank(value)) {
    return null;
  }

  const number = Number(value);
  assert(Number.isFinite(number), `숫자로 변환할 수 없는 값: ${value}`);
  return number;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((candidate) =>
    candidate.some((cell) => !isBlank(cell)),
  );
  assert(nonEmptyRows.length > 0, "CSV에 헤더가 없습니다.");

  const [headers, ...dataRows] = nonEmptyRows;
  return dataRows.map((cells, rowIndex) => {
    assert(
      cells.length === headers.length,
      `CSV ${rowIndex + 2}행의 컬럼 수가 헤더와 다릅니다.`,
    );
    return Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex]]),
    );
  });
}

function parsePilotDefinitions(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter((cells) => /^`SEOUL-[A-Z0-9-]+`$/.test(cells[1] ?? ""))
    .map((cells) => ({
      district: cells[0],
      marketId: cells[1].slice(1, -1),
      marketName: cells[2],
      pilotType: cells[3],
      loadStatus: cells[4],
    }));
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}

function indexBy(items, getKey, label) {
  const result = new Map();
  for (const item of items) {
    const key = getKey(item);
    assert(!result.has(key), `${label} 중복 ID: ${key}`);
    result.set(key, item);
  }
  return result;
}

function countBy(items, getValue) {
  const counts = {};
  for (const item of items) {
    const value = getValue(item) ?? "(missing)";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hasGeometry(feature) {
  return Boolean(feature?.geometry?.type && feature?.geometry?.coordinates);
}

function geometryType(feature) {
  return hasGeometry(feature) ? feature.geometry.type : null;
}

function allEqual(items, expected) {
  return items.every((item) => item === expected);
}

function buildCoreSpatialStatus({
  entityType,
  entityId,
  feature,
  confidence = null,
  reviewNote,
}) {
  const geometryStatus = nullableText(feature?.properties?.status) ?? "text_only";
  const type = geometryType(feature);
  let verificationStatus = "text_only";

  if (geometryStatus === "validated" && type === "Point") {
    verificationStatus = "verified_point";
  } else if (geometryStatus === "validated" && type) {
    verificationStatus = "verified_geometry";
  } else if (geometryStatus === "draft" || type) {
    verificationStatus = "candidate";
  }

  return {
    entityType,
    entityId,
    geometryStatus,
    verificationStatus,
    geometryType: type,
    geometrySource: null,
    sourceVersion: nullableText(feature?.properties?.geometry_version),
    sourceDate: null,
    sourceCrs: nullableText(feature?.properties?.source_crs),
    outputCrs: nullableText(feature?.properties?.output_crs),
    verifiedDate: null,
    confidence,
    verificationMethod: "source_record_inspection",
    reviewNote,
  };
}

function buildReferenceSummary(features, idField, label) {
  const ids = features.map((feature) => String(feature.properties[idField]));
  const geometryPresentCount = features.filter(hasGeometry).length;
  return {
    label,
    featureCount: features.length,
    uniqueIdCount: new Set(ids).size,
    duplicateIdCount: duplicateValues(ids).length,
    geometryPresentCount,
    geometryMissingCount: features.length - geometryPresentCount,
    geometryTypes: countBy(features, (feature) => geometryType(feature)),
    statuses: countBy(features, (feature) => feature.properties.status),
    sourceCrs: countBy(features, (feature) => feature.properties.source_crs),
    outputCrs: countBy(features, (feature) => feature.properties.output_crs),
  };
}

function markdownEscape(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildArtifacts() {
  for (const [label, path] of Object.entries(sourcePaths)) {
    assert(existsSync(path), `필수 파일 없음 (${label}): ${path}`);
  }

  assert(
    sha256(sourcePaths.pilotDefinition) === sha256(sourcePaths.pilotDefinitionCopy),
    "PILOT_25_MARKETS.md 두 사본의 SHA-256이 다릅니다.",
  );

  const hierarchy = readJson(sourcePaths.hierarchy);
  const programMarkets = readJson(sourcePaths.programMarkets).records;
  const programMarketGeoJson = readJson(sourcePaths.programMarketGeoJson);
  const frameoneMarketsGeoJson = readJson(sourcePaths.frameoneMarkets);
  const frameoneSubmarketsGeoJson = readJson(sourcePaths.frameoneSubmarkets);
  const nodesGeoJson = readJson(sourcePaths.nodes);
  const officialMarketsGeoJson = readJson(sourcePaths.officialMarkets);
  const administrativeDongsGeoJson = readJson(sourcePaths.administrativeDongs);
  const livingGridGeoJson = readJson(sourcePaths.livingGrid);

  const administrativeDongCrosswalk = parseCsv(
    readText(sourcePaths.administrativeDongCrosswalk),
  );
  const officialMarketCrosswalk = parseCsv(
    readText(sourcePaths.officialMarketCrosswalk),
  );
  const livingGridCrosswalk = parseCsv(
    readText(sourcePaths.livingGridCrosswalk),
  );

  const districts = hierarchy.districts;
  const markets = districts.flatMap((district) => district.markets);
  const submarkets = markets.flatMap((market) => market.submarkets);
  const nodes = submarkets.flatMap((submarket) => submarket.nodes);

  const marketById = indexBy(markets, (market) => market.marketId, "Market");
  const submarketById = indexBy(
    submarkets,
    (submarket) => submarket.submarketId,
    "Submarket",
  );
  indexBy(nodes, (node) => node.nodeId, "Node");

  const frameoneMarketFeatureById = indexBy(
    frameoneMarketsGeoJson.features,
    (feature) => feature.properties.market_id,
    "FRAMEONE Market GeoJSON",
  );
  const programMarketFeatureById = indexBy(
    programMarketGeoJson.features,
    (feature) => feature.properties.market_id,
    "Program Market GeoJSON",
  );
  const frameoneSubmarketFeatureById = indexBy(
    frameoneSubmarketsGeoJson.features,
    (feature) => feature.properties.submarket_id,
    "FRAMEONE Submarket GeoJSON",
  );
  const nodeFeatureById = indexBy(
    nodesGeoJson.features,
    (feature) => feature.properties.node_id,
    "Node GeoJSON",
  );
  const officialMarketFeatureById = indexBy(
    officialMarketsGeoJson.features,
    (feature) => String(feature.properties.official_area_code),
    "서울시 공식상권 GeoJSON",
  );
  const administrativeDongFeatureById = indexBy(
    administrativeDongsGeoJson.features,
    (feature) => String(feature.properties.adm_cd),
    "행정동 GeoJSON",
  );
  const livingGridFeatureById = indexBy(
    livingGridGeoJson.features,
    (feature) => String(feature.properties.grid_id),
    "생활인구 Grid GeoJSON",
  );

  assert(districts.length === 25, `District 개수 오류: ${districts.length}`);
  assert(markets.length === 156, `Market 개수 오류: ${markets.length}`);
  assert(submarkets.length === 382, `Submarket 개수 오류: ${submarkets.length}`);
  assert(nodes.length === 763, `Node 개수 오류: ${nodes.length}`);
  assert(programMarkets.length === 156, "markets.v1.1.json은 156개여야 합니다.");
  assert(
    frameoneMarketsGeoJson.features.length === 156,
    "FRAMEONE_MARKETS.geojson은 156개여야 합니다.",
  );
  assert(
    frameoneSubmarketsGeoJson.features.length === 382,
    "FRAMEONE_SUBMARKETS.geojson은 382개여야 합니다.",
  );
  assert(nodesGeoJson.features.length === 763, "NODES.geojson은 763개여야 합니다.");

  const invalidSubmarketParentIds = submarkets
    .filter((submarket) => !marketById.has(submarket.parentMarketId))
    .map((submarket) => submarket.submarketId);
  const invalidNodeParentIds = nodes
    .filter((node) => !submarketById.has(node.parentSubmarketId))
    .map((node) => node.nodeId);
  assert(invalidSubmarketParentIds.length === 0, "잘못된 Submarket 부모가 있습니다.");
  assert(invalidNodeParentIds.length === 0, "잘못된 Node 부모가 있습니다.");

  const programMarketIds = new Set(programMarkets.map((market) => market.market_id));
  assert(
    markets.every((market) => programMarketIds.has(market.marketId)),
    "Hierarchy와 markets.v1.1.json의 Market ID가 일치하지 않습니다.",
  );
  assert(
    markets.every((market) => frameoneMarketFeatureById.has(market.marketId)),
    "Hierarchy와 FRAMEONE_MARKETS.geojson의 Market ID가 일치하지 않습니다.",
  );
  const programMarketGeoJsonMissingHierarchyIds = markets
    .filter((market) => !programMarketFeatureById.has(market.marketId))
    .map((market) => market.marketId);
  const programMarketGeoJsonExtraIds = programMarketGeoJson.features
    .map((feature) => feature.properties.market_id)
    .filter((marketId) => !marketById.has(marketId));
  assert(
    submarkets.every((submarket) =>
      frameoneSubmarketFeatureById.has(submarket.submarketId),
    ),
    "Hierarchy와 FRAMEONE_SUBMARKETS.geojson의 Submarket ID가 일치하지 않습니다.",
  );
  assert(
    nodes.every((node) => nodeFeatureById.has(node.nodeId)),
    "Hierarchy와 NODES.geojson의 Node ID가 일치하지 않습니다.",
  );
  assert(
    submarkets.every(
      (submarket) =>
        frameoneSubmarketFeatureById.get(submarket.submarketId).properties
          .parent_market_id === submarket.parentMarketId,
    ),
    "Hierarchy와 FRAMEONE_SUBMARKETS.geojson의 부모 Market ID가 일치하지 않습니다.",
  );
  assert(
    nodes.every(
      (node) =>
        nodeFeatureById.get(node.nodeId).properties.parent_submarket_id ===
        node.parentSubmarketId,
    ),
    "Hierarchy와 NODES.geojson의 부모 Submarket ID가 일치하지 않습니다.",
  );

  const pilotDefinitions = parsePilotDefinitions(readText(sourcePaths.pilotDefinition));
  const pilotIds = pilotDefinitions.map((pilot) => pilot.marketId);
  assert(pilotDefinitions.length === 25, `Pilot Market 개수 오류: ${pilotDefinitions.length}`);
  assert(new Set(pilotIds).size === 25, "Pilot Market ID가 중복되었습니다.");
  assert(
    new Set(pilotDefinitions.map((pilot) => pilot.district)).size === 25,
    "Pilot 자치구가 25개가 아닙니다.",
  );
  assert(
    pilotIds.every((marketId) => marketById.has(marketId)),
    "Pilot 정의에 존재하지 않는 Market ID가 있습니다.",
  );

  for (const pilot of pilotDefinitions) {
    const market = marketById.get(pilot.marketId);
    assert(market.gu === pilot.district, `${pilot.marketId} 자치구가 일치하지 않습니다.`);
    assert(market.name === pilot.marketName, `${pilot.marketId} 상권명이 일치하지 않습니다.`);
  }

  const pilotIdSet = new Set(pilotIds);
  const pilotAdministrativeDongCrosswalk = administrativeDongCrosswalk.filter((row) =>
    pilotIdSet.has(row.market_id),
  );
  const pilotOfficialMarketCrosswalk = officialMarketCrosswalk.filter((row) =>
    pilotIdSet.has(row.market_id),
  );

  const missingAdminCrosswalkMarketIds = administrativeDongCrosswalk
    .filter((row) => !marketById.has(row.market_id))
    .map((row) => row.market_id);
  const missingOfficialCrosswalkMarketIds = officialMarketCrosswalk
    .filter((row) => !marketById.has(row.market_id))
    .map((row) => row.market_id);
  const missingGridCrosswalkMarketIds = livingGridCrosswalk
    .filter((row) => !marketById.has(row.market_id))
    .map((row) => row.market_id);
  const missingAdministrativeDongIds = administrativeDongCrosswalk
    .filter((row) => !administrativeDongFeatureById.has(String(row.adm_cd)))
    .map((row) => row.adm_cd);
  const missingOfficialAreaCodes = officialMarketCrosswalk
    .filter((row) => !officialMarketFeatureById.has(String(row.official_area_code)))
    .map((row) => row.official_area_code);
  const missingLivingGridIds = livingGridCrosswalk
    .filter((row) => !livingGridFeatureById.has(String(row.grid_id)))
    .map((row) => row.grid_id);

  assert(missingAdminCrosswalkMarketIds.length === 0, "행정동 Crosswalk에 잘못된 Market ID가 있습니다.");
  assert(missingOfficialCrosswalkMarketIds.length === 0, "공식상권 Crosswalk에 잘못된 Market ID가 있습니다.");
  assert(missingGridCrosswalkMarketIds.length === 0, "Grid Crosswalk에 잘못된 Market ID가 있습니다.");
  assert(missingAdministrativeDongIds.length === 0, "존재하지 않는 행정동 Crosswalk ID가 있습니다.");
  assert(missingOfficialAreaCodes.length === 0, "존재하지 않는 공식상권 Crosswalk ID가 있습니다.");
  assert(missingLivingGridIds.length === 0, "존재하지 않는 Grid Crosswalk ID가 있습니다.");

  const officialSameDistrictResults = officialMarketCrosswalk.map((row) => {
    const market = marketById.get(row.market_id);
    const reference = officialMarketFeatureById.get(String(row.official_area_code));
    const referenceDistrict = nullableText(reference?.properties?.gu);
    return {
      marketId: row.market_id,
      officialAreaCode: row.official_area_code,
      sameDistrict:
        market && referenceDistrict ? market.gu === referenceDistrict : null,
    };
  });
  const officialSameDistrictCount = officialSameDistrictResults.filter(
    (result) => result.sameDistrict === true,
  ).length;
  const officialDifferentDistrictCount = officialSameDistrictResults.filter(
    (result) => result.sameDistrict === false,
  ).length;
  const officialDistrictUnknownCount = officialSameDistrictResults.filter(
    (result) => result.sameDistrict === null,
  ).length;

  const administrativeDongDistrictLabelCount = administrativeDongsGeoJson.features.filter(
    (feature) => !isBlank(feature.properties.gu),
  ).length;

  const officialCenterXs = officialMarketsGeoJson.features.map((feature) =>
    nullableNumber(feature.properties.center_x),
  );
  const officialCenterYs = officialMarketsGeoJson.features.map((feature) =>
    nullableNumber(feature.properties.center_y),
  );
  assert(officialCenterXs.every((value) => value !== null), "공식상권 center_x 누락이 있습니다.");
  assert(officialCenterYs.every((value) => value !== null), "공식상권 center_y 누락이 있습니다.");
  assert(
    allEqual(
      officialMarketsGeoJson.features.map((feature) => feature.properties.source_crs),
      "EPSG:5181",
    ),
    "공식상권 center_x/center_y 원천 CRS가 EPSG:5181로 통일되어 있지 않습니다.",
  );
  assert(
    allEqual(
      officialMarketsGeoJson.features.map((feature) => feature.properties.output_crs),
      "EPSG:4326",
    ),
    "공식상권 출력 geometry CRS가 EPSG:4326으로 통일되어 있지 않습니다.",
  );
  const centerValuesThatLookLikeWgs84 = officialCenterXs.filter(
    (x, index) => Math.abs(x) <= 180 && Math.abs(officialCenterYs[index]) <= 90,
  ).length;
  assert(
    centerValuesThatLookLikeWgs84 === 0,
    "center_x/center_y 중 WGS84처럼 보이는 값이 있어 별도 검토가 필요합니다.",
  );

  const frameoneMarketGeometryCount = frameoneMarketsGeoJson.features.filter(hasGeometry).length;
  const programMarketGeometryCount = programMarketGeoJson.features.filter(hasGeometry).length;
  const frameoneSubmarketGeometryCount = frameoneSubmarketsGeoJson.features.filter(hasGeometry).length;
  const nodeGeometryCount = nodesGeoJson.features.filter(hasGeometry).length;
  const nodeAddressCount = nodes.filter((node) => !isBlank(node.address)).length;
  const nodeCoordinateCount = nodes.filter(
    (node) => !isBlank(node.latitude) && !isBlank(node.longitude),
  ).length;
  assert(frameoneMarketGeometryCount === 0, "FRAMEONE Market geometry가 새로 발견되었습니다.");
  assert(programMarketGeometryCount === 0, "Program Market geometry가 새로 발견되었습니다.");
  assert(frameoneSubmarketGeometryCount === 0, "FRAMEONE Submarket geometry가 새로 발견되었습니다.");
  assert(nodeGeometryCount === 0, "Node geometry가 새로 발견되었습니다.");
  assert(nodeAddressCount === 0, "Node 주소가 새로 발견되었습니다.");
  assert(nodeCoordinateCount === 0, "Node 좌표가 새로 발견되었습니다.");

  const administrativeReferenceSummary = buildReferenceSummary(
    administrativeDongsGeoJson.features,
    "adm_cd",
    "서울시 행정동",
  );
  const officialReferenceSummary = buildReferenceSummary(
    officialMarketsGeoJson.features,
    "official_area_code",
    "서울시 공식상권",
  );
  const livingGridReferenceSummary = buildReferenceSummary(
    livingGridGeoJson.features,
    "grid_id",
    "생활인구 250m Grid",
  );

  const pilotMarkets = pilotDefinitions.map((pilot) => {
    const market = marketById.get(pilot.marketId);
    const marketFeature = frameoneMarketFeatureById.get(pilot.marketId);
    const adminRows = pilotAdministrativeDongCrosswalk.filter(
      (row) => row.market_id === pilot.marketId,
    );
    const officialRows = pilotOfficialMarketCrosswalk.filter(
      (row) => row.market_id === pilot.marketId,
    );

    const administrativeDongCandidates = adminRows.map((row) => {
      const reference = administrativeDongFeatureById.get(String(row.adm_cd));
      return {
        verificationStatus: "candidate",
        referenceStatus: "verified_reference",
        administrativeDongCode: row.adm_cd,
        administrativeDongName: nullableText(row.adm_nm),
        relationType: row.relation_type,
        confidence: nullableText(row.confidence),
        sourceId: nullableText(row.source_id),
        geometryVersion: nullableText(row.geometry_version),
        referenceExists: Boolean(reference),
        referenceGeometryExists: hasGeometry(reference),
        referenceGeometryType: geometryType(reference),
        referenceSourceCrs: nullableText(reference?.properties?.source_crs),
        referenceOutputCrs: nullableText(reference?.properties?.output_crs),
        sameDistrict: null,
        sameDistrictCheck: "unavailable_reference_district_labels_missing",
        overlapRatio: nullableNumber(row.overlap_ratio),
        manualReviewRequired: true,
      };
    });

    const officialMarketCandidates = officialRows.map((row) => {
      const reference = officialMarketFeatureById.get(String(row.official_area_code));
      const referenceDistrict = nullableText(reference?.properties?.gu);
      return {
        verificationStatus: "candidate",
        referenceStatus: "verified_reference",
        officialAreaCode: row.official_area_code,
        officialAreaName: row.official_area_name,
        officialAreaType: row.official_area_type,
        officialBaseYear: nullableText(row.official_base_year),
        relationType: row.relation_type,
        confidence: nullableText(row.confidence),
        sourceId: nullableText(row.source_id),
        geometryVersion: nullableText(row.geometry_version),
        matchBasis: nullableText(row.match_basis),
        checkedAt: nullableText(row.checked_at),
        referenceExists: Boolean(reference),
        referenceGeometryExists: hasGeometry(reference),
        referenceGeometryType: geometryType(reference),
        referenceDistrict,
        sameDistrict: referenceDistrict ? market.gu === referenceDistrict : null,
        overlapAreaM2: nullableNumber(row.overlap_area_m2),
        marketOverlapRatio: nullableNumber(row.market_overlap_ratio),
        officialOverlapRatio: nullableNumber(row.official_overlap_ratio),
        manualReviewRequired: true,
      };
    });

    const pilotSubmarkets = market.submarkets.map((submarket) => {
      const submarketFeature = frameoneSubmarketFeatureById.get(submarket.submarketId);
      const properties = submarketFeature.properties;

      return {
        submarketId: submarket.submarketId,
        parentMarketId: submarket.parentMarketId,
        submarketName: submarket.name,
        spatialStatus: buildCoreSpatialStatus({
          entityType: "submarket",
          entityId: submarket.submarketId,
          feature: submarketFeature,
          confidence: nullableText(properties.confidence),
          reviewNote: "Polygon 또는 대표 좌표가 없으며 텍스트 앵커만 검토할 수 있음",
        }),
        textAnchors: {
          administrativeDong:
            submarket.administrativeDong ??
            nullableText(properties.administrative_dong),
          mainStation: nullableText(properties.main_station),
          mainStreet: nullableText(properties.main_street),
          mainAnchor: nullableText(properties.main_anchor),
          boundaryBasis: nullableText(properties.boundary_basis),
        },
        requiredFollowUp: [
          "공간화에 사용할 텍스트 앵커 현장 검증",
          "검증된 WGS84 대표점 또는 경계 geometry 확보",
          "geometry 출처·버전·확인일 기록",
        ],
        nodes: submarket.nodes.map((node) => {
          const nodeFeature = nodeFeatureById.get(node.nodeId);
          const nodeProperties = nodeFeature.properties;
          const address = nullableText(node.address ?? nodeProperties.address);
          const latitude = nullableNumber(node.latitude ?? nodeProperties.latitude);
          const longitude = nullableNumber(node.longitude ?? nodeProperties.longitude);

          return {
            nodeId: node.nodeId,
            parentSubmarketId: node.parentSubmarketId,
            nodeType: node.type,
            nodeName: node.name,
            address,
            addressStatus: address ? "field_check_required" : "not_collected",
            latitude,
            longitude,
            coordinateStatus:
              latitude !== null && longitude !== null
                ? "field_check_required"
                : "not_collected",
            spatialStatus: buildCoreSpatialStatus({
              entityType: "node",
              entityId: node.nodeId,
              feature: nodeFeature,
              reviewNote: "주소와 좌표를 공신력 있는 출처 또는 현장조사로 확인해야 함",
            }),
            sourceId: nullableText(node.sourceId ?? nodeProperties.source_id),
            fieldSurveyPriority: nullableText(nodeProperties.field_survey_priority),
            sourceNote: nullableText(nodeProperties.notes),
            requiredFollowUp: [
              "주소 확인",
              "주소 출처 기록",
              "EPSG:4326 위도·경도 확인",
              "좌표 검증 방법과 확인일 기록",
            ],
          };
        }),
      };
    });

    return {
      marketId: market.marketId,
      marketName: market.name,
      district: market.gu,
      pilotType: pilot.pilotType,
      pilotLoadStatus: pilot.loadStatus,
      researchPriority: market.researchPriority,
      bakeryMarketImportance: market.bakeryMarketImportance,
      submarketCount: market.submarkets.length,
      nodeCount: market.submarkets.flatMap((submarket) => submarket.nodes).length,
      spatialStatus: buildCoreSpatialStatus({
        entityType: "market",
        entityId: market.marketId,
        feature: marketFeature,
        reviewNote: "FRAMEONE Market Polygon과 대표 좌표가 모두 미확정",
      }),
      administrativeDongCandidates,
      officialMarketCandidates,
      crosswalkStatus: "candidate",
      manualReviewRequired: true,
      missingData: [
        "검증된 Market Polygon 또는 대표점",
        "확정 행정동 관계와 overlap 비율",
        "확정 공식상권 관계와 overlap 면적·비율",
        "생활인구 Grid Crosswalk",
      ],
      submarkets: pilotSubmarkets,
    };
  });

  const pilotSubmarkets = pilotMarkets.flatMap((market) => market.submarkets);
  const pilotNodes = pilotSubmarkets.flatMap((submarket) => submarket.nodes);
  const pilotMarketGeometryCount = pilotMarkets.filter(
    (market) => market.spatialStatus.geometryType !== null,
  ).length;
  const pilotSubmarketGeometryCount = pilotSubmarkets.filter(
    (submarket) => submarket.spatialStatus.geometryType !== null,
  ).length;
  const pilotNodeGeometryCount = pilotNodes.filter(
    (node) => node.spatialStatus.geometryType !== null,
  ).length;
  const pilotNodeCoordinateCount = pilotNodes.filter(
    (node) => node.latitude !== null && node.longitude !== null,
  ).length;

  assert(pilotMarkets.length === 25, "산출물 Pilot Market이 25개가 아닙니다.");
  assert(duplicateValues(pilotMarkets.map((market) => market.marketId)).length === 0, "산출물 Market ID 중복이 있습니다.");
  assert(duplicateValues(pilotSubmarkets.map((submarket) => submarket.submarketId)).length === 0, "산출물 Submarket ID 중복이 있습니다.");
  assert(duplicateValues(pilotNodes.map((node) => node.nodeId)).length === 0, "산출물 Node ID 중복이 있습니다.");
  assert(pilotMarketGeometryCount === 0, "Pilot Market에 geometry가 생성되었습니다.");
  assert(pilotSubmarketGeometryCount === 0, "Pilot Submarket에 geometry가 생성되었습니다.");
  assert(pilotNodeGeometryCount === 0, "Pilot Node에 geometry가 생성되었습니다.");
  assert(pilotNodeCoordinateCount === 0, "Pilot Node에 좌표가 생성되었습니다.");

  const adminOverlapPopulatedCount = administrativeDongCrosswalk.filter(
    (row) => !isBlank(row.overlap_ratio),
  ).length;
  const officialOverlapAreaPopulatedCount = officialMarketCrosswalk.filter(
    (row) => !isBlank(row.overlap_area_m2),
  ).length;
  const officialMarketOverlapPopulatedCount = officialMarketCrosswalk.filter(
    (row) => !isBlank(row.market_overlap_ratio),
  ).length;
  const officialReferenceOverlapPopulatedCount = officialMarketCrosswalk.filter(
    (row) => !isBlank(row.official_overlap_ratio),
  ).length;
  const adminMissingReferenceGeometryCount = administrativeDongCrosswalk.filter(
    (row) => {
      const reference = administrativeDongFeatureById.get(String(row.adm_cd));
      return reference && !hasGeometry(reference);
    },
  ).length;
  const officialMissingReferenceGeometryCount = officialMarketCrosswalk.filter(
    (row) => {
      const reference = officialMarketFeatureById.get(
        String(row.official_area_code),
      );
      return reference && !hasGeometry(reference);
    },
  ).length;
  const pilotOfficialSameDistrictCount = pilotOfficialMarketCrosswalk.filter(
    (row) => {
      const market = marketById.get(row.market_id);
      const reference = officialMarketFeatureById.get(
        String(row.official_area_code),
      );
      return (
        market &&
        reference?.properties?.gu &&
        market.gu === reference.properties.gu
      );
    },
  ).length;

  const dataset = {
    schemaVersion: "1.0.0",
    preparedAt: hierarchy.checkedAt,
    datasetName: "FRAMEONE Pilot 25 Spatial Readiness",
    purpose:
      "지도 개발 전 Pilot 25의 공간정보 준비상태와 수동 검토 대상을 구조화한다.",
    dataPrinciples: [
      "기존 Market/Submarket/Node ID와 hierarchy를 변경하지 않는다.",
      "없는 좌표와 geometry는 null로 유지한다.",
      "manual_review Crosswalk는 candidate이며 확정 관계로 사용하지 않는다.",
      "서울시 공식상권과 행정동 geometry는 verified_reference일 뿐 FRAMEONE 경계가 아니다.",
      "EPSG:5181 center_x/center_y를 WGS84로 직접 사용하지 않는다.",
    ],
    sourceFiles: Object.fromEntries(
      Object.entries(sourcePaths).map(([label, path]) => [
        label,
        relativeSourcePath(path),
      ]),
    ),
    spatialStatusSchema: {
      jsonFieldConvention: "camelCase",
      requiredFields: [
        "entityType",
        "entityId",
        "geometryStatus",
        "verificationStatus",
        "geometryType",
        "geometrySource",
        "sourceVersion",
        "sourceDate",
        "sourceCrs",
        "outputCrs",
        "verifiedDate",
        "confidence",
        "verificationMethod",
        "reviewNote",
      ],
      existingGeometryStatuses: {
        text_only: "기존 데이터 계약의 geometry 미확정 상태",
        draft: "기존 데이터 계약의 초안 geometry 상태",
        validated: "기존 데이터 계약의 검증된 geometry 상태",
      },
      verificationStatuses: {
        text_only: "공간값 없이 텍스트 hierarchy와 앵커만 존재",
        candidate: "후보 관계 또는 초안이며 수동 검토 전에는 확정 사용 금지",
        verified_reference:
          "공식 참조 레이어의 ID와 geometry 자체는 검증되었지만 FRAMEONE 경계는 아님",
        verified_point: "출처와 CRS가 확인된 FRAMEONE 대표점",
        verified_geometry: "출처와 CRS가 확인된 FRAMEONE Polygon/MultiPolygon",
      },
    },
    summary: {
      hierarchy: {
        districtCount: districts.length,
        marketCount: markets.length,
        submarketCount: submarkets.length,
        nodeCount: nodes.length,
        duplicateMarketIdCount: duplicateValues(markets.map((market) => market.marketId)).length,
        duplicateSubmarketIdCount: duplicateValues(
          submarkets.map((submarket) => submarket.submarketId),
        ).length,
        duplicateNodeIdCount: duplicateValues(nodes.map((node) => node.nodeId)).length,
        invalidSubmarketParentCount: invalidSubmarketParentIds.length,
        invalidNodeParentCount: invalidNodeParentIds.length,
      },
      pilot: {
        districtCount: new Set(pilotMarkets.map((market) => market.district)).size,
        marketCount: pilotMarkets.length,
        submarketCount: pilotSubmarkets.length,
        nodeCount: pilotNodes.length,
        marketGeometryCount: pilotMarketGeometryCount,
        submarketGeometryCount: pilotSubmarketGeometryCount,
        nodeGeometryCount: pilotNodeGeometryCount,
        nodeAddressCount: pilotNodes.filter((node) => node.address !== null).length,
        nodeCoordinateCount: pilotNodeCoordinateCount,
        administrativeDongCandidateCount:
          pilotAdministrativeDongCrosswalk.length,
        officialMarketCandidateCount: pilotOfficialMarketCrosswalk.length,
      },
      frameoneSpatialData: {
        marketGeometryCount: frameoneMarketGeometryCount,
        submarketGeometryCount: frameoneSubmarketGeometryCount,
        nodeGeometryCount,
        nodeAddressCount,
        nodeCoordinateCount,
        statuses: {
          markets: countBy(
            frameoneMarketsGeoJson.features,
            (feature) => feature.properties.status,
          ),
          submarkets: countBy(
            frameoneSubmarketsGeoJson.features,
            (feature) => feature.properties.status,
          ),
          nodes: countBy(nodesGeoJson.features, (feature) => feature.properties.status),
        },
      },
      sourceConsistency: {
        canonicalHierarchyPath: relativeSourcePath(sourcePaths.hierarchy),
        frameoneMarketGeoJsonMissingHierarchyIdCount: 0,
        programMarketGeoJsonMissingHierarchyIds:
          programMarketGeoJsonMissingHierarchyIds,
        programMarketGeoJsonExtraIds: programMarketGeoJsonExtraIds,
        programMarketGeoJsonCanonicalForPilot: false,
      },
    },
    referenceLayers: {
      administrativeDongs: administrativeReferenceSummary,
      officialMarkets: officialReferenceSummary,
      livingGrid250m: livingGridReferenceSummary,
    },
    crsValidation: {
      officialMarketCenterCoordinates: {
        sourceCrs: "EPSG:5181",
        outputGeometryCrs: "EPSG:4326",
        centerXMinimum: Math.min(...officialCenterXs),
        centerXMaximum: Math.max(...officialCenterXs),
        centerYMinimum: Math.min(...officialCenterYs),
        centerYMaximum: Math.max(...officialCenterYs),
        valuesThatLookLikeWgs84Count: centerValuesThatLookLikeWgs84,
        directWgs84UseAllowed: false,
        requiredConversion: "EPSG:5181 -> EPSG:4326",
        conversionPerformedByThisDataset: false,
        implementationNote:
          "현재 의존성에는 좌표변환 라이브러리가 없다. 향후 원천 중심점 사용이 필요하면 수집/Adapter 단계에서 proj4 등의 검증된 변환기를 별도 검토한다.",
      },
    },
    crosswalkValidation: {
      automaticChecks: [
        "Crosswalk Market ID가 hierarchy에 존재하는지 확인",
        "참조 ID가 각 참조 GeoJSON에 존재하는지 확인",
        "참조 feature의 geometry 존재 여부 확인",
        "공식상권 후보와 FRAMEONE Market의 자치구 일치 여부 확인",
        "저장된 overlap 값 존재 여부 확인",
      ],
      unavailableChecks: [
        "FRAMEONE Market geometry가 없어 Polygon intersection과 overlap 계산 불가",
        "ADMIN_DONG.geojson의 gu/gu_code/adm_nm이 비어 있어 행정동 후보의 같은 자치구 여부 자동검증 불가",
      ],
      administrativeDong: {
        totalRowCount: administrativeDongCrosswalk.length,
        pilotRowCount: pilotAdministrativeDongCrosswalk.length,
        coveredMarketCount: new Set(
          administrativeDongCrosswalk.map((row) => row.market_id),
        ).size,
        coveredPilotMarketCount: new Set(
          pilotAdministrativeDongCrosswalk.map((row) => row.market_id),
        ).size,
        missingMarketIdCount: missingAdminCrosswalkMarketIds.length,
        missingReferenceIdCount: missingAdministrativeDongIds.length,
        missingReferenceGeometryCount: adminMissingReferenceGeometryCount,
        relationTypes: countBy(
          administrativeDongCrosswalk,
          (row) => row.relation_type,
        ),
        overlapRatioPopulatedCount: adminOverlapPopulatedCount,
        sameDistrictCheckAvailable: administrativeDongDistrictLabelCount > 0,
        sameDistrictCheckedRowCount: 0,
        verificationStatus: "candidate",
        manualReviewRequired: true,
      },
      officialMarket: {
        totalRowCount: officialMarketCrosswalk.length,
        pilotRowCount: pilotOfficialMarketCrosswalk.length,
        coveredMarketCount: new Set(
          officialMarketCrosswalk.map((row) => row.market_id),
        ).size,
        coveredPilotMarketCount: new Set(
          pilotOfficialMarketCrosswalk.map((row) => row.market_id),
        ).size,
        missingMarketIdCount: missingOfficialCrosswalkMarketIds.length,
        missingReferenceIdCount: missingOfficialAreaCodes.length,
        missingReferenceGeometryCount: officialMissingReferenceGeometryCount,
        relationTypes: countBy(
          officialMarketCrosswalk,
          (row) => row.relation_type,
        ),
        sameDistrictCount: officialSameDistrictCount,
        differentDistrictCount: officialDifferentDistrictCount,
        districtUnknownCount: officialDistrictUnknownCount,
        overlapAreaPopulatedCount: officialOverlapAreaPopulatedCount,
        marketOverlapRatioPopulatedCount:
          officialMarketOverlapPopulatedCount,
        officialOverlapRatioPopulatedCount:
          officialReferenceOverlapPopulatedCount,
        verificationStatus: "candidate",
        manualReviewRequired: true,
      },
      livingGrid: {
        totalRowCount: livingGridCrosswalk.length,
        pilotRowCount: livingGridCrosswalk.filter((row) =>
          pilotIdSet.has(row.market_id),
        ).length,
        missingMarketIdCount: missingGridCrosswalkMarketIds.length,
        missingReferenceIdCount: missingLivingGridIds.length,
        verificationStatus: "text_only",
        manualReviewRequired: true,
      },
      spatialIntersectionAvailable: false,
      statusPromotionPerformed: false,
    },
    markets: pilotMarkets,
  };

  const reportLines = [
    "# PILOT 25 SPATIAL READINESS REPORT",
    "",
    `기준일: ${hierarchy.checkedAt}`,
    "",
    "## 1. 완료 범위",
    "",
    "- Pilot 25를 기존 hierarchy ID로 분리하고 Market·Submarket·Node 공간 준비상태를 JSON으로 구조화했다.",
    "- 기존 Crosswalk의 참조 ID, 참조 geometry, 공식상권 자치구 일치를 자동검증했다.",
    "- FRAMEONE geometry가 없으므로 Polygon intersection과 overlap 계산은 수행하지 않았다.",
    "- 지도 Viewer, 좌표변환, hierarchy 및 원본 데이터 수정은 수행하지 않았다.",
    `- \`08_PROGRAM/markets.v1.geojson\`에는 canonical hierarchy와 다른 구 ID 표기 ${programMarketGeoJsonExtraIds.length}건이 있어 Pilot 원천으로 사용하지 않았다.`,
    "",
    "## 2. 공간데이터 상태 스키마",
    "",
    "기존 `GeometryStatus = text_only | draft | validated`를 변경하지 않는다. Pilot 준비 데이터의 별도 `verificationStatus`는 다음 의미로 사용한다.",
    "",
    "| verificationStatus | 의미 |",
    "|---|---|",
    "| `text_only` | 공간값 없이 텍스트 hierarchy와 앵커만 존재 |",
    "| `candidate` | Crosswalk 후보 또는 초안이며 수동 검토 전 확정 사용 금지 |",
    "| `verified_reference` | 참조 레이어의 ID와 geometry 자체만 검증됨. FRAMEONE 경계가 아님 |",
    "| `verified_point` | 향후 출처·CRS가 확인된 FRAMEONE 대표점 |",
    "| `verified_geometry` | 향후 출처·CRS가 확인된 FRAMEONE Polygon/MultiPolygon |",
    "",
    "각 엔터티의 `spatialStatus`에는 `entityType`, `entityId`, `geometryStatus`, `verificationStatus`, `geometryType`, `geometrySource`, `sourceVersion`, `sourceDate`, `sourceCrs`, `outputCrs`, `verifiedDate`, `confidence`, `verificationMethod`, `reviewNote`를 기록한다.",
    "",
    "## 3. Pilot 25 현황",
    "",
    `- Market: ${pilotMarkets.length}`,
    `- Submarket: ${pilotSubmarkets.length}`,
    `- Node: ${pilotNodes.length}`,
    `- 행정동 후보: ${pilotAdministrativeDongCrosswalk.length}`,
    `- 공식상권 후보: ${pilotOfficialMarketCrosswalk.length}`,
    `- 생성한 좌표 또는 geometry: 0`,
    "",
    "| 자치구 | Market ID | Market | 우선순위 | 베이커리 중요도 | Submarket | Node | 행정동 후보 | 공식상권 후보 | geometry |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---|",
    ...pilotMarkets.map(
      (market) =>
        `| ${markdownEscape(market.district)} | \`${market.marketId}\` | ${markdownEscape(market.marketName)} | ${market.researchPriority} | ${market.bakeryMarketImportance} | ${market.submarketCount} | ${market.nodeCount} | ${market.administrativeDongCandidates.length} | ${market.officialMarketCandidates.length} | \`${market.spatialStatus.geometryStatus}\` |`,
    ),
    "",
    "## 4. Crosswalk 자동검증 결과",
    "",
    "| 검증 항목 | 전체 | Pilot 25 | 결과 |",
    "|---|---:|---:|---|",
    `| Market ↔ 행정동 행 | ${administrativeDongCrosswalk.length} | ${pilotAdministrativeDongCrosswalk.length} | Market ID 누락 ${missingAdminCrosswalkMarketIds.length}, 행정동 ID 누락 ${missingAdministrativeDongIds.length}, 참조 geometry 누락 ${adminMissingReferenceGeometryCount} |`,
    `| Market ↔ 공식상권 행 | ${officialMarketCrosswalk.length} | ${pilotOfficialMarketCrosswalk.length} | Market ID 누락 ${missingOfficialCrosswalkMarketIds.length}, 공식상권 ID 누락 ${missingOfficialAreaCodes.length}, 참조 geometry 누락 ${officialMissingReferenceGeometryCount} |`,
    `| 공식상권 같은 자치구 | ${officialSameDistrictCount}/${officialMarketCrosswalk.length} | ${pilotOfficialSameDistrictCount}/${pilotOfficialMarketCrosswalk.length} | 불일치 ${officialDifferentDistrictCount}, 확인 불가 ${officialDistrictUnknownCount} |`,
    `| Market ↔ Grid 행 | ${livingGridCrosswalk.length} | 0 | 미완성 |`,
    `| 저장된 overlap 값 | 행정동 ${adminOverlapPopulatedCount}, 공식상권 면적 ${officialOverlapAreaPopulatedCount} | 0 | FRAMEONE Polygon 부재로 계산 불가 |`,
    "",
    "행정동 참조 GeoJSON의 `gu`, `gu_code`, `adm_nm` 값이 비어 있어 행정동 후보의 같은 자치구 여부는 자동검증할 수 없다. 모든 기존 Crosswalk 관계는 `manual_review`이며 상태를 승격하지 않았다.",
    "",
    "## 5. EPSG 검증",
    "",
    `- 공식상권 ${officialMarketsGeoJson.features.length}개 모두 속성상 원천 CRS는 \`EPSG:5181\`, 출력 geometry CRS는 \`EPSG:4326\`이다.`,
    `- \`center_x\` 범위: ${Math.min(...officialCenterXs)}–${Math.max(...officialCenterXs)}`,
    `- \`center_y\` 범위: ${Math.min(...officialCenterYs)}–${Math.max(...officialCenterYs)}`,
    "- `center_x`, `center_y`는 WGS84 경위도로 직접 사용할 수 없다.",
    "- 필요 시 수집/Adapter 단계에서 `EPSG:5181 → EPSG:4326` 변환이 필요하다. 현재 프로젝트에는 변환 라이브러리가 없으며 이번 작업에서는 설치·변환하지 않았다. 향후 후보는 `proj4` 등 검증된 좌표변환기다.",
    "",
    "## 6. 수동 검토 및 부족 데이터",
    "",
    "- Pilot Market 25개의 검증된 Polygon 또는 대표점",
    "- Pilot Submarket 66개의 검증된 Polygon 또는 대표점",
    "- Pilot Node 117개의 주소, EPSG:4326 좌표, 출처와 확인일",
    "- 행정동 후보의 자치구 검증에 필요한 행정동 코드-명칭-자치구 매핑",
    "- Market Polygon 확보 후 계산할 Crosswalk overlap 면적과 비율",
    "- Market ↔ 생활인구 Grid Crosswalk",
    "- `manual_review` 후보의 사람 검토 기록과 승인 기준",
    "",
    "## 7. 지도 입력 규칙",
    "",
    "- `verified_point`만 FRAMEONE 점으로, `verified_geometry`만 FRAMEONE 경계로 표시한다.",
    "- `verified_reference`는 서울시 참조 레이어로만 표시하고 FRAMEONE 경계로 치환하지 않는다.",
    "- `candidate`는 검토 후보로 명시하며 확정 분석이나 공간 가중치 계산에 사용하지 않는다.",
    "- `text_only`는 지도 geometry 없이 hierarchy와 `경계 확인 필요` 상태만 표시한다.",
    "",
    "## 8. 무결성 검증",
    "",
    `- District / Market / Submarket / Node: ${districts.length} / ${markets.length} / ${submarkets.length} / ${nodes.length}`,
    `- Pilot Market ID 중복: ${duplicateValues(pilotMarkets.map((market) => market.marketId)).length}`,
    `- Pilot Submarket ID 중복: ${duplicateValues(pilotSubmarkets.map((submarket) => submarket.submarketId)).length}`,
    `- Pilot Node ID 중복: ${duplicateValues(pilotNodes.map((node) => node.nodeId)).length}`,
    `- 부모 연결 오류: ${invalidSubmarketParentIds.length + invalidNodeParentIds.length}`,
    `- 존재하지 않는 Crosswalk 참조 ID: ${missingAdministrativeDongIds.length + missingOfficialAreaCodes.length + missingLivingGridIds.length}`,
    `- \`markets.v1.geojson\`에서 canonical hierarchy에 없는 ID: ${programMarketGeoJsonExtraIds.length} (${programMarketGeoJsonExtraIds.join(", ")})`,
    `- canonical hierarchy에는 있으나 \`markets.v1.geojson\`에 없는 ID: ${programMarketGeoJsonMissingHierarchyIds.length} (${programMarketGeoJsonMissingHierarchyIds.join(", ")})`,
    "- 임의 좌표 생성: 0",
    "- 임의 geometry 생성: 0",
    "",
  ];

  return {
    datasetText: `${JSON.stringify(dataset, null, 2)}\n`,
    reportText: `${reportLines.join("\n").replace(/\n+$/, "")}\n`,
    summary: dataset.summary,
    crosswalkValidation: dataset.crosswalkValidation,
  };
}

function writeOrVerify(path, expected, label) {
  if (shouldWrite) {
    writeFileSync(path, expected, "utf8");
    return;
  }

  assert(existsSync(path), `${label}이 없습니다. --write로 생성하십시오.`);
  assert(readText(path) === expected, `${label}이 원천 데이터와 일치하지 않습니다.`);
}

const artifacts = buildArtifacts();
writeOrVerify(outputJsonPath, artifacts.datasetText, "Pilot 공간 준비 JSON");
writeOrVerify(outputReportPath, artifacts.reportText, "Pilot 공간 준비 리포트");

const mode = shouldWrite ? "생성" : "검증";
console.log(`PASS: Pilot 25 공간 준비 산출물 ${mode} 완료`);
console.log(
  `Pilot: Market ${artifacts.summary.pilot.marketCount}, Submarket ${artifacts.summary.pilot.submarketCount}, Node ${artifacts.summary.pilot.nodeCount}`,
);
console.log(
  `Crosswalk: 행정동 ${artifacts.crosswalkValidation.administrativeDong.pilotRowCount}, 공식상권 ${artifacts.crosswalkValidation.officialMarket.pilotRowCount}, Grid ${artifacts.crosswalkValidation.livingGrid.pilotRowCount}`,
);
console.log("임의 좌표/geometry 생성: 0");
