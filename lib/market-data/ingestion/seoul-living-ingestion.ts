import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SEOUL_LIVING_API_FIELDS,
  SEOUL_LIVING_SERVICE,
  fetchSeoulLivingRawPage,
  toSeoulLivingRecord,
  type SeoulLivingApiField,
  type SeoulLivingApiRecord,
  type SeoulLivingRawPage,
} from "../clients/seoul-living";
import type { SeoulOpenDataRow } from "../clients/seoul-open-data";
import { adaptSeoulLivingRecord } from "../adapters/seoul-living";
import { parseSeoulLivingPeriod } from "../period";
import type { MarketDataObservation, MarketDataStatus } from "../types";
import { optionalText, parseMetricValue } from "../value";
import {
  calculateExpectedPageCount,
  checksum,
  isRetryableSeoulError,
  pageFilename,
  serializeNdjsonRecord,
} from "./seoul-spatial-ingestion";

const SOURCE_ID = "SRC-SEOUL-LIVING";
const DATASET = "seoul_living_population_250m";
const SOURCE = "Seoul Open Data Plaza";
const SOURCE_BASIS = "OA-22784_CURRENT_API";
const MISSING_BUCKET = "<MISSING>";
const AGE_SEX_FIELDS = SEOUL_LIVING_API_FIELDS.slice(5);

export type LivingRawPage = SeoulLivingRawPage;

export interface PopulationQuality {
  available: number;
  suppressed: number;
  missing: number;
  invalid: number;
}

export interface LivingCompletedPage {
  start_index: number;
  end_index: number;
  row_count: number;
  raw_file: string;
  raw_sha256: string;
  normalized_chunk: string;
  normalized_sha256: string;
  normalized_count: number;
  quarantine_chunk: string | null;
  quarantine_sha256: string | null;
  quarantine_count: number;
  fetched_at: string;
  quality: PageQuality;
}

export interface PageQuality {
  ymd_distribution: Record<string, number>;
  tt_distribution: Record<string, number>;
  invalid_ymd_count: number;
  invalid_tt_count: number;
  cell_id_missing_count: number;
  cell_id_malformed_count: number;
  cell_id_format_distribution: Record<string, number>;
  h_dng_cd_missing_count: number;
  h_dng_cd_malformed_count: number;
  h_dng_cd_unexpected_count: number;
  spop: PopulationQuality;
  age_sex: PopulationQuality;
  schema_missing_fields: string[];
  schema_unexpected_fields: string[];
  schema_drift_row_count: number;
}

export interface LivingCheckpoint {
  schema_version: "1.0.0";
  snapshot_id: string;
  source_id: typeof SOURCE_ID;
  service_name: typeof SEOUL_LIVING_SERVICE;
  source_reference_date: string | null;
  page_size: number;
  total_count: number;
  source_basis: typeof SOURCE_BASIS;
  completed_pages: LivingCompletedPage[];
  last_completed_page: string | null;
  started_at: string;
  updated_at: string;
}

export interface LivingValidation {
  result: "PASS" | "REVIEW_REQUIRED" | "FAIL";
  count_consistent: boolean;
  pagination_contiguous: boolean;
  expected_page_count_match: boolean;
  raw_checksum_match: boolean;
  normalized_checksum_match: boolean;
  quarantine_checksum_match: boolean;
  single_ymd: boolean;
  tt_valid: boolean;
  cell_id_complete: boolean;
  h_dng_cd_valid: boolean;
  schema_drift: boolean;
  duplicate_candidate_count: number;
  errors: string[];
  review_reasons: string[];
}

export interface LivingSnapshotManifest {
  manifest_kind: "LIVING_POPULATION_API_SNAPSHOT";
  schema_version: "1.0.0";
  snapshot_id: string;
  source_id: typeof SOURCE_ID;
  dataset: typeof DATASET;
  service_name: typeof SEOUL_LIVING_SERVICE;
  source: typeof SOURCE;
  source_basis: typeof SOURCE_BASIS;
  source_reference_date: string | null;
  started_at: string;
  fetched_at: string;
  page_size: number;
  expected_rows: number;
  fetched_rows: number;
  normalized_rows: number;
  quarantine_rows: number;
  expected_page_count: number;
  page_count: number;
  unique_cell_count: number;
  ymd_distribution: Record<string, number>;
  tt_distribution: Record<string, number>;
  cell_id_quality: {
    missing: number;
    malformed: number;
    format_distribution: Record<string, number>;
  };
  h_dng_cd_quality: {
    missing: number;
    malformed: number;
    unexpected: number;
  };
  population_quality: {
    spop: PopulationQuality;
    age_sex_fields: PopulationQuality;
  };
  candidate_key: readonly ["YMD", "TT", "H_DNG_CD", "CELL_ID"];
  duplicate_candidate_count: number;
  schema_validation: {
    expected_field_count: number;
    expected_fields: readonly SeoulLivingApiField[];
    missing_fields: string[];
    unexpected_fields: string[];
    drift_row_count: number;
  };
  checksums: {
    raw_page_set_sha256: string | null;
    normalized_page_set_sha256: string | null;
    quarantine_page_set_sha256: string | null;
    checkpoint_sha256: string | null;
  };
  validation: LivingValidation;
  status: "VALIDATING" | "READY" | "REVIEW_REQUIRED" | "FAILED";
  limited_run: boolean;
  source_snapshot_ready: boolean;
  publish_eligible: false;
  staging: boolean;
  current_pointer_updated: false;
  raw_path: string;
  normalized_path: string;
  quarantine_path: string;
  checkpoint_path: string;
  duration_ms: number;
  disk_size_bytes: number;
  failure: {
    kind: string;
    message: string;
    failed_at: string;
  } | null;
  limitations: string[];
}

