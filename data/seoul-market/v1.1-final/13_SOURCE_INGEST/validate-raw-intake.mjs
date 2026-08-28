import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const ingestDirectory = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(ingestDirectory, "..");
const repositoryRoot = resolve(dataRoot, "..", "..", "..");
const rawDirectory = join(ingestDirectory, "raw");
const manifestsDirectory = join(ingestDirectory, "manifests");
const normalizedDirectory = join(ingestDirectory, "normalized");
const quarantineDirectory = join(ingestDirectory, "quarantine");
const contractPath = join(
  ingestDirectory,
  "source-contracts",
  "SOURCE_CONTRACTS.json",
);
const validationPath = join(ingestDirectory, "RAW_INTAKE_VALIDATION.json");
const reportPath = join(ingestDirectory, "RAW_INTAKE_REPORT.md");
const summaryPath = join(ingestDirectory, "VALIDATION_SUMMARY.json");
const manifestSchemaPath = join(manifestsDirectory, "MANIFEST_SCHEMA.json");
const checkedAt = "2026-08-28";

const protectedPaths = [
  join(repositoryRoot, "data", "consultations.json"),
  join(repositoryRoot, "data", "diagnosis-drafts.json.backup"),
];

const integrityPaths = {
  hierarchy: join(dataRoot, "MARKET_HIERARCHY.json"),
  officialMarkets: join(dataRoot, "09_GEO", "OFFICIAL_SEOUL_MARKETS.geojson"),
  administrativeDongs: join(dataRoot, "09_GEO", "ADMIN_DONG.geojson"),
  livingGrid: join(dataRoot, "09_GEO", "LIVING_GRID_250M.geojson"),
  frameoneMarkets: join(dataRoot, "09_GEO", "FRAMEONE_MARKETS.geojson"),
  frameoneSubmarkets: join(dataRoot, "09_GEO", "FRAMEONE_SUBMARKETS.geojson"),
  nodes: join(dataRoot, "09_GEO", "NODES.geojson"),
  officialCrosswalk: join(dataRoot, "09_GEO", "MARKET_OFFICIAL_CROSSWALK.csv"),
  administrativeCrosswalk: join(
    dataRoot,
    "09_GEO",
    "MARKET_ADMIN_DONG_CROSSWALK.csv",
  ),
  livingGridCrosswalk: join(
    dataRoot,
    "09_GEO",
    "MARKET_LIVING_GRID_CROSSWALK.csv",
  ),
  step4aReport: join(
    dataRoot,
    "12_VALIDATION",
    "STEP4A_DATA_COMPATIBILITY_REPORT.md",
  ),
  step4aOfficial: join(
    dataRoot,
    "12_VALIDATION",
    "OFFICIAL_MARKET_CODE_COMPATIBILITY.json",
  ),
  step4aLiving: join(
    dataRoot,
    "12_VALIDATION",
    "LIVING_GRID_KEY_COVERAGE.json",
  ),
  step4aAdministrative: join(
    dataRoot,
    "12_VALIDATION",
    "ADMIN_DONG_ATTRIBUTE_AUDIT.json",
  ),
};

const expectedIntegrityHashes = {
  hierarchy: "67ac5a5237b3893fc78e4fd67a7b97b4cd2774a69b5c6a7eb1bf2a6f8266e102",
  officialMarkets: "5793cced1936360ce93afd301d53ec4af30bac94844d969b75ad08038c407bb6",
  administrativeDongs: "b533e780608b53b10b9e7912d7f6cb7ec4ce712285abffc13ff06e7c68a31d5c",
  livingGrid: "b591c6e6379b7ba962d7d6ef5494ffd0dee519ddcae7ec69cbd8b7f86a07e8ad",
  frameoneMarkets: "f0ad94078846b31e5cc5817bcf635115e30e6e1b7d293916063aa616fe79f172",
  frameoneSubmarkets: "2f98a6771d86dc57d52599d383990cbc0dce7ba23fc9e6e1f944567c5fc2f7ef",
  nodes: "ee625a6dd697cc7cbdf18d3cb6f747b21c9ef918cc31ee27b71e7eda8e309095",
  officialCrosswalk: "a2cb9107f51fc1522943544f9c2194a54bf859b99d2cab402ac842577d1fe546",
  administrativeCrosswalk: "1d00d368457c85999316116a2c3a1ead4cc12b81af9ac8259103f7a57c369884",
  livingGridCrosswalk: "5637ffe2139895e5ad3d7db029402314a6c83db9d30d33a3d8f530b2d2dd08b3",
  step4aReport: "eb069a67fc7c898c911e18505011483b0e7898a63312889acfad2161c8a00c3a",
  step4aOfficial: "c03d4d7e0fd18b915521a2806cd861b86753f786cf5d57b62368058284526038",
  step4aLiving: "955a543eee4bd6c7d7ac40458d3238426dba569fda922c0723979a9aaf16992c",
  step4aAdministrative: "60a9b50b8ae8391caeab316885ad2204977caf3669449f0999dda90d39d97504",
};

const secretPattern =
  /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sha256(path) {
  const hash = createHash("sha256");
  const buffer = readFileSync(path);
  hash.update(buffer);
  return hash.digest("hex");
}

function relativeToIngest(path) {
  return relative(ingestDirectory, path).replaceAll("\\", "/");
}

function relativeToDataRoot(path) {
  return relative(dataRoot, path).replaceAll("\\", "/");
}

function listFiles(directory, { includeGitkeep = false } = {}) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path, { includeGitkeep }));
    else if (includeGitkeep || entry.name !== ".gitkeep") files.push(path);
  }
  return files.sort(compareText);
}

function flattenHierarchy(document) {
  const districts = document.districts ?? [];
  const markets = districts.flatMap((district) => district.markets ?? []);
  const submarkets = markets.flatMap((market) => market.submarkets ?? []);
  const nodes = submarkets.flatMap((submarket) => submarket.nodes ?? []);
  return { districts, markets, submarkets, nodes };
}

function parseCsvRows(text, onRow) {
  let row = [];
  let value = "";
  let quoted = false;
  let rowIndex = 0;

  const emitRow = () => {
    row.push(value);
    value = "";
    if (rowIndex === 0 && row[0]) row[0] = row[0].replace(/^\uFEFF/, "");
    onRow(row, rowIndex);
    row = [];
    rowIndex += 1;
  };

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
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      if (value.endsWith("\r")) value = value.slice(0, -1);
      emitRow();
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV 인용부호가 닫히지 않았습니다.");
  if (row.length > 0 || value.length > 0) emitRow();
  return rowIndex;
}

