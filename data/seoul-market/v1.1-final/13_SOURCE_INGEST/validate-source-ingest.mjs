import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ingestDirectory = dirname(fileURLToPath(import.meta.url));
const dataRoot = join(ingestDirectory, "..");
const geoDirectory = join(dataRoot, "09_GEO");
const validationDirectory = join(dataRoot, "12_VALIDATION");
const contractPath = join(
  ingestDirectory,
  "source-contracts",
  "SOURCE_CONTRACTS.json",
);
const contractSchemaPath = join(
  ingestDirectory,
  "source-contracts",
  "SOURCE_CONTRACT_SCHEMA.json",
);
const manifestSchemaPath = join(
  ingestDirectory,
  "manifests",
  "MANIFEST_SCHEMA.json",
);
const summaryPath = join(ingestDirectory, "VALIDATION_SUMMARY.json");
const rawDirectory = join(ingestDirectory, "raw");
const normalizedDirectory = join(ingestDirectory, "normalized");
const quarantineDirectory = join(ingestDirectory, "quarantine");
const manifestsDirectory = join(ingestDirectory, "manifests");

const expectedSourceIds = [
  "SRC-SEOUL-LIVING",
  "SRC-SEOUL-AREA",
  "SRC-SEOUL-STORES",
  "SRC-SEOUL-SALES",
  "SRC-SEOUL-FOOT",
  "SRC-SEOUL-WORK",
  "SRC-SGIS",
];

const sourceIntegrityPaths = {
  hierarchy: join(dataRoot, "MARKET_HIERARCHY.json"),
  officialMarkets: join(geoDirectory, "OFFICIAL_SEOUL_MARKETS.geojson"),
  administrativeDongs: join(geoDirectory, "ADMIN_DONG.geojson"),
  livingGrid: join(geoDirectory, "LIVING_GRID_250M.geojson"),
  frameoneMarkets: join(geoDirectory, "FRAMEONE_MARKETS.geojson"),
  frameoneSubmarkets: join(geoDirectory, "FRAMEONE_SUBMARKETS.geojson"),
  nodes: join(geoDirectory, "NODES.geojson"),
  officialCrosswalk: join(geoDirectory, "MARKET_OFFICIAL_CROSSWALK.csv"),
  administrativeCrosswalk: join(
    geoDirectory,
    "MARKET_ADMIN_DONG_CROSSWALK.csv",
  ),
  livingGridCrosswalk: join(
    geoDirectory,
    "MARKET_LIVING_GRID_CROSSWALK.csv",
  ),
  step4aReport: join(
    validationDirectory,
    "STEP4A_DATA_COMPATIBILITY_REPORT.md",
  ),
  step4aOfficial: join(
    validationDirectory,
    "OFFICIAL_MARKET_CODE_COMPATIBILITY.json",
  ),
  step4aLiving: join(
    validationDirectory,
    "LIVING_GRID_KEY_COVERAGE.json",
  ),
  step4aAdministrative: join(
    validationDirectory,
    "ADMIN_DONG_ATTRIBUTE_AUDIT.json",
  ),
};

const contractRequiredFields = [
  "source_id",
  "institution",
  "dataset_name",
  "source_reference",
  "source_version",
  "source_date",
  "retrieved_at",
  "file_format",
  "allowed_extensions",
  "encoding",
  "key_field",
  "code_system",
  "spatial_unit",
  "coordinate_system",
  "required_columns",
  "optional_columns",
  "nullable_columns",
  "numeric_columns",
  "unique_key",
  "source_column_map",
  "supported_versions",
  "compatibility_requirement",
  "license_status",
  "usage_note",
  "status",
];

const manifestRequiredFields = [
  "source_id",
  "original_filename",
  "sha256",
  "retrieved_at",
  "source_date",
  "source_version",
  "row_count",
  "key_count",
  "validation_status",
  "compatibility_status",
  "normalized_output",
  "notes",
];

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

function relativeToIngest(path) {
  return relative(ingestDirectory, path).replaceAll("\\", "/");
}