export interface LivingIngestionDependencies {
  fetchRawPage?: (request: {
    startIndex: number;
    endIndex: number;
    signal: AbortSignal;
  }) => Promise<LivingRawPage>;
  delay?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
  onProgress?: (progress: {
    snapshotId: string;
    completedPages: number;
    expectedPages: number;
    fetchedRows: number;
    totalRows: number;
  }) => void;
}

export interface RunLivingIngestionOptions {
  ingestRoot: string;
  pageSize?: number;
  maxPages?: number;
  full?: boolean;
  resumeSnapshotId?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  dependencies?: LivingIngestionDependencies;
}

export interface RunLivingIngestionResult {
  manifest: LivingSnapshotManifest;
  manifestPath: string;
  currentPointerUpdated: false;
}

interface RunPaths {
  rawStaging: string;
  rawPages: string;
  checkpoint: string;
  normalizedStaging: string;
  normalizedPages: string;
  quarantineStaging: string;
  quarantinePages: string;
  manifest: string;
  rawFinal: string;
  normalizedFinal: string;
  quarantineFinal: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function emptyPopulationQuality(): PopulationQuality {
  return { available: 0, suppressed: 0, missing: 0, invalid: 0 };
}

function emptyPageQuality(): PageQuality {
  return {
    ymd_distribution: {},
    tt_distribution: {},
    invalid_ymd_count: 0,
    invalid_tt_count: 0,
    cell_id_missing_count: 0,
    cell_id_malformed_count: 0,
    cell_id_format_distribution: {},
    h_dng_cd_missing_count: 0,
    h_dng_cd_malformed_count: 0,
    h_dng_cd_unexpected_count: 0,
    spop: emptyPopulationQuality(),
    age_sex: emptyPopulationQuality(),
    schema_missing_fields: [],
    schema_unexpected_fields: [],
    schema_drift_row_count: 0,
  };
}

function addDistribution(
  distribution: Record<string, number>,
  value: unknown,
): void {
  const key = optionalText(value) ?? MISSING_BUCKET;
  distribution[key] = (distribution[key] ?? 0) + 1;
}

function mergeDistribution(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function mergePopulationQuality(
  target: PopulationQuality,
  source: PopulationQuality,
): void {
  target.available += source.available;
  target.suppressed += source.suppressed;
  target.missing += source.missing;
  target.invalid += source.invalid;
}

function populationStatus(value: unknown): MarketDataStatus {
  const parsed = parseMetricValue(value, ["*"]);
  if (
    parsed.dataStatus === "available" &&
    parsed.value !== null &&
    parsed.value < 0
  ) {
    return "invalid";
  }
  return parsed.dataStatus;
}

function incrementPopulation(
  quality: PopulationQuality,
  value: unknown,
): void {
  quality[populationStatus(value)] += 1;
}

function schemaIssues(row: SeoulOpenDataRow): {
  missing: string[];
  unexpected: string[];
} {
  const fields = Object.keys(row);
  return {
    missing: SEOUL_LIVING_API_FIELDS.filter(
      (field) => !Object.hasOwn(row, field),
    ),
    unexpected: fields.filter(
      (field) =>
        !SEOUL_LIVING_API_FIELDS.includes(field as SeoulLivingApiField),
    ),
  };
}

function cellIdFormat(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  if (typeof value !== "string" && typeof value !== "number") return "UNSUPPORTED_TYPE";
  return /^\d+$/.test(text)
    ? `DIGITS_LENGTH_${text.length}`
    : `TEXT_LENGTH_${text.length}`;
}

function isValidYmd(value: unknown): boolean {
  return parseSeoulLivingPeriod(value, "00").status === "valid";
}

function collectRowQuality(row: SeoulOpenDataRow, quality: PageQuality): void {
  addDistribution(quality.ymd_distribution, row.YMD);
  addDistribution(quality.tt_distribution, row.TT);
  if (!isValidYmd(row.YMD)) quality.invalid_ymd_count += 1;
  const hour = optionalText(row.TT);
  if (!hour || !/^(?:[01]\d|2[0-3])$/.test(hour)) {
    quality.invalid_tt_count += 1;
  }

  const cellId = optionalText(row.CELL_ID);
  const format = cellIdFormat(row.CELL_ID);
  if (!cellId) quality.cell_id_missing_count += 1;
  else if (format === "UNSUPPORTED_TYPE") quality.cell_id_malformed_count += 1;
  if (format) {
    quality.cell_id_format_distribution[format] =
      (quality.cell_id_format_distribution[format] ?? 0) + 1;
  }

  const dongCode = optionalText(row.H_DNG_CD);
  if (!dongCode) quality.h_dng_cd_missing_count += 1;
  else if (!/^\d{8}$/.test(dongCode)) quality.h_dng_cd_malformed_count += 1;
  else if (!dongCode.startsWith("11")) quality.h_dng_cd_unexpected_count += 1;

  incrementPopulation(quality.spop, row.SPOP);
  for (const field of AGE_SEX_FIELDS) {
    incrementPopulation(quality.age_sex, row[field]);
  }
}

function safeSnapshotId(value: string): string {
  assert(/^[A-Za-z0-9_-]+$/.test(value), "snapshot ID가 올바르지 않습니다.");
  return value;
}

function createSnapshotId(referenceYmd: string | null, now: Date): string {
  const execution = now.toISOString().replace(/[-:.]/g, "");
  return safeSnapshotId(
    `${SOURCE_ID}_${referenceYmd ?? "UNRESOLVED"}_${execution}_${randomUUID().slice(0, 8)}`,
  );
}

function buildPaths(
  ingestRoot: string,
  snapshotId: string,
): RunPaths {
  const rawSource = path.join(ingestRoot, "raw", SOURCE_ID);
  const normalizedSource = path.join(ingestRoot, "normalized", SOURCE_ID);
  const quarantineSource = path.join(ingestRoot, "quarantine", SOURCE_ID);
  const manifestSource = path.join(
    ingestRoot,
    "manifests",
    SOURCE_ID,
    "snapshots",
  );
  const rawStaging = path.join(rawSource, ".staging", snapshotId);
  const normalizedStaging = path.join(
    normalizedSource,
    ".staging",
    snapshotId,
  );
  const quarantineStaging = path.join(
    quarantineSource,
    ".staging",
    snapshotId,
  );
  return {
    rawStaging,
    rawPages: path.join(rawStaging, "pages"),
    checkpoint: path.join(rawStaging, "checkpoint.json"),
    normalizedStaging,
    normalizedPages: path.join(normalizedStaging, "pages"),
    quarantineStaging,
    quarantinePages: path.join(quarantineStaging, "pages"),
    manifest: path.join(manifestSource, `${snapshotId}.manifest.json`),
    rawFinal: path.join(rawSource, snapshotId),
    normalizedFinal: path.join(normalizedSource, snapshotId),
    quarantineFinal: path.join(quarantineSource, snapshotId),
  };
}

function ensureWithin(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  assert(
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `허용되지 않은 생성 경로입니다: ${target}`,
  );
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

async function fileSha256(target: string): Promise<string> {
  return checksum(await fs.readFile(target));
}

async function readJson<T>(target: string): Promise<T> {
  return JSON.parse(await fs.readFile(target, "utf8")) as T;
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replaceAll("\\", "/");
}

function sanitizeError(error: unknown): { kind: string; message: string } {
  const candidate = error as {
    kind?: unknown;
    name?: unknown;
    message?: unknown;
  };
  const kind =
    typeof candidate.kind === "string"
      ? candidate.kind
      : typeof candidate.name === "string"
        ? candidate.name
        : "error";
  let message =
    typeof candidate.message === "string"
      ? candidate.message
      : "생활인구 수집 작업에 실패했습니다.";
  message = message.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
  if (apiKey) message = message.replaceAll(apiKey, "[redacted-key]");
  return { kind: kind.slice(0, 80), message: message.slice(0, 500) };
}

async function fetchWithRetry(
  fetchPage: (signal: AbortSignal) => Promise<LivingRawPage>,
  options: {
    timeoutMs: number;
    maxAttempts: number;
    delay: (milliseconds: number) => Promise<void>;
    random: () => number;
  },
): Promise<LivingRawPage> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fetchPage(AbortSignal.timeout(options.timeoutMs));
    } catch (error) {
      lastError = error;
      if (
        attempt >= options.maxAttempts ||
        !isRetryableSeoulError(error)
      ) {
        throw error;
      }
      const baseDelay = 1_000 * 2 ** (attempt - 1);
      await options.delay(baseDelay + Math.floor(options.random() * 200));
    }
  }
  throw lastError;
}