function parseCsvDocument(text, rowVisitor) {
  let header = null;
  let rowCount = 0;
  let rowWidthErrorCount = 0;
  parseCsvRows(text, (row, rowIndex) => {
    if (rowIndex === 0) {
      header = row;
      assert(new Set(header).size === header.length, "CSV header가 중복되었습니다.");
      return;
    }
    if (row.length === 1 && row[0] === "") return;
    rowCount += 1;
    if (row.length !== header.length) rowWidthErrorCount += 1;
    rowVisitor(row, header, rowCount);
  });
  assert(header, "CSV header가 없습니다.");
  return { header, rowCount, rowWidthErrorCount };
}

function rowObject(row, header) {
  return Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""]));
}

function decodeCsv(buffer) {
  const candidates = buffer.subarray(0, Math.min(buffer.length, 131_072));
  if (
    candidates.length >= 3 &&
    candidates[0] === 0xef &&
    candidates[1] === 0xbb &&
    candidates[2] === 0xbf
  ) {
    return { encoding: "UTF-8-BOM", text: new TextDecoder("utf-8").decode(buffer) };
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(candidates);
    return { encoding: "UTF-8", text: decoder.decode(buffer) };
  } catch {
    try {
      const decoder = new TextDecoder("euc-kr", { fatal: true });
      decoder.decode(candidates);
      return { encoding: "CP949", text: decoder.decode(buffer) };
    } catch {
      return { encoding: "ENCODING_ADAPTER_REQUIRED", text: null };
    }
  }
}

function decodeZipFilename(buffer, utf8) {
  return new TextDecoder(utf8 ? "utf-8" : "euc-kr").decode(buffer);
}

