import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const validationDirectory = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(validationDirectory, "..");
const geoDirectory = join(dataRoot, "09_GEO");
const repositoryRoot = join(dataRoot, "..", "..", "..");
const shouldWrite = process.argv.includes("--write");

const outputPaths = {
  officialMarket: join(
    validationDirectory,
    "OFFICIAL_MARKET_CODE_COMPATIBILITY.json",
  ),
  livingGrid: join(validationDirectory, "LIVING_GRID_KEY_COVERAGE.json"),
  administrativeDong: join(
    validationDirectory,
    "ADMIN_DONG_ATTRIBUTE_AUDIT.json",
  ),
  report: join(validationDirectory, "STEP4A_DATA_COMPATIBILITY_REPORT.md"),
};

const sourcePaths = {
  hierarchy: join(dataRoot, "MARKET_HIERARCHY.json"),
  officialMarkets: join(geoDirectory, "OFFICIAL_SEOUL_MARKETS.geojson"),
  administrativeDongs: join(geoDirectory, "ADMIN_DONG.geojson"),
  livingGrid: join(geoDirectory, "LIVING_GRID_250M.geojson"),
  frameoneMarkets: join(geoDirectory, "FRAMEONE_MARKETS.geojson"),
  frameoneSubmarkets: join(geoDirectory, "FRAMEONE_SUBMARKETS.geojson"),
  nodes: join(geoDirectory, "NODES.geojson"),
  officialMarketCrosswalk: join(
    geoDirectory,
    "MARKET_OFFICIAL_CROSSWALK.csv",
  ),
  administrativeDongCrosswalk: join(
    geoDirectory,
    "MARKET_ADMIN_DONG_CROSSWALK.csv",
  ),
  livingGridCrosswalk: join(
    geoDirectory,
    "MARKET_LIVING_GRID_CROSSWALK.csv",
  ),
};

const protectedPaths = {
  consultations: join(repositoryRoot, "data", "consultations.json"),
  diagnosisDraftBackup: join(
    repositoryRoot,
    "data",
    "diagnosis-drafts.json.backup",
  ),
};

const expectedSourceHashes = {
  hierarchy: "67ac5a5237b3893fc78e4fd67a7b97b4cd2774a69b5c6a7eb1bf2a6f8266e102",
  officialMarkets:
    "5793cced1936360ce93afd301d53ec4af30bac94844d969b75ad08038c407bb6",
  administrativeDongs:
    "b533e780608b53b10b9e7912d7f6cb7ec4ce712285abffc13ff06e7c68a31d5c",
  livingGrid:
    "b591c6e6379b7ba962d7d6ef5494ffd0dee519ddcae7ec69cbd8b7f86a07e8ad",
  officialMarketCrosswalk:
    "a2cb9107f51fc1522943544f9c2194a54bf859b99d2cab402ac842577d1fe546",
  administrativeDongCrosswalk:
    "1d00d368457c85999316116a2c3a1ead4cc12b81af9ac8259103f7a57c369884",
  livingGridCrosswalk:
    "5637ffe2139895e5ad3d7db029402314a6c83db9d30d33a3d8f530b2d2dd08b3",
};

const expectedProtectedHashes = {
  consultations:
    "dac9b0655fe45d0220f8a40518648f9b9063e90aa67bc3714a788182437307e3",
  diagnosisDraftBackup:
    "f088ddd01bb24bbcf00e159eb49033e9746ca246efe6668a88ea11197d953037",
};

const officialSources = {
  officialMarketGeometry:
    "https://data.seoul.go.kr/dataList/OA-15560/S/1/datasetView.do",
  officialMarketMethodology: "https://golmok.seoul.go.kr/introduce.do",
  officialMarketMetrics: [
    "https://data.seoul.go.kr/dataList/OA-15577/S/1/datasetView.do",
    "https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do",
    "https://data.seoul.go.kr/dataList/OA-15568/S/1/datasetView.do",
    "https://data.seoul.go.kr/dataList/OA-15569/S/1/datasetView.do",
  ],
  livingPopulation:
    "https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do",
  livingPopulationTransition:
    "https://data.seoul.go.kr/together/notice/boardView.do?seq=721010a1522630fbf7a78d381a8326ee",
  administrativeDongGeometry:
    "https://data.seoul.go.kr/dataList/OA-22160/S/1/datasetView.do",
  seoulAdministrativeDongCodes: "https://golmok.seoul.go.kr/introduce.do",
  administrativeStandardCodes: "https://www.code.go.kr/indexFrame.do",
  sgisBoundary:
    "https://sgis.mods.go.kr/developer/html/newOpenApi/api/dataApi/addressBoundary.html",
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

function relativeToRepository(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
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

function countBy(items, getValue) {
  const counts = {};
  for (const item of items) {
    const value = getValue(item);
    const key = isBlank(value) ? "(missing)" : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
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
    } else if (character === '"') {
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

function walkFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "12_VALIDATION") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(path));
    } else if (entry.isFile()) {
      result.push(path);
    }
  }
  return result;
}