async function verifyCheckpoint(
  checkpoint: LivingCheckpoint,
  paths: RunPaths,
  expected: { snapshotId: string; pageSize: number },
): Promise<void> {
  assert(checkpoint.snapshot_id === expected.snapshotId, "checkpoint snapshot ID가 다릅니다.");
  assert(checkpoint.source_id === SOURCE_ID, "checkpoint source ID가 다릅니다.");
  assert(checkpoint.service_name === SEOUL_LIVING_SERVICE, "checkpoint service가 다릅니다.");
  assert(checkpoint.source_basis === SOURCE_BASIS, "checkpoint source basis가 다릅니다.");
  assert(checkpoint.page_size === expected.pageSize, "checkpoint page size가 다릅니다.");

  let expectedStart = 1;
  for (const page of checkpoint.completed_pages) {
    assert(page.start_index === expectedStart, "checkpoint page 범위에 공백 또는 중복이 있습니다.");
    const rawTarget = path.join(paths.rawStaging, page.raw_file);
    const normalizedTarget = path.join(
      paths.normalizedStaging,
      page.normalized_chunk,
    );
    assert(await pathExists(rawTarget), `완료 raw page가 없습니다: ${page.raw_file}`);
    assert(
      (await fileSha256(rawTarget)) === page.raw_sha256,
      `raw page checksum이 다릅니다: ${page.raw_file}`,
    );
    assert(
      await pathExists(normalizedTarget),
      `완료 normalized page가 없습니다: ${page.normalized_chunk}`,
    );
    assert(
      (await fileSha256(normalizedTarget)) === page.normalized_sha256,
      `normalized page checksum이 다릅니다: ${page.normalized_chunk}`,
    );
    if (page.quarantine_chunk) {
      const quarantineTarget = path.join(
        paths.quarantineStaging,
        page.quarantine_chunk,
      );
      assert(
        await pathExists(quarantineTarget),
        `완료 quarantine page가 없습니다: ${page.quarantine_chunk}`,
      );
      assert(
        (await fileSha256(quarantineTarget)) === page.quarantine_sha256,
        `quarantine page checksum이 다릅니다: ${page.quarantine_chunk}`,
      );
    }
    expectedStart = page.end_index + 1;
  }
}

