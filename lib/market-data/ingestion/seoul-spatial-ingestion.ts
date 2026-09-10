import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SeoulOpenDataClientError,
  type SeoulOpenDataRow,
} from "../clients/seoul-open-data";
import {
  SEOUL_CROSSWALK_SERVICE,
  SEOUL_PEDESTRIAN_NETWORK_SERVICE,
  SEOUL_PEDESTRIAN_SPATIAL_SOURCE,
  fetchSeoulCrosswalkRawPage,
  fetchSeoulPedestrianNetworkRawPage,
  parseSeoulCrosswalkRow,
  parseSeoulPedestrianNetworkRow,
  type SeoulPedestrianSpatialRawPage,
} from "../clients/seoul-pedestrian-spatial";

export type SeoulSpatialDataset = "pedestrian" | "crosswalk";

export interface SeoulSpatialRecord {
  nodeWkt: string | null;
  nodeId: string | null;
  linkWkt: string | null;
  linkId: string | null;
  districtCode: string | null;
  districtName: string | null;
}

export interface SpatialRawPage {
  service: string;
  start: number;
  end: number;
  totalCount: number | null;
  rows: SeoulOpenDataRow[];
  rawResponse: string;
  source: string;
  sourceBasis: string;
  fetchedAt: string;
}

export interface CompletedPage {
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
}

export interface SpatialCheckpoint {
  schema_version: "1.0.0";
  snapshot_id: string;
  source_id: string;
  service_name: string;
  page_size: number;
  total_count: number;
  source_basis: string;
  completed_pages: CompletedPage[];
  last_completed_page: string | null;
  updated_at: string;
}

export interface DistrictCount {
  district_code: string;
  district_name: string | null;
  row_count: number;
}

export interface SpatialValidation {
  result_code_status: "PASS" | "FAIL";
  total_count_consistent: boolean;
  collected_page_ranges_contiguous: boolean;
  expected_page_count_match: boolean;
  fetched_row_count_match: boolean;
  stored_count_match: boolean;
  district_counts_match: boolean;
  raw_checksum_match: boolean;
  normalized_checksum_match: boolean;
  parsing_failure_count: number;
  node_wkt_missing_count: number;
  link_wkt_missing_count: number;
  exact_duplicate_record_count: number;
  node_id_duplicate_count: number;
  link_id_duplicate_count: number;
  ready: boolean;
  errors: string[];
}

export interface SpatialSnapshotManifest {
  manifest_kind: "API_SNAPSHOT";
  schema_version: "1.0.0";
  snapshot_id: string;
  dataset: "seoul_pedestrian_network" | "seoul_crosswalk";
  service_name: string;
  source_id: string;
  source: string;
  source_basis: string;
  fetched_at: string;
  page_size: number;
  total_count: number;
  expected_page_count: number;
  fetched_page_count: number;
  fetched_row_count: number;
  stored_count: number;
  quarantined_count: number;
  district_counts: DistrictCount[];
  validation: SpatialValidation;
  status: "COLLECTING" | "VALIDATING" | "READY" | "FAILED";
  limited_run: boolean;
  publish_eligible: boolean;
  raw_path: string;
  normalized_path: string;
  checkpoint_path: string;
  failure: {
    kind: string;
    message: string;
    failed_at: string;
  } | null;
}

interface DatasetConfig {
  dataset: SpatialSnapshotManifest["dataset"];
  sourceId: string;
  serviceName: string;
  fetchRawPage: (request: {
    startIndex: number;
    endIndex: number;
    signal?: AbortSignal;
  }) => Promise<SeoulPedestrianSpatialRawPage>;
  parseRow: (row: SeoulOpenDataRow) => SeoulSpatialRecord;
}

export interface IngestionDependencies {
  fetchRawPage?: (request: {
    dataset: SeoulSpatialDataset;
    startIndex: number;
    endIndex: number;
    signal: AbortSignal;
  }) => Promise<SpatialRawPage>;
  parseRow?: (row: SeoulOpenDataRow) => SeoulSpatialRecord;
  delay?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
}

export interface RunSpatialIngestionOptions {
  dataset: SeoulSpatialDataset;
  ingestRoot: string;
  pageSize?: number;
  maxPages?: number;
  full?: boolean;
  resumeSnapshotId?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  dependencies?: IngestionDependencies;
}

export interface RunSpatialIngestionResult {
  manifest: SpatialSnapshotManifest;
  manifestPath: string;
  currentPointerUpdated: boolean;
}