function findMetricCandidates(kind) {
  const dataExtensions = new Set([
    ".csv",
    ".json",
    ".ndjson",
    ".parquet",
    ".xlsx",
    ".xls",
    ".zip",
  ]);
  const patterns =
    kind === "officialMarket"
      ? /(oa-1556[89]|oa-1557[27]|sales|stores?|foot|work|metric|표준단위|추정매출|점포|길단위인구|직장인구)/i
      : /(oa-22784|250[_-]?local[_-]?resd|living.*population|population.*living|생활인구)/i;

  return walkFiles(dataRoot)
    .filter((path) => dataExtensions.has(extname(path).toLowerCase()))
    .filter((path) => !path.toLowerCase().endsWith(".geojson"))
    .filter((path) => !path.toLowerCase().includes("crosswalk"))
    .filter((path) => patterns.test(relativeToRepository(path)))
    .map(relativeToRepository)
    .sort();
}

function hasGeometry(feature) {
  return Boolean(feature?.geometry?.type && feature?.geometry?.coordinates);
}

function visitCoordinatePairs(coordinates, visitor) {
  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    visitor(coordinates[0], coordinates[1]);
    return;
  }
  if (Array.isArray(coordinates)) {
    for (const child of coordinates) {
      visitCoordinatePairs(child, visitor);
    }
  }
}

function geometryAudit(features) {
  let coordinatePairCount = 0;
  let invalidCoordinatePairCount = 0;
  const bounds = {
    minimumLongitude: Number.POSITIVE_INFINITY,
    minimumLatitude: Number.POSITIVE_INFINITY,
    maximumLongitude: Number.NEGATIVE_INFINITY,
    maximumLatitude: Number.NEGATIVE_INFINITY,
  };

  for (const feature of features) {
    if (!hasGeometry(feature)) {
      continue;
    }
    visitCoordinatePairs(feature.geometry.coordinates, (longitude, latitude) => {
      coordinatePairCount += 1;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        invalidCoordinatePairCount += 1;
        return;
      }
      bounds.minimumLongitude = Math.min(bounds.minimumLongitude, longitude);
      bounds.minimumLatitude = Math.min(bounds.minimumLatitude, latitude);
      bounds.maximumLongitude = Math.max(bounds.maximumLongitude, longitude);
      bounds.maximumLatitude = Math.max(bounds.maximumLatitude, latitude);
    });
  }

  const geometryPresentCount = features.filter(hasGeometry).length;
  return {
    geometryPresentCount,
    geometryMissingCount: features.length - geometryPresentCount,
    geometryTypes: countBy(features, (feature) => feature.geometry?.type),
    coordinatePairCount,
    invalidCoordinatePairCount,
    outputBounds:
      coordinatePairCount === 0
        ? null
        : Object.fromEntries(
            Object.entries(bounds).map(([key, value]) => [
              key,
              Number(value.toFixed(7)),
            ]),
          ),
  };
}

function featureKeyAudit(features, keyField) {
  const keys = features
    .map((feature) => feature.properties?.[keyField])
    .filter((value) => !isBlank(value))
    .map(String);
  return {
    keyField,
    nonNullCount: keys.length,
    nullCount: features.length - keys.length,
    uniqueCount: new Set(keys).size,
    duplicateCount: duplicateValues(keys).length,
    duplicateValues: duplicateValues(keys),
  };
}

function nonNullCount(features, field) {
  return features.filter((feature) => !isBlank(feature.properties?.[field]))
    .length;
}

function versionAudit(features) {
  return {
    sourceIds: countBy(features, (feature) => feature.properties?.source_id),
    sourceCrs: countBy(features, (feature) => feature.properties?.source_crs),
    outputCrs: countBy(features, (feature) => feature.properties?.output_crs),
    geometryVersions: countBy(
      features,
      (feature) => feature.properties?.geometry_version,
    ),
    statuses: countBy(features, (feature) => feature.properties?.status),
  };
}

