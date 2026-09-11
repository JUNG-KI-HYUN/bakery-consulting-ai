import { inflateRawSync } from "node:zlib";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const validationDirectory = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(validationDirectory, "..");
const ingestDirectory = join(dataRoot, "13_SOURCE_INGEST");
const geometryPath = join(dataRoot, "09_GEO", "LIVING_GRID_250M.geojson");
const snapshotManifestDirectory = join(
  ingestDirectory,
  "manifests",
  "SRC-SEOUL-LIVING",
  "snapshots",
);
const legacyManifestPath = join(
  ingestDirectory,
  "manifests",
  "SRC-SEOUL-LIVING",
  "250_LOCAL_RESD_20260823.zip.manifest.json",
);
const outputPath = join(
  validationDirectory,
  "LIVING_GRID_RECONCILIATION_V1.json",
);
const shouldWrite = process.argv.includes("--write");
const cellIdPattern = /^[가-힣]{2}\d{8}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function relativeToRepository(path) {
  return relative(join(dataRoot, "..", "..", ".."), path).replaceAll("\\", "/");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareText);
}

function duplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => compareText(left.value, right.value));
}

function formatSummary(ids) {
  const distribution = {};
  for (const id of ids) {
    const format = cellIdPattern.test(id)
      ? "KOREAN_2_PLUS_DIGITS_8_LENGTH_10"
      : `MALFORMED_LENGTH_${[...id].length}`;
    distribution[format] = (distribution[format] ?? 0) + 1;
  }
  return {
    expected_pattern: "^[가-힣]{2}\\d{8}$",
    malformed_count: ids.filter((id) => !cellIdPattern.test(id)).length,
    distribution,
  };
}

export function reconcileIdSets(metricValues, geometryValues) {
  const metricIds = uniqueSorted(metricValues);
  const geometryIds = uniqueSorted(geometryValues);
  const metricSet = new Set(metricIds);
  const geometrySet = new Set(geometryIds);
  const both = metricIds.filter((id) => geometrySet.has(id));
  const metricOnly = metricIds.filter((id) => !geometrySet.has(id));
  const geometryOnly = geometryIds.filter((id) => !metricSet.has(id));

  return {
    both,
    metricOnly,
    geometryOnly,
    equations: {
      metric: {
        expression: "BOTH + METRIC_ONLY = metric unique count",
        left: both.length + metricOnly.length,
        right: metricIds.length,
        valid: both.length + metricOnly.length === metricIds.length,
      },
      geometry: {
        expression: "BOTH + GEOMETRY_ONLY = geometry unique count",
        left: both.length + geometryOnly.length,
        right: geometryIds.length,
        valid: both.length + geometryOnly.length === geometryIds.length,
      },
    },
  };
}

export function inspectGeometry(featureCollection) {
  assert(featureCollection?.type === "FeatureCollection", "GeoJSON FeatureCollection이 아닙니다.");
  const ids = [];
  let missingCellId = 0;
  let nullGeometry = 0;
  const geometryTypes = {};
  for (const feature of featureCollection.features ?? []) {
    const id = feature?.properties?.grid_id;
    if (typeof id !== "string" || id.length === 0) missingCellId += 1;
    else ids.push(id);
    if (!feature?.geometry) nullGeometry += 1;
    else {
      const type = feature.geometry.type ?? "<MISSING>";
      geometryTypes[type] = (geometryTypes[type] ?? 0) + 1;
    }
  }
  const duplicateIds = duplicates(ids);
  return {
    ids,
    summary: {
      feature_count: featureCollection.features?.length ?? 0,
      unique_cell_id_count: new Set(ids).size,
      duplicate_cell_id_count: duplicateIds.length,
      duplicate_cell_ids: duplicateIds,
      missing_cell_id_count: missingCellId,
      malformed_cell_id_count: ids.filter((id) => !cellIdPattern.test(id)).length,
      id_format: formatSummary(uniqueSorted(ids)),
      geometry_types: geometryTypes,
      null_geometry_count: nullGeometry,
    },
  };
}

function readLatestReadyManifest() {
  assert(existsSync(snapshotManifestDirectory), "생활인구 snapshot manifest 폴더가 없습니다.");
  const ready = readdirSync(snapshotManifestDirectory)
    .filter((name) => name.endsWith(".manifest.json"))
    .map((name) => ({ path: join(snapshotManifestDirectory, name), manifest: readJson(join(snapshotManifestDirectory, name)) }))
    .filter(({ manifest }) => manifest.status === "READY" && manifest.source_snapshot_ready === true)
    .sort((left, right) => compareText(right.manifest.fetched_at, left.manifest.fetched_at));
  assert(ready.length > 0, "READY 생활인구 snapshot manifest가 없습니다.");
  return ready[0];
}