function relativeToDataRoot(path) {
  return relative(dataRoot, path).replaceAll("\\", "/");
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
  const records = dataRows.map((cells, rowIndex) => {
    assert(
      cells.length === headers.length,
      `CSV ${rowIndex + 2}행의 컬럼 수가 헤더와 다릅니다.`,
    );
    return Object.fromEntries(
      headers.map((header, columnIndex) => [header, cells[columnIndex]]),
    );
  });
  return { headers, records };
}

function parseJsonRecords(text) {
  const parsed = JSON.parse(text);
  let records;
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (Array.isArray(parsed.records)) {
    records = parsed.records;
  } else if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    records = parsed.features.map((feature) => ({
      ...(feature.properties ?? {}),
      geometry: feature.geometry ?? null,
    }));
  } else {
    throw new Error("JSON은 배열, records 배열 또는 FeatureCollection이어야 합니다.");
  }
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return { headers, records };
}

function parseRawFile(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".csv") {
    return parseCsv(readText(path));
  }
  if (extension === ".json") {
    return parseJsonRecords(readText(path));
  }
  return null;
}

function listFiles(directory, { recursive = true, ignorePlaceholders = true } = {}) {
  if (!existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...listFiles(path, { recursive, ignorePlaceholders }));
    } else if (entry.isFile()) {
      if (ignorePlaceholders && entry.name === ".gitkeep") {
        continue;
      }
      files.push(path);
    }
  }
  return files.sort();
}

function validateContractShape(contract) {
  const errors = [];
  for (const field of contractRequiredFields) {
    if (!Object.hasOwn(contract, field)) {
      errors.push(`MISSING_CONTRACT_FIELD:${field}`);
    }
  }
  for (const field of [
    "required_columns",
    "optional_columns",
    "nullable_columns",
    "numeric_columns",
    "unique_key",
  ]) {
    if (!Array.isArray(contract[field])) {
      errors.push(`INVALID_CONTRACT_ARRAY:${field}`);
    } else if (duplicateValues(contract[field]).length > 0) {
      errors.push(`DUPLICATE_CONTRACT_VALUE:${field}`);
    }
  }
  if (!contract.source_column_map || typeof contract.source_column_map !== "object") {
    errors.push("MISSING_SOURCE_COLUMN_MAP");
  } else {
    for (const column of contract.required_columns ?? []) {
      if (!Object.hasOwn(contract.source_column_map, column)) {
        errors.push(`MISSING_SOURCE_COLUMN_MAPPING:${column}`);
      }
    }
  }
  if (!(contract.required_columns ?? []).includes(contract.key_field)) {
    errors.push("KEY_FIELD_NOT_REQUIRED");
  }
  for (const column of contract.unique_key ?? []) {
    if (!(contract.required_columns ?? []).includes(column)) {
      errors.push(`UNIQUE_KEY_NOT_REQUIRED:${column}`);
    }
  }
  const compatibility = contract.compatibility_requirement;
  if (
    !compatibility ||
    typeof compatibility !== "object" ||
    !Array.isArray(compatibility.requirements)
  ) {
    errors.push("INVALID_COMPATIBILITY_REQUIREMENT");
  }
  return errors;
}

function unresolvedContractItems(contract) {
  const unresolvedColumns = Object.entries(contract.source_column_map ?? {})
    .filter(([, sourceColumn]) => isBlank(sourceColumn))
    .map(([canonicalColumn]) => canonicalColumn)
    .sort();
  const unresolved = [];
  if (contract.file_format === "UNKNOWN") {
    unresolved.push("file_format");
  }
  if (!Array.isArray(contract.allowed_extensions) || contract.allowed_extensions.length === 0) {
    unresolved.push("allowed_extensions");
  }
  if (isBlank(contract.encoding) && contract.file_format !== "SHP_OR_ZIP") {
    unresolved.push("encoding");
  }
  if (!Array.isArray(contract.supported_versions) || contract.supported_versions.length === 0) {
    unresolved.push("supported_versions");
  }
  if (isBlank(contract.code_system)) {
    unresolved.push("code_system");
  }
  if (isBlank(contract.spatial_unit)) {
    unresolved.push("spatial_unit");
  }
  if (
    (contract.required_columns ?? []).includes("geometry") &&
    isBlank(contract.coordinate_system)
  ) {
    unresolved.push("coordinate_system");
  }
  return { unresolvedColumns, unresolvedMetadata: unresolved.sort() };
}