async function normalizePage(
  rows: SeoulOpenDataRow[],
  pageBaseName: string,
  paths: RunPaths,
  rawFile: string,
): Promise<
  Pick<
    LivingCompletedPage,
    | "normalized_chunk"
    | "normalized_sha256"
    | "normalized_count"
    | "quarantine_chunk"
    | "quarantine_sha256"
    | "quarantine_count"
    | "quality"
  >
> {
  const normalizedLines: string[] = [];
  const quarantineLines: string[] = [];
  const quality = emptyPageQuality();
  const missingFields = new Set<string>();
  const unexpectedFields = new Set<string>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    collectRowQuality(row, quality);
    const issues = schemaIssues(row);
    for (const field of issues.missing) missingFields.add(field);
    for (const field of issues.unexpected) unexpectedFields.add(field);
    if (issues.missing.length > 0 || issues.unexpected.length > 0) {
      quality.schema_drift_row_count += 1;
      quarantineLines.push(
        serializeNdjsonRecord({
          raw_file: rawFile,
          row_index: rowIndex,
          error_kind: "schema_drift",
          missing_fields: issues.missing,
          unexpected_fields: issues.unexpected,
        }),
      );
      continue;
    }

    const [observation] = adaptSeoulLivingRecord(
      toSeoulLivingRecord(row as SeoulLivingApiRecord),
    );
    normalizedLines.push(serializeNdjsonRecord(observation));
  }

  quality.schema_missing_fields = [...missingFields].sort();
  quality.schema_unexpected_fields = [...unexpectedFields].sort();
  const normalizedContent = normalizedLines.join("");
  const normalizedChunk = path.join("pages", `${pageBaseName}.ndjson`);
  await atomicWrite(
    path.join(paths.normalizedStaging, normalizedChunk),
    normalizedContent,
  );

  let quarantineChunk: string | null = null;
  let quarantineSha256: string | null = null;
  if (quarantineLines.length > 0) {
    const quarantineContent = quarantineLines.join("");
    quarantineChunk = path.join("pages", `${pageBaseName}.ndjson`);
    await atomicWrite(
      path.join(paths.quarantineStaging, quarantineChunk),
      quarantineContent,
    );
    quarantineSha256 = checksum(quarantineContent);
  }

  return {
    normalized_chunk: normalizedChunk.replaceAll("\\", "/"),
    normalized_sha256: checksum(normalizedContent),
    normalized_count: normalizedLines.length,
    quarantine_chunk: quarantineChunk?.replaceAll("\\", "/") ?? null,
    quarantine_sha256: quarantineSha256,
    quarantine_count: quarantineLines.length,
    quality,
  };
}

function mergeQuality(pages: LivingCompletedPage[]): PageQuality {
  const merged = emptyPageQuality();
  const missingFields = new Set<string>();
  const unexpectedFields = new Set<string>();
  for (const page of pages) {
    const quality = page.quality;
    mergeDistribution(merged.ymd_distribution, quality.ymd_distribution);
    mergeDistribution(merged.tt_distribution, quality.tt_distribution);
    mergeDistribution(
      merged.cell_id_format_distribution,
      quality.cell_id_format_distribution,
    );
    merged.invalid_ymd_count += quality.invalid_ymd_count;
    merged.invalid_tt_count += quality.invalid_tt_count;
    merged.cell_id_missing_count += quality.cell_id_missing_count;
    merged.cell_id_malformed_count += quality.cell_id_malformed_count;
    merged.h_dng_cd_missing_count += quality.h_dng_cd_missing_count;
    merged.h_dng_cd_malformed_count += quality.h_dng_cd_malformed_count;
    merged.h_dng_cd_unexpected_count += quality.h_dng_cd_unexpected_count;
    merged.schema_drift_row_count += quality.schema_drift_row_count;
    mergePopulationQuality(merged.spop, quality.spop);
    mergePopulationQuality(merged.age_sex, quality.age_sex);
    for (const field of quality.schema_missing_fields) missingFields.add(field);
    for (const field of quality.schema_unexpected_fields) {
      unexpectedFields.add(field);
    }
  }
  merged.schema_missing_fields = [...missingFields].sort();
  merged.schema_unexpected_fields = [...unexpectedFields].sort();
  return merged;
}

async function inspectNormalized(
  checkpoint: LivingCheckpoint,
  paths: RunPaths,
): Promise<{
  rowCount: number;
  uniqueCellCount: number;
  duplicateCandidateCount: number;
}> {
  const cells = new Set<string>();
  const candidateKeys = new Set<string>();
  let rowCount = 0;
  let duplicateCandidateCount = 0;
  for (const page of checkpoint.completed_pages) {
    const content = await fs.readFile(
      path.join(paths.normalizedStaging, page.normalized_chunk),
      "utf8",
    );
    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;
      const observation = JSON.parse(line) as MarketDataObservation;
      rowCount += 1;
      if (observation.geographyId) cells.add(observation.geographyId);
      const ymd = observation.metadata?.rawDate;
      const hour = observation.metadata?.rawHour;
      const dong = observation.metadata?.administrativeDongCode;
      const cell = observation.geographyId;
      if (ymd && hour && dong && cell) {
        const key = `${ymd}|${hour}|${dong}|${cell}`;
        if (candidateKeys.has(key)) duplicateCandidateCount += 1;
        else candidateKeys.add(key);
      }
    }
  }
  return { rowCount, uniqueCellCount: cells.size, duplicateCandidateCount };
}

async function directorySize(target: string): Promise<number> {
  if (!(await pathExists(target))) return 0;
  let total = 0;
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    total += entry.isDirectory()
      ? await directorySize(child)
      : (await fs.stat(child)).size;
  }
  return total;
}