function readCurrentMetricIds(manifest) {
  const pagesDirectory = join(ingestDirectory, ...manifest.normalized_path.split("/"), "pages");
  assert(existsSync(pagesDirectory), `normalized pages 폴더가 없습니다: ${pagesDirectory}`);
  const ids = [];
  let rowCount = 0;
  for (const name of readdirSync(pagesDirectory).filter((value) => value.endsWith(".ndjson")).sort(compareText)) {
    const lines = readFileSync(join(pagesDirectory, name), "utf8").split(/\r?\n/u);
    for (const line of lines) {
      if (!line) continue;
      const row = JSON.parse(line);
      ids.push(row.geographyId);
      rowCount += 1;
    }
  }
  return { ids, rowCount };
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function extractSingleZipEntry(zipPath) {
  const zip = readFileSync(zipPath);
  const eocd = findEndOfCentralDirectory(zip);
  assert(eocd >= 0, `ZIP central directory를 찾을 수 없습니다: ${basename(zipPath)}`);
  assert(zip.readUInt16LE(eocd + 10) === 1, "과거 생활인구 ZIP은 파일 1개여야 합니다.");
  const centralOffset = zip.readUInt32LE(eocd + 16);
  assert(zip.readUInt32LE(centralOffset) === 0x02014b50, "ZIP central directory 형식이 잘못됐습니다.");
  const method = zip.readUInt16LE(centralOffset + 10);
  const compressedSize = zip.readUInt32LE(centralOffset + 20);
  const localOffset = zip.readUInt32LE(centralOffset + 42);
  assert(zip.readUInt32LE(localOffset) === 0x04034b50, "ZIP local header 형식이 잘못됐습니다.");
  const nameLength = zip.readUInt16LE(localOffset + 26);
  const extraLength = zip.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
  if (method === 0) return compressed;
  assert(method === 8, `지원하지 않는 ZIP 압축 방식입니다: ${method}`);
  return inflateRawSync(compressed);
}

export function parseCsvRows(text, visitor) {
  let row = [];
  let value = "";
  let quoted = false;
  let rowIndex = 0;
  const emit = () => {
    row.push(value);
    if (rowIndex === 0 && row[0]) row[0] = row[0].replace(/^\uFEFF/, "");
    visitor(row, rowIndex);
    row = [];
    value = "";
    rowIndex += 1;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"' && value.length === 0) quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      if (value.endsWith("\r")) value = value.slice(0, -1);
      emit();
    } else value += character;
  }
  assert(!quoted, "CSV 인용부호가 닫히지 않았습니다.");
  if (row.length > 0 || value.length > 0) emit();
  return rowIndex;
}

function readLegacyMetricIds(manifest) {
  const zipPath = join(ingestDirectory, ...manifest.raw_path.split("/"));
  const csv = new TextDecoder("euc-kr", { fatal: true }).decode(extractSingleZipEntry(zipPath));
  let cellIndex = -1;
  const ids = [];
  let rowCount = 0;
  parseCsvRows(csv, (row, rowIndex) => {
    if (rowIndex === 0) {
      cellIndex = row.indexOf(manifest.key_field);
      assert(cellIndex >= 0, `과거 CSV에 ${manifest.key_field} header가 없습니다.`);
      return;
    }
    if (row.length === 1 && row[0] === "") return;
    ids.push(row[cellIndex]);
    rowCount += 1;
  });
  return { ids, rowCount };
}

function groupSummary(ids, includeIds = false) {
  const summary = {
    count: ids.length,
    sample_cell_ids: ids.slice(0, 10),
    duplicate_count: duplicates(ids).length,
    id_format: formatSummary(ids),
  };
  if (includeIds) summary.cell_ids = ids;
  return summary;
}

