import registryDocumentJson from "../../data/seoul-market/v1.1-final/13_SOURCE_INGEST/DATA_SOURCE_REGISTRY.json";
import sourceContractsDocumentJson from "../../data/seoul-market/v1.1-final/13_SOURCE_INGEST/source-contracts/SOURCE_CONTRACTS.json";

export const DATA_SOURCE_CATEGORIES = [
  "SALES",
  "STORE",
  "SPATIAL",
  "POPULATION",
  "POI_MAP",
  "PERMIT",
  "TRANSPORT",
  "HOUSING",
  "PARKING",
  "STATISTICS",
  "ADDRESS",
  "BUILDING",
] as const;

export const DATA_SOURCE_LIFECYCLES = ["CURRENT", "PLANNED", "OPTIONAL"] as const;
export const DATA_SOURCE_CONNECTION_STATUSES = [
  "CONNECTED",
  "READY_TO_CONNECT",
  "NOT_CONNECTED",
] as const;
export const DATA_SOURCE_ACCESS_TYPES = [
  "OPEN_API",
  "OPEN_API_OR_FILE",
  "API_AND_SDK",
] as const;
export const DATA_SOURCE_INGESTION_MODES = [
  "SCHEDULED",
  "CHANGE_WATCH",
  "ON_DEMAND",
] as const;
export const DATA_SOURCE_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "CHANGE_ONLY",
  "ON_DEMAND",
  "UNKNOWN",
] as const;
export const DATA_SOURCE_MANUAL_POLICIES = [
  "AUTO",
  "AUTO_WITH_REVIEW",
  "MANUAL_EXCEPTION",
] as const;
export const DATA_SOURCE_PRIORITIES = ["P0", "P1", "P2"] as const;
export const DATA_SOURCE_HEALTHS = [
  "HEALTHY",
  "STALE",
  "UPDATE_AVAILABLE",
  "REVIEW_REQUIRED",
  "ERROR",
  "NOT_CONNECTED",
] as const;

export const DATA_SOURCE_AUTH_ENV_NAMES = [
  "SEOUL_OPEN_DATA_API_KEY",
  "PUBLIC_DATA_API_KEY",
  "KAKAO_REST_API_KEY",
  "NEXT_PUBLIC_KAKAO_MAP_KEY",
  "SGIS_CONSUMER_KEY",
  "SGIS_CONSUMER_SECRET",
  "JUSO_ADDRESS_API_KEY",
  "VWORLD_API_KEY",
  "KOSIS_API_KEY",
] as const;

export type DataSourceCategory = (typeof DATA_SOURCE_CATEGORIES)[number];
export type DataSourceLifecycle = (typeof DATA_SOURCE_LIFECYCLES)[number];
export type DataSourceConnectionStatus =
  (typeof DATA_SOURCE_CONNECTION_STATUSES)[number];
export type DataSourceAccessType = (typeof DATA_SOURCE_ACCESS_TYPES)[number];
export type DataSourceIngestionMode =
  (typeof DATA_SOURCE_INGESTION_MODES)[number];
export type DataSourceFrequency = (typeof DATA_SOURCE_FREQUENCIES)[number];
export type DataSourceManualPolicy =
  (typeof DATA_SOURCE_MANUAL_POLICIES)[number];
export type DataSourcePriority = (typeof DATA_SOURCE_PRIORITIES)[number];
export type DataSourceHealth = (typeof DATA_SOURCE_HEALTHS)[number];
export type DataSourceAuthEnvName =
  (typeof DATA_SOURCE_AUTH_ENV_NAMES)[number];

export interface DataSourceRegistryEntry {
  sourceId: string;
  aliases: readonly string[];
  sourceName: string;
  provider: string;
  purpose: string;
  category: DataSourceCategory;
  lifecycle: DataSourceLifecycle;
  connectionStatus: DataSourceConnectionStatus;
  accessType: DataSourceAccessType;
  authEnv: readonly DataSourceAuthEnvName[];
  ingestionMode: DataSourceIngestionMode;
  sourceRefreshFrequency: DataSourceFrequency;
  frameoneCheckFrequency: DataSourceFrequency;
  manualPolicy: DataSourceManualPolicy;
  priority: DataSourcePriority | null;
  contractRef: string | null;
  officialUrl: string;
  notes: string;
}