function flattenHierarchy(hierarchy) {
  const districts = hierarchy.districts;
  const markets = districts.flatMap((district) => district.markets);
  const submarkets = markets.flatMap((market) => market.submarkets);
  const nodes = submarkets.flatMap((submarket) => submarket.nodes);
  return { districts, markets, submarkets, nodes };
}

function buildAdministrativeMappingAudit(adminFeatures, officialFeatures) {
  const adminCodes = new Set(
    adminFeatures.map((feature) => String(feature.properties.adm_cd)),
  );
  const referenceByCode = new Map();
  for (const feature of officialFeatures) {
    const properties = feature.properties;
    const code = String(properties.adm_cd);
    if (!referenceByCode.has(code)) {
      referenceByCode.set(code, {
        names: new Set(),
        areaGuCodes: new Set(),
        areaGuNames: new Set(),
      });
    }
    const reference = referenceByCode.get(code);
    if (!isBlank(properties.adm_nm)) {
      reference.names.add(String(properties.adm_nm));
    }
    if (!isBlank(properties.gu_code)) {
      reference.areaGuCodes.add(String(properties.gu_code));
    }
    if (!isBlank(properties.gu)) {
      reference.areaGuNames.add(String(properties.gu));
    }
  }

  const referenceCodes = new Set(referenceByCode.keys());
  const intersectionCodes = [...adminCodes].filter((code) =>
    referenceCodes.has(code),
  );
  const missingReferenceCodes = [...adminCodes]
    .filter((code) => !referenceCodes.has(code))
    .sort();
  const referenceCodesOutsideGeometry = [...referenceCodes]
    .filter((code) => !adminCodes.has(code))
    .sort();
  const nameConflictCodes = [...referenceByCode.entries()]
    .filter(([, reference]) => reference.names.size > 1)
    .map(([code]) => code)
    .sort();
  const areaGuConflictCodes = [...referenceByCode.entries()]
    .filter(
      ([, reference]) =>
        reference.areaGuCodes.size > 1 || reference.areaGuNames.size > 1,
    )
    .map(([code]) => code)
    .sort();

  return {
    candidateSource: relativeToRepository(sourcePaths.officialMarkets),
    candidateSourceRole:
      "같은 서울 공식상권 레이어의 adm_cd/adm_nm 속성을 이용한 보완 후보이며 ADMIN_DONG 원본을 자동 수정하지 않는다.",
    geometryCodeCount: adminCodes.size,
    referenceCodeCount: referenceCodes.size,
    intersectingCodeCount: intersectionCodes.length,
    geometryCodeMissingReferenceCount: missingReferenceCodes.length,
    geometryCodesMissingReference: missingReferenceCodes,
    referenceCodeOutsideGeometryCount: referenceCodesOutsideGeometry.length,
    referenceCodesOutsideGeometry,
    nameConflictCodeCount: nameConflictCodes.length,
    nameConflictCodes,
    areaGuConflictCodeCount: areaGuConflictCodes.length,
    areaGuConflictCodes,
    note:
      "official_area의 gu/gu_code는 상권 자체의 자치구 속성이므로 행정동 자치구를 행 단위로 확정하는 데 직접 사용할 수 없다.",
  };
}