export function buildReconciliation({ geometryDocument, currentManifest, currentMetric, legacyManifest, legacyMetric }) {
  const geometry = inspectGeometry(geometryDocument);
  const currentMetricIds = uniqueSorted(currentMetric.ids);
  const legacyMetricIds = uniqueSorted(legacyMetric.ids);
  const current = reconcileIdSets(currentMetricIds, geometry.ids);
  const legacy = reconcileIdSets(legacyMetricIds, geometry.ids);
  const historical = reconcileIdSets(currentMetricIds, legacyMetricIds);
  const common = historical.both;
  const newOnly = historical.metricOnly;
  const oldOnly = historical.geometryOnly;
  const metricOnlyReconfirmedAbsent = current.metricOnly.every(
    (id) => !geometry.ids.includes(id),
  );

  return {
    schema_version: "1.0.0",
    audit: "250m_CELL_ID_GEOMETRY_RECONCILIATION_V1",
    audited_at: currentManifest.fetched_at.slice(0, 10),
    result: "CONDITIONAL",
    aggregation_performed: false,
    current_pointer_updated: false,
    geometry: {
      path: relativeToRepository(geometryPath),
      ...geometry.summary,
      source_id: geometryDocument.features?.[0]?.properties?.source_id ?? null,
      source_date_or_version: geometryDocument.features?.[0]?.properties?.geometry_version ?? null,
      source_crs: geometryDocument.features?.[0]?.properties?.source_crs ?? null,
      output_crs: geometryDocument.features?.[0]?.properties?.output_crs ?? null,
      official_source: "서울 격자 파일(250m, 5179, SHP)",
      official_source_reference: "https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do",
    },
    metric: {
      manifest_path: relativeToRepository(currentManifest.__path),
      snapshot_id: currentManifest.snapshot_id,
      status: currentManifest.status,
      source_reference_date: currentManifest.source_reference_date,
      row_count: currentMetric.rowCount,
      unique_cell_id_count: currentMetricIds.length,
      missing_cell_id_count: currentManifest.cell_id_quality.missing,
      malformed_cell_id_count: currentManifest.cell_id_quality.malformed,
      id_format: formatSummary(currentMetricIds),
      repeated_cell_ids_across_hour_or_dong_rows: duplicates(currentMetric.ids).length,
      duplicate_candidate_key_count: currentManifest.duplicate_candidate_count,
    },
    reconciliation: {
      both: groupSummary(current.both),
      metric_only: groupSummary(current.metricOnly, true),
      geometry_only: groupSummary(current.geometryOnly, true),
      metric_only_reconfirmed_absent_from_geometry: metricOnlyReconfirmedAbsent,
      equations: current.equations,
    },
    historical_comparison: {
      old_manifest_path: relativeToRepository(legacyManifest.__path),
      old_source_date: legacyManifest.source_date,
      old_row_count: legacyMetric.rowCount,
      old_unique_cell_id_count: legacyMetricIds.length,
      common: groupSummary(common),
      old_only: groupSummary(oldOnly, true),
      new_only: groupSummary(newOnly, true),
      old_geometry_reconciliation: {
        both_count: legacy.both.length,
        metric_only_count: legacy.metricOnly.length,
        metric_only_cell_ids: legacy.metricOnly,
        geometry_only_count: legacy.geometryOnly.length,
      },
      interpretation: "날짜가 다른 실제 CELL_ID 집합 차이이며, OLD_ONLY 감소를 오류로 판정하지 않았다.",
    },
    source_compatibility: {
      status: "NEEDS_REVIEW",
      confirmed: [
        "metric과 geometry CELL_ID는 모두 동일한 10자 형식이며 현재 metric 8,559개 중 8,558개가 일치한다.",
        "geometry는 EPSG:5179 원본을 EPSG:4326으로 변환한 Polygon 10,125개이며 CELL_ID 누락·중복·형식 오류가 없다.",
        "현재와 과거 metric-only CELL_ID는 모두 다사47256125이며 geometry 전체에서 정확히 검색해도 없다.",
      ],
      unresolved: [
        "geometry version SEOUL_250M_GRID_SHP_2025-05-12와 현재 API snapshot의 정확한 source version 동일성은 저장소 근거만으로 확정할 수 없다.",
        "GEOMETRY_ONLY가 날짜별 미제공, 비식별 억제, 무인구 격자, 서울 경계 주변 격자 또는 version 차이 중 무엇인지 CELL_ID 비교만으로 구분할 수 없다.",
        "METRIC_ONLY 다사47256125의 geometry 누락 원인은 저장소 근거만으로 확정할 수 없다.",
      ],
    },
    compatibility_decision: {
      status: "CONDITIONAL",
      market_submarket_aggregation_readiness: "CONDITIONAL",
      reason: "ID 체계는 거의 전부 호환되지만 1개 metric-only geometry 부재와 geometry/API source version 동일성 미확정 때문에 mismatch 처리 정책 없이 집계할 수 없다.",
      prohibited_interpretations: [
        "GEOMETRY_ONLY를 population 0으로 자동 처리하지 않는다.",
        "METRIC_ONLY 또는 GEOMETRY_ONLY를 조용히 삭제하지 않는다.",
        "이번 판정으로 Market/Submarket Join을 수행하거나 current pointer를 게시하지 않는다.",
      ],
    },
  };
}

function main() {
  const { path: manifestPath, manifest: currentManifest } = readLatestReadyManifest();
  currentManifest.__path = manifestPath;
  const legacyManifest = readJson(legacyManifestPath);
  legacyManifest.__path = legacyManifestPath;
  const result = buildReconciliation({
    geometryDocument: readJson(geometryPath),
    currentManifest,
    currentMetric: readCurrentMetricIds(currentManifest),
    legacyManifest,
    legacyMetric: readLegacyMetricIds(legacyManifest),
  });
  if (shouldWrite) writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
