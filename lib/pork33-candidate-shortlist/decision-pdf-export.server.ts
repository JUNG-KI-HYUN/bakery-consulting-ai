import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildPork33DecisionPages, type Pork33DecisionPage, type Pork33DecisionScope } from "./decision-report";
import type { Pork33DecisionServerInputs } from "./decision-snapshots.server";
import { buildPowerShellInvocation, resolvePowerShellExecutable, sanitizePork33PdfFilePart } from "./pdf-export.server";
import { assertPork33CustomerReportSource } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

const execFileAsync = promisify(execFile);

function candidateWithPaths(candidate: Extract<Pork33DecisionPage, { kind: "CANDIDATE_SUMMARY" | "FIELD_PHOTO" }>["candidate"], inputs: Pork33DecisionServerInputs) {
  return {
    ...candidate,
    mapImagePath: candidate.mapRef ? inputs.assetPaths[candidate.mapRef] ?? null : null,
    representativePhotoPath: candidate.representativePhotoRef ? inputs.assetPaths[candidate.representativePhotoRef] ?? null : null,
  };
}

function materializePages(pages: Pork33DecisionPage[], inputs: Pork33DecisionServerInputs) {
  return pages.map((page) => {
    if (page.kind === "REGION_OVERVIEW") {
      return { ...page, region: { ...page.region, heroPhotoPath: page.region.heroPhotoRef ? inputs.assetPaths[page.region.heroPhotoRef] ?? null : null } };
    }
    if (page.kind === "REGION_DEMAND_SUMMARY") return page;
    if (page.kind === "APARTMENT_AREA_ANALYSIS") {
      return {
        ...page,
        area: {
          ...page.area,
          mapThumbnails: page.area.mapThumbnails.map((map) => ({ ...map, mapPath: map.mapRef ? inputs.assetPaths[map.mapRef] ?? null : null })),
        },
      };
    }
    if (page.kind === "CANDIDATE_COMPARE") {
      return {
        ...page,
        candidates: page.candidates.map((candidate) => ({
          ...candidate,
          representativePhotoPath: candidate.representativePhotoRef ? inputs.assetPaths[candidate.representativePhotoRef] ?? null : null,
        })),
      };
    }
    const candidate = candidateWithPaths(page.candidate, inputs);
    if (page.kind === "CANDIDATE_SUMMARY") return { ...page, candidate };
    return { ...page, candidate, photos: page.photos.map((photo) => ({ ...photo, path: inputs.assetPaths[photo.assetRef] })) };
  });
}

export function buildPork33DecisionFileName(state: Pork33ShortlistStateV1, scope: Pork33DecisionScope) {
  if (scope.scopeType === "ALL") return "FRAMEONE_PORK33_DECISION_REPORT_V2.pdf";
  const region = state.regions.find((item) => item.regionId === scope.regionId);
  if (!region) throw new Error("선택한 Region을 찾을 수 없습니다.");
  return `FRAMEONE_PORK33_DECISION_REPORT_V2_${sanitizePork33PdfFilePart(region.label).replace(/_/gu, "")}.pdf`;
}

export async function generatePork33DecisionPdf(
  state: Pork33ShortlistStateV1,
  inputs: Pork33DecisionServerInputs,
  scope: Pork33DecisionScope,
) {
  assertPork33CustomerReportSource(state);
  const pages = buildPork33DecisionPages(state, inputs.assets, inputs.sbiz365ByCandidateId, scope);
  const outputRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-decision-report-runtime", randomUUID());
  await mkdir(outputRoot, { recursive: true });
  const bindingPath = path.join(outputRoot, "binding.json");
  const pdfPath = path.join(outputRoot, buildPork33DecisionFileName(state, scope));
  const diagnosticsPath = path.join(outputRoot, "diagnostics.json");
  await writeFile(bindingPath, `${JSON.stringify({ pages: materializePages(pages, inputs) }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const scriptPath = path.join(/* turbopackIgnore: true */ process.cwd(), "tools", "pork33-decision-report-pdf", "generate.ps1");
  const invocation = buildPowerShellInvocation(await resolvePowerShellExecutable(), scriptPath, bindingPath, pdfPath, diagnosticsPath);
  const timeout = pages.length > 60 ? 600_000 : 300_000;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await execFileAsync(invocation.executable, invocation.args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const outputExists = await access(pdfPath).then(() => true).catch(() => false);
      if (attempt >= 3 || outputExists || !/RPC_E_CALL_REJECTED|0x80010001/u.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8")) as { pageCount: number; overlapCount: number; landscape: boolean };
  if (!diagnostics.landscape || diagnostics.pageCount !== pages.length || diagnostics.overlapCount !== 0) throw new Error("Decision Report V2 PDF layout validation에 실패했습니다.");
  return { bytes: await readFile(pdfPath), fileName: path.basename(pdfPath), filePath: pdfPath, diagnostics, pages };
}