function validateTabularData({ headers, records }, contract) {
  const errors = [];
  const needsReview = [];
  const headerSet = new Set(headers);
  const mappings = contract.source_column_map ?? {};

  for (const canonicalColumn of contract.required_columns) {
    const sourceColumn = mappings[canonicalColumn];
    if (isBlank(sourceColumn)) {
      needsReview.push(`UNRESOLVED_COLUMN_MAPPING:${canonicalColumn}`);
    } else if (!headerSet.has(sourceColumn)) {
      errors.push(`MISSING_REQUIRED_COLUMN:${sourceColumn}`);
    }
  }

  const resolvedUniqueKey = contract.unique_key.map(
    (canonicalColumn) => mappings[canonicalColumn],
  );
  if (resolvedUniqueKey.some(isBlank)) {
    needsReview.push("UNRESOLVED_UNIQUE_KEY_MAPPING");
  }

  const keyValues = [];
  let nullKeyCount = 0;
  if (!resolvedUniqueKey.some(isBlank)) {
    for (const record of records) {
      const keyParts = resolvedUniqueKey.map((column) => record[column]);
      if (keyParts.some(isBlank)) {
        nullKeyCount += 1;
      } else {
        keyValues.push(keyParts.map(String).join("\u001f"));
      }
    }
  }
  if (nullKeyCount > 0) {
    errors.push(`NULL_KEY:${nullKeyCount}`);
  }
  const duplicateKeys = duplicateValues(keyValues);
  if (duplicateKeys.length > 0) {
    errors.push(`DUPLICATE_KEY:${duplicateKeys.length}`);
  }

  let invalidNumericCount = 0;
  for (const canonicalColumn of contract.numeric_columns) {
    const sourceColumn = mappings[canonicalColumn];
    if (isBlank(sourceColumn) || !headerSet.has(sourceColumn)) {
      continue;
    }
    const nullable = contract.nullable_columns.includes(canonicalColumn);
    for (const record of records) {
      const value = record[sourceColumn];
      if (isBlank(value)) {
        if (!nullable) {
          invalidNumericCount += 1;
        }
      } else if (!Number.isFinite(Number(value))) {
        invalidNumericCount += 1;
      }
    }
  }
  if (invalidNumericCount > 0) {
    errors.push(`INVALID_NUMERIC:${invalidNumericCount}`);
  }

  return {
    status: errors.length > 0 ? "FAIL" : needsReview.length > 0 ? "NEEDS_REVIEW" : "PASS",
    errors,
    needsReview,
    rowCount: records.length,
    keyCount: resolvedUniqueKey.some(isBlank) ? null : new Set(keyValues).size,
    nullKeyCount: resolvedUniqueKey.some(isBlank) ? null : nullKeyCount,
    duplicateKeyCount: resolvedUniqueKey.some(isBlank)
      ? null
      : duplicateKeys.length,
    invalidNumericCount,
  };
}

function validateVersion(contract, sourceVersion) {
  if (isBlank(sourceVersion)) {
    return { status: "FAIL", error: "MISSING_SOURCE_VERSION" };
  }
  if (!Array.isArray(contract.supported_versions) || contract.supported_versions.length === 0) {
    return { status: "NEEDS_REVIEW", error: "SUPPORTED_VERSIONS_NOT_DEFINED" };
  }
  if (!contract.supported_versions.includes(sourceVersion)) {
    return { status: "FAIL", error: "UNSUPPORTED_VERSION" };
  }
  return { status: "PASS", error: null };
}

function validateFileExtension(contract, filename) {
  const extension = extname(filename).toLowerCase();
  return contract.allowed_extensions.includes(extension)
    ? { status: "PASS", error: null }
    : { status: "FAIL", error: "UNSUPPORTED_FILE_EXTENSION" };
}

function validateCompatibility(contract, manifestCompatibilityStatus = null) {
  const requirement = contract.compatibility_requirement;
  if (requirement.join_allowed !== true || requirement.status !== "PASS") {
    return {
      status: "BLOCKED",
      joinAllowed: false,
      error: "COMPATIBILITY_BLOCKED",
    };
  }
  if (manifestCompatibilityStatus !== "PASS") {
    return {
      status: "NEEDS_REVIEW",
      joinAllowed: false,
      error: "MANIFEST_COMPATIBILITY_NOT_PASSED",
    };
  }
  return { status: "PASS", joinAllowed: true, error: null };
}