function buildArtifacts() {
  for (const [label, path] of Object.entries({
    ...sourcePaths,
    ...protectedPaths,
  })) {
    assert(existsSync(path), `필수 파일 없음 (${label}): ${path}`);
  }

  for (const [label, expected] of Object.entries(expectedSourceHashes)) {
    assert(
      sha256(sourcePaths[label]) === expected,
      `기존 원천 파일 SHA-256 변경 감지: ${relativeToRepository(sourcePaths[label])}`,
    );
  }
  for (const [label, expected] of Object.entries(expectedProtectedHashes)) {
    assert(
      sha256(protectedPaths[label]) === expected,
      `보호 파일 SHA-256 변경 감지: ${relativeToRepository(protectedPaths[label])}`,
    );
  }

  const hierarchy = flattenHierarchy(readJson(sourcePaths.hierarchy));
  assert(hierarchy.districts.length === 25, "District 개수는 25여야 합니다.");
  assert(hierarchy.markets.length === 156, "Market 개수는 156이어야 합니다.");
  assert(
    hierarchy.submarkets.length === 382,
    "Submarket 개수는 382여야 합니다.",
  );
  assert(hierarchy.nodes.length === 763, "Node 개수는 763이어야 합니다.");

  const officialMarketGeoJson = readJson(sourcePaths.officialMarkets);
  const administrativeDongGeoJson = readJson(sourcePaths.administrativeDongs);
  const livingGridGeoJson = readJson(sourcePaths.livingGrid);
  const frameoneMarketGeoJson = readJson(sourcePaths.frameoneMarkets);
  const frameoneSubmarketGeoJson = readJson(sourcePaths.frameoneSubmarkets);
  const nodeGeoJson = readJson(sourcePaths.nodes);
  const officialMarketCrosswalk = parseCsv(
    readText(sourcePaths.officialMarketCrosswalk),
  );
  const administrativeDongCrosswalk = parseCsv(
    readText(sourcePaths.administrativeDongCrosswalk),
  );
  const livingGridCrosswalk = parseCsv(
    readText(sourcePaths.livingGridCrosswalk),
  );

  const officialFeatures = officialMarketGeoJson.features;
  const administrativeFeatures = administrativeDongGeoJson.features;
  const livingGridFeatures = livingGridGeoJson.features;
  const officialKeyAudit = featureKeyAudit(
    officialFeatures,
    "official_area_code",
  );
  const administrativeKeyAudit = featureKeyAudit(
    administrativeFeatures,
    "adm_cd",
  );
  const livingGridKeyAudit = featureKeyAudit(livingGridFeatures, "grid_id");
  const livingGridGidAudit = featureKeyAudit(livingGridFeatures, "gid");

  assert(officialFeatures.length === 1650, "공식상권 feature는 1,650개여야 합니다.");
  assert(officialKeyAudit.nullCount === 0, "공식상권 코드 누락이 있습니다.");
  assert(officialKeyAudit.duplicateCount === 0, "공식상권 코드 중복이 있습니다.");
  assert(administrativeFeatures.length === 425, "행정동 feature는 425개여야 합니다.");
  assert(administrativeKeyAudit.nullCount === 0, "행정동 코드 누락이 있습니다.");
  assert(administrativeKeyAudit.duplicateCount === 0, "행정동 코드 중복이 있습니다.");
  assert(livingGridFeatures.length === 10125, "생활인구 Grid feature는 10,125개여야 합니다.");
  assert(livingGridKeyAudit.nullCount === 0, "Grid ID 누락이 있습니다.");
  assert(livingGridKeyAudit.duplicateCount === 0, "Grid ID 중복이 있습니다.");
  assert(livingGridGidAudit.nullCount === 0, "Grid GID 누락이 있습니다.");
  assert(livingGridGidAudit.duplicateCount === 0, "Grid GID 중복이 있습니다.");

  const officialGeometryAudit = geometryAudit(officialFeatures);
  const administrativeGeometryAudit = geometryAudit(administrativeFeatures);
  const livingGridGeometryAudit = geometryAudit(livingGridFeatures);
  assert(
    officialGeometryAudit.geometryPresentCount === 1650,
    "공식상권 geometry 누락이 있습니다.",
  );
  assert(
    administrativeGeometryAudit.geometryPresentCount === 425,
    "행정동 geometry 누락이 있습니다.",
  );
  assert(
    livingGridGeometryAudit.geometryPresentCount === 10125,
    "Grid geometry 누락이 있습니다.",
  );
  assert(
    officialGeometryAudit.invalidCoordinatePairCount === 0 &&
      administrativeGeometryAudit.invalidCoordinatePairCount === 0 &&
      livingGridGeometryAudit.invalidCoordinatePairCount === 0,
    "비정상 좌표가 있습니다.",
  );

  const frameoneGeometryCounts = {
    market: frameoneMarketGeoJson.features.filter(hasGeometry).length,
    submarket: frameoneSubmarketGeoJson.features.filter(hasGeometry).length,
    node: nodeGeoJson.features.filter(hasGeometry).length,
  };
  assert(
    Object.values(frameoneGeometryCounts).every((count) => count === 0),
    "FRAMEONE geometry가 새로 생성되었거나 기존 기준과 달라졌습니다.",
  );
  assert(
    frameoneMarketGeoJson.features.length === 156 &&
      frameoneSubmarketGeoJson.features.length === 382 &&
      nodeGeoJson.features.length === 763,
    "FRAMEONE 공간 참조 feature 개수가 hierarchy와 다릅니다.",
  );

  const officialRelationTypes = countBy(
    officialMarketCrosswalk,
    (row) => row.relation_type,
  );
  const administrativeRelationTypes = countBy(
    administrativeDongCrosswalk,
    (row) => row.relation_type,
  );
  assert(
    officialMarketCrosswalk.length === 863 &&
      officialRelationTypes.manual_review === 863,
    "공식상권 Crosswalk 상태가 기존 manual_review 기준과 다릅니다.",
  );
  assert(
    administrativeDongCrosswalk.length === 458 &&
      administrativeRelationTypes.manual_review === 458,
    "행정동 Crosswalk 상태가 기존 manual_review 기준과 다릅니다.",
  );
  assert(livingGridCrosswalk.length === 0, "Grid Crosswalk가 새로 생성되었습니다.");

  const officialMetricCandidates = findMetricCandidates("officialMarket");
  const livingMetricCandidates = findMetricCandidates("livingGrid");
  const officialMetricStatus =
    officialMetricCandidates.length === 0 ? "SOURCE_MISSING" : "NEEDS_REVIEW";
  const livingMetricStatus =
    livingMetricCandidates.length === 0 ? "SOURCE_MISSING" : "NEEDS_REVIEW";

  const officialMarketArtifact = {
    schemaVersion: "1.0.0",
    auditedAt: "2026-08-28",
    status: officialMetricStatus,
    compatibilityStatus: "NEEDS_REVIEW",
    directJoinAllowed: false,
    geometry: {
      path: relativeToRepository(sourcePaths.officialMarkets),
      featureCount: officialFeatures.length,
      key: officialKeyAudit,
      geometry: officialGeometryAudit,
      attributes: {
        officialAreaNameNonNullCount: nonNullCount(
          officialFeatures,
          "official_area_name",
        ),
        officialAreaTypeNonNullCount: nonNullCount(
          officialFeatures,
          "official_area_type",
        ),
        officialAreaTypeCounts: countBy(
          officialFeatures,
          (feature) => feature.properties.official_area_type,
        ),
      },
      version: versionAudit(officialFeatures),
      sha256: sha256(sourcePaths.officialMarkets),
    },
    metricSource: {
      status: officialMetricStatus,
      localSearchRoot: relativeToRepository(dataRoot),
      localCandidateFiles: officialMetricCandidates,
      requiredMinimumFields: [
        "기준년코드",
        "기준분기코드",
        "상권구분코드",
        "상권코드",
        "상권코드명",
      ],
      officialSourceCandidates: officialSources.officialMarketMetrics,
    },
    comparison: {
      geometryCodeCount: officialKeyAudit.uniqueCount,
      metricCodeCount: null,
      intersectingCodeCount: null,
      geometryOnlyCodeCount: null,
      metricOnlyCodeCount: null,
      nameMatchCount: null,
      nameMismatchCount: null,
      typeMatchCount: null,
      typeMismatchCount: null,
      reason:
        "2024+ 지표 원본이 저장소에 없어 교집합·차집합·명칭·유형 호환성을 계산하지 않았다.",
    },
    evidence: {
      geometrySource: officialSources.officialMarketGeometry,
      currentMethodology: officialSources.officialMarketMethodology,
      localGeometryVersion: "SEOUL_MARKET_SHP_2023-10-20",
      methodologySpatialBasis: "2022 표준단위구역 기반",
    },
  };

  const livingGridArtifact = {
    schemaVersion: "1.0.0",
    auditedAt: "2026-08-28",
    status: livingMetricStatus,
    joinAllowed: false,
    geometry: {
      path: relativeToRepository(sourcePaths.livingGrid),
      featureCount: livingGridFeatures.length,
      key: livingGridKeyAudit,
      secondaryKey: livingGridGidAudit,
      cellXNonNullCount: nonNullCount(livingGridFeatures, "cell_x"),
      cellYNonNullCount: nonNullCount(livingGridFeatures, "cell_y"),
      geometry: livingGridGeometryAudit,
      version: versionAudit(livingGridFeatures),
      sha256: sha256(sourcePaths.livingGrid),
    },
    metricSource: {
      status: livingMetricStatus,
      localSearchRoot: relativeToRepository(dataRoot),
      localCandidateFiles: livingMetricCandidates,
      expectedJoinKey: "CELL_ID",
      officialSource: officialSources.livingPopulation,
      transitionNotice: officialSources.livingPopulationTransition,
    },
    coverage: {
      geometryKeyCount: livingGridKeyAudit.uniqueCount,
      metricRowCount: null,
      metricKeyCount: null,
      matchedKeyCount: null,
      geometryOnlyKeyCount: null,
      metricOnlyKeyCount: null,
      coverageRatio: null,
      duplicateMetricKeyCount: null,
      nullMetricKeyCount: null,
      reason:
        "OA-22784 생활인구 수치 파일/API 응답이 저장소에 없어 coverage를 0으로 치환하지 않고 null로 유지했다.",
    },
    aggregationPerformed: false,
  };

  const administrativeMappingAudit = buildAdministrativeMappingAudit(
    administrativeFeatures,
    officialFeatures,
  );
  const administrativeDongArtifact = {
    schemaVersion: "1.0.0",
    auditedAt: "2026-08-28",
    status: "NEEDS_REVIEW",
    geometry: {
      path: relativeToRepository(sourcePaths.administrativeDongs),
      featureCount: administrativeFeatures.length,
      key: administrativeKeyAudit,
      geometry: administrativeGeometryAudit,
      version: versionAudit(administrativeFeatures),
      sha256: sha256(sourcePaths.administrativeDongs),
    },
    attributes: {
      administrativeDongName: {
        field: "adm_nm",
        nonNullCount: nonNullCount(administrativeFeatures, "adm_nm"),
        nullCount:
          administrativeFeatures.length -
          nonNullCount(administrativeFeatures, "adm_nm"),
      },
      guCode: {
        field: "gu_code",
        nonNullCount: nonNullCount(administrativeFeatures, "gu_code"),
        nullCount:
          administrativeFeatures.length -
          nonNullCount(administrativeFeatures, "gu_code"),
      },
      guName: {
        field: "gu",
        nonNullCount: nonNullCount(administrativeFeatures, "gu"),
        nullCount:
          administrativeFeatures.length - nonNullCount(administrativeFeatures, "gu"),
      },
      administrativeCodeLengths: countBy(
        administrativeFeatures,
        (feature) => String(feature.properties.adm_cd).length,
      ),
      fiveDigitPrefixes: {
        uniqueCount: new Set(
          administrativeFeatures.map((feature) =>
            String(feature.properties.adm_cd).slice(0, 5),
          ),
        ).size,
        interpretation:
          "구 코드 후보 구조만 확인했으며 공식 코드표 대조 전에는 속성으로 확정하지 않는다.",
      },
    },
    internalOfficialReferenceCandidate: administrativeMappingAudit,
    officialReferenceCandidates: [
      {
        source: officialSources.seoulAdministrativeDongCodes,
        expectedContent: "서울시 상권분석서비스 자치구-행정동 코드 PDF",
        accessStatus: "NEEDS_REVIEW",
      },
      {
        source: officialSources.sgisBoundary,
        expectedFields: ["adm_cd", "adm_nm", "sgg_cd", "sgg_nm", "base_year"],
        accessStatus: "KEY_REQUIRED",
      },
      {
        source: officialSources.administrativeStandardCodes,
        expectedContent: "행정동 코드 및 법정동-행정동 매핑",
        accessStatus: "DOWNLOAD_OR_LINKAGE_REVIEW_REQUIRED",
      },
    ],
    automaticEnrichmentPerformed: false,
  };

  const hierarchySummary = {
    districtCount: hierarchy.districts.length,
    marketCount: hierarchy.markets.length,
    submarketCount: hierarchy.submarkets.length,
    nodeCount: hierarchy.nodes.length,
  };
  const reportLines = [
    "# STEP 4A DATA COMPATIBILITY REPORT",
    "",
    "기준일: 2026-08-28",
    "",
    "## 1. 판정",
    "",
    "- STEP 4A 로컬 호환성 점검과 재현 가능한 검증 산출물 작성은 완료했다.",
    "- 공식상권 2024+ 지표 원본과 OA-22784 생활인구 수치 원본은 저장소에서 찾지 못했다. 두 호환성 검사는 `SOURCE_MISSING`이며 `PASS`가 아니다.",
    "- 행정동 레이어의 명칭·자치구 속성이 모두 비어 있어 `NEEDS_REVIEW`다.",
    "- 기존 데이터, geometry, Crosswalk, 프로그램 코드에는 손대지 않았다.",
    "",
    "## 2. 공식상권 geometry와 2024+ 지표",
    "",
    `- geometry: ${officialFeatures.length}개, 공식상권코드 고유 ${officialKeyAudit.uniqueCount}개, 누락 ${officialKeyAudit.nullCount}, 중복 ${officialKeyAudit.duplicateCount}`,
    `- geometry 유형: Polygon ${officialGeometryAudit.geometryTypes.Polygon ?? 0}, MultiPolygon ${officialGeometryAudit.geometryTypes.MultiPolygon ?? 0}`,
    "- 원천/출력 CRS: `EPSG:5181` → `EPSG:4326`",
    "- local geometry version: `SEOUL_MARKET_SHP_2023-10-20`",
    "- 현재 서울시 상권분석서비스 설명은 2022 표준단위구역을 상권 구성 기반으로 명시한다.",
    `- 2024+ 지표 후보 파일: ${officialMetricCandidates.length}개`,
    "- 지표 원본이 없으므로 geometry 코드 수 외 metric 코드 수, 교집합, 차집합, 명칭/유형 일치는 모두 `null`이다.",
    "- 결론: 코드가 같다고 가정하는 직접 조인은 금지하고, 지표 파일 확보 뒤 기준년·분기·상권구분코드·상권코드·명칭·유형을 비교해야 한다.",
    "",
    "## 3. 생활인구 Grid key coverage",
    "",
    `- geometry: ${livingGridFeatures.length}개, grid_id 고유 ${livingGridKeyAudit.uniqueCount}개, 누락 ${livingGridKeyAudit.nullCount}, 중복 ${livingGridKeyAudit.duplicateCount}`,
    `- 보조 GID: 고유 ${livingGridGidAudit.uniqueCount}개, 누락 ${livingGridGidAudit.nullCount}, 중복 ${livingGridGidAudit.duplicateCount}`,
    "- 원천/출력 CRS: `EPSG:5179` → `EPSG:4326`",
    "- local geometry version: `SEOUL_250M_GRID_SHP_2025-05-12`",
    `- OA-22784 수치 후보 파일: ${livingMetricCandidates.length}개`,
    "- 수치 원본이 없으므로 metric row/key, matched/unmatched key, coverage ratio는 모두 `null`이다. 미확인을 0으로 기록하지 않았다.",
    "- OA-22784 수치 원본을 확보한 뒤 `CELL_ID`를 문자열로 보존하여 `grid_id`와 비교해야 한다.",
    "",
    "## 4. 행정동 attribute audit",
    "",
    `- geometry: ${administrativeFeatures.length}개, adm_cd 고유 ${administrativeKeyAudit.uniqueCount}개, 누락 ${administrativeKeyAudit.nullCount}, 중복 ${administrativeKeyAudit.duplicateCount}`,
    `- adm_nm: 값 있음 ${nonNullCount(administrativeFeatures, "adm_nm")}, 누락 ${administrativeFeatures.length - nonNullCount(administrativeFeatures, "adm_nm")}`,
    `- gu_code: 값 있음 ${nonNullCount(administrativeFeatures, "gu_code")}, 누락 ${administrativeFeatures.length - nonNullCount(administrativeFeatures, "gu_code")}`,
    `- gu: 값 있음 ${nonNullCount(administrativeFeatures, "gu")}, 누락 ${administrativeFeatures.length - nonNullCount(administrativeFeatures, "gu")}`,
    `- 공식상권 레이어의 adm_cd/adm_nm 후보로 ${administrativeMappingAudit.intersectingCodeCount}/${administrativeMappingAudit.geometryCodeCount}개 코드를 참조할 수 있다. 미참조 ${administrativeMappingAudit.geometryCodeMissingReferenceCount}개, 명칭 충돌 ${administrativeMappingAudit.nameConflictCodeCount}개다.`,
    `- 공식상권의 area-level 자치구가 행정동 코드와 어긋나는 후보 ${administrativeMappingAudit.areaGuConflictCodeCount}개가 있어 이를 행정동 자치구로 복사하지 않는다.`,
    "- 보완 후보는 서울시 자치구-행정동 코드 PDF, SGIS 기준연도 경계 API, 행정안전부 행정표준코드관리시스템이다.",
    "",
    "## 5. 기존 데이터 불변 검증",
    "",
    `- hierarchy: ${hierarchySummary.districtCount} / ${hierarchySummary.marketCount} / ${hierarchySummary.submarketCount} / ${hierarchySummary.nodeCount}`,
    `- FRAMEONE non-null geometry: Market ${frameoneGeometryCounts.market}, Submarket ${frameoneGeometryCounts.submarket}, Node ${frameoneGeometryCounts.node}`,
    `- Crosswalk: 공식상권 ${officialMarketCrosswalk.length}개 모두 manual_review, 행정동 ${administrativeDongCrosswalk.length}개 모두 manual_review, Grid ${livingGridCrosswalk.length}개`,
    "- Crosswalk 상태 승격: 0",
    "- 신규 geometry/좌표 생성: 0",
    "- 생활인구 수치 집계·상권 점수 계산: 0",
    "- 보호 상담 데이터 SHA-256: 작업 시작 기준과 동일",
    "",
    "## 6. 다음 단계 조건",
    "",
    "STEP 4B에서 가능한 범위는 원천 스냅샷 수집 어댑터의 입력 계약·스키마 검증까지다. 공식 데이터 파일/API 응답, 기준시점, 서비스 코드, 필드가 확보되기 전에는 실제 적재 성공이나 공간 조인을 선언할 수 없다.",
    "",
    "STEP 4C 전에 반드시 필요한 데이터:",
    "",
    "- 동일 기준분기의 2024+ 공식상권 지표 원본과 상권코드·명칭·구분코드",
    "- OA-22784 생활인구 수치 원본과 원문 `CELL_ID`",
    "- 425개 행정동 전체의 기준연도 코드·명칭·자치구 코드·자치구명 공식 매핑",
    "- geometry와 지표의 버전 호환성 검토 결과 및 불일치 코드 처리 규칙",
    "- FRAMEONE Polygon 확정 전에는 Market↔Grid 집계 및 overlap 계산 금지",
    "",
    "## 7. 공식 출처",
    "",
    `- 공식상권 geometry: ${officialSources.officialMarketGeometry}`,
    `- 서울시 상권분석서비스 구성 기준: ${officialSources.officialMarketMethodology}`,
    `- 생활인구 250m: ${officialSources.livingPopulation}`,
    `- 생활인구 전환 공지: ${officialSources.livingPopulationTransition}`,
    `- 행정동 geometry: ${officialSources.administrativeDongGeometry}`,
    `- SGIS 행정경계 API: ${officialSources.sgisBoundary}`,
    `- 행정표준코드관리시스템: ${officialSources.administrativeStandardCodes}`,
    "",
  ];

  const artifacts = {
    officialMarket: `${JSON.stringify(officialMarketArtifact, null, 2)}\n`,
    livingGrid: `${JSON.stringify(livingGridArtifact, null, 2)}\n`,
    administrativeDong: `${JSON.stringify(administrativeDongArtifact, null, 2)}\n`,
    report: `${reportLines.join("\n").replace(/\n+$/, "")}\n`,
  };

  return {
    artifacts,
    summary: {
      hierarchy: hierarchySummary,
      officialMarketStatus: officialMetricStatus,
      livingGridStatus: livingMetricStatus,
      administrativeDongStatus: administrativeDongArtifact.status,
      officialMetricCandidates: officialMetricCandidates.length,
      livingMetricCandidates: livingMetricCandidates.length,
    },
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

const protectedHashesBefore = Object.fromEntries(
  Object.entries(protectedPaths).map(([label, path]) => [label, sha256(path)]),
);
const result = buildArtifacts();
writeOrVerify(
  outputPaths.officialMarket,
  result.artifacts.officialMarket,
  "공식상권 호환성 JSON",
);
writeOrVerify(
  outputPaths.livingGrid,
  result.artifacts.livingGrid,
  "생활인구 Grid coverage JSON",
);
writeOrVerify(
  outputPaths.administrativeDong,
  result.artifacts.administrativeDong,
  "행정동 속성 audit JSON",
);
writeOrVerify(outputPaths.report, result.artifacts.report, "STEP 4A 보고서");

for (const [label, path] of Object.entries(protectedPaths)) {
  assert(
    sha256(path) === protectedHashesBefore[label],
    `검증 중 보호 파일 변경 감지: ${relativeToRepository(path)}`,
  );
}

const mode = shouldWrite ? "산출물 생성" : "재현성 검증";
console.log(`STEP4A_AUDIT_COMPLETE: ${mode}`);
console.log(
  `Hierarchy: ${result.summary.hierarchy.districtCount} / ${result.summary.hierarchy.marketCount} / ${result.summary.hierarchy.submarketCount} / ${result.summary.hierarchy.nodeCount}`,
);
console.log(
  `${result.summary.officialMarketStatus}: 2024+ 공식상권 지표 후보 ${result.summary.officialMetricCandidates}개; compatibility PASS 아님`,
);
console.log(
  `${result.summary.livingGridStatus}: 생활인구 수치 후보 ${result.summary.livingMetricCandidates}개; coverage PASS 아님`,
);
console.log(
  `${result.summary.administrativeDongStatus}: 행정동 명칭·자치구 공식 매핑 보완 필요`,
);
console.log("기존 geometry/Crosswalk 상태 승격/생활인구 집계/상권 점수 계산: 0");