function aggregateChecksum(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => value !== null);
  return present.length > 0 ? checksum(present.join("\n")) : null;
}

async function validateRun(
  checkpoint: LivingCheckpoint,
  paths: RunPaths,
  full: boolean,
): Promise<{
  quality: PageQuality;
  validation: LivingValidation;
  normalizedRows: number;
  quarantineRows: number;
  uniqueCellCount: number;
  duplicateCandidateCount: number;
  checksums: LivingSnapshotManifest["checksums"];
}> {
  let paginationContiguous = true;
  let rawChecksumMatch = true;
  let normalizedChecksumMatch = true;
  let quarantineChecksumMatch = true;
  let expectedStart = 1;
  for (const page of checkpoint.completed_pages) {
    if (page.start_index !== expectedStart) paginationContiguous = false;
    expectedStart = page.end_index + 1;
    if (
      (await fileSha256(path.join(paths.rawStaging, page.raw_file))) !==
      page.raw_sha256
    ) {
      rawChecksumMatch = false;
    }
    if (
      (await fileSha256(
        path.join(paths.normalizedStaging, page.normalized_chunk),
      )) !== page.normalized_sha256
    ) {
      normalizedChecksumMatch = false;
    }
    if (
      page.quarantine_chunk &&
      (await fileSha256(
        path.join(paths.quarantineStaging, page.quarantine_chunk),
      )) !== page.quarantine_sha256
    ) {
      quarantineChecksumMatch = false;
    }
  }

  const fetchedRows = checkpoint.completed_pages.reduce(
    (sum, page) => sum + page.row_count,
    0,
  );
  const quarantineRows = checkpoint.completed_pages.reduce(
    (sum, page) => sum + page.quarantine_count,
    0,
  );
  const inspected = await inspectNormalized(checkpoint, paths);
  const normalizedRows = inspected.rowCount;
  const countConsistent =
    fetchedRows === normalizedRows + quarantineRows &&
    (!full || fetchedRows === checkpoint.total_count);
  const expectedPageCount = calculateExpectedPageCount(
    checkpoint.total_count,
    checkpoint.page_size,
  );
  const expectedPageCountMatch =
    checkpoint.completed_pages.length === expectedPageCount;
  const quality = mergeQuality(checkpoint.completed_pages);
  const actualYmds = Object.keys(quality.ymd_distribution).filter(
    (value) => value !== MISSING_BUCKET,
  );
  const singleYmd =
    actualYmds.length === 1 &&
    quality.invalid_ymd_count === 0 &&
    actualYmds[0] === checkpoint.source_reference_date;
  const schemaDrift =
    quality.schema_drift_row_count > 0 ||
    quality.schema_missing_fields.length > 0 ||
    quality.schema_unexpected_fields.length > 0;
  const errors: string[] = [];
  const reviewReasons: string[] = [];
  if (!paginationContiguous) errors.push("PAGE_RANGE_GAP_OR_OVERLAP");
  if (!rawChecksumMatch) errors.push("RAW_CHECKSUM_MISMATCH");
  if (!normalizedChecksumMatch) errors.push("NORMALIZED_CHECKSUM_MISMATCH");
  if (!quarantineChecksumMatch) errors.push("QUARANTINE_CHECKSUM_MISMATCH");
  if (!countConsistent) errors.push("COUNT_CONSISTENCY_MISMATCH");
  if (full && !expectedPageCountMatch) errors.push("EXPECTED_PAGE_COUNT_MISMATCH");
  if (!singleYmd) reviewReasons.push("MULTIPLE_OR_INVALID_YMD");
  if (quality.invalid_tt_count > 0) reviewReasons.push("INVALID_TT");
  if (
    quality.cell_id_missing_count > 0 ||
    quality.cell_id_malformed_count > 0
  ) {
    reviewReasons.push("INVALID_CELL_ID");
  }
  if (Object.keys(quality.cell_id_format_distribution).length > 1) {
    reviewReasons.push("CELL_ID_FORMAT_INCONSISTENT");
  }
  if (
    quality.h_dng_cd_missing_count > 0 ||
    quality.h_dng_cd_malformed_count > 0 ||
    quality.h_dng_cd_unexpected_count > 0
  ) {
    reviewReasons.push("INVALID_OR_UNEXPECTED_H_DNG_CD");
  }
  if (quality.spop.missing > 0 || quality.spop.invalid > 0) {
    reviewReasons.push("MISSING_OR_INVALID_SPOP");
  }
  if (quality.age_sex.invalid > 0) reviewReasons.push("INVALID_AGE_SEX_POPULATION");
  if (schemaDrift) reviewReasons.push("SCHEMA_DRIFT");
  if (inspected.duplicateCandidateCount > 0) {
    reviewReasons.push("DUPLICATE_CANDIDATE_KEY");
  }

  return {
    quality,
    validation: {
      result:
        errors.length > 0
          ? "FAIL"
          : reviewReasons.length > 0
            ? "REVIEW_REQUIRED"
            : "PASS",
      count_consistent: countConsistent,
      pagination_contiguous: paginationContiguous,
      expected_page_count_match: expectedPageCountMatch,
      raw_checksum_match: rawChecksumMatch,
      normalized_checksum_match: normalizedChecksumMatch,
      quarantine_checksum_match: quarantineChecksumMatch,
      single_ymd: singleYmd,
      tt_valid: quality.invalid_tt_count === 0,
      cell_id_complete:
        quality.cell_id_missing_count === 0 &&
        quality.cell_id_malformed_count === 0,
      h_dng_cd_valid:
        quality.h_dng_cd_missing_count === 0 &&
        quality.h_dng_cd_malformed_count === 0 &&
        quality.h_dng_cd_unexpected_count === 0,
      schema_drift: schemaDrift,
      duplicate_candidate_count: inspected.duplicateCandidateCount,
      errors,
      review_reasons: reviewReasons,
    },
    normalizedRows,
    quarantineRows,
    uniqueCellCount: inspected.uniqueCellCount,
    duplicateCandidateCount: inspected.duplicateCandidateCount,
    checksums: {
      raw_page_set_sha256: aggregateChecksum(
        checkpoint.completed_pages.map((page) => page.raw_sha256),
      ),
      normalized_page_set_sha256: aggregateChecksum(
        checkpoint.completed_pages.map((page) => page.normalized_sha256),
      ),
      quarantine_page_set_sha256: aggregateChecksum(
        checkpoint.completed_pages.map((page) => page.quarantine_sha256),
      ),
      checkpoint_sha256: await fileSha256(paths.checkpoint),
    },
  };
}