const DATASET_CONFIGS: Record<SeoulSpatialDataset, DatasetConfig> = {
  pedestrian: {
    dataset: "seoul_pedestrian_network",
    sourceId: "SRC-SEOUL-PEDESTRIAN-NETWORK",
    serviceName: SEOUL_PEDESTRIAN_NETWORK_SERVICE,
    fetchRawPage: fetchSeoulPedestrianNetworkRawPage,
    parseRow: parseSeoulPedestrianNetworkRow,
  },
  crosswalk: {
    dataset: "seoul_crosswalk",
    sourceId: "SRC-SEOUL-CROSSWALK",
    serviceName: SEOUL_CROSSWALK_SERVICE,
    fetchRawPage: fetchSeoulCrosswalkRawPage,
    parseRow: parseSeoulCrosswalkRow,
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function pageFilename(startIndex: number, endIndex: number): string {
  assert(Number.isInteger(startIndex) && startIndex > 0, "startIndex가 올바르지 않습니다.");
  assert(Number.isInteger(endIndex) && endIndex >= startIndex, "endIndex가 올바르지 않습니다.");
  return `${String(startIndex).padStart(6, "0")}-${String(endIndex).padStart(6, "0")}.json`;
}

export function calculateExpectedPageCount(totalCount: number, pageSize: number): number {
  assert(Number.isInteger(totalCount) && totalCount >= 0, "totalCount가 올바르지 않습니다.");
  assert(Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 1_000, "pageSize는 1~1000이어야 합니다.");
  return Math.ceil(totalCount / pageSize);
}

export function districtFileKey(districtCode: string | null | undefined): string {
  const value = districtCode?.trim() ?? "";
  return /^(?:\d{5}|\d{10})$/.test(value) ? value : "UNKNOWN";
}

export function serializeNdjsonRecord(record: unknown): string {
  return `${JSON.stringify(record)}\n`;
}

export function checksum(content: string | Buffer): string {
  return sha256(content);
}

function safeSnapshotId(value: string): string {
  assert(/^[A-Za-z0-9_-]+$/.test(value), "snapshot ID가 올바르지 않습니다.");
  return value;
}

function createSnapshotId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

function ensureWithin(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  assert(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative), `허용되지 않은 생성 경로입니다: ${target}`);
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

async function readJson<T>(target: string): Promise<T> {
  return JSON.parse(await fs.readFile(target, "utf8")) as T;
}

async function fileSha256(target: string): Promise<string> {
  return sha256(await fs.readFile(target));
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replaceAll("\\", "/");
}

function sanitizeError(error: unknown): { kind: string; message: string } {
  const candidate = error as { kind?: unknown; name?: unknown; message?: unknown };
  const kind = typeof candidate.kind === "string"
    ? candidate.kind
    : typeof candidate.name === "string"
      ? candidate.name
      : "error";
  let message = typeof candidate.message === "string" ? candidate.message : "수집 작업에 실패했습니다.";
  message = message.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
  if (apiKey) {
    message = message.replaceAll(apiKey, "[redacted-key]");
  }
  return { kind: kind.slice(0, 80), message: message.slice(0, 500) };
}

export function isRetryableSeoulError(error: unknown): boolean {
  if (error instanceof SeoulOpenDataClientError) {
    return error.kind === "http" && (
      error.httpStatus === undefined ||
      error.httpStatus === 429 ||
      error.httpStatus >= 500
    );
  }
  const candidate = error as { kind?: unknown; httpStatus?: unknown; name?: unknown };
  if (candidate.name === "AbortError" || candidate.name === "TimeoutError") {
    return true;
  }
  if (candidate.kind !== "http") {
    return false;
  }
  return candidate.httpStatus === undefined || candidate.httpStatus === 429 || (
    typeof candidate.httpStatus === "number" && candidate.httpStatus >= 500
  );
}

async function fetchWithRetry(
  fetchPage: (signal: AbortSignal) => Promise<SpatialRawPage>,
  options: {
    timeoutMs: number;
    maxAttempts: number;
    delay: (milliseconds: number) => Promise<void>;
    random: () => number;
  },
): Promise<SpatialRawPage> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fetchPage(AbortSignal.timeout(options.timeoutMs));
    } catch (error) {
      lastError = error;
      if (attempt >= options.maxAttempts || !isRetryableSeoulError(error)) {
        throw error;
      }
      const baseDelay = 1_000 * (2 ** (attempt - 1));
      await options.delay(baseDelay + Math.floor(options.random() * 200));
    }
  }
  throw lastError;
}

