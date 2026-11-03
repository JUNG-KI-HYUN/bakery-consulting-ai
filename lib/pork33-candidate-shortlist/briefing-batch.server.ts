import "server-only";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPork33BriefingServerInputs } from "./briefing-assets.server";
import { buildPork33BriefingFileName, generatePork33BriefingPdf } from "./briefing-pdf-export.server";
import type { Pork33BriefingScope } from "./briefing-report";
import { assertPork33CustomerReportSource } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

export type Pork33BriefingBatchCategory = "ALL" | "REGION" | "CANDIDATE";
export type Pork33BriefingBatchOptions = { all: boolean; regions: boolean; candidates: boolean };
export type Pork33BriefingBatchFile = { category: Pork33BriefingBatchCategory; fileName: string; scopeId: string; pageCount: number; downloadUrl: string };
export type Pork33BriefingBatchManifest = {
  schemaVersion: "frameone.pork33-briefing-batch.v1";
  batchId: string;
  generatedAt: string;
  options: Pork33BriefingBatchOptions;
  allPdfCount: number;
  regionPdfCount: number;
  candidatePdfCount: number;
  failed: Array<{ category: Pork33BriefingBatchCategory; scopeId: string; message: string }>;
  files: Pork33BriefingBatchFile[];
};

function timestamp(date: Date) { return date.toISOString().replace(/[-:]/gu, "").replace("T", "-").slice(0, 15); }
function safeError(error: unknown) { return error instanceof Error ? error.message : "PDF 생성 실패"; }
function outputRoot(rootDir?: string) { return rootDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-briefing"); }
function url(batchId: string, category: Pork33BriefingBatchCategory, fileName: string) { return `/api/tools/pork33-candidate-shortlist/briefing-export/download?batchId=${encodeURIComponent(batchId)}&category=${category}&fileName=${encodeURIComponent(fileName)}`; }

export async function generatePork33BriefingBatch(
  state: Pork33ShortlistStateV1,
  options: Pork33BriefingBatchOptions,
  runtime: { batchId?: string; now?: Date; rootDir?: string } = {},
): Promise<Pork33BriefingBatchManifest> {
  assertPork33CustomerReportSource(state);
  if (!options.all && !options.regions && !options.candidates) throw new Error("생성할 보고서 유형을 하나 이상 선택해야 합니다.");
  const now = runtime.now ?? new Date();
  const batchId = runtime.batchId ?? `batch-${timestamp(now)}-${randomUUID().slice(0, 8)}`;
  if (!/^batch-[0-9A-Za-z-]+$/u.test(batchId)) throw new Error("Batch ID가 올바르지 않습니다.");
  const root = outputRoot(runtime.rootDir);
  await mkdir(root, { recursive: true });
  const batchRoot = path.join(root, batchId);
  await mkdir(batchRoot, { recursive: false });
  const inputs = await loadPork33BriefingServerInputs(state);
  await writeFile(path.join(batchRoot, "SBIZ365_SNAPSHOTS.json"), `${JSON.stringify(Object.values(inputs.sbiz365ByCandidateId), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const files: Pork33BriefingBatchFile[] = [];
  const failed: Pork33BriefingBatchManifest["failed"] = [];

  async function create(category: Pork33BriefingBatchCategory, scopeId: string, scope: Pork33BriefingScope) {
    try {
      const output = await generatePork33BriefingPdf(state, inputs, scope);
      const directory = path.join(batchRoot, category);
      await mkdir(directory, { recursive: true });
      const fileName = buildPork33BriefingFileName(state, scope);
      await copyFile(output.filePath, path.join(directory, fileName));
      files.push({ category, fileName, scopeId, pageCount: output.diagnostics.pageCount, downloadUrl: url(batchId, category, fileName) });
    } catch (error) {
      failed.push({ category, scopeId, message: safeError(error) });
    }
  }

  if (options.all) await create("ALL", "ALL", { scopeType: "ALL" });
  if (options.regions) for (const region of state.regions) await create("REGION", region.regionId, { scopeType: "REGION", regionId: region.regionId });
  if (options.candidates) for (const candidate of state.candidates.slice().sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder)) {
    await create("CANDIDATE", candidate.identity.candidateStoreId, { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId });
  }
  const manifest: Pork33BriefingBatchManifest = {
    schemaVersion: "frameone.pork33-briefing-batch.v1",
    batchId,
    generatedAt: now.toISOString(),
    options,
    allPdfCount: files.filter((file) => file.category === "ALL").length,
    regionPdfCount: files.filter((file) => file.category === "REGION").length,
    candidatePdfCount: files.filter((file) => file.category === "CANDIDATE").length,
    failed,
    files,
  };
  await writeFile(path.join(batchRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifest;
}

export async function readPork33BriefingBatchFile(batchId: string, category: string, fileName: string, rootDir?: string) {
  if (!/^batch-[0-9A-Za-z-]+$/u.test(batchId)) throw new Error("Batch ID가 올바르지 않습니다.");
  if (!(new Set(["ALL", "REGION", "CANDIDATE"])).has(category)) throw new Error("Batch category가 올바르지 않습니다.");
  if (path.basename(fileName) !== fileName || !fileName.toLowerCase().endsWith(".pdf")) throw new Error("파일명이 올바르지 않습니다.");
  const target = path.join(outputRoot(rootDir), batchId, category, fileName);
  return { bytes: await readFile(target), fileName };
}
