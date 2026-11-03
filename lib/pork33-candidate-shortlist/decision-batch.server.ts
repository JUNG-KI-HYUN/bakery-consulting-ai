import "server-only";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPork33DecisionFileName, generatePork33DecisionPdf } from "./decision-pdf-export.server";
import type { Pork33DecisionScope } from "./decision-report";
import { loadPork33DecisionServerInputs } from "./decision-snapshots.server";
import { assertPork33CustomerReportSource } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

export type Pork33DecisionBatchCategory = "ALL" | "REGION";
export type Pork33DecisionBatchOptions = { all: boolean; regions: boolean };
export type Pork33DecisionBatchFile = { category: Pork33DecisionBatchCategory; fileName: string; scopeId: string; pageCount: number; downloadUrl: string };
export type Pork33DecisionBatchManifest = {
  schemaVersion: "frameone.pork33-decision-report-batch.v2";
  batchId: string;
  generatedAt: string;
  options: Pork33DecisionBatchOptions;
  sbizSnapshotSourceBatchId: string;
  allPdfCount: number;
  regionPdfCount: number;
  failed: Array<{ category: Pork33DecisionBatchCategory; scopeId: string; message: string }>;
  files: Pork33DecisionBatchFile[];
};

function timestamp(date: Date) { return date.toISOString().replace(/[-:]/gu, "").replace("T", "-").slice(0, 15); }
function safeError(error: unknown) { return error instanceof Error ? error.message : "Decision Report V2 PDF 생성 실패"; }
function outputRoot(rootDir?: string) { return rootDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-decision-report"); }
function url(batchId: string, category: Pork33DecisionBatchCategory, fileName: string) { return `/api/tools/pork33-candidate-shortlist/decision-export/download?batchId=${encodeURIComponent(batchId)}&category=${category}&fileName=${encodeURIComponent(fileName)}`; }

export async function generatePork33DecisionBatch(
  state: Pork33ShortlistStateV1,
  options: Pork33DecisionBatchOptions,
  runtime: { batchId?: string; now?: Date; rootDir?: string } = {},
): Promise<Pork33DecisionBatchManifest> {
  assertPork33CustomerReportSource(state);
  if (!options.all && !options.regions) throw new Error("생성할 V2 보고서 유형을 하나 이상 선택해야 합니다.");
  const now = runtime.now ?? new Date();
  const batchId = runtime.batchId ?? `batch-${timestamp(now)}-${randomUUID().slice(0, 8)}`;
  if (!/^batch-[0-9A-Za-z-]+$/u.test(batchId)) throw new Error("Batch ID가 올바르지 않습니다.");
  const root = outputRoot(runtime.rootDir);
  await mkdir(root, { recursive: true });
  const batchRoot = path.join(root, batchId);
  await mkdir(batchRoot, { recursive: false });
  const inputs = await loadPork33DecisionServerInputs(state);
  await writeFile(path.join(batchRoot, "SBIZ365_SNAPSHOT_BINDING.json"), `${JSON.stringify({
    schemaVersion: "frameone.pork33-decision-sbiz-binding.v1",
    sourceBatchId: inputs.sbizSnapshotSourceBatchId,
    candidateIds: Object.keys(inputs.sbiz365ByCandidateId).sort(),
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const files: Pork33DecisionBatchFile[] = [];
  const failed: Pork33DecisionBatchManifest["failed"] = [];

  async function create(category: Pork33DecisionBatchCategory, scopeId: string, scope: Pork33DecisionScope) {
    try {
      const output = await generatePork33DecisionPdf(state, inputs, scope);
      const directory = path.join(batchRoot, category);
      await mkdir(directory, { recursive: true });
      const fileName = buildPork33DecisionFileName(state, scope);
      await copyFile(output.filePath, path.join(directory, fileName));
      files.push({ category, fileName, scopeId, pageCount: output.diagnostics.pageCount, downloadUrl: url(batchId, category, fileName) });
    } catch (error) {
      failed.push({ category, scopeId, message: safeError(error) });
    }
  }

  if (options.all) await create("ALL", "ALL", { scopeType: "ALL" });
  if (options.regions) for (const region of state.regions) await create("REGION", region.regionId, { scopeType: "REGION", regionId: region.regionId });
  const manifest: Pork33DecisionBatchManifest = {
    schemaVersion: "frameone.pork33-decision-report-batch.v2",
    batchId,
    generatedAt: now.toISOString(),
    options,
    sbizSnapshotSourceBatchId: inputs.sbizSnapshotSourceBatchId,
    allPdfCount: files.filter((file) => file.category === "ALL").length,
    regionPdfCount: files.filter((file) => file.category === "REGION").length,
    failed,
    files,
  };
  await writeFile(path.join(batchRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifest;
}

export async function readPork33DecisionBatchFile(batchId: string, category: string, fileName: string, rootDir?: string) {
  if (!/^batch-[0-9A-Za-z-]+$/u.test(batchId)) throw new Error("Batch ID가 올바르지 않습니다.");
  if (!(new Set(["ALL", "REGION"])).has(category)) throw new Error("Batch category가 올바르지 않습니다.");
  if (path.basename(fileName) !== fileName || !fileName.toLowerCase().endsWith(".pdf")) throw new Error("파일명이 올바르지 않습니다.");
  const target = path.join(outputRoot(rootDir), batchId, category, fileName);
  return { bytes: await readFile(target), fileName };
}