export interface DataSourceRegistry {
  schemaVersion: "1.0.0";
  scope: "SEOUL_ALL_25_DISTRICTS";
  sources: readonly DataSourceRegistryEntry[];
}

export interface DataSourceRuntimeState {
  sourceId: string;
  health: DataSourceHealth;
  lastCheckedAt?: string | null;
  lastFetchedAt?: string | null;
  lastPublishedAt?: string | null;
  currentSnapshot?: string | null;
  updateAvailable?: boolean;
  lastError?: string | null;
}

type UnknownRecord = Record<string, unknown>;

const SOURCE_ID_PATTERN = /^SRC-[A-Z0-9-]+$/;
const TOP_LEVEL_FIELDS = new Set(["schemaVersion", "scope", "sources"]);
const ENTRY_FIELDS = new Set([
  "sourceId",
  "aliases",
  "sourceName",
  "provider",
  "purpose",
  "category",
  "lifecycle",
  "connectionStatus",
  "accessType",
  "authEnv",
  "ingestionMode",
  "sourceRefreshFrequency",
  "frameoneCheckFrequency",
  "manualPolicy",
  "priority",
  "contractRef",
  "officialUrl",
  "notes",
]);

const contractSourceIds = new Set(
  sourceContractsDocumentJson.contracts.map((contract) => contract.source_id),
);

export class DataSourceRegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataSourceRegistryValidationError";
  }
}

function fail(message: string): never {
  throw new DataSourceRegistryValidationError(message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, path: string): asserts value is UnknownRecord {
  if (!isRecord(value)) fail(`${path}는 object여야 합니다.`);
}

function assertKnownFields(
  value: UnknownRecord,
  allowedFields: ReadonlySet<string>,
  path: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowedFields.has(key));
  if (unknown.length > 0) fail(`${path}에 알 수 없는 field가 있습니다: ${unknown.join(", ")}`);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${path}는 비어 있지 않은 string이어야 합니다.`);
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${path} 값이 허용 enum이 아닙니다.`);
  }
  return value as T;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(`${path}는 string array여야 합니다.`);
  }
  if (new Set(value).size !== value.length) fail(`${path}에 중복 값이 있습니다.`);
  return value;
}

function validateSourceId(value: unknown, path: string): string {
  const sourceId = requireNonEmptyString(value, path);
  if (!SOURCE_ID_PATTERN.test(sourceId)) fail(`${path}가 Source ID 규칙과 다릅니다.`);
  return sourceId;
}

function validateOfficialUrl(value: unknown, path: string): string {
  const officialUrl = requireNonEmptyString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(officialUrl);
  } catch {
    fail(`${path}가 유효한 URL이 아닙니다.`);
  }
  if (parsed.protocol !== "https:") fail(`${path}는 HTTPS 공식 URL이어야 합니다.`);
  return officialUrl;
}