function referenceYmdFromRows(rows: SeoulOpenDataRow[]): string | null {
  const values = new Set(
    rows
      .map((row) => optionalText(row.YMD))
      .filter((value): value is string => value !== undefined && isValidYmd(value)),
  );
  return values.size === 1 ? [...values][0] : null;
}

function manifestPaths(
  ingestRoot: string,
  paths: RunPaths,
  staging: boolean,
): Pick<
  LivingSnapshotManifest,
  "raw_path" | "normalized_path" | "quarantine_path" | "checkpoint_path"
> {
  const raw = staging ? paths.rawStaging : paths.rawFinal;
  return {
    raw_path: relativePath(ingestRoot, raw),
    normalized_path: relativePath(
      ingestRoot,
      staging ? paths.normalizedStaging : paths.normalizedFinal,
    ),
    quarantine_path: relativePath(
      ingestRoot,
      staging ? paths.quarantineStaging : paths.quarantineFinal,
    ),
    checkpoint_path: relativePath(ingestRoot, path.join(raw, "checkpoint.json")),
  };
}

function baseManifest(
  checkpoint: LivingCheckpoint,
  now: Date,
  startedMs: number,
  paths: RunPaths,
  ingestRoot: string,
  validated: Awaited<ReturnType<typeof validateRun>>,
  limitedRun: boolean,
  staging: boolean,
  status: LivingSnapshotManifest["status"],
  diskSizeBytes: number,
): LivingSnapshotManifest {
  const fetchedRows = checkpoint.completed_pages.reduce(
    (sum, page) => sum + page.row_count,
    0,
  );
  return {
    manifest_kind: "LIVING_POPULATION_API_SNAPSHOT",
    schema_version: "1.0.0",
    snapshot_id: checkpoint.snapshot_id,
    source_id: SOURCE_ID,
    dataset: DATASET,
    service_name: SEOUL_LIVING_SERVICE,
    source: SOURCE,
    source_basis: SOURCE_BASIS,
    source_reference_date: checkpoint.source_reference_date,
    started_at: checkpoint.started_at,
    fetched_at: now.toISOString(),
    page_size: checkpoint.page_size,
    expected_rows: checkpoint.total_count,
    fetched_rows: fetchedRows,
    normalized_rows: validated.normalizedRows,
    quarantine_rows: validated.quarantineRows,
    expected_page_count: calculateExpectedPageCount(
      checkpoint.total_count,
      checkpoint.page_size,
    ),
    page_count: checkpoint.completed_pages.length,
    unique_cell_count: validated.uniqueCellCount,
    ymd_distribution: validated.quality.ymd_distribution,
    tt_distribution: validated.quality.tt_distribution,
    cell_id_quality: {
      missing: validated.quality.cell_id_missing_count,
      malformed: validated.quality.cell_id_malformed_count,
      format_distribution: validated.quality.cell_id_format_distribution,
    },
    h_dng_cd_quality: {
      missing: validated.quality.h_dng_cd_missing_count,
      malformed: validated.quality.h_dng_cd_malformed_count,
      unexpected: validated.quality.h_dng_cd_unexpected_count,
    },
    population_quality: {
      spop: validated.quality.spop,
      age_sex_fields: validated.quality.age_sex,
    },
    candidate_key: ["YMD", "TT", "H_DNG_CD", "CELL_ID"],
    duplicate_candidate_count: validated.duplicateCandidateCount,
    schema_validation: {
      expected_field_count: SEOUL_LIVING_API_FIELDS.length,
      expected_fields: SEOUL_LIVING_API_FIELDS,
      missing_fields: validated.quality.schema_missing_fields,
      unexpected_fields: validated.quality.schema_unexpected_fields,
      drift_row_count: validated.quality.schema_drift_row_count,
    },
    checksums: validated.checksums,
    validation: validated.validation,
    status,
    limited_run: limitedRun,
    source_snapshot_ready: status === "READY",
    publish_eligible: false,
    staging,
    current_pointer_updated: false,
    ...manifestPaths(ingestRoot, paths, staging),
    duration_ms: Math.max(0, now.getTime() - startedMs),
    disk_size_bytes: diskSizeBytes,
    failure: null,
    limitations: [
      "Source snapshot READY는 geometry compatibility 또는 Market/Submarket Join READY를 의미하지 않는다.",
      "LIVING_GRID_250M.geojson, Crosswalk, production current pointer를 변경하지 않았다.",
    ],
  };
}