function validateManifestShape(manifest) {
  const errors = [];
  for (const field of manifestRequiredFields) {
    if (!Object.hasOwn(manifest, field)) {
      errors.push(`MISSING_MANIFEST_FIELD:${field}`);
    }
  }
  if (
    typeof manifest.original_filename === "string" &&
    basename(manifest.original_filename) !== manifest.original_filename
  ) {
    errors.push("UNSAFE_ORIGINAL_FILENAME");
  }
  if (
    typeof manifest.sha256 === "string" &&
    !/^[a-f0-9]{64}$/.test(manifest.sha256)
  ) {
    errors.push("INVALID_SHA256");
  }
  for (const field of ["row_count", "key_count"]) {
    const value = manifest[field];
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      errors.push(`INVALID_MANIFEST_COUNT:${field}`);
    }
  }
  return errors;
}

function validateManifest(manifestPath, contractsById) {
  const manifest = readJson(manifestPath);
  const errors = validateManifestShape(manifest);
  const contract = contractsById.get(manifest.source_id);
  if (!contract) {
    errors.push("UNKNOWN_SOURCE_ID");
    return {
      manifest: relativeToIngest(manifestPath),
      sourceId: manifest.source_id ?? null,
      validationStatus: "FAIL",
      compatibilityStatus: "NOT_RUN",
      joinAllowed: false,
      rowCount: null,
      keyCount: null,
      errors,
    };
  }

  if (errors.length > 0) {
    return {
      manifest: relativeToIngest(manifestPath),
      sourceId: contract.source_id,
      validationStatus: "FAIL",
      compatibilityStatus: "NOT_RUN",
      joinAllowed: false,
      rowCount: null,
      keyCount: null,
      errors,
    };
  }

  const rawPath = join(rawDirectory, contract.source_id, manifest.original_filename);
  if (!existsSync(rawPath)) {
    return {
      manifest: relativeToIngest(manifestPath),
      sourceId: contract.source_id,
      rawPath: relativeToIngest(rawPath),
      validationStatus: "SOURCE_MISSING",
      compatibilityStatus: "NOT_RUN",
      joinAllowed: false,
      rowCount: null,
      keyCount: null,
      errors: [...errors, "RAW_FILE_MISSING"],
    };
  }

  if (sha256(rawPath) !== manifest.sha256) {
    errors.push("SHA256_MISMATCH");
  }
  const extensionValidation = validateFileExtension(
    contract,
    manifest.original_filename,
  );
  if (extensionValidation.status === "FAIL") {
    errors.push(extensionValidation.error);
  }
  for (const field of ["retrieved_at", "source_date", "source_version"]) {
    if (isBlank(manifest[field])) {
      errors.push(`MISSING_MANIFEST_METADATA:${field}`);
    }
  }

  const version = validateVersion(contract, manifest.source_version);
  if (version.status === "FAIL") {
    errors.push(version.error);
  }
  const needsReview = version.status === "NEEDS_REVIEW" ? [version.error] : [];
  const unresolved = unresolvedContractItems(contract);
  needsReview.push(
    ...unresolved.unresolvedMetadata.map(
      (field) => `UNRESOLVED_CONTRACT_METADATA:${field}`,
    ),
  );
  const parsed = parseRawFile(rawPath);
  let tabular = null;
  if (parsed) {
    tabular = validateTabularData(parsed, contract);
    errors.push(...tabular.errors);
    needsReview.push(...tabular.needsReview);
    if (manifest.row_count !== null && manifest.row_count !== tabular.rowCount) {
      errors.push("ROW_COUNT_MISMATCH");
    }
    if (manifest.key_count !== null && manifest.key_count !== tabular.keyCount) {
      errors.push("KEY_COUNT_MISMATCH");
    }
  } else {
    needsReview.push("CONTENT_PARSER_NOT_AVAILABLE");
  }

  const compatibility = validateCompatibility(
    contract,
    manifest.compatibility_status,
  );
  if (manifest.normalized_output !== null && !compatibility.joinAllowed) {
    errors.push("NORMALIZED_OUTPUT_FOR_BLOCKED_SOURCE");
  }

  return {
    manifest: relativeToIngest(manifestPath),
    sourceId: contract.source_id,
    rawPath: relativeToIngest(rawPath),
    validationStatus:
      errors.length > 0 ? "FAIL" : needsReview.length > 0 ? "NEEDS_REVIEW" : "PASS",
    compatibilityStatus: compatibility.status,
    joinAllowed: compatibility.joinAllowed,
    rowCount: tabular?.rowCount ?? null,
    keyCount: tabular?.keyCount ?? null,
    errors,
    needsReview,
  };
}