interface RunPaths {
  rawStaging: string;
  rawPages: string;
  checkpoint: string;
  normalizedStaging: string;
  normalizedChunks: string;
  districts: string;
  quarantineStaging: string;
  quarantineChunks: string;
  quarantineOutput: string;
  manifest: string;
  current: string;
  rawFinal: string;
  normalizedFinal: string;
  quarantineFinal: string;
}

function buildPaths(ingestRoot: string, sourceId: string, snapshotId: string): RunPaths {
  const rawSource = path.join(ingestRoot, "raw", sourceId);
  const normalizedSource = path.join(ingestRoot, "normalized", sourceId);
  const quarantineSource = path.join(ingestRoot, "quarantine", sourceId);
  const manifestSource = path.join(ingestRoot, "manifests", sourceId);
  const rawStaging = path.join(rawSource, ".staging", snapshotId);
  const normalizedStaging = path.join(normalizedSource, ".staging", snapshotId);
  const quarantineStaging = path.join(quarantineSource, ".staging", snapshotId);
  return {
    rawStaging,
    rawPages: path.join(rawStaging, "pages"),
    checkpoint: path.join(rawStaging, "checkpoint.json"),
    normalizedStaging,
    normalizedChunks: path.join(normalizedStaging, ".page-chunks"),
    districts: path.join(normalizedStaging, "districts"),
    quarantineStaging,
    quarantineChunks: path.join(quarantineStaging, ".page-chunks"),
    quarantineOutput: path.join(quarantineStaging, "parse-failures.ndjson"),
    manifest: path.join(manifestSource, `${snapshotId}.manifest.json`),
    current: path.join(manifestSource, "current.json"),
    rawFinal: path.join(rawSource, snapshotId),
    normalizedFinal: path.join(normalizedSource, snapshotId),
    quarantineFinal: path.join(quarantineSource, snapshotId),
  };
}

async function verifyCheckpoint(
  checkpoint: SpatialCheckpoint,
  paths: RunPaths,
  expected: { snapshotId: string; sourceId: string; serviceName: string; pageSize: number },
): Promise<void> {
  assert(checkpoint.snapshot_id === expected.snapshotId, "checkpoint snapshot ID가 다릅니다.");
  assert(checkpoint.source_id === expected.sourceId, "checkpoint source ID가 다릅니다.");
  assert(checkpoint.service_name === expected.serviceName, "checkpoint service가 다릅니다.");
  assert(checkpoint.page_size === expected.pageSize, "checkpoint page size가 다릅니다.");
  assert(checkpoint.source_basis === SEOUL_PEDESTRIAN_SPATIAL_SOURCE.sourceBasis, "checkpoint source basis가 다릅니다.");

  let expectedStart = 1;
  for (const page of checkpoint.completed_pages) {
    assert(page.start_index === expectedStart, "checkpoint page 범위에 공백 또는 중복이 있습니다.");
    assert(page.end_index >= page.start_index, "checkpoint page 범위가 올바르지 않습니다.");
    const rawPath = path.join(paths.rawStaging, page.raw_file);
    const normalizedPath = path.join(paths.normalizedStaging, page.normalized_chunk);
    assert(await pathExists(rawPath), `완료 raw page가 없습니다: ${page.raw_file}`);
    assert(await fileSha256(rawPath) === page.raw_sha256, `raw page checksum이 다릅니다: ${page.raw_file}`);
    assert(await pathExists(normalizedPath), `완료 normalized chunk가 없습니다: ${page.normalized_chunk}`);
    assert(await fileSha256(normalizedPath) === page.normalized_sha256, `normalized chunk checksum이 다릅니다: ${page.normalized_chunk}`);
    if (page.quarantine_chunk) {
      const quarantinePath = path.join(paths.quarantineStaging, page.quarantine_chunk);
      assert(await pathExists(quarantinePath), `완료 quarantine chunk가 없습니다: ${page.quarantine_chunk}`);
      assert(await fileSha256(quarantinePath) === page.quarantine_sha256, `quarantine chunk checksum이 다릅니다: ${page.quarantine_chunk}`);
    }
    expectedStart = page.end_index + 1;
  }
}