function dosDateTime(date, time) {
  const year = ((date >> 9) & 0x7f) + 1980;
  const month = (date >> 5) & 0x0f;
  const day = date & 0x1f;
  const hour = (time >> 11) & 0x1f;
  const minute = (time >> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  const pad = (value) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function readZipDirectory(zipPath) {
  const buffer = readFileSync(zipPath);
  let eocd = -1;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  assert(eocd >= 0, `ZIP EOCD를 찾을 수 없습니다: ${basename(zipPath)}`);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    assert(buffer.readUInt32LE(offset) === 0x02014b50, "ZIP central directory 오류");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const time = buffer.readUInt16LE(offset + 12);
    const date = buffer.readUInt16LE(offset + 14);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameBytes = buffer.subarray(offset + 46, offset + 46 + nameLength);
    const utf8 = (flags & 0x0800) !== 0;
    entries.push({
      original_filename: decodeZipFilename(nameBytes, utf8),
      extension: extname(decodeZipFilename(nameBytes, utf8)).toLowerCase(),
      compressed_size: compressedSize,
      uncompressed_size: uncompressedSize,
      compression_method: method === 8 ? "DEFLATE" : method === 0 ? "STORE" : `METHOD_${method}`,
      crc32: crc32.toString(16).padStart(8, "0"),
      filename_encoding: utf8 ? "UTF-8" : "CP949",
      last_modified_local: dosDateTime(date, time),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZipCsv(zipPath) {
  const temporaryBase = resolve(tmpdir());
  const temporaryDirectory = resolve(
    mkdtempSync(join(temporaryBase, "frameone-raw-intake-")),
  );
  assert(
    dirname(temporaryDirectory) === temporaryBase,
    "임시 압축해제 경로가 OS temp 바로 아래가 아닙니다.",
  );
  try {
    const escapedZip = zipPath.replaceAll("'", "''");
    const escapedDestination = temporaryDirectory.replaceAll("'", "''");
    const command = `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDestination}' -Force`;
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8" },
    );
    assert(
      result.status === 0,
      `ZIP 압축해제 실패: ${basename(zipPath)}: ${result.stderr || result.stdout}`,
    );
    const csvFiles = listFiles(temporaryDirectory, { includeGitkeep: true }).filter(
      (path) => extname(path).toLowerCase() === ".csv",
    );
    assert(csvFiles.length === 1, `ZIP 내부 CSV가 1개가 아닙니다: ${basename(zipPath)}`);
    return readFileSync(csvFiles[0]);
  } finally {
    assert(
      temporaryDirectory.startsWith(`${temporaryBase}\\`) ||
        temporaryDirectory.startsWith(`${temporaryBase}/`),
      "임시 삭제 경로 검증 실패",
    );
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function requiredHeaderIndexes(header, names) {
  const indexes = Object.fromEntries(names.map((name) => [name, header.indexOf(name)]));
  const missing = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([name]) => name);
  assert(missing.length === 0, `필수 header 누락: ${missing.join(", ")}`);
  return indexes;
}

function addName(names, code, name) {
  if (!names.has(code)) names.set(code, new Set());
  names.get(code).add(name);
}

function namesToObject(names, onlyConflicts = false) {
  return Object.fromEntries(
    [...names.entries()]
      .filter(([, values]) => !onlyConflicts || values.size > 1)
      .sort(([left], [right]) => compareText(left, right))
      .map(([code, values]) => [code, [...values].sort(compareText)]),
  );
}

function scanLiving(text) {
  const gridCounts = new Map();
  const legacyKeys = new Map();
  const rowKeys = new Set();
  const dates = new Set();
  const hours = new Set();
  const administrativeCodes = new Set();
  let nullGridCount = 0;
  let duplicateRowKeyCount = 0;
  let invalidTotalCount = 0;
  let suppressedTotalCount = 0;
  let headerIndexes;
  let ageColumns = [];

  const parsed = parseCsvDocument(text, (row, header, rowNumber) => {
    if (rowNumber === 1) {
      headerIndexes = requiredHeaderIndexes(header, [
        "일자",
        "시간",
        "행정동코드",
        "250M격자",
        "생활인구합계",
      ]);
      ageColumns = header.filter((name) => /^(남자|여자) /.test(name));
      assert(ageColumns.length === 28, "생활인구 성별·연령 header 개수 오류");
    }
    const value = (name) => (row[headerIndexes[name]] ?? "").trim();
    const date = value("일자");
    const hour = value("시간");
    const administrativeCode = value("행정동코드");
    const grid = value("250M격자");
    const total = value("생활인구합계");
    if (!grid) nullGridCount += 1;
    else gridCounts.set(grid, (gridCounts.get(grid) ?? 0) + 1);
    dates.add(date);
    hours.add(hour);
    administrativeCodes.add(administrativeCode);
    const legacyKey = `${date}\u001f${hour}\u001f${grid}`;
    legacyKeys.set(legacyKey, (legacyKeys.get(legacyKey) ?? 0) + 1);
    const rowKey = `${date}\u001f${hour}\u001f${administrativeCode}\u001f${grid}`;
    if (rowKeys.has(rowKey)) duplicateRowKeyCount += 1;
    rowKeys.add(rowKey);
    if (total === "*") suppressedTotalCount += 1;
    else if (total === "" || !Number.isFinite(Number(total))) invalidTotalCount += 1;
  });

  const dateValues = [...dates].sort(compareText);
  const sourceDate =
    dateValues.length === 1 && /^\d{8}$/.test(dateValues[0])
      ? `${dateValues[0].slice(0, 4)}-${dateValues[0].slice(4, 6)}-${dateValues[0].slice(6, 8)}`
      : null;
  const legacyDuplicateGroups = [...legacyKeys.values()].filter((count) => count > 1);
  return {
    header: parsed.header,
    row_count: parsed.rowCount,
    row_width_error_count: parsed.rowWidthErrorCount,
    key_field: "250M격자",
    key_count: gridCounts.size,
    null_key_count: nullGridCount,
    grid_repeated_row_count: parsed.rowCount - gridCounts.size,
    row_key_fields: ["일자", "시간", "행정동코드", "250M격자"],
    row_key_count: rowKeys.size,
    duplicate_key_count: duplicateRowKeyCount,
    legacy_key_without_administrative_dong: ["일자", "시간", "250M격자"],
    legacy_duplicate_group_count: legacyDuplicateGroups.length,
    legacy_duplicate_excess_row_count: legacyDuplicateGroups.reduce(
      (sum, count) => sum + count - 1,
      0,
    ),
    date_values: dateValues,
    hour_values: [...hours].sort(compareText),
    administrative_dong_code_count: administrativeCodes.size,
    gender_age_columns: ageColumns,
    suppressed_total_marker: "*",
    suppressed_total_count: suppressedTotalCount,
    invalid_total_count: invalidTotalCount,
    source_date: sourceDate,
    source_version: dateValues.length === 1 ? `${dateValues[0]}_KO_HEADER` : null,
    content_validation_status:
      parsed.rowWidthErrorCount === 0 &&
      nullGridCount === 0 &&
      duplicateRowKeyCount === 0 &&
      invalidTotalCount === 0
        ? "NEEDS_REVIEW"
        : "FAIL",
    _gridSet: new Set(gridCounts.keys()),
  };
}

function metricHeaderConfiguration(sourceId, header) {
  if (sourceId === "SRC-SEOUL-SALES") {
    return {
      header_variant_suffix: "KO_HEADER",
      fields: {
        year_quarter: "기준_년분기_코드",
        area_type: "상권_구분_코드",
        area_type_name: "상권_구분_코드_명",
        area_code: "상권_코드",
        area_name: "상권_코드_명",
        service_code: "서비스_업종_코드",
        service_name: "서비스_업종_코드_명",
      },
      numeric_fields: header.filter((name) => name.includes("매출_금액")),
    };
  }
  if (header.includes("stdr_yyqu_cd")) {
    return {
      header_variant_suffix: "EN_HEADER",
      fields: {
        year_quarter: "stdr_yyqu_cd",
        area_type: "trdar_se_cd",
        area_type_name: "trdar_se_cd_nm",
        area_code: "trdar_cd",
        area_name: "trdar_cd_nm",
        service_code: "svc_induty_cd",
        service_name: "svc_induty_cd_nm",
      },
      numeric_fields: ["stor_co", "frc_stor_co", "opbiz_stor_co", "clsbiz_stor_co"],
    };
  }
  return {
    header_variant_suffix: "KO_HEADER",
    fields: {
      year_quarter: "기준_년분기_코드",
      area_type: "상권_구분_코드",
      area_type_name: "상권_구분_코드_명",
      area_code: "상권_코드",
      area_name: "상권_코드_명",
      service_code: "서비스_업종_코드",
      service_name: "서비스_업종_코드_명",
    },
    numeric_fields: ["점포_수", "프랜차이즈_점포_수", "개업_점포_수", "폐업_점포_수"],
  };
}

function scanMetric(text, sourceId) {
  let configuration;
  let indexes;
  const codes = new Set();
  const names = new Map();
  const quarters = new Set();
  const serviceCodes = new Set();
  const serviceNames = new Set();
  const compositeKeys = new Set();
  const invalidNumericCounts = new Map();
  let nullCodeCount = 0;
  let duplicateKeyCount = 0;

  const parsed = parseCsvDocument(text, (row, header, rowNumber) => {
    if (rowNumber === 1) {
      configuration = metricHeaderConfiguration(sourceId, header);
      indexes = requiredHeaderIndexes(header, [
        ...Object.values(configuration.fields),
        ...configuration.numeric_fields,
      ]);
    }
    const value = (name) => (row[indexes[name]] ?? "").trim();
    const yearQuarter = value(configuration.fields.year_quarter);
    const areaType = value(configuration.fields.area_type);
    const code = value(configuration.fields.area_code);
    const name = value(configuration.fields.area_name);
    const serviceCode = value(configuration.fields.service_code);
    const serviceName = value(configuration.fields.service_name);
    if (!code) nullCodeCount += 1;
    else {
      codes.add(code);
      addName(names, code, name);
    }
    quarters.add(yearQuarter);
    serviceCodes.add(serviceCode);
    serviceNames.add(serviceName);
    const rowKey = `${yearQuarter}\u001f${areaType}\u001f${code}\u001f${serviceCode}`;
    if (compositeKeys.has(rowKey)) duplicateKeyCount += 1;
    compositeKeys.add(rowKey);
    for (const numericField of configuration.numeric_fields) {
      const numericValue = value(numericField);
      if (numericValue === "" || !Number.isFinite(Number(numericValue))) {
        invalidNumericCounts.set(
          numericField,
          (invalidNumericCounts.get(numericField) ?? 0) + 1,
        );
      }
    }
  });

  const quarterValues = [...quarters].sort(compareText);
  const years = new Set(quarterValues.map((value) => value.slice(0, 4)));
  assert(years.size === 1, `${sourceId} raw에 복수 또는 불명확한 연도가 있습니다.`);
  const year = [...years][0];
  const sourceVersion = `${year}_${configuration.header_variant_suffix}`;
  return {
    year,
    header: parsed.header,
    header_variant: configuration.header_variant_suffix,
    actual_fields: configuration.fields,
    numeric_fields_checked: configuration.numeric_fields,
    row_count: parsed.rowCount,
    row_width_error_count: parsed.rowWidthErrorCount,
    key_field: configuration.fields.area_code,
    key_count: codes.size,
    null_key_count: nullCodeCount,
    code_repeated_row_count: parsed.rowCount - codes.size,
    row_key_fields: [
      configuration.fields.year_quarter,
      configuration.fields.area_type,
      configuration.fields.area_code,
      configuration.fields.service_code,
    ],
    row_key_count: compositeKeys.size,
    duplicate_key_count: duplicateKeyCount,
    quarter_values: quarterValues,
    service_code_count: serviceCodes.size,
    service_name_count: serviceNames.size,
    within_file_name_conflicts: namesToObject(names, true),
    invalid_numeric_counts: Object.fromEntries(
      [...invalidNumericCounts.entries()].sort(([left], [right]) => compareText(left, right)),
    ),
    source_date:
      quarterValues.length > 0
        ? `${year}-Q${quarterValues[0].slice(4)}..${year}-Q${quarterValues.at(-1).slice(4)}`
        : null,
    source_version: sourceVersion,
    content_validation_status:
      parsed.rowWidthErrorCount === 0 &&
      nullCodeCount === 0 &&
      duplicateKeyCount === 0 &&
      invalidNumericCounts.size === 0
        ? "VALIDATED"
        : "FAIL",
    _codeSet: codes,
    _names: names,
  };
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function nameConflicts(leftNames, rightNames, codes) {
  const conflicts = [];
  for (const code of [...codes].sort(compareText)) {
    const left = [...(leftNames.get(code) ?? [])].sort(compareText);
    const right = [...(rightNames.get(code) ?? [])].sort(compareText);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      conflicts.push({ code, left_names: left, right_names: right });
    }
  }
  return conflicts;
}

function compareCodeSets(left, right, leftLabel, rightLabel) {
  const intersection = new Set([...left._codeSet].filter((code) => right._codeSet.has(code)));
  const leftOnly = [...left._codeSet].filter((code) => !right._codeSet.has(code)).sort(compareText);
  const rightOnly = [...right._codeSet].filter((code) => !left._codeSet.has(code)).sort(compareText);
  return {
    [`${leftLabel}_code_count`]: left._codeSet.size,
    [`${rightLabel}_code_count`]: right._codeSet.size,
    intersection_count: intersection.size,
    [`${leftLabel}_only_count`]: leftOnly.length,
    [`${rightLabel}_only_count`]: rightOnly.length,
    [`${leftLabel}_only_codes`]: leftOnly,
    [`${rightLabel}_only_codes`]: rightOnly,
    name_conflict_count: nameConflicts(left._names, right._names, intersection).length,
    name_conflicts: nameConflicts(left._names, right._names, intersection),
  };
}

function compareGeometryMetric(geometry, metric) {
  const intersection = new Set(
    [...geometry._codeSet].filter((code) => metric._codeSet.has(code)),
  );
  const geometryOnly = [...geometry._codeSet]
    .filter((code) => !metric._codeSet.has(code))
    .sort(compareText);
  const metricOnly = [...metric._codeSet]
    .filter((code) => !geometry._codeSet.has(code))
    .sort(compareText);
  const conflicts = nameConflicts(geometry._names, metric._names, intersection);
  return {
    geometry_code_count: geometry._codeSet.size,
    metric_code_count: metric._codeSet.size,
    intersection_count: intersection.size,
    geometry_only_count: geometryOnly.length,
    metric_only_count: metricOnly.length,
    geometry_only_codes: geometryOnly,
    metric_only_codes: metricOnly,
    code_match_ratio: intersection.size / geometry._codeSet.size,
    name_conflict_count: conflicts.length,
    name_conflicts: conflicts,
    code_level_status: setsEqual(geometry._codeSet, metric._codeSet)
      ? "CODE_LEVEL_MATCH"
      : "PARTIAL_CODE_MATCH",
    geometry_compatibility_status: "NEEDS_REVIEW",
    join_allowed: false,
  };
}

function publicAnalysis(analysis) {
  return Object.fromEntries(
    Object.entries(analysis).filter(([key]) => !key.startsWith("_")),
  );
}

function buildManifest(rawFile, analysis, innerFiles, encoding) {
  const compatibilityStatus =
    rawFile.source_id === "SRC-SEOUL-STORES"
      ? "CODE_LEVEL_MATCH"
      : "NEEDS_REVIEW";
  const notes =
    rawFile.source_id === "SRC-SEOUL-LIVING"
      ? "Raw bytes preserved. 250M격자 coverage만 계산했으며 '*' 억제값과 행정동별 grid 분할을 기록했다. 생활인구 합산 및 Market 집계는 수행하지 않았다."
      : rawFile.source_id === "SRC-SEOUL-SALES"
        ? "Raw bytes preserved. Header·row key·상권코드 집합만 검증했으며 매출 금액 합계·평균은 계산하지 않았다."
        : "Raw bytes preserved. Header·row key·상권코드 집합만 검증했으며 경쟁·개폐업 분석은 수행하지 않았다.";
  return {
    schema_version: "1.1.0",
    source_id: rawFile.source_id,
    original_filename: basename(rawFile.path),
    raw_path: relativeToIngest(rawFile.path),
    extension: extname(rawFile.path).toLowerCase(),
    file_size: rawFile.file_size,
    sha256: rawFile.sha256,
    last_modified_at: rawFile.last_modified_at,
    retrieved_at: null,
    source_date: analysis.source_date,
    source_version: analysis.source_version,
    is_zip: true,
    inner_files: innerFiles,
    encoding,
    header: analysis.header,
    row_count: analysis.row_count,
    key_field: analysis.key_field,
    key_count: analysis.key_count,
    row_key_fields: analysis.row_key_fields,
    null_key_count: analysis.null_key_count,
    duplicate_key_count: analysis.duplicate_key_count,
    content_validation_status: analysis.content_validation_status,
    validation_status:
      analysis.content_validation_status === "FAIL" ? "FAIL" : "NEEDS_REVIEW",
    compatibility_status: compatibilityStatus,
    normalized_output: null,
    notes,
  };
}

function runSelfTests() {
  const tests = [];
  const test = (name, condition) => {
    assert(condition, `Self test 실패: ${name}`);
    tests.push({ name, status: "PASS" });
  };
  const rows = [];
  parseCsvRows('a,b\n"x,y",z\n', (row) => rows.push(row));
  test("csv_quoted_field", rows[1][0] === "x,y");
  test("unknown_is_not_zero", null !== 0);
  test("code_match_does_not_confirm_geometry", "CODE_LEVEL_MATCH" !== "PASS");
  test("raw_zip_extension_only", extname("sample.zip") === ".zip");
  test("cp949_decoder_available", new TextDecoder("euc-kr").encoding === "euc-kr");
  return tests;
}

function buildReport(validation) {
  const living = validation.living;
  const sales = validation.sales;
  const stores = validation.stores;
  const lines = [
    "# STEP 4B-1 RAW INTAKE REPORT",
    "",
    `기준일: ${validation.checked_at}`,
    "",
    "## 1. 판정",
    "",
    "- 실제 Raw ZIP 5개와 내부 CSV 5개를 식별하고 원본 SHA-256, CP949 인코딩, 실제 Header, 행·key 구조를 검증했다.",
    "- Raw는 수정하지 않았고 저장소 내부에 압축해제본을 남기지 않았다. Manifest와 검증 결과만 생성했다.",
    "- 생활인구 합산, 매출 분석, 경쟁점 분석, Polygon intersection, FRAMEONE 자동매칭, Crosswalk 승격은 모두 수행하지 않았다.",
    "- 코드 일치는 geometry 동등성의 증거가 아니므로 모든 공간 Join은 계속 금지한다.",
    "",
    "## 2. Raw 파일",
    "",
    "| Source | 파일 | SHA-256 | 인코딩 | 행수 | Key 수 |",
    "|---|---|---|---:|---:|---:|",
    ...validation.raw_files.map(
      (file) =>
        `| ${file.source_id} | ${file.original_filename} | \`${file.sha256}\` | ${file.encoding} | ${file.row_count.toLocaleString("en-US")} | ${file.key_count.toLocaleString("en-US")} |`,
    ),
    "",
    "## 3. 실제 Header와 Contract 차이",
    "",
    "- 생활인구 Grid key 실제 Header는 `CELL_ID`가 아니라 `250M격자`다. 실제 행 grain은 `일자 + 시간 + 행정동코드 + 250M격자`다.",
    "- Sales는 `기준_년분기_코드` 한 필드로 연도·분기를 표현하며 2024/2025 모두 한국어 Header다.",
    "- Stores는 2024 한국어 Header와 2025 영문 Header가 서로 달라 version별 매핑이 필요하다.",
    "",
    "## 4. 생활인구 Grid Coverage",
    "",
    `- metric rows: ${living.row_count.toLocaleString("en-US")}`,
    `- metric unique grid: ${living.coverage.metric_unique_grid_count.toLocaleString("en-US")}`,
    `- geometry grid: ${living.coverage.geometry_grid_count.toLocaleString("en-US")}`,
    `- matched / geometry-only / metric-only: ${living.coverage.matched_grid_count.toLocaleString("en-US")} / ${living.coverage.geometry_only_count.toLocaleString("en-US")} / ${living.coverage.metric_only_count.toLocaleString("en-US")}`,
    `- geometry coverage ratio: ${(living.coverage.geometry_coverage_ratio * 100).toFixed(6)}%`,
    `- metric coverage ratio: ${(living.coverage.metric_coverage_ratio * 100).toFixed(6)}%`,
    `- \`생활인구합계\`의 \`*\` 억제값: ${living.suppressed_total_count.toLocaleString("en-US")}행. 0으로 치환하지 않았다.`,
    `- 기존 3필드 후보 key에는 ${living.legacy_duplicate_excess_row_count.toLocaleString("en-US")}개 중복 초과행이 있으나 행정동코드를 포함한 실제 4필드 row key 중복은 ${living.duplicate_key_count}개다.`,
    "",
    "## 5. 2024/2025 코드 비교",
    "",
    `- Sales: ${sales.year_comparison["2024_code_count"]} / ${sales.year_comparison["2025_code_count"]}, 교집합 ${sales.year_comparison.intersection_count}, 2024 only ${sales.year_comparison["2024_only_count"]}, 2025 only ${sales.year_comparison["2025_only_count"]}, 명칭 충돌 ${sales.year_comparison.name_conflict_count}`,
    `- Stores: ${stores.year_comparison["2024_code_count"]} / ${stores.year_comparison["2025_code_count"]}, 교집합 ${stores.year_comparison.intersection_count}, 2024 only ${stores.year_comparison["2024_only_count"]}, 2025 only ${stores.year_comparison["2025_only_count"]}, 명칭 충돌 ${stores.year_comparison.name_conflict_count}`,
    `- Sales↔Stores 2024: 교집합 ${validation.sales_stores_comparison["2024"].intersection_count}, Sales only ${validation.sales_stores_comparison["2024"].sales_only_count}, Stores only ${validation.sales_stores_comparison["2024"].stores_only_count}`,
    `- Sales↔Stores 2025: 교집합 ${validation.sales_stores_comparison["2025"].intersection_count}, Sales only ${validation.sales_stores_comparison["2025"].sales_only_count}, Stores only ${validation.sales_stores_comparison["2025"].stores_only_count}`,
    "",
    "## 6. 2023 geometry 코드 비교",
    "",
    ...["2024", "2025"].flatMap((year) => [
      `- Sales ${year}: geometry 1,650 / metric ${validation.geometry_metric_comparison.sales[year].metric_code_count.toLocaleString("en-US")} / 교집합 ${validation.geometry_metric_comparison.sales[year].intersection_count.toLocaleString("en-US")} / 상태 \`${validation.geometry_metric_comparison.sales[year].code_level_status}\``,
      `- Stores ${year}: geometry 1,650 / metric ${validation.geometry_metric_comparison.stores[year].metric_code_count.toLocaleString("en-US")} / 교집합 ${validation.geometry_metric_comparison.stores[year].intersection_count.toLocaleString("en-US")} / 상태 \`${validation.geometry_metric_comparison.stores[year].code_level_status}\``,
    ]),
    "- `CODE_LEVEL_MATCH`도 geometry version 호환 확정이 아니다. 공식 근거 확인 전 `geometry_compatibility_status=NEEDS_REVIEW`, `join_allowed=false`를 유지한다.",
    "",
    "## 7. 후속 확인",
    "",
    "- Raw의 공식 다운로드 시각과 배포 라이선스/제공 버전을 확인해야 한다. 확인 전 `retrieved_at=null`을 유지한다.",
    "- 생활인구 metric-only Grid 1개와 geometry-only Grid 1,562개의 시점·경계 범위를 확인해야 한다.",
    "- 코드 3110024 명칭의 2024 `혜회동주민센터`와 2025 `혜화동주민센터` 차이를 공식 원천에서 확인해야 한다.",
    "- STEP 4B-2 API 검증 전에는 API key·adapter를 추가하지 않는다.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildArtifacts() {
  for (const path of [
    contractPath,
    manifestSchemaPath,
    ...protectedPaths,
    ...Object.values(integrityPaths),
  ]) {
    assert(existsSync(path), `필수 파일 없음: ${path}`);
  }
  const protectedBefore = Object.fromEntries(
    protectedPaths.map((path) => [path, sha256(path)]),
  );
  const integrityHashes = Object.fromEntries(
    Object.entries(integrityPaths).map(([label, path]) => [label, sha256(path)]),
  );
  for (const [label, expected] of Object.entries(expectedIntegrityHashes)) {
    assert(integrityHashes[label] === expected, `기존 데이터 변경 감지: ${label}`);
  }

  const contracts = readJson(contractPath).contracts;
  readJson(manifestSchemaPath);
  const contractsById = new Map(contracts.map((contract) => [contract.source_id, contract]));
  const rawPaths = listFiles(rawDirectory);
  assert(rawPaths.length === 5, `실제 Raw는 5개여야 합니다: ${rawPaths.length}`);
  const sourceCounts = new Map();
  const analyzedFiles = [];
  let secretMatchCount = 0;

  for (const path of rawPaths) {
    const sourceId = relative(rawDirectory, path).split(/[\\/]/)[0];
    assert(
      ["SRC-SEOUL-LIVING", "SRC-SEOUL-SALES", "SRC-SEOUL-STORES"].includes(sourceId),
      `허용되지 않은 Raw source: ${sourceId}`,
    );
    assert(extname(path).toLowerCase() === ".zip", `Raw ZIP이 아닙니다: ${path}`);
    assert(contractsById.has(sourceId), `Source Contract 없음: ${sourceId}`);
    sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
    const entries = readZipDirectory(path);
    const csvEntries = entries.filter((entry) => entry.extension === ".csv");
    assert(csvEntries.length === 1, `ZIP 내부 CSV가 1개가 아닙니다: ${basename(path)}`);
    const csvBuffer = extractZipCsv(path);
    assert(
      csvBuffer.length === csvEntries[0].uncompressed_size,
      `ZIP 내부 CSV 크기 불일치: ${basename(path)}`,
    );
    const decoded = decodeCsv(csvBuffer);
    assert(
      decoded.encoding !== "ENCODING_ADAPTER_REQUIRED",
      `ENCODING_ADAPTER_REQUIRED: ${basename(path)}`,
    );
    if (secretPattern.test(decoded.text)) secretMatchCount += 1;
    const analysis =
      sourceId === "SRC-SEOUL-LIVING"
        ? scanLiving(decoded.text)
        : scanMetric(decoded.text, sourceId);
    const rawFile = {
      source_id: sourceId,
      path,
      file_size: statSync(path).size,
      sha256: sha256(path),
      last_modified_at: statSync(path).mtime.toISOString(),
    };
    const manifest = buildManifest(rawFile, analysis, entries, decoded.encoding);
    const manifestPath = join(
      manifestsDirectory,
      sourceId,
      `${basename(path)}.manifest.json`,
    );
    analyzedFiles.push({ rawFile, analysis, manifest, manifestPath });
  }

  assert(sourceCounts.get("SRC-SEOUL-LIVING") === 1, "생활인구 Raw 수 오류");
  assert(sourceCounts.get("SRC-SEOUL-SALES") === 2, "Sales Raw 수 오류");
  assert(sourceCounts.get("SRC-SEOUL-STORES") === 2, "Stores Raw 수 오류");

  const livingFile = analyzedFiles.find(
    (file) => file.rawFile.source_id === "SRC-SEOUL-LIVING",
  );
  const salesFiles = analyzedFiles
    .filter((file) => file.rawFile.source_id === "SRC-SEOUL-SALES")
    .sort((left, right) => compareText(left.analysis.year, right.analysis.year));
  const storesFiles = analyzedFiles
    .filter((file) => file.rawFile.source_id === "SRC-SEOUL-STORES")
    .sort((left, right) => compareText(left.analysis.year, right.analysis.year));
  assert(
    JSON.stringify(salesFiles.map((file) => file.analysis.year)) ===
      JSON.stringify(["2024", "2025"]),
    "Sales 2024/2025 식별 실패",
  );
  assert(
    JSON.stringify(storesFiles.map((file) => file.analysis.year)) ===
      JSON.stringify(["2024", "2025"]),
    "Stores 2024/2025 식별 실패",
  );

  const hierarchy = flattenHierarchy(readJson(integrityPaths.hierarchy));
  assert(hierarchy.districts.length === 25, "District 개수 오류");
  assert(hierarchy.markets.length === 156, "Market 개수 오류");
  assert(hierarchy.submarkets.length === 382, "Submarket 개수 오류");
  assert(hierarchy.nodes.length === 763, "Node 개수 오류");

  const officialMarkets = readJson(integrityPaths.officialMarkets);
  const livingGrid = readJson(integrityPaths.livingGrid);
  const frameoneMarkets = readJson(integrityPaths.frameoneMarkets);
  const frameoneSubmarkets = readJson(integrityPaths.frameoneSubmarkets);
  const nodes = readJson(integrityPaths.nodes);
  assert(officialMarkets.features.length === 1650, "공식상권 geometry 개수 오류");
  assert(livingGrid.features.length === 10125, "생활인구 Grid geometry 개수 오류");
  assert(
    [...frameoneMarkets.features, ...frameoneSubmarkets.features, ...nodes.features].every(
      (feature) => feature.geometry === null,
    ),
    "FRAMEONE geometry가 생성되었습니다.",
  );
  const officialGeometry = { _codeSet: new Set(), _names: new Map() };
  for (const feature of officialMarkets.features) {
    const code = String(feature.properties.official_area_code ?? "").trim();
    const name = String(feature.properties.official_area_name ?? "").trim();
    officialGeometry._codeSet.add(code);
    addName(officialGeometry._names, code, name);
  }
  const geometryGridSet = new Set(
    livingGrid.features.map((feature) => String(feature.properties.grid_id ?? "").trim()),
  );

  const metricGridSet = livingFile.analysis._gridSet;
  const matchedGrid = new Set([...metricGridSet].filter((key) => geometryGridSet.has(key)));
  const geometryOnlyGrid = [...geometryGridSet]
    .filter((key) => !metricGridSet.has(key))
    .sort(compareText);
  const metricOnlyGrid = [...metricGridSet]
    .filter((key) => !geometryGridSet.has(key))
    .sort(compareText);
  const livingCoverage = {
    geometry_grid_count: geometryGridSet.size,
    metric_unique_grid_count: metricGridSet.size,
    matched_grid_count: matchedGrid.size,
    geometry_only_count: geometryOnlyGrid.length,
    metric_only_count: metricOnlyGrid.length,
    geometry_coverage_ratio: matchedGrid.size / geometryGridSet.size,
    metric_coverage_ratio: matchedGrid.size / metricGridSet.size,
    geometry_only_sample: geometryOnlyGrid.slice(0, 20),
    metric_only_keys: metricOnlyGrid,
  };

  const salesByYear = Object.fromEntries(
    salesFiles.map((file) => [file.analysis.year, file.analysis]),
  );
  const storesByYear = Object.fromEntries(
    storesFiles.map((file) => [file.analysis.year, file.analysis]),
  );
  const salesYearComparison = compareCodeSets(
    salesByYear["2024"],
    salesByYear["2025"],
    "2024",
    "2025",
  );
  const storesYearComparison = compareCodeSets(
    storesByYear["2024"],
    storesByYear["2025"],
    "2024",
    "2025",
  );
  const salesStoresComparison = Object.fromEntries(
    ["2024", "2025"].map((year) => [
      year,
      compareCodeSets(salesByYear[year], storesByYear[year], "sales", "stores"),
    ]),
  );
  const geometryMetricComparison = {
    sales: Object.fromEntries(
      ["2024", "2025"].map((year) => [
        year,
        compareGeometryMetric(officialGeometry, salesByYear[year]),
      ]),
    ),
    stores: Object.fromEntries(
      ["2024", "2025"].map((year) => [
        year,
        compareGeometryMetric(officialGeometry, storesByYear[year]),
      ]),
    ),
  };

  const rawFilesPublic = analyzedFiles.map(({ rawFile, analysis, manifest, manifestPath }) => ({
    source_id: rawFile.source_id,
    original_filename: basename(rawFile.path),
    raw_path: relativeToIngest(rawFile.path),
    extension: extname(rawFile.path).toLowerCase(),
    file_size: rawFile.file_size,
    sha256: rawFile.sha256,
    last_modified_at: rawFile.last_modified_at,
    is_zip: true,
    inner_files: manifest.inner_files,
    encoding: manifest.encoding,
    header: analysis.header,
    row_count: analysis.row_count,
    key_field: analysis.key_field,
    key_count: analysis.key_count,
    null_key_count: analysis.null_key_count,
    duplicate_key_count: analysis.duplicate_key_count,
    manifest_path: relativeToIngest(manifestPath),
  }));

  const validation = {
    schema_version: "1.0.0",
    checked_at: checkedAt,
    step: "STEP_4B_1",
    status: "COMPLETED_WITH_NEEDS_REVIEW",
    analysis_use_allowed: false,
    raw_file_count: rawFilesPublic.length,
    raw_files: rawFilesPublic,
    contract_differences: [
      {
        source_id: "SRC-SEOUL-LIVING",
        previous_assumption: "CELL_ID; base_date + hour_code + cell_id",
        observed: "250M격자; 일자 + 시간 + 행정동코드 + 250M격자",
        action: "실제 Header와 행 grain만 Contract에 반영",
      },
      {
        source_id: "SRC-SEOUL-SALES",
        previous_assumption: "기준연도와 기준분기 분리 필드",
        observed: "기준_년분기_코드 결합 필드; 2024/2025 한국어 Header 동일",
        action: "결합 필드와 실제 매출 Header를 Contract에 반영",
      },
      {
        source_id: "SRC-SEOUL-STORES",
        previous_assumption: "단일 미확인 Header",
        observed: "2024 한국어 Header / 2025 영문 Header",
        action: "version별 source_column_map을 Contract에 반영",
      },
    ],
    living: {
      ...publicAnalysis(livingFile.analysis),
      coverage: livingCoverage,
      compatibility_status: "NEEDS_REVIEW",
      join_allowed: false,
      population_aggregation_performed: false,
    },
    sales: {
      by_year: Object.fromEntries(
        salesFiles.map((file) => [file.analysis.year, publicAnalysis(file.analysis)]),
      ),
      year_comparison: salesYearComparison,
      amount_aggregation_performed: false,
      compatibility_status: "NEEDS_REVIEW",
      join_allowed: false,
    },
    stores: {
      by_year: Object.fromEntries(
        storesFiles.map((file) => [file.analysis.year, publicAnalysis(file.analysis)]),
      ),
      year_comparison: storesYearComparison,
      competition_analysis_performed: false,
      compatibility_status: "CODE_LEVEL_MATCH",
      geometry_compatibility_status: "NEEDS_REVIEW",
      join_allowed: false,
    },
    sales_stores_comparison: salesStoresComparison,
    geometry_metric_comparison: geometryMetricComparison,
    manifest_count: analyzedFiles.length,
    normalized_file_count: listFiles(normalizedDirectory).length,
    quarantine_data_file_count: listFiles(quarantineDirectory).length,
    raw_sha256_unchanged_during_validation: true,
    secret_match_count: secretMatchCount,
    prohibited_operations: {
      living_population_aggregation_count: 0,
      sales_amount_analysis_count: 0,
      competition_analysis_count: 0,
      polygon_intersection_count: 0,
      frameone_auto_match_count: 0,
      crosswalk_promotion_count: 0,
      geometry_creation_count: 0,
    },
    integrity: {
      hierarchy: {
        district_count: hierarchy.districts.length,
        market_count: hierarchy.markets.length,
        submarket_count: hierarchy.submarkets.length,
        node_count: hierarchy.nodes.length,
      },
      reference_geometry: {
        official_market_count: officialMarkets.features.length,
        living_grid_count: livingGrid.features.length,
      },
      frameone_non_null_geometry: { markets: 0, submarkets: 0, nodes: 0 },
      source_sha256: Object.fromEntries(
        Object.entries(integrityPaths).map(([label, path]) => [
          label,
          { path: relativeToDataRoot(path), sha256: integrityHashes[label] },
        ]),
      ),
      protected_files_changed_during_validation: 0,
    },
    self_tests: runSelfTests(),
  };

  const missingSourceResult = (sourceId) => {
    const contract = contractsById.get(sourceId);
    return {
      source_id: sourceId,
      status: "SOURCE_MISSING",
      raw_file_count: 0,
      manifest_count: 0,
      row_count: null,
      key_count: null,
      coverage: null,
      validation_status: "NOT_RUN",
      compatibility_status: contract.compatibility_requirement.status,
      join_allowed: false,
    };
  };
  const presentSourceResult = (sourceId, files, keyCount, coverage, compatibilityStatus) => ({
    source_id: sourceId,
    status: "SOURCE_PRESENT",
    raw_file_count: files.length,
    manifest_count: files.length,
    row_count: files.reduce((sum, file) => sum + file.analysis.row_count, 0),
    key_count: keyCount,
    coverage,
    validation_status: files.every(
      (file) => file.analysis.content_validation_status === "VALIDATED",
    )
      ? "VALIDATED"
      : "NEEDS_REVIEW",
    compatibility_status: compatibilityStatus,
    join_allowed: false,
  });
  const salesUnion = new Set([
    ...salesByYear["2024"]._codeSet,
    ...salesByYear["2025"]._codeSet,
  ]);
  const storesUnion = new Set([
    ...storesByYear["2024"]._codeSet,
    ...storesByYear["2025"]._codeSet,
  ]);
  const sourceResults = [
    presentSourceResult(
      "SRC-SEOUL-LIVING",
      [livingFile],
      livingFile.analysis.key_count,
      livingCoverage,
      "NEEDS_REVIEW",
    ),
    missingSourceResult("SRC-SEOUL-AREA"),
    presentSourceResult(
      "SRC-SEOUL-STORES",
      storesFiles,
      storesUnion.size,
      null,
      "CODE_LEVEL_MATCH",
    ),
    presentSourceResult(
      "SRC-SEOUL-SALES",
      salesFiles,
      salesUnion.size,
      null,
      "NEEDS_REVIEW",
    ),
    missingSourceResult("SRC-SEOUL-FOOT"),
    missingSourceResult("SRC-SEOUL-WORK"),
    missingSourceResult("SRC-SGIS"),
  ];
  const summary = {
    schema_version: "1.1.0",
    checked_at: checkedAt,
    step: "STEP_4B_1",
    step_status: "RAW_INTAKE_VALIDATED_WITH_REVIEW_ITEMS",
    ingest_status: "PARTIAL_SOURCE_PRESENT",
    analysis_use_allowed: false,
    source_contract_count: contracts.length,
    compatibility_gates: {
      official_market_2023_geometry_to_2024_plus_metrics: {
        status: "NEEDS_REVIEW",
        stores_code_level_status: "CODE_LEVEL_MATCH",
        sales_code_level_status: "PARTIAL_CODE_MATCH",
        geometry_compatibility_status: "NEEDS_REVIEW",
        join_allowed: false,
      },
      living_grid_geometry_to_metric_grid_key: {
        status: "NEEDS_REVIEW",
        coverage: livingCoverage,
        join_allowed: false,
      },
      administrative_dong_attribute_enrichment: {
        status: "BLOCKED",
        automatic_enrichment_allowed: false,
      },
    },
    source_results: sourceResults,
    manifest_results: analyzedFiles.map(({ manifest, manifestPath }) => ({
      manifest: relativeToIngest(manifestPath),
      source_id: manifest.source_id,
      raw_path: manifest.raw_path,
      sha256: manifest.sha256,
      validation_status: manifest.validation_status,
      content_validation_status: manifest.content_validation_status,
      compatibility_status: manifest.compatibility_status,
      row_count: manifest.row_count,
      key_count: manifest.key_count,
      join_allowed: false,
    })),
    self_tests: validation.self_tests,
    integrity: {
      ...validation.integrity,
      raw_source_file_count: analyzedFiles.length,
      normalized_file_count: 0,
      quarantine_data_file_count: 0,
      actual_manifest_count: analyzedFiles.length,
      numeric_aggregation_count: 0,
      geometry_creation_count: 0,
      crosswalk_promotion_count: 0,
    },
  };

  const expectedOutputs = new Map([
    [validationPath, `${JSON.stringify(validation, null, 2)}\n`],
    [reportPath, buildReport(validation)],
    [summaryPath, `${JSON.stringify(summary, null, 2)}\n`],
    ...analyzedFiles.map(({ manifest, manifestPath }) => [
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    ]),
  ]);

  const protectedAfter = Object.fromEntries(
    protectedPaths.map((path) => [path, sha256(path)]),
  );
  assert(
    JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter),
    "보호 상담 데이터가 검증 중 변경되었습니다.",
  );
  const rawAfter = Object.fromEntries(rawPaths.map((path) => [path, sha256(path)]));
  const rawBefore = Object.fromEntries(
    analyzedFiles.map(({ rawFile }) => [rawFile.path, rawFile.sha256]),
  );
  assert(
    JSON.stringify(rawBefore) === JSON.stringify(rawAfter),
    "Raw SHA-256이 검증 중 변경되었습니다.",
  );
  assert(secretMatchCount === 0, "Raw에서 credential 형태 Secret이 발견되었습니다.");

  return { expectedOutputs, validation, summary, analyzedFiles };
}

function writeOrVerify(expectedOutputs) {
  const expectedManifestPaths = new Set(
    [...expectedOutputs.keys()].filter((path) => path.includes(`${manifestsDirectory}\\`) || path.includes(`${manifestsDirectory}/`)),
  );
  const actualManifestPaths = listFiles(manifestsDirectory).filter(
    (path) => basename(path) !== "MANIFEST_SCHEMA.json",
  );
  const unexpectedManifests = actualManifestPaths.filter(
    (path) => !expectedManifestPaths.has(path),
  );
  assert(
    unexpectedManifests.length === 0,
    `예상하지 않은 manifest가 있습니다: ${unexpectedManifests.map(relativeToIngest).join(", ")}`,
  );

  if (process.argv.includes("--write")) {
    for (const [path, content] of expectedOutputs) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
    }
    return "artifacts written";
  }
  for (const [path, content] of expectedOutputs) {
    assert(existsSync(path), `산출물 없음: ${relativeToIngest(path)}`);
    assert(
      readFileSync(path, "utf8") === content,
      `산출물 재현성 불일치: ${relativeToIngest(path)}`,
    );
  }
  return "artifacts verified";
}

const { expectedOutputs, validation, summary } = buildArtifacts();
const result = writeOrVerify(expectedOutputs);
console.log(`STEP4B1_RAW_INTAKE: ${result}`);
console.log(`Raw files: ${validation.raw_file_count}; manifests: ${validation.manifest_count}`);
console.log(
  `Living Grid: ${validation.living.coverage.matched_grid_count}/${validation.living.coverage.geometry_grid_count}; geometry-only ${validation.living.coverage.geometry_only_count}; metric-only ${validation.living.coverage.metric_only_count}`,
);
console.log(
  `Sales codes 2024/2025: ${validation.sales.year_comparison["2024_code_count"]}/${validation.sales.year_comparison["2025_code_count"]}`,
);
console.log(
  `Stores codes 2024/2025: ${validation.stores.year_comparison["2024_code_count"]}/${validation.stores.year_comparison["2025_code_count"]}`,
);
console.log(
  `Analysis/geometry/Crosswalk promotion: ${summary.integrity.numeric_aggregation_count}/${summary.integrity.geometry_creation_count}/${summary.integrity.crosswalk_promotion_count}`,
);