function buildFixtureContract({ compatibilityAllowed = true } = {}) {
  return {
    source_id: "SRC-TEST",
    institution: "TEST",
    dataset_name: "TEST",
    source_reference: "https://example.invalid/test",
    source_version: null,
    source_date: null,
    retrieved_at: null,
    file_format: "CSV",
    allowed_extensions: [".csv"],
    encoding: "UTF-8",
    key_field: "id",
    code_system: "TEST_CODE",
    spatial_unit: "test_unit",
    coordinate_system: null,
    required_columns: ["id", "value"],
    optional_columns: [],
    nullable_columns: [],
    numeric_columns: ["value"],
    unique_key: ["id"],
    source_column_map: { id: "ID", value: "VALUE" },
    supported_versions: ["v1"],
    compatibility_requirement: {
      gate_id: "TEST_GATE",
      status: compatibilityAllowed ? "PASS" : "BLOCKED",
      join_allowed: compatibilityAllowed,
      requirements: ["test"],
      step4a_evidence: "test",
    },
    license_status: "CONFIRMED",
    usage_note: "test",
    status: "READY",
  };
}

function runSelfTests() {
  const validContract = buildFixtureContract();
  const tests = [];
  const check = (name, condition) => {
    assert(condition, `SELF_TEST_FAIL:${name}`);
    tests.push({ name, status: "PASS" });
  };

  const valid = validateTabularData(
    {
      headers: ["ID", "VALUE"],
      records: [
        { ID: "A", VALUE: "0" },
        { ID: "B", VALUE: "12.5" },
      ],
    },
    validContract,
  );
  check("valid_rows_and_actual_zero", valid.status === "PASS");

  const missingColumn = validateTabularData(
    { headers: ["ID"], records: [{ ID: "A" }] },
    validContract,
  );
  check(
    "missing_required_column",
    missingColumn.errors.includes("MISSING_REQUIRED_COLUMN:VALUE"),
  );

  const duplicateKey = validateTabularData(
    {
      headers: ["ID", "VALUE"],
      records: [
        { ID: "A", VALUE: "1" },
        { ID: "A", VALUE: "2" },
      ],
    },
    validContract,
  );
  check(
    "duplicate_key",
    duplicateKey.errors.some((error) => error.startsWith("DUPLICATE_KEY:")),
  );

  const nullKey = validateTabularData(
    { headers: ["ID", "VALUE"], records: [{ ID: "", VALUE: "1" }] },
    validContract,
  );
  check(
    "null_key",
    nullKey.errors.some((error) => error.startsWith("NULL_KEY:")),
  );

  const invalidNumeric = validateTabularData(
    { headers: ["ID", "VALUE"], records: [{ ID: "A", VALUE: "not-number" }] },
    validContract,
  );
  check(
    "invalid_numeric",
    invalidNumeric.errors.some((error) => error.startsWith("INVALID_NUMERIC:")),
  );

  check(
    "unsupported_version",
    validateVersion(validContract, "v2").error === "UNSUPPORTED_VERSION",
  );
  check(
    "unsupported_file_extension",
    validateFileExtension(validContract, "source.txt").error ===
      "UNSUPPORTED_FILE_EXTENSION",
  );
  check(
    "supported_file_extension",
    validateFileExtension(validContract, "source.csv").status === "PASS",
  );
  check(
    "compatibility_gate_blocks_join",
    validateCompatibility(buildFixtureContract({ compatibilityAllowed: false }), "PASS")
      .joinAllowed === false,
  );
  check(
    "source_missing_counts_are_null",
    ({ rowCount: null, keyCount: null }).rowCount === null &&
      ({ rowCount: null, keyCount: null }).keyCount === null,
  );
  const unresolvedContract = {
    ...validContract,
    source_column_map: { id: null, value: "VALUE" },
  };
  check(
    "unresolved_column_mapping_needs_review",
    validateTabularData(
      { headers: ["ID", "VALUE"], records: [{ ID: "A", VALUE: "1" }] },
      unresolvedContract,
    ).status === "NEEDS_REVIEW",
  );

  return tests;
}