async function normalizePage(
  rows: SeoulOpenDataRow[],
  parseRow: DatasetConfig["parseRow"],
  pageBaseName: string,
  paths: RunPaths,
  rawFile: string,
): Promise<Pick<CompletedPage, "normalized_chunk" | "normalized_sha256" | "normalized_count" | "quarantine_chunk" | "quarantine_sha256" | "quarantine_count">> {
  const normalizedLines: string[] = [];
  const quarantineLines: string[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    try {
      normalizedLines.push(serializeNdjsonRecord(parseRow(rows[rowIndex])));
    } catch (error) {
      const safe = sanitizeError(error);
      quarantineLines.push(serializeNdjsonRecord({
        raw_file: rawFile,
        row_index: rowIndex,
        error_kind: safe.kind,
        error_message: safe.message,
      }));
    }
  }

  const normalizedContent = normalizedLines.join("");
  const normalizedChunk = path.join(".page-chunks", `${pageBaseName}.ndjson`);
  const normalizedPath = path.join(paths.normalizedStaging, normalizedChunk);
  await atomicWrite(normalizedPath, normalizedContent);

  let quarantineChunk: string | null = null;
  let quarantineSha256: string | null = null;
  if (quarantineLines.length > 0) {
    const quarantineContent = quarantineLines.join("");
    quarantineChunk = path.join(".page-chunks", `${pageBaseName}.ndjson`);
    await atomicWrite(path.join(paths.quarantineStaging, quarantineChunk), quarantineContent);
    quarantineSha256 = sha256(quarantineContent);
  }

  return {
    normalized_chunk: normalizedChunk.replaceAll("\\", "/"),
    normalized_sha256: sha256(normalizedContent),
    normalized_count: normalizedLines.length,
    quarantine_chunk: quarantineChunk?.replaceAll("\\", "/") ?? null,
    quarantine_sha256: quarantineSha256,
    quarantine_count: quarantineLines.length,
  };
}

async function rebuildOutputs(checkpoint: SpatialCheckpoint, paths: RunPaths, ingestRoot: string): Promise<void> {
  ensureWithin(ingestRoot, paths.districts);
  ensureWithin(ingestRoot, paths.quarantineOutput);
  await fs.rm(paths.districts, { recursive: true, force: true });
  await fs.rm(paths.quarantineOutput, { force: true });
  await fs.mkdir(paths.districts, { recursive: true });
  await fs.mkdir(path.dirname(paths.quarantineOutput), { recursive: true });

  for (const page of checkpoint.completed_pages) {
    const content = await fs.readFile(path.join(paths.normalizedStaging, page.normalized_chunk), "utf8");
    const byDistrict = new Map<string, string[]>();
    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;
      const record = JSON.parse(line) as SeoulSpatialRecord;
      const key = districtFileKey(record.districtCode);
      const lines = byDistrict.get(key) ?? [];
      lines.push(`${line}\n`);
      byDistrict.set(key, lines);
    }
    for (const [key, lines] of byDistrict) {
      await fs.appendFile(path.join(paths.districts, `${key}.ndjson`), lines.join(""), "utf8");
    }
    if (page.quarantine_chunk) {
      const quarantine = await fs.readFile(path.join(paths.quarantineStaging, page.quarantine_chunk), "utf8");
      await fs.appendFile(paths.quarantineOutput, quarantine, "utf8");
    }
  }
}

