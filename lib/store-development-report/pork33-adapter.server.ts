import "server-only";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatePork33BriefingPdf } from "../pork33-candidate-shortlist/briefing-pdf-export.server";
import { generatePork33DecisionPdf } from "../pork33-candidate-shortlist/decision-pdf-export.server";
import { loadPork33DecisionServerInputs } from "../pork33-candidate-shortlist/decision-snapshots.server";
import { loadCurrentPork33State } from "../pork33-candidate-shortlist/repository.server";
import type { Pork33ShortlistStateV1 } from "../pork33-candidate-shortlist/types";
import {
  STORE_DEVELOPMENT_REPORT_TYPES,
  type ReportGenerationRequestV1,
  type ReportGenerationResultV1,
  type ReportOutputHistoryItemV1,
  type StoreDevelopmentReportCenterWorkspaceV1,
} from "./contracts";
import { PORK33_CASE_ID, PORK33_STORE_DEVELOPMENT_PRESET_ID, STORE_DEVELOPMENT_REPORT_PRESETS_V1 } from "./presets";
import {
  buildPork33StoreDevelopmentCase,
  buildStoreDevelopmentReportFileName,
  derivePork33ReportDataReadiness,
  resolvePork33ReportGenerationPlan,
} from "./report-center";

const REPORT_CENTER_MANIFEST_SCHEMA_VERSION = "frameone.store-development-report-generation-manifest.v1" as const;

type ReportCenterManifestV1 = {
  schemaVersion: typeof REPORT_CENTER_MANIFEST_SCHEMA_VERSION;
  result: ReportGenerationResultV1;
};

type ExistingBatchManifest = {
  schemaVersion?: string;
  batchId?: string;
  generatedAt?: string;
  failed?: unknown[];
  files?: Array<{ category?: string; scopeId?: string; fileName?: string; pageCount?: number; downloadUrl?: string }>;
};

function outputRoot(rootDir?: string) {
  return rootDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "output", "store-development-report");
}

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:]/gu, "").replace("T", "-").slice(0, 15);
}