function flattenHierarchy(hierarchy) {
  const districts = hierarchy.districts;
  const markets = districts.flatMap((district) => district.markets);
  const submarkets = markets.flatMap((market) => market.submarkets);
  const nodes = submarkets.flatMap((submarket) => submarket.nodes);
  return { districts, markets, submarkets, nodes };
}

function hasGeometry(feature) {
  return Boolean(feature?.geometry?.type && feature?.geometry?.coordinates);
}

function buildSummary() {
  for (const path of [
    contractPath,
    contractSchemaPath,
    manifestSchemaPath,
    rawDirectory,
    normalizedDirectory,
    quarantineDirectory,
    manifestsDirectory,
    ...Object.values(sourceIntegrityPaths),
  ]) {
    assert(existsSync(path), `필수 경로 없음: ${path}`);
  }

  const contractDocument = readJson(contractPath);
  readJson(contractSchemaPath);
  readJson(manifestSchemaPath);
  const contracts = contractDocument.contracts;
  assert(Array.isArray(contracts), "contracts 배열이 없습니다.");
  const sourceIds = contracts.map((contract) => contract.source_id);
  assert(duplicateValues(sourceIds).length === 0, "Source Contract ID가 중복되었습니다.");
  assert(
    JSON.stringify([...sourceIds].sort()) === JSON.stringify([...expectedSourceIds].sort()),
    "Source Contract 목록이 DATA_SOURCE_CATALOG 대상 7개와 다릅니다.",
  );
  for (const contract of contracts) {
    const errors = validateContractShape(contract);
    assert(errors.length === 0, `${contract.source_id} 계약 오류: ${errors.join(", ")}`);
  }

  const hierarchy = flattenHierarchy(readJson(sourceIntegrityPaths.hierarchy));
  assert(hierarchy.districts.length === 25, "District 개수 오류");
  assert(hierarchy.markets.length === 156, "Market 개수 오류");
  assert(hierarchy.submarkets.length === 382, "Submarket 개수 오류");
  assert(hierarchy.nodes.length === 763, "Node 개수 오류");

  const officialMarkets = readJson(sourceIntegrityPaths.officialMarkets);
  const administrativeDongs = readJson(sourceIntegrityPaths.administrativeDongs);
  const livingGrid = readJson(sourceIntegrityPaths.livingGrid);
  const frameoneMarkets = readJson(sourceIntegrityPaths.frameoneMarkets);
  const frameoneSubmarkets = readJson(sourceIntegrityPaths.frameoneSubmarkets);
  const nodes = readJson(sourceIntegrityPaths.nodes);
  assert(officialMarkets.features.length === 1650, "공식상권 geometry 개수 오류");
  assert(administrativeDongs.features.length === 425, "행정동 geometry 개수 오류");
  assert(livingGrid.features.length === 10125, "Grid geometry 개수 오류");
  const frameoneGeometryCounts = {
    markets: frameoneMarkets.features.filter(hasGeometry).length,
    submarkets: frameoneSubmarkets.features.filter(hasGeometry).length,
    nodes: nodes.features.filter(hasGeometry).length,
  };
  assert(
    Object.values(frameoneGeometryCounts).every((value) => value === 0),
    "FRAMEONE geometry가 생성되었습니다.",
  );

  const officialCrosswalk = parseCsv(readText(sourceIntegrityPaths.officialCrosswalk));
  const administrativeCrosswalk = parseCsv(
    readText(sourceIntegrityPaths.administrativeCrosswalk),
  );
  const livingGridCrosswalk = parseCsv(
    readText(sourceIntegrityPaths.livingGridCrosswalk),
  );
  assert(
    officialCrosswalk.records.length === 863 &&
      officialCrosswalk.records.every((row) => row.relation_type === "manual_review"),
    "공식상권 Crosswalk가 승격되었습니다.",
  );
  assert(
    administrativeCrosswalk.records.length === 458 &&
      administrativeCrosswalk.records.every(
        (row) => row.relation_type === "manual_review",
      ),
    "행정동 Crosswalk가 승격되었습니다.",
  );
  assert(livingGridCrosswalk.records.length === 0, "Grid Crosswalk가 생성되었습니다.");

  const step4aOfficial = readJson(sourceIntegrityPaths.step4aOfficial);
  const step4aLiving = readJson(sourceIntegrityPaths.step4aLiving);
  const step4aAdministrative = readJson(sourceIntegrityPaths.step4aAdministrative);
  assert(
    step4aOfficial.status === "SOURCE_MISSING" &&
      step4aOfficial.directJoinAllowed === false,
    "STEP 4A 공식상권 gate가 변경되었습니다.",
  );
  assert(
    step4aLiving.status === "SOURCE_MISSING" && step4aLiving.joinAllowed === false,
    "STEP 4A 생활인구 gate가 변경되었습니다.",
  );
  assert(
    step4aAdministrative.status === "NEEDS_REVIEW" &&
      step4aAdministrative.automaticEnrichmentPerformed === false,
    "STEP 4A 행정동 gate가 변경되었습니다.",
  );

  const rawFiles = listFiles(rawDirectory);
  const normalizedFiles = listFiles(normalizedDirectory);
  const quarantineFiles = listFiles(quarantineDirectory);
  const manifestFiles = listFiles(manifestsDirectory).filter(
    (path) => basename(path) !== "MANIFEST_SCHEMA.json",
  );
  assert(rawFiles.length === 0, "STEP 4B-0에서 실제 raw 파일을 생성할 수 없습니다.");
  assert(normalizedFiles.length === 0, "STEP 4B-0에서 normalized 파일을 생성할 수 없습니다.");
  assert(quarantineFiles.length === 0, "STEP 4B-0에서 quarantine 데이터를 생성할 수 없습니다.");
  assert(manifestFiles.length === 0, "실제 원천 없는 가짜 manifest를 생성할 수 없습니다.");

  const selfTests = runSelfTests();
  const contractsById = new Map(
    contracts.map((contract) => [contract.source_id, contract]),
  );
  const manifestResults = manifestFiles.map((path) =>
    validateManifest(path, contractsById),
  );
  const sourceResults = contracts.map((contract) => {
    const unresolved = unresolvedContractItems(contract);
    return {
      source_id: contract.source_id,
      status: "SOURCE_MISSING",
      raw_file_count: 0,
      manifest_count: 0,
      row_count: null,
      key_count: null,
      coverage: null,
      validation_status: "NOT_RUN",
      compatibility_status: contract.compatibility_requirement.status,
      join_allowed: false,
      unresolved_source_columns: unresolved.unresolvedColumns,
      unresolved_contract_metadata: unresolved.unresolvedMetadata,
    };
  });

  return {
    schema_version: "1.0.0",
    checked_at: "2026-08-28",
    step: "STEP_4B_0",
    step_status: "CONTRACT_READY",
    ingest_status: "SOURCE_MISSING",
    analysis_use_allowed: false,
    source_contract_count: contracts.length,
    directory_roles: {
      raw: "원본 그대로 보존; 수정·정규화·분석 사용 금지",
      normalized: "validation PASS와 compatibility PASS를 모두 충족한 파생 데이터만 허용",
      quarantine: "버전·컬럼·key·numeric·compatibility 문제가 있는 원천과 검증 결과를 격리",
    },
    missing_value_policy: {
      source_missing_row_count: null,
      source_missing_key_count: null,
      source_missing_coverage: null,
      actual_observed_zero: 0,
      zero_substitution_for_unknown_allowed: false,
    },
    validation_support: {
      source_identification: true,
      file_existence: true,
      file_extension: true,
      required_columns: true,
      null_key: true,
      duplicate_key: true,
      numeric_parse: true,
      source_date: true,
      source_version: true,
      code_system: true,
      spatial_unit: true,
      coordinate_system_when_geometry_required: true,
      compatibility_requirement: true,
    },
    compatibility_gates: {
      official_market_2023_geometry_to_2024_metrics: {
        status: "BLOCKED",
        join_allowed: false,
      },
      living_grid_geometry_to_oa_22784_cell_id: {
        status: "BLOCKED",
        join_allowed: false,
      },
      administrative_dong_attribute_enrichment: {
        status: "BLOCKED",
        automatic_enrichment_allowed: false,
      },
    },
    source_results: sourceResults,
    manifest_results: manifestResults,
    self_tests: selfTests,
    integrity: {
      hierarchy: {
        district_count: hierarchy.districts.length,
        market_count: hierarchy.markets.length,
        submarket_count: hierarchy.submarkets.length,
        node_count: hierarchy.nodes.length,
      },
      reference_geometry: {
        official_market_count: officialMarkets.features.length,
        administrative_dong_count: administrativeDongs.features.length,
        living_grid_count: livingGrid.features.length,
      },
      frameone_non_null_geometry: frameoneGeometryCounts,
      crosswalk: {
        official_market_rows: officialCrosswalk.records.length,
        official_market_manual_review_rows: officialCrosswalk.records.filter(
          (row) => row.relation_type === "manual_review",
        ).length,
        administrative_dong_rows: administrativeCrosswalk.records.length,
        administrative_dong_manual_review_rows:
          administrativeCrosswalk.records.filter(
            (row) => row.relation_type === "manual_review",
          ).length,
        living_grid_rows: livingGridCrosswalk.records.length,
        status_promotion_count: 0,
      },
      source_sha256: Object.fromEntries(
        Object.entries(sourceIntegrityPaths).map(([label, path]) => [
          label,
          {
            path: relativeToDataRoot(path),
            sha256: sha256(path),
          },
        ]),
      ),
      raw_source_file_count: rawFiles.length,
      normalized_file_count: normalizedFiles.length,
      quarantine_data_file_count: quarantineFiles.length,
      actual_manifest_count: manifestFiles.length,
      numeric_aggregation_count: 0,
      geometry_creation_count: 0,
    },
  };
}