async function validateStoredRecords(paths: RunPaths): Promise<{
  storedCount: number;
  districtCounts: DistrictCount[];
  nodeWktMissing: number;
  linkWktMissing: number;
  exactDuplicates: number;
  nodeIdDuplicates: number;
  linkIdDuplicates: number;
}> {
  const filenames = (await fs.readdir(paths.districts)).filter((name) => name.endsWith(".ndjson")).sort();
  const exactHashes = new Set<string>();
  const nodeIds = new Set<string>();
  const linkIds = new Set<string>();
  const districtRows = new Map<string, { name: string | null; count: number }>();
  let storedCount = 0;
  let nodeWktMissing = 0;
  let linkWktMissing = 0;
  let exactDuplicates = 0;
  let nodeIdDuplicates = 0;
  let linkIdDuplicates = 0;

  for (const filename of filenames) {
    const fileKey = path.basename(filename, ".ndjson");
    const content = await fs.readFile(path.join(paths.districts, filename), "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line) continue;
      const record = JSON.parse(line) as SeoulSpatialRecord;
      const expectedKey = districtFileKey(record.districtCode);
      assert(expectedKey === fileKey, `district NDJSON 분할이 올바르지 않습니다: ${filename}`);
      storedCount += 1;
      if (record.nodeWkt === null) nodeWktMissing += 1;
      if (record.linkWkt === null) linkWktMissing += 1;
      const recordHash = sha256(line);
      if (exactHashes.has(recordHash)) exactDuplicates += 1;
      else exactHashes.add(recordHash);
      if (record.nodeId !== null) {
        if (nodeIds.has(record.nodeId)) nodeIdDuplicates += 1;
        else nodeIds.add(record.nodeId);
      }
      if (record.linkId !== null) {
        if (linkIds.has(record.linkId)) linkIdDuplicates += 1;
        else linkIds.add(record.linkId);
      }
      const current = districtRows.get(fileKey) ?? { name: record.districtName, count: 0 };
      if (current.name === null && record.districtName !== null) current.name = record.districtName;
      current.count += 1;
      districtRows.set(fileKey, current);
    }
  }

  return {
    storedCount,
    districtCounts: [...districtRows.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([districtCode, value]) => ({
      district_code: districtCode,
      district_name: districtCode === "UNKNOWN" ? null : value.name,
      row_count: value.count,
    })),
    nodeWktMissing,
    linkWktMissing,
    exactDuplicates,
    nodeIdDuplicates,
    linkIdDuplicates,
  };
}

async function validateRun(
  checkpoint: SpatialCheckpoint,
  paths: RunPaths,
  limitedRun: boolean,
): Promise<{ manifestCounts: Omit<SpatialSnapshotManifest, "manifest_kind" | "schema_version" | "snapshot_id" | "dataset" | "service_name" | "source_id" | "source" | "source_basis" | "fetched_at" | "page_size" | "status" | "limited_run" | "publish_eligible" | "raw_path" | "normalized_path" | "checkpoint_path" | "failure">; hardErrors: string[] }> {
  let rawChecksumMatch = true;
  let normalizedChecksumMatch = true;
  let contiguous = true;
  let expectedStart = 1;
  for (const page of checkpoint.completed_pages) {
    if (page.start_index !== expectedStart) contiguous = false;
    expectedStart = page.end_index + 1;
    if (await fileSha256(path.join(paths.rawStaging, page.raw_file)) !== page.raw_sha256) rawChecksumMatch = false;
    if (await fileSha256(path.join(paths.normalizedStaging, page.normalized_chunk)) !== page.normalized_sha256) normalizedChecksumMatch = false;
  }

  const stored = await validateStoredRecords(paths);
  const fetchedRowCount = checkpoint.completed_pages.reduce((sum, page) => sum + page.row_count, 0);
  const quarantinedCount = checkpoint.completed_pages.reduce((sum, page) => sum + page.quarantine_count, 0);
  const expectedPageCount = calculateExpectedPageCount(checkpoint.total_count, checkpoint.page_size);
  const districtTotal = stored.districtCounts.reduce((sum, district) => sum + district.row_count, 0);
  const expectedPageCountMatch = checkpoint.completed_pages.length === expectedPageCount;
  const fetchedRowCountMatch = fetchedRowCount === checkpoint.total_count;
  const storedCountMatch = stored.storedCount === fetchedRowCount;
  const districtCountsMatch = districtTotal === stored.storedCount;
  const hardErrors: string[] = [];
  if (!contiguous) hardErrors.push("PAGE_RANGE_GAP_OR_OVERLAP");
  if (!rawChecksumMatch) hardErrors.push("RAW_CHECKSUM_MISMATCH");
  if (!normalizedChecksumMatch) hardErrors.push("NORMALIZED_CHECKSUM_MISMATCH");
  if (!storedCountMatch) hardErrors.push("STORED_COUNT_MISMATCH");
  if (!districtCountsMatch) hardErrors.push("DISTRICT_COUNT_MISMATCH");
  if (quarantinedCount > 0) hardErrors.push("PARSING_FAILURE");
  if (!limitedRun && !expectedPageCountMatch) hardErrors.push("EXPECTED_PAGE_COUNT_MISMATCH");
  if (!limitedRun && !fetchedRowCountMatch) hardErrors.push("FETCHED_ROW_COUNT_MISMATCH");
  const ready = !limitedRun && hardErrors.length === 0;

  return {
    manifestCounts: {
      total_count: checkpoint.total_count,
      expected_page_count: expectedPageCount,
      fetched_page_count: checkpoint.completed_pages.length,
      fetched_row_count: fetchedRowCount,
      stored_count: stored.storedCount,
      quarantined_count: quarantinedCount,
      district_counts: stored.districtCounts,
      validation: {
        result_code_status: "PASS",
        total_count_consistent: true,
        collected_page_ranges_contiguous: contiguous,
        expected_page_count_match: expectedPageCountMatch,
        fetched_row_count_match: fetchedRowCountMatch,
        stored_count_match: storedCountMatch,
        district_counts_match: districtCountsMatch,
        raw_checksum_match: rawChecksumMatch,
        normalized_checksum_match: normalizedChecksumMatch,
        parsing_failure_count: quarantinedCount,
        node_wkt_missing_count: stored.nodeWktMissing,
        link_wkt_missing_count: stored.linkWktMissing,
        exact_duplicate_record_count: stored.exactDuplicates,
        node_id_duplicate_count: stored.nodeIdDuplicates,
        link_id_duplicate_count: stored.linkIdDuplicates,
        ready,
        errors: hardErrors,
      },
    },
    hardErrors,
  };
}