function downloadUrl(generationId: string, fileName: string) {
  return `/api/tools/store-development-report/download?generationId=${encodeURIComponent(generationId)}&fileName=${encodeURIComponent(fileName)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGenerationResult(value: unknown): value is ReportGenerationResultV1 {
  if (!isRecord(value)) return false;
  return value.schemaVersion === "frameone.report-generation-result.v1"
    && typeof value.generationId === "string"
    && typeof value.generatedAt === "string"
    && value.caseId === PORK33_CASE_ID
    && value.presetId === PORK33_STORE_DEVELOPMENT_PRESET_ID
    && STORE_DEVELOPMENT_REPORT_TYPES.includes(value.reportType as (typeof STORE_DEVELOPMENT_REPORT_TYPES)[number])
    && value.outputFormat === "PDF"
    && value.status === "COMPLETED"
    && typeof value.fileName === "string"
    && typeof value.pageCount === "number"
    && typeof value.downloadUrl === "string";
}

function historyFromResult(result: ReportGenerationResultV1, state: Pork33ShortlistStateV1): ReportOutputHistoryItemV1 {
  let scopeLabel: string;
  if (result.scope.scopeType === "ALL") scopeLabel = "전체";
  else if (result.scope.scopeType === "REGION") {
    const regionId = result.scope.regionId;
    scopeLabel = state.regions.find((region) => region.regionId === regionId)?.label ?? regionId;
  } else if (result.scope.scopeType === "APARTMENT_AREA") {
    const apartmentAreaId = result.scope.apartmentAreaId;
    scopeLabel = state.apartmentAreas.find((area) => area.apartmentAreaId === apartmentAreaId)?.label ?? apartmentAreaId;
  } else {
    const candidateStoreId = result.scope.candidateStoreId;
    scopeLabel = state.candidates.find((candidate) => candidate.identity.candidateStoreId === candidateStoreId)?.identity.displayCode ?? candidateStoreId;
  }
  return {
    historyId: result.generationId,
    generatedAt: result.generatedAt,
    caseId: result.caseId,
    presetId: result.presetId,
    reportType: result.reportType,
    scopeLabel,
    pageCount: result.pageCount,
    fileName: result.fileName,
    downloadUrl: result.downloadUrl,
    source: "REPORT_CENTER",
  };
}

async function loadReportCenterHistory(state: Pork33ShortlistStateV1, rootDir?: string): Promise<ReportOutputHistoryItemV1[]> {
  const root = outputRoot(rootDir);
  let directories;
  try {
    directories = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const history: ReportOutputHistoryItemV1[] = [];
  for (const directory of directories.filter((entry) => entry.isDirectory() && /^generation-[0-9A-Za-z-]+$/u.test(entry.name))) {
    try {
      const manifest: unknown = JSON.parse(await readFile(path.join(root, directory.name, "manifest.json"), "utf8"));
      if (!isRecord(manifest) || manifest.schemaVersion !== REPORT_CENTER_MANIFEST_SCHEMA_VERSION || !isGenerationResult(manifest.result)) continue;
      if (manifest.result.generationId !== directory.name) continue;
      history.push(historyFromResult(manifest.result, state));
    } catch {
      // 불완전한 generation은 History에 노출하지 않는다.
    }
  }
  return history;
}

async function loadLatestExistingBatchHistory(
  state: Pork33ShortlistStateV1,
  directoryName: "pork33-briefing" | "pork33-decision-report",
): Promise<ReportOutputHistoryItemV1[]> {
  const root = path.join(/* turbopackIgnore: true */ process.cwd(), "output", directoryName);
  let directories;
  try {
    directories = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const manifests: ExistingBatchManifest[] = [];
  for (const directory of directories.filter((entry) => entry.isDirectory() && /^batch-[0-9A-Za-z-]+$/u.test(entry.name))) {
    try {
      const manifest = JSON.parse(await readFile(path.join(root, directory.name, "manifest.json"), "utf8")) as ExistingBatchManifest;
      if (manifest.batchId === directory.name && typeof manifest.generatedAt === "string" && Array.isArray(manifest.failed) && manifest.failed.length === 0 && Array.isArray(manifest.files)) manifests.push(manifest);
    } catch {
      // 손상되거나 불완전한 기존 batch는 History에 노출하지 않는다.
    }
  }
  manifests.sort((left, right) => (right.generatedAt ?? "").localeCompare(left.generatedAt ?? ""));
  const latest = manifests[0];
  if (!latest?.files || !latest.batchId || !latest.generatedAt) return [];
  return latest.files.flatMap((file, index): ReportOutputHistoryItemV1[] => {
    if (!file.category || !file.scopeId || !file.fileName || typeof file.pageCount !== "number" || !file.downloadUrl) return [];
    const region = state.regions.find((item) => item.regionId === file.scopeId);
    const candidate = state.candidates.find((item) => item.identity.candidateStoreId === file.scopeId);
    const scopeLabel = file.category === "ALL" ? "전체" : region?.label ?? candidate?.identity.displayCode ?? file.scopeId;
    return [{
      historyId: `${latest.batchId}:${file.category}:${file.scopeId}:${index}`,
      generatedAt: latest.generatedAt as string,
      caseId: PORK33_CASE_ID,
      presetId: PORK33_STORE_DEVELOPMENT_PRESET_ID,
      reportType: directoryName === "pork33-decision-report" ? "DECISION_REPORT" : file.category === "CANDIDATE" ? "CANDIDATE_SINGLE" : "FIELD_BRIEFING",
      scopeLabel,
      pageCount: file.pageCount,
      fileName: file.fileName,
      downloadUrl: file.downloadUrl,
      source: "PORK33_EXISTING_OUTPUT",
    }];
  });
}

export async function loadStoreDevelopmentReportCenterWorkspace(): Promise<StoreDevelopmentReportCenterWorkspaceV1> {
  const state = await loadCurrentPork33State();
  const [inputs, genericHistory, briefingHistory, decisionHistory] = await Promise.all([
    loadPork33DecisionServerInputs(state),
    loadReportCenterHistory(state),
    loadLatestExistingBatchHistory(state, "pork33-briefing"),
    loadLatestExistingBatchHistory(state, "pork33-decision-report"),
  ]);
  const checkedAt = new Date().toISOString();
  const readinessByReportType = Object.fromEntries(STORE_DEVELOPMENT_REPORT_TYPES.map((reportType) => [
    reportType,
    derivePork33ReportDataReadiness(state, inputs.assets, inputs.sbiz365ByCandidateId, reportType, checkedAt),
  ])) as StoreDevelopmentReportCenterWorkspaceV1["readinessByReportType"];
  const history = [...genericHistory, ...decisionHistory, ...briefingHistory]
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
    .slice(0, 16);
  return {
    schemaVersion: "frameone.store-development-report-center-workspace.v1",
    cases: [buildPork33StoreDevelopmentCase(state)],
    presets: STORE_DEVELOPMENT_REPORT_PRESETS_V1,
    readinessByReportType,
    history,
  };
}

export async function generateStoreDevelopmentReport(
  request: ReportGenerationRequestV1,
  runtime: { now?: Date; generationId?: string; rootDir?: string } = {},
): Promise<ReportGenerationResultV1> {
  const state = await loadCurrentPork33State();
  const inputs = await loadPork33DecisionServerInputs(state);
  const plan = resolvePork33ReportGenerationPlan(request, state);
  const now = runtime.now ?? new Date();
  const readiness = derivePork33ReportDataReadiness(state, inputs.assets, inputs.sbiz365ByCandidateId, request.reportType, now.toISOString());
  if (readiness.overallStatus === "BLOCKED") throw new Error("필수 자료가 준비되지 않아 보고서를 생성할 수 없습니다.");

  const output = plan.sourceGenerator === "PORK33_BRIEFING_V1"
    ? await generatePork33BriefingPdf(state, inputs, plan.briefingScope as NonNullable<typeof plan.briefingScope>)
    : await generatePork33DecisionPdf(state, inputs, plan.decisionScope as NonNullable<typeof plan.decisionScope>);
  const generationId = runtime.generationId ?? `generation-${timestamp(now)}-${randomUUID().slice(0, 8)}`;
  if (!/^generation-[0-9A-Za-z-]+$/u.test(generationId)) throw new Error("Generation ID가 올바르지 않습니다.");
  const root = outputRoot(runtime.rootDir);
  await mkdir(root, { recursive: true });
  const generationRoot = path.join(root, generationId);
  await mkdir(generationRoot, { recursive: false });
  const fileName = buildStoreDevelopmentReportFileName(request, plan, now);
  await copyFile(output.filePath, path.join(generationRoot, fileName));
  const result: ReportGenerationResultV1 = {
    schemaVersion: "frameone.report-generation-result.v1",
    generationId,
    generatedAt: now.toISOString(),
    caseId: request.caseId,
    presetId: request.presetId,
    reportType: request.reportType,
    scope: request.scope,
    outputFormat: "PDF",
    status: "COMPLETED",
    fileName,
    pageCount: output.diagnostics.pageCount,
    downloadUrl: downloadUrl(generationId, fileName),
    sourceGenerator: plan.sourceGenerator,
    sourceStateSnapshotId: state.snapshotId,
    sourceSbizSnapshotBatchId: inputs.sbizSnapshotSourceBatchId,
  };
  const manifest: ReportCenterManifestV1 = { schemaVersion: REPORT_CENTER_MANIFEST_SCHEMA_VERSION, result };
  await writeFile(path.join(generationRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return result;
}

export async function readStoreDevelopmentReportFile(generationId: string, fileName: string, rootDir?: string) {
  if (!/^generation-[0-9A-Za-z-]+$/u.test(generationId)) throw new Error("Generation ID가 올바르지 않습니다.");
  if (path.basename(fileName) !== fileName || !fileName.toLowerCase().endsWith(".pdf")) throw new Error("파일명이 올바르지 않습니다.");
  const generationRoot = path.join(outputRoot(rootDir), generationId);
  const manifest: unknown = JSON.parse(await readFile(path.join(generationRoot, "manifest.json"), "utf8"));
  if (!isRecord(manifest) || manifest.schemaVersion !== REPORT_CENTER_MANIFEST_SCHEMA_VERSION || !isGenerationResult(manifest.result)) throw new Error("Generation manifest가 올바르지 않습니다.");
  if (manifest.result.generationId !== generationId || manifest.result.fileName !== fileName) throw new Error("Generation 결과와 요청 파일이 일치하지 않습니다.");
  return { bytes: await readFile(path.join(generationRoot, fileName)), fileName };
}