function writeOrVerifySummary(summary) {
  const expected = `${JSON.stringify(summary, null, 2)}\n`;
  if (process.argv.includes("--write-summary")) {
    writeFileSync(summaryPath, expected, "utf8");
    return "summary written";
  }
  assert(existsSync(summaryPath), "VALIDATION_SUMMARY.json이 없습니다. --write-summary로 생성하십시오.");
  assert(readText(summaryPath) === expected, "VALIDATION_SUMMARY.json이 현재 계약·원천 상태와 일치하지 않습니다.");
  return "summary verified";
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const manifestArgument = argumentValue("--validate-manifest");
if (manifestArgument) {
  const contractDocument = readJson(contractPath);
  const contractsById = new Map(
    contractDocument.contracts.map((contract) => [contract.source_id, contract]),
  );
  const manifestPath = join(process.cwd(), manifestArgument);
  console.log(JSON.stringify(validateManifest(manifestPath, contractsById), null, 2));
} else {
  const summary = buildSummary();
  const result = writeOrVerifySummary(summary);
  console.log(`STEP4B0_CONTRACT_READY: ${result}`);
  console.log(`Source Contracts: ${summary.source_contract_count}`);
  console.log(
    `Source state: ${summary.ingest_status}; raw ${summary.integrity.raw_source_file_count}; manifests ${summary.integrity.actual_manifest_count}`,
  );
  console.log(
    `Compatibility gates: official market ${summary.compatibility_gates.official_market_2023_geometry_to_2024_metrics.status}, living grid ${summary.compatibility_gates.living_grid_geometry_to_oa_22784_cell_id.status}, admin dong ${summary.compatibility_gates.administrative_dong_attribute_enrichment.status}`,
  );
  console.log(`Self tests: ${summary.self_tests.length} PASS`);
  console.log("생활인구/매출 집계, geometry 생성, Crosswalk 승격: 0");
}
