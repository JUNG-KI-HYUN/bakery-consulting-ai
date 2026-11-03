import "server-only";
import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { groupPork33CandidatesByLocality } from "./locality";
import { generatePork33ShortlistPdf, resolvePowerShellExecutable, sanitizePork33PdfFilePart } from "./pdf-export.server";
import type { Pork33ReportScope } from "./report";
import { assertPork33CustomerReportSource } from "./seed-types";
import type { Pork33CandidateState, Pork33ShortlistStateV1 } from "./types";

export type Pork33BatchCategory = "candidate" | "locality" | "region" | "all";
export type Pork33BatchFile = { category: Pork33BatchCategory; fileName: string; scopeType: Pork33ReportScope["scopeType"]; scopeId: string; downloadUrl: string };
export type Pork33BatchFailure = { scopeType: Pork33ReportScope["scopeType"]; scopeId: string; message: string };
export type Pork33BatchSkip = { candidateId: string; candidateStoreId: string; reason: string };
export type Pork33BatchManifest = {
  schemaVersion: "frameone.pork33-batch-export-manifest.v1";
  batchId: string;
  generatedAt: string;
  candidatePdfCount: number;
  localityPdfCount: number;
  regionPdfCount: number;
  allPdfCount: number;
  generatedCandidateIds: string[];
  skippedCandidateIds: Pork33BatchSkip[];
  failed: Pork33BatchFailure[];
  files: Pork33BatchFile[];
};

function outputRoot(rootDir?: string) { return rootDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-candidate-shortlist"); }
function timestamp(date: Date) { return date.toISOString().replace(/[-:]/gu, "").replace("T", "-").slice(0, 15); }
function safeError(error: unknown) { return error instanceof Error ? error.message : "PDF 생성 실패"; }
function downloadUrl(batchId: string, category: Pork33BatchCategory, fileName: string) { return `/api/tools/pork33-candidate-shortlist/batch-export/download?batchId=${encodeURIComponent(batchId)}&category=${category}&fileName=${encodeURIComponent(fileName)}`; }

export function getPork33BatchCandidateEligibility(candidate: Pork33CandidateState) {
  if (candidate.normalized.reviewStatus === "DROP") return { eligible: false, reason: "INACTIVE_DROP" } as const;
  if (candidate.normalized.geocodeStatus !== "RESOLVED") return { eligible: false, reason: candidate.normalized.geocodeStatus } as const;
  if (candidate.normalized.latitude === null || candidate.normalized.longitude === null) return { eligible: false, reason: "COORDINATE_MISSING" } as const;
  return { eligible: true, reason: null } as const;
}

async function assertPdfRuntime() {
  const executable = await resolvePowerShellExecutable();
  if (path.isAbsolute(executable)) await access(executable);
  return executable;
}

type PdfGenerator = typeof generatePork33ShortlistPdf;

async function createOne(state: Pork33ShortlistStateV1, batchRoot: string, category: Pork33BatchCategory, scope: Pork33ReportScope, fileName: string, scopeId: string, generator: PdfGenerator): Promise<Pork33BatchFile> {
  const output = await generator(state, scope);
  const directory = path.join(batchRoot, category);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, fileName);
  await copyFile(output.filePath, target);
  return { category, fileName, scopeType: scope.scopeType, scopeId, downloadUrl: downloadUrl(path.basename(batchRoot), category, fileName) };
}

