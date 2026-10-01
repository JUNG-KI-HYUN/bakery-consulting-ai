import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ANALYSIS_RUN_SNAPSHOT_SCHEMA_VERSION,
  AnalysisRunSnapshotValidationError,
  isCanonicalAnalysisRunId,
  normalizeSectionSave,
  type AnalysisRunSectionSaveInput,
  type AnalysisRunSnapshot,
} from "./analysis-run-snapshot";

interface AnalysisRunRegistryFile {
  schemaVersion: "frameone.analysis-run-registry.v1";
  runs: AnalysisRunSnapshot[];
}

let pendingWrite = Promise.resolve();

export class AnalysisRunRepositoryError extends Error {}

function registryFilePath() {
  const override = process.env.FRAMEONE_ANALYSIS_RUNS_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "analysis-runs.json");
}

async function ensureRegistry(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, '{"schemaVersion":"frameone.analysis-run-registry.v1","runs":[]}\n', { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

function assertSnapshot(value: unknown): asserts value is AnalysisRunSnapshot {
  if (!value || typeof value !== "object") throw new TypeError("Analysis Run snapshot이 객체가 아닙니다.");
  const candidate = value as Partial<AnalysisRunSnapshot>;
  if (candidate.schemaVersion !== ANALYSIS_RUN_SNAPSHOT_SCHEMA_VERSION || !isCanonicalAnalysisRunId(candidate.analysisRunId)) {
    throw new TypeError("Analysis Run snapshot schema 또는 ID가 올바르지 않습니다.");
  }
  if (candidate.targetSnapshot?.analysisRunId !== candidate.analysisRunId || !candidate.sections || !Number.isFinite(Date.parse(candidate.createdAt ?? "")) || !Number.isFinite(Date.parse(candidate.updatedAt ?? ""))) {
    throw new TypeError("Analysis Run snapshot 필수값이 올바르지 않습니다.");
  }
}

async function readRegistry(filePath: string): Promise<AnalysisRunRegistryFile> {
  await ensureRegistry(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as AnalysisRunRegistryFile;
    if (parsed.schemaVersion !== "frameone.analysis-run-registry.v1" || !Array.isArray(parsed.runs)) throw new TypeError("Analysis Run registry root가 올바르지 않습니다.");
    parsed.runs.forEach(assertSnapshot);
    return parsed;
  } catch (error) {
    throw new AnalysisRunRepositoryError("Analysis Run 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeRegistry(filePath: string, registry: AnalysisRunRegistryFile) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new AnalysisRunRepositoryError("Analysis Run 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

export async function getAnalysisRunSnapshot(analysisRunId: string): Promise<AnalysisRunSnapshot | null> {
  if (!isCanonicalAnalysisRunId(analysisRunId)) return null;
  await pendingWrite;
  const registry = await readRegistry(registryFilePath());
  return structuredClone(registry.runs.find((run) => run.analysisRunId === analysisRunId) ?? null);
}

export function saveAnalysisRunSection(input: AnalysisRunSectionSaveInput): Promise<AnalysisRunSnapshot> {
  const normalized = normalizeSectionSave(input);
  const filePath = registryFilePath();
  let saved!: AnalysisRunSnapshot;
  const operation = pendingWrite.then(async () => {
    const registry = await readRegistry(filePath);
    const runIndex = registry.runs.findIndex((run) => run.analysisRunId === normalized.targetSnapshot.analysisRunId);
    const timestamp = new Date().toISOString();
    const run: AnalysisRunSnapshot = runIndex >= 0 ? registry.runs[runIndex] : {
      schemaVersion: ANALYSIS_RUN_SNAPSHOT_SCHEMA_VERSION,
      analysisRunId: normalized.targetSnapshot.analysisRunId,
      targetSnapshot: normalized.targetSnapshot,
      createdAt: timestamp,
      updatedAt: timestamp,
      sections: {},
    };
    if (run.targetSnapshot.analysisRunId !== normalized.targetSnapshot.analysisRunId) {
      throw new AnalysisRunSnapshotValidationError("저장된 Run target identity가 일치하지 않습니다.");
    }
    const sections = structuredClone(run.sections);
    const current = sections[normalized.section] as { versions: unknown[] } | undefined;
    const duplicate = current?.versions.find((item) => JSON.stringify(item) === JSON.stringify(normalized.version));
    if (!duplicate) {
      const sameTimestamp = current?.versions.some((item) => (item as { generatedAt?: string }).generatedAt === normalized.version.generatedAt);
      if (sameTimestamp) throw new AnalysisRunSnapshotValidationError("같은 generatedAt에 다른 section 결과가 이미 저장되어 있습니다.");
      if (normalized.section === "competition") {
        sections.competition = { transientDetailRestore: "REQUERY_REQUIRED", versions: [...(sections.competition?.versions ?? []), normalized.version] };
      } else if (normalized.section === "location") {
        sections.location = { versions: [...(sections.location?.versions ?? []), normalized.version] };
      } else if (normalized.section === "rental") {
        sections.rental = { versions: [...(sections.rental?.versions ?? []), normalized.version] };
      } else {
        sections.economic = { versions: [...(sections.economic?.versions ?? []), normalized.version] };
      }
    }
    saved = { ...run, targetSnapshot: normalized.targetSnapshot, updatedAt: duplicate ? run.updatedAt : timestamp, sections };
    if (!duplicate) {
      if (runIndex >= 0) registry.runs[runIndex] = saved;
      else registry.runs.push(saved);
      await writeRegistry(filePath, registry);
    }
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(saved));
}