async function writeFailureManifest(
  error: unknown,
  checkpoint: LivingCheckpoint,
  paths: RunPaths,
  ingestRoot: string,
  startedMs: number,
  now: Date,
  limitedRun: boolean,
): Promise<void> {
  const safe = sanitizeError(error);
  const emptyValidated: Awaited<ReturnType<typeof validateRun>> = {
    quality: mergeQuality(checkpoint.completed_pages),
    validation: {
      result: "FAIL",
      count_consistent: false,
      pagination_contiguous: false,
      expected_page_count_match: false,
      raw_checksum_match: false,
      normalized_checksum_match: false,
      quarantine_checksum_match: false,
      single_ymd: false,
      tt_valid: false,
      cell_id_complete: false,
      h_dng_cd_valid: false,
      schema_drift: false,
      duplicate_candidate_count: 0,
      errors: [safe.kind],
      review_reasons: [],
    },
    normalizedRows: checkpoint.completed_pages.reduce(
      (sum, page) => sum + page.normalized_count,
      0,
    ),
    quarantineRows: checkpoint.completed_pages.reduce(
      (sum, page) => sum + page.quarantine_count,
      0,
    ),
    uniqueCellCount: 0,
    duplicateCandidateCount: 0,
    checksums: {
      raw_page_set_sha256: aggregateChecksum(
        checkpoint.completed_pages.map((page) => page.raw_sha256),
      ),
      normalized_page_set_sha256: aggregateChecksum(
        checkpoint.completed_pages.map((page) => page.normalized_sha256),
      ),
      quarantine_page_set_sha256: aggregateChecksum(
        checkpoint.completed_pages.map((page) => page.quarantine_sha256),
      ),
      checkpoint_sha256: (await pathExists(paths.checkpoint))
        ? await fileSha256(paths.checkpoint)
        : null,
    },
  };
  const manifest = baseManifest(
    checkpoint,
    now,
    startedMs,
    paths,
    ingestRoot,
    emptyValidated,
    limitedRun,
    true,
    "FAILED",
    await directorySize(paths.rawStaging) +
      (await directorySize(paths.normalizedStaging)) +
      (await directorySize(paths.quarantineStaging)),
  );
  manifest.failure = { ...safe, failed_at: now.toISOString() };
  await atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function runSeoulLivingIngestion(
  options: RunLivingIngestionOptions,
): Promise<RunLivingIngestionResult> {
  const pageSize = options.pageSize ?? 1_000;
  calculateExpectedPageCount(0, pageSize);
  const full = options.full === true;
  const maxPages = options.maxPages;
  assert(
    full !== (maxPages !== undefined),
    "실행 안전을 위해 --full 또는 --max-pages 중 정확히 하나가 필요합니다.",
  );
  if (maxPages !== undefined) {
    assert(
      Number.isInteger(maxPages) && maxPages > 0,
      "maxPages는 양의 정수여야 합니다.",
    );
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 3;
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0, "timeoutMs가 올바르지 않습니다.");
  assert(
    Number.isInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 3,
    "maxAttempts는 1~3이어야 합니다.",
  );

  const now = options.dependencies?.now ?? (() => new Date());
  const delay =
    options.dependencies?.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.dependencies?.random ?? Math.random;
  const fetchRawPage = options.dependencies?.fetchRawPage;
  const ingestRoot = path.resolve(options.ingestRoot);
  const startedAt = now();
  let startedMs = startedAt.getTime();
  let checkpoint: LivingCheckpoint | null = null;
  let paths: RunPaths | null = null;
  let pendingFirstPage: LivingRawPage | null = null;

  try {
    if (options.resumeSnapshotId) {
      const snapshotId = safeSnapshotId(options.resumeSnapshotId);
      paths = buildPaths(ingestRoot, snapshotId);
      checkpoint = await readJson<LivingCheckpoint>(paths.checkpoint);
      await verifyCheckpoint(checkpoint, paths, { snapshotId, pageSize });
    } else {
      pendingFirstPage = await fetchWithRetry(
        (signal) =>
          fetchRawPage
            ? fetchRawPage({ startIndex: 1, endIndex: pageSize, signal })
            : fetchSeoulLivingRawPage({ start: 1, end: pageSize, signal }),
        { timeoutMs, maxAttempts, delay, random },
      );
      assert(
        pendingFirstPage.totalCount !== null &&
          Number.isInteger(pendingFirstPage.totalCount) &&
          pendingFirstPage.totalCount > 0,
        "생활인구 API total count가 없거나 0입니다.",
      );
      const referenceYmd = referenceYmdFromRows(pendingFirstPage.rows);
      const snapshotId = createSnapshotId(referenceYmd, startedAt);
      paths = buildPaths(ingestRoot, snapshotId);
      checkpoint = {
        schema_version: "1.0.0",
        snapshot_id: snapshotId,
        source_id: SOURCE_ID,
        service_name: SEOUL_LIVING_SERVICE,
        source_reference_date: referenceYmd,
        page_size: pageSize,
        total_count: pendingFirstPage.totalCount,
        source_basis: SOURCE_BASIS,
        completed_pages: [],
        last_completed_page: null,
        started_at: startedAt.toISOString(),
        updated_at: startedAt.toISOString(),
      };
    }

    assert(paths !== null && checkpoint !== null, "ingestion 경로를 준비하지 못했습니다.");
    startedMs = Date.parse(checkpoint.started_at);
    assert(Number.isFinite(startedMs), "checkpoint started_at이 올바르지 않습니다.");
    for (const target of Object.values(paths)) ensureWithin(ingestRoot, target);
    await Promise.all([
      fs.mkdir(paths.rawPages, { recursive: true }),
      fs.mkdir(paths.normalizedPages, { recursive: true }),
      fs.mkdir(paths.quarantinePages, { recursive: true }),
      fs.mkdir(path.dirname(paths.manifest), { recursive: true }),
    ]);

    const lastCompletedEnd = checkpoint.completed_pages.at(-1)?.end_index;
    let nextStart: number =
      lastCompletedEnd === undefined ? 1 : lastCompletedEnd + 1;
    while (nextStart <= checkpoint.total_count) {
      if (
        maxPages !== undefined &&
        checkpoint.completed_pages.length >= maxPages
      ) {
        break;
      }
      const requestEnd = Math.min(
        nextStart + pageSize - 1,
        checkpoint.total_count,
      );
      const page =
        pendingFirstPage ??
        (await fetchWithRetry(
          (signal) =>
            fetchRawPage
              ? fetchRawPage({
                  startIndex: nextStart,
                  endIndex: requestEnd,
                  signal,
                })
              : fetchSeoulLivingRawPage({
                  start: nextStart,
                  end: requestEnd,
                  signal,
                }),
          { timeoutMs, maxAttempts, delay, random },
        ));
      pendingFirstPage = null;
      assert(page.service === SEOUL_LIVING_SERVICE, "API service name이 요청과 다릅니다.");
      assert(page.start === nextStart, "API page 시작 범위가 요청과 다릅니다.");
      assert(page.totalCount === checkpoint.total_count, "수집 중 API total count가 변경되었습니다.");
      const logicalEnd = Math.min(requestEnd, checkpoint.total_count);
      const expectedRows = logicalEnd - nextStart + 1;
      assert(
        page.rows.length === expectedRows,
        `API page row count가 요청 범위와 다릅니다: ${page.rows.length}/${expectedRows}`,
      );
      const filename = pageFilename(nextStart, logicalEnd);
      const rawRelative = path.join("pages", filename).replaceAll("\\", "/");
      const rawTarget = path.join(paths.rawStaging, rawRelative);
      await atomicWrite(rawTarget, page.rawResponse);
      const pageBaseName = path.basename(filename, ".json");
      const normalized = await normalizePage(
        page.rows,
        pageBaseName,
        paths,
        rawRelative,
      );
      checkpoint.completed_pages.push({
        start_index: nextStart,
        end_index: logicalEnd,
        row_count: page.rows.length,
        raw_file: rawRelative,
        raw_sha256: await fileSha256(rawTarget),
        ...normalized,
        fetched_at: page.fetchedAt,
      });
      checkpoint.last_completed_page = pageBaseName;
      checkpoint.updated_at = now().toISOString();
      await atomicWrite(paths.checkpoint, `${JSON.stringify(checkpoint, null, 2)}\n`);
      options.dependencies?.onProgress?.({
        snapshotId: checkpoint.snapshot_id,
        completedPages: checkpoint.completed_pages.length,
        expectedPages: calculateExpectedPageCount(
          checkpoint.total_count,
          checkpoint.page_size,
        ),
        fetchedRows: checkpoint.completed_pages.reduce(
          (sum, completed) => sum + completed.row_count,
          0,
        ),
        totalRows: checkpoint.total_count,
      });
      nextStart = logicalEnd + 1;
    }

    const validated = await validateRun(checkpoint, paths, full);
    if (validated.validation.result === "FAIL") {
      throw new Error(
        `Living ingestion validation failed: ${validated.validation.errors.join(", ")}`,
      );
    }
    const limitedRun = !full;
    const status: LivingSnapshotManifest["status"] = limitedRun
      ? "VALIDATING"
      : validated.validation.result === "REVIEW_REQUIRED"
        ? "REVIEW_REQUIRED"
        : "READY";
    let staging = true;
    let rawDataPath = paths.rawStaging;
    let normalizedDataPath = paths.normalizedStaging;
    let quarantineDataPath = paths.quarantineStaging;

    if (status === "READY") {
      assert(!await pathExists(paths.rawFinal), "동일 snapshot raw directory가 이미 존재합니다.");
      assert(!await pathExists(paths.normalizedFinal), "동일 snapshot normalized directory가 이미 존재합니다.");
      assert(!await pathExists(paths.quarantineFinal), "동일 snapshot quarantine directory가 이미 존재합니다.");
      await fs.rename(paths.rawStaging, paths.rawFinal);
      await fs.rename(paths.normalizedStaging, paths.normalizedFinal);
      await fs.rename(paths.quarantineStaging, paths.quarantineFinal);
      staging = false;
      rawDataPath = paths.rawFinal;
      normalizedDataPath = paths.normalizedFinal;
      quarantineDataPath = paths.quarantineFinal;
    }

    const finishedAt = now();
    const diskSizeBytes =
      (await directorySize(rawDataPath)) +
      (await directorySize(normalizedDataPath)) +
      (await directorySize(quarantineDataPath));
    const manifest = baseManifest(
      checkpoint,
      finishedAt,
      startedMs,
      paths,
      ingestRoot,
      validated,
      limitedRun,
      staging,
      status,
      diskSizeBytes,
    );
    await atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    return {
      manifest,
      manifestPath: paths.manifest,
      currentPointerUpdated: false,
    };
  } catch (error) {
    if (checkpoint && paths) {
      await writeFailureManifest(
        error,
        checkpoint,
        paths,
        ingestRoot,
        startedMs,
        now(),
        !full,
      );
    }
    throw error;
  }
}
