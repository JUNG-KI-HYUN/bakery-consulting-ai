import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildPowerShellInvocation, resolvePowerShellExecutable, sanitizePork33PdfFilePart } from "./pdf-export.server";
import { buildPork33BriefingPages, type Pork33BriefingPage, type Pork33BriefingScope } from "./briefing-report";
import type { Pork33BriefingServerInputs } from "./briefing-assets.server";
import { assertPork33CustomerReportSource } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

const execFileAsync = promisify(execFile);

function materializePages(pages: Pork33BriefingPage[], inputs: Pork33BriefingServerInputs) {
  return pages.map((page) => {
    if (page.kind === "REGION_OVERVIEW") {
      return { ...page, region: { ...page.region, heroPhotoPath: page.region.heroPhotoRef ? inputs.assetPaths[page.region.heroPhotoRef] ?? null : null } };
    }
    const candidate = {
      ...page.candidate,
      mapImagePath: page.candidate.mapRef ? inputs.assetPaths[page.candidate.mapRef] ?? null : null,
      representativePhotoPath: page.candidate.representativePhotoRef ? inputs.assetPaths[page.candidate.representativePhotoRef] ?? null : null,
    };
    if (page.kind === "CANDIDATE_SUMMARY") return { ...page, candidate };
    return { ...page, candidate, photos: page.photos.map((photo) => ({ ...photo, path: inputs.assetPaths[photo.assetRef] })) };
  });
}

export function buildPork33BriefingFileName(state: Pork33ShortlistStateV1, scope: Pork33BriefingScope) {
  if (scope.scopeType === "ALL") return "FRAMEONE_PORK33_ALL_CANDIDATE_BRIEFING.pdf";
  if (scope.scopeType === "REGION") {
    const region = state.regions.find((item) => item.regionId === scope.regionId);
    if (!region) throw new Error("선택한 Region을 찾을 수 없습니다.");
    return `FRAMEONE_PORK33_${sanitizePork33PdfFilePart(region.label).replace(/_/gu, "")}.pdf`;
  }
  const candidate = state.candidates.find((item) => item.identity.candidateStoreId === scope.candidateStoreId);
  if (!candidate) throw new Error("선택한 Candidate를 찾을 수 없습니다.");
  return `${candidate.identity.displayCode}.pdf`;
}

export async function generatePork33BriefingPdf(
  state: Pork33ShortlistStateV1,
  inputs: Pork33BriefingServerInputs,
  scope: Pork33BriefingScope,
) {
  assertPork33CustomerReportSource(state);
  const pages = buildPork33BriefingPages(state, inputs.assets, inputs.sbiz365ByCandidateId, scope);
  const outputRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-briefing-runtime", randomUUID());
  await mkdir(outputRoot, { recursive: true });
  const bindingPath = path.join(outputRoot, "binding.json");
  const pdfPath = path.join(outputRoot, buildPork33BriefingFileName(state, scope));
  const diagnosticsPath = path.join(outputRoot, "diagnostics.json");
  await writeFile(bindingPath, `${JSON.stringify({ pages: materializePages(pages, inputs) }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const scriptPath = path.join(process.cwd(), "tools", "pork33-briefing-pdf", "generate.ps1");
  const invocation = buildPowerShellInvocation(await resolvePowerShellExecutable(), scriptPath, bindingPath, pdfPath, diagnosticsPath);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await execFileAsync(invocation.executable, invocation.args, { windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const outputExists = await access(pdfPath).then(() => true).catch(() => false);
      if (attempt >= 3 || outputExists || !/RPC_E_CALL_REJECTED|0x80010001/u.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8")) as { pageCount: number; overlapCount: number; landscape: boolean };
  if (!diagnostics.landscape || diagnostics.pageCount !== pages.length || diagnostics.overlapCount !== 0) throw new Error("Briefing PDF layout validation에 실패했습니다.");
  return { bytes: await readFile(pdfPath), fileName: path.basename(pdfPath), filePath: pdfPath, diagnostics, pages };
}