function emptyValidation(error: string): SpatialValidation {
  return {
    result_code_status: "FAIL",
    total_count_consistent: false,
    collected_page_ranges_contiguous: false,
    expected_page_count_match: false,
    fetched_row_count_match: false,
    stored_count_match: false,
    district_counts_match: false,
    raw_checksum_match: false,
    normalized_checksum_match: false,
    parsing_failure_count: 0,
    node_wkt_missing_count: 0,
    link_wkt_missing_count: 0,
    exact_duplicate_record_count: 0,
    node_id_duplicate_count: 0,
    link_id_duplicate_count: 0,
    ready: false,
    errors: [error],
  };
}

export async function runSeoulSpatialIngestion(options: RunSpatialIngestionOptions): Promise<RunSpatialIngestionResult> {
  const config = DATASET_CONFIGS[options.dataset];
  assert(config, "지원하지 않는 dataset입니다.");
  const pageSize = options.pageSize ?? 1_000;
  calculateExpectedPageCount(0, pageSize);
  const full = options.full === true;
  const maxPages = options.maxPages;
  assert(full !== (maxPages !== undefined), "--full 또는 --max-pages 중 정확히 하나가 필요합니다.");
  if (maxPages !== undefined) assert(Number.isInteger(maxPages) && maxPages > 0, "maxPages는 양의 정수여야 합니다.");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 3;
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0, "timeoutMs가 올바르지 않습니다.");
  assert(Number.isInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 3, "maxAttempts는 1~3이어야 합니다.");
  const now = options.dependencies?.now ?? (() => new Date());
  const delay = options.dependencies?.delay ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.dependencies?.random ?? Math.random;
  const snapshotId = safeSnapshotId(options.resumeSnapshotId ?? createSnapshotId(now()));
  const ingestRoot = path.resolve(options.ingestRoot);
  const paths = buildPaths(ingestRoot, config.sourceId, snapshotId);
  for (const target of Object.values(paths)) ensureWithin(ingestRoot, target);
  await Promise.all([
    fs.mkdir(paths.rawPages, { recursive: true }),
    fs.mkdir(paths.normalizedChunks, { recursive: true }),
    fs.mkdir(paths.quarantineChunks, { recursive: true }),
    fs.mkdir(path.dirname(paths.manifest), { recursive: true }),
  ]);

  let checkpoint: SpatialCheckpoint | null = null;
  let readyManifestWritten = false;
  let failureManifestWritten = false;
  try {
    if (options.resumeSnapshotId) {
      assert(await pathExists(paths.checkpoint), "resume checkpoint가 없습니다.");
      checkpoint = await readJson<SpatialCheckpoint>(paths.checkpoint);
      await verifyCheckpoint(checkpoint, paths, {
        snapshotId,
        sourceId: config.sourceId,
        serviceName: config.serviceName,
        pageSize,
      });
    }

    const lastCompletedEnd = checkpoint?.completed_pages.at(-1)?.end_index;
    let nextStart: number = lastCompletedEnd === undefined ? 1 : lastCompletedEnd + 1;
    while (checkpoint === null || nextStart <= checkpoint.total_count) {
      if (maxPages !== undefined && (checkpoint?.completed_pages.length ?? 0) >= maxPages) break;
      const requestEnd = checkpoint === null
        ? nextStart + pageSize - 1
        : Math.min(nextStart + pageSize - 1, checkpoint.total_count);
      const rawPage = await fetchWithRetry(
        (signal) => options.dependencies?.fetchRawPage
          ? options.dependencies.fetchRawPage({ dataset: options.dataset, startIndex: nextStart, endIndex: requestEnd, signal })
          : config.fetchRawPage({ startIndex: nextStart, endIndex: requestEnd, signal }),
        { timeoutMs, maxAttempts, delay, random },
      );
      assert(rawPage.service === config.serviceName, "API service name이 요청과 다릅니다.");
      assert(rawPage.start === nextStart, "API page 시작 범위가 요청과 다릅니다.");
      assert(rawPage.totalCount !== null && Number.isInteger(rawPage.totalCount) && rawPage.totalCount >= 0, "API total count가 없습니다.");
      if (checkpoint !== null) assert(rawPage.totalCount === checkpoint.total_count, "수집 중 API total count가 변경되었습니다.");
      const totalCount = rawPage.totalCount;
      const logicalEnd = Math.min(requestEnd, totalCount);
      const expectedRows = totalCount === 0 ? 0 : logicalEnd - nextStart + 1;
      assert(rawPage.rows.length === expectedRows, `API page row count가 요청 범위와 다릅니다: ${rawPage.rows.length}/${expectedRows}`);
      const filename = pageFilename(nextStart, logicalEnd);
      const rawRelative = path.join("pages", filename).replaceAll("\\", "/");
      const rawTarget = path.join(paths.rawStaging, rawRelative);
      await atomicWrite(rawTarget, rawPage.rawResponse);
      const rawSha256 = await fileSha256(rawTarget);
      const pageBaseName = path.basename(filename, ".json");
      const normalized = await normalizePage(
        rawPage.rows,
        options.dependencies?.parseRow ?? config.parseRow,
        pageBaseName,
        paths,
        rawRelative,
      );
      const completedPage: CompletedPage = {
        start_index: nextStart,
        end_index: logicalEnd,
        row_count: rawPage.rows.length,
        raw_file: rawRelative,
        raw_sha256: rawSha256,
        ...normalized,
        fetched_at: rawPage.fetchedAt,
      };
      checkpoint = checkpoint ?? {
        schema_version: "1.0.0",
        snapshot_id: snapshotId,
        source_id: config.sourceId,
        service_name: config.serviceName,
        page_size: pageSize,
        total_count: totalCount,
        source_basis: rawPage.sourceBasis,
        completed_pages: [],
        last_completed_page: null,
        updated_at: rawPage.fetchedAt,
      };
      assert(rawPage.source === SEOUL_PEDESTRIAN_SPATIAL_SOURCE.source, "API source metadata가 다릅니다.");
      assert(rawPage.sourceBasis === checkpoint.source_basis, "수집 중 source basis가 변경되었습니다.");
      checkpoint.completed_pages.push(completedPage);
      checkpoint.last_completed_page = pageBaseName;
      checkpoint.updated_at = now().toISOString();
      await atomicWrite(paths.checkpoint, `${JSON.stringify(checkpoint, null, 2)}\n`);
      nextStart = logicalEnd + 1;
      if (totalCount === 0) break;
    }

    assert(checkpoint !== null, "수집된 page가 없습니다.");
    await rebuildOutputs(checkpoint, paths, ingestRoot);
    const limitedRun = !full;
    const { manifestCounts, hardErrors } = await validateRun(checkpoint, paths, limitedRun);
    const baseManifest: SpatialSnapshotManifest = {
      manifest_kind: "API_SNAPSHOT",
      schema_version: "1.0.0",
      snapshot_id: snapshotId,
      dataset: config.dataset,
      service_name: config.serviceName,
      source_id: config.sourceId,
      source: SEOUL_PEDESTRIAN_SPATIAL_SOURCE.source,
      source_basis: checkpoint.source_basis,
      fetched_at: now().toISOString(),
      page_size: pageSize,
      ...manifestCounts,
      status: hardErrors.length > 0 ? "FAILED" : limitedRun ? "VALIDATING" : "READY",
      limited_run: limitedRun,
      publish_eligible: !limitedRun && hardErrors.length === 0,
      raw_path: relativePath(ingestRoot, paths.rawStaging),
      normalized_path: relativePath(ingestRoot, paths.districts),
      checkpoint_path: relativePath(ingestRoot, paths.checkpoint),
      failure: hardErrors.length > 0 ? {
        kind: "validation",
        message: hardErrors.join(", "),
        failed_at: now().toISOString(),
      } : null,
    };

    if (hardErrors.length > 0) {
      await atomicWrite(paths.manifest, `${JSON.stringify(baseManifest, null, 2)}\n`);
      failureManifestWritten = true;
      throw new Error(`Spatial ingestion validation failed: ${hardErrors.join(", ")}`);
    }
    if (limitedRun) {
      await atomicWrite(paths.manifest, `${JSON.stringify(baseManifest, null, 2)}\n`);
      return { manifest: baseManifest, manifestPath: paths.manifest, currentPointerUpdated: false };
    }

    assert(!await pathExists(paths.rawFinal), "동일 snapshot raw directory가 이미 존재합니다.");
    assert(!await pathExists(paths.normalizedFinal), "동일 snapshot normalized directory가 이미 존재합니다.");
    assert(!await pathExists(paths.quarantineFinal), "동일 snapshot quarantine directory가 이미 존재합니다.");
    await fs.rm(paths.normalizedChunks, { recursive: true, force: true });
    await fs.rm(paths.quarantineChunks, { recursive: true, force: true });
    await fs.rename(paths.rawStaging, paths.rawFinal);
    await fs.rename(paths.normalizedStaging, paths.normalizedFinal);
    await fs.rename(paths.quarantineStaging, paths.quarantineFinal);
    const readyManifest: SpatialSnapshotManifest = {
      ...baseManifest,
      raw_path: relativePath(ingestRoot, paths.rawFinal),
      normalized_path: relativePath(ingestRoot, path.join(paths.normalizedFinal, "districts")),
      checkpoint_path: relativePath(ingestRoot, path.join(paths.rawFinal, "checkpoint.json")),
    };
    await atomicWrite(paths.manifest, `${JSON.stringify(readyManifest, null, 2)}\n`);
    readyManifestWritten = true;
    await atomicWrite(paths.current, `${JSON.stringify({
      schema_version: "1.0.0",
      source_id: config.sourceId,
      snapshot_id: snapshotId,
      manifest: relativePath(ingestRoot, paths.manifest),
      updated_at: now().toISOString(),
    }, null, 2)}\n`);
    return { manifest: readyManifest, manifestPath: paths.manifest, currentPointerUpdated: true };
  } catch (error) {
    if (!readyManifestWritten && !failureManifestWritten) {
      const safe = sanitizeError(error);
      const completedPages = checkpoint?.completed_pages ?? [];
      const fetchedRows = completedPages.reduce((sum, page) => sum + page.row_count, 0);
      const quarantined = completedPages.reduce((sum, page) => sum + page.quarantine_count, 0);
      const failureManifest: SpatialSnapshotManifest = {
        manifest_kind: "API_SNAPSHOT",
        schema_version: "1.0.0",
        snapshot_id: snapshotId,
        dataset: config.dataset,
        service_name: config.serviceName,
        source_id: config.sourceId,
        source: SEOUL_PEDESTRIAN_SPATIAL_SOURCE.source,
        source_basis: checkpoint?.source_basis ?? SEOUL_PEDESTRIAN_SPATIAL_SOURCE.sourceBasis,
        fetched_at: now().toISOString(),
        page_size: pageSize,
        total_count: checkpoint?.total_count ?? 0,
        expected_page_count: checkpoint ? calculateExpectedPageCount(checkpoint.total_count, pageSize) : 0,
        fetched_page_count: completedPages.length,
        fetched_row_count: fetchedRows,
        stored_count: completedPages.reduce((sum, page) => sum + page.normalized_count, 0),
        quarantined_count: quarantined,
        district_counts: [],
        validation: emptyValidation(safe.kind),
        status: "FAILED",
        limited_run: !full,
        publish_eligible: false,
        raw_path: relativePath(ingestRoot, paths.rawStaging),
        normalized_path: relativePath(ingestRoot, paths.districts),
        checkpoint_path: relativePath(ingestRoot, paths.checkpoint),
        failure: { ...safe, failed_at: now().toISOString() },
      };
      await atomicWrite(paths.manifest, `${JSON.stringify(failureManifest, null, 2)}\n`);
    }
    throw error;
  }
}
