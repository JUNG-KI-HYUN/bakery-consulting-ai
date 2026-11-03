import { isCandidateStoreId } from "../field/identifiers";
import {
  ANALYSIS_CLUSTER_SCHEMA_VERSION,
  type AnalysisClusterFrameoneContext,
  type AnalysisClusterV1,
  type AnalysisClusterValidationResult,
  type AnalysisRunId,
  type CandidateStoreId,
} from "./types";

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "analysisClusterId",
  "label",
  "analysisRunIds",
  "candidateStoreIds",
  "frameoneContext",
  "createdAt",
]);

const FRAMEONE_CONTEXT_KEYS = new Set(["marketId", "submarketId", "nodeId"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyReference(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function reportUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}는 Analysis Cluster V1 필드가 아닙니다.`);
  }
}

function parseReferenceArray<T extends string>(
  value: unknown,
  path: string,
  validate: (candidate: unknown) => candidate is T,
  errors: string[],
): readonly T[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 배열이어야 합니다.`);
    return null;
  }

  const parsed: T[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (!validate(candidate)) {
      errors.push(`${path}[${index}]가 올바른 reference ID가 아닙니다.`);
      continue;
    }
    if (seen.has(candidate)) {
      errors.push(`${path}에 중복 ID ${candidate}가 있습니다.`);
      continue;
    }
    seen.add(candidate);
    parsed.push(candidate);
  }
  return Object.freeze(parsed);
}

function parseFrameoneContext(
  value: unknown,
  errors: string[],
): AnalysisClusterFrameoneContext | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push("frameoneContext는 객체여야 합니다.");
    return undefined;
  }

  reportUnknownKeys(value, FRAMEONE_CONTEXT_KEYS, "frameoneContext", errors);
  const context: { marketId?: string; submarketId?: string; nodeId?: string } = {};
  for (const key of FRAMEONE_CONTEXT_KEYS) {
    const candidate = value[key];
    if (candidate === undefined) continue;
    if (!isNonEmptyReference(candidate)) {
      errors.push(`frameoneContext.${key}는 비어 있지 않은 ID여야 합니다.`);
      continue;
    }
    context[key as keyof typeof context] = candidate;
  }
  return Object.freeze(context);
}

/**
 * 값의 존재 여부만 검증한다. Candidate/Analysis Run/Market record를 조회하거나 관계를 확정하지 않는다.
 * 반환값은 입력을 변경하지 않고 새 readonly reference 배열과 context로 구성한다.
 */
export function validateAnalysisCluster(value: unknown): AnalysisClusterValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "INVALID_ANALYSIS_CLUSTER",
      message: "Analysis Cluster V1 검증에 실패했습니다.",
      errors: Object.freeze(["Analysis Cluster는 객체여야 합니다."]),
    };
  }

  reportUnknownKeys(value, TOP_LEVEL_KEYS, "analysisCluster", errors);
  if (value.schemaVersion !== ANALYSIS_CLUSTER_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${ANALYSIS_CLUSTER_SCHEMA_VERSION}이어야 합니다.`);
  }
  if (!isNonEmptyReference(value.analysisClusterId)) {
    errors.push("analysisClusterId는 비어 있지 않은 ID여야 합니다.");
  }
  if (typeof value.label !== "string" || value.label.trim() === "") {
    errors.push("label은 비어 있지 않은 문자열이어야 합니다.");
  }
  if (!isNonEmptyReference(value.createdAt)) {
    errors.push("createdAt은 비어 있지 않은 문자열이어야 합니다.");
  }

  const analysisRunIds = parseReferenceArray<AnalysisRunId>(
    value.analysisRunIds,
    "analysisRunIds",
    isNonEmptyReference,
    errors,
  );
  const candidateStoreIds = parseReferenceArray<CandidateStoreId>(
    value.candidateStoreIds,
    "candidateStoreIds",
    isCandidateStoreId,
    errors,
  );
  const frameoneContext = parseFrameoneContext(value.frameoneContext, errors);

  if (errors.length > 0 || !analysisRunIds || !candidateStoreIds) {
    return {
      ok: false,
      code: "INVALID_ANALYSIS_CLUSTER",
      message: "Analysis Cluster V1 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }

  const cluster: AnalysisClusterV1 = {
    schemaVersion: ANALYSIS_CLUSTER_SCHEMA_VERSION,
    analysisClusterId: value.analysisClusterId as string,
    label: value.label as string,
    analysisRunIds,
    candidateStoreIds,
    ...(frameoneContext ? { frameoneContext } : {}),
    createdAt: value.createdAt as string,
  };
  return { ok: true, value: Object.freeze(cluster) };
}