function parseEntry(value: unknown, index: number): DataSourceRegistryEntry {
  const path = `sources[${index}]`;
  assertRecord(value, path);
  assertKnownFields(value, ENTRY_FIELDS, path);

  const authEnv = requireStringArray(value.authEnv, `${path}.authEnv`).map((name) =>
    requireEnum(name, DATA_SOURCE_AUTH_ENV_NAMES, `${path}.authEnv`),
  );
  const aliases = requireStringArray(value.aliases, `${path}.aliases`).map((alias) =>
    validateSourceId(alias, `${path}.aliases`),
  );
  const priority =
    value.priority === null
      ? null
      : requireEnum(value.priority, DATA_SOURCE_PRIORITIES, `${path}.priority`);
  const contractRef =
    value.contractRef === null
      ? null
      : validateSourceId(value.contractRef, `${path}.contractRef`);

  if (contractRef !== null && !contractSourceIds.has(contractRef)) {
    fail(`${path}.contractRef가 기존 Source Contract와 연결되지 않습니다: ${contractRef}`);
  }

  return {
    sourceId: validateSourceId(value.sourceId, `${path}.sourceId`),
    aliases,
    sourceName: requireNonEmptyString(value.sourceName, `${path}.sourceName`),
    provider: requireNonEmptyString(value.provider, `${path}.provider`),
    purpose: requireNonEmptyString(value.purpose, `${path}.purpose`),
    category: requireEnum(value.category, DATA_SOURCE_CATEGORIES, `${path}.category`),
    lifecycle: requireEnum(value.lifecycle, DATA_SOURCE_LIFECYCLES, `${path}.lifecycle`),
    connectionStatus: requireEnum(
      value.connectionStatus,
      DATA_SOURCE_CONNECTION_STATUSES,
      `${path}.connectionStatus`,
    ),
    accessType: requireEnum(value.accessType, DATA_SOURCE_ACCESS_TYPES, `${path}.accessType`),
    authEnv,
    ingestionMode: requireEnum(
      value.ingestionMode,
      DATA_SOURCE_INGESTION_MODES,
      `${path}.ingestionMode`,
    ),
    sourceRefreshFrequency: requireEnum(
      value.sourceRefreshFrequency,
      DATA_SOURCE_FREQUENCIES,
      `${path}.sourceRefreshFrequency`,
    ),
    frameoneCheckFrequency: requireEnum(
      value.frameoneCheckFrequency,
      DATA_SOURCE_FREQUENCIES,
      `${path}.frameoneCheckFrequency`,
    ),
    manualPolicy: requireEnum(
      value.manualPolicy,
      DATA_SOURCE_MANUAL_POLICIES,
      `${path}.manualPolicy`,
    ),
    priority,
    contractRef,
    officialUrl: validateOfficialUrl(value.officialUrl, `${path}.officialUrl`),
    notes: requireNonEmptyString(value.notes, `${path}.notes`),
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function validateDataSourceRegistry(value: unknown): DataSourceRegistry {
  assertRecord(value, "registry");
  assertKnownFields(value, TOP_LEVEL_FIELDS, "registry");
  if (value.schemaVersion !== "1.0.0") fail("registry.schemaVersion이 지원되지 않습니다.");
  if (value.scope !== "SEOUL_ALL_25_DISTRICTS") fail("registry.scope가 서울 전체 범위가 아닙니다.");
  if (!Array.isArray(value.sources)) fail("registry.sources는 array여야 합니다.");

  const sources = value.sources.map(parseEntry);
  const canonicalIds = new Set<string>();
  for (const source of sources) {
    if (canonicalIds.has(source.sourceId)) fail(`중복 sourceId입니다: ${source.sourceId}`);
    canonicalIds.add(source.sourceId);
  }

  const aliases = new Set<string>();
  for (const source of sources) {
    for (const alias of source.aliases) {
      if (canonicalIds.has(alias) || aliases.has(alias)) {
        fail(`중복되거나 canonical ID와 충돌하는 alias입니다: ${alias}`);
      }
      aliases.add(alias);
    }
  }

  return { schemaVersion: "1.0.0", scope: "SEOUL_ALL_25_DISTRICTS", sources };
}

const validatedRegistry = deepFreeze(
  validateDataSourceRegistry(registryDocumentJson),
) as Readonly<DataSourceRegistry>;
const sourcesById = new Map<string, DataSourceRegistryEntry>();
for (const source of validatedRegistry.sources) {
  sourcesById.set(source.sourceId, source);
  for (const alias of source.aliases) sourcesById.set(alias, source);
}

export function getAllDataSources(): readonly DataSourceRegistryEntry[] {
  return validatedRegistry.sources;
}

export function getDataSourceById(
  sourceId: string,
): DataSourceRegistryEntry | undefined {
  return sourcesById.get(sourceId);
}