export async function generatePork33BatchExport(state: Pork33ShortlistStateV1, options: { now?: Date; batchId?: string; rootDir?: string; generatePdf?: PdfGenerator; skipRuntimeCheck?: boolean } = {}): Promise<Pork33BatchManifest> {
  assertPork33CustomerReportSource(state);
  if (!options.skipRuntimeCheck) await assertPdfRuntime();
  const now = options.now ?? new Date();
  const batchId = options.batchId ?? `batch-${timestamp(now)}-${randomUUID().slice(0, 8)}`;
  if (!/^batch-[0-9A-Za-z-]+$/u.test(batchId)) throw new Error("Batch ID가 올바르지 않습니다.");
  const batchRoot = path.join(outputRoot(options.rootDir), batchId);
  const generator = options.generatePdf ?? generatePork33ShortlistPdf;
  await mkdir(batchRoot, { recursive: false });
  const files: Pork33BatchFile[] = [];
  const failed: Pork33BatchFailure[] = [];
  const generatedCandidateIds: string[] = [];
  const skippedCandidateIds: Pork33BatchSkip[] = [];
  const candidates = state.candidates.slice().sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder);

  for (const candidate of candidates) {
    const eligibility = getPork33BatchCandidateEligibility(candidate);
    if (!eligibility.eligible) {
      skippedCandidateIds.push({ candidateId: candidate.identity.displayCode, candidateStoreId: candidate.identity.candidateStoreId, reason: eligibility.reason });
      continue;
    }
    const fileName = `FRAMEONE_PORK33_${candidate.identity.displayCode}_후보점포.pdf`;
    try {
      files.push(await createOne(state, batchRoot, "candidate", { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId }, fileName, candidate.identity.candidateStoreId, generator));
      generatedCandidateIds.push(candidate.identity.displayCode);
    } catch (error) {
      failed.push({ scopeType: "CANDIDATE", scopeId: candidate.identity.candidateStoreId, message: safeError(error) });
    }
  }

  for (const locality of groupPork33CandidatesByLocality(state)) {
    const fileName = `FRAMEONE_PORK33_${sanitizePork33PdfFilePart(locality.label)}.pdf`;
    try { files.push(await createOne(state, batchRoot, "locality", { scopeType: "LOCALITY", localityKey: locality.localityKey }, fileName, locality.localityKey, generator)); }
    catch (error) { failed.push({ scopeType: "LOCALITY", scopeId: locality.localityKey, message: safeError(error) }); }
  }

  for (const region of state.regions) {
    const fileName = `FRAMEONE_PORK33_${sanitizePork33PdfFilePart(region.label)}.pdf`;
    try { files.push(await createOne(state, batchRoot, "region", { scopeType: "REGION", regionId: region.regionId }, fileName, region.regionId, generator)); }
    catch (error) { failed.push({ scopeType: "REGION", scopeId: region.regionId, message: safeError(error) }); }
  }

  try { files.push(await createOne(state, batchRoot, "all", { scopeType: "ALL" }, "PORK33_ALL_CANDIDATES.pdf", "ALL", generator)); }
  catch (error) { failed.push({ scopeType: "ALL", scopeId: "ALL", message: safeError(error) }); }

  const manifest: Pork33BatchManifest = {
    schemaVersion: "frameone.pork33-batch-export-manifest.v1",
    batchId,
    generatedAt: now.toISOString(),
    candidatePdfCount: files.filter((file) => file.category === "candidate").length,
    localityPdfCount: files.filter((file) => file.category === "locality").length,
    regionPdfCount: files.filter((file) => file.category === "region").length,
    allPdfCount: files.filter((file) => file.category === "all").length,
    generatedCandidateIds,
    skippedCandidateIds,
    failed,
    files,
  };
  await writeFile(path.join(batchRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifest;
}

export async function readPork33BatchFile(batchId: string, category: string, fileName: string, rootDir?: string) {
  if (!/^batch-[0-9A-Za-z-]+$/u.test(batchId)) throw new Error("Batch ID가 올바르지 않습니다.");
  if (!(["candidate", "locality", "region", "all"] as string[]).includes(category)) throw new Error("Batch category가 올바르지 않습니다.");
  if (path.basename(fileName) !== fileName || !fileName.toLowerCase().endsWith(".pdf")) throw new Error("파일명이 올바르지 않습니다.");
  const target = path.join(/* turbopackIgnore: true */ outputRoot(rootDir), batchId, category, fileName);
  return { bytes: await readFile(/* turbopackIgnore: true */ target), fileName };
}
