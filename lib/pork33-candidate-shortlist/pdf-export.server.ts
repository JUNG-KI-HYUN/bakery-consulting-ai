import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildPork33ReportPages, resolvePork33ReportSelection, type Pork33ReportScope } from "./report";
import { assertPork33CustomerReportSource } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

const execFileAsync = promisify(execFile);

async function exists(filePath: string) { try { await access(filePath); return true; } catch { return false; } }

export async function resolvePowerShellExecutable() {
  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE ?? "";
    const candidates = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((directory) => path.join(directory.replace(/^"|"$/gu, ""), "pwsh.exe"));
    if (userProfile) candidates.push(path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "powershell", "pwsh.exe"));
    candidates.push("C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    for (const pwsh of candidates) {
      if (await exists(pwsh)) return pwsh;
    }
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const windowsPowerShell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (await exists(windowsPowerShell)) return windowsPowerShell;
  }
  return "pwsh.exe";
}
function singleQuotedPowerShell(value: string) { return `'${value.replace(/'/gu, "''")}'`; }

export function buildPowerShellInvocation(executable: string, scriptPath: string, bindingPath: string, pdfPath: string, diagnosticsPath: string) {
  const parameters = `-BindingPath ${singleQuotedPowerShell(bindingPath)} -OutputPdf ${singleQuotedPowerShell(pdfPath)} -DiagnosticsPath ${singleQuotedPowerShell(diagnosticsPath)}`;
  if (path.basename(executable).toLowerCase() !== "powershell.exe") {
    return { executable, args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-BindingPath", bindingPath, "-OutputPdf", pdfPath, "-DiagnosticsPath", diagnosticsPath] };
  }
  const command = `$runner = [ScriptBlock]::Create([IO.File]::ReadAllText(${singleQuotedPowerShell(scriptPath)}, [Text.Encoding]::UTF8)); & $runner ${parameters}`;
  return { executable, args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")] };
}
export function sanitizePork33PdfFilePart(value: string) {
  return value.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_").replace(/\s+/gu, "_").replace(/_+/gu, "_").replace(/^_|_$/gu, "").slice(0, 80) || "UNKNOWN";
}
export function buildPork33PdfFileName(state: Pork33ShortlistStateV1, scope: Pork33ReportScope) {
  const selection = resolvePork33ReportSelection(state, scope);
  if (scope.scopeType === "ALL") return `FRAMEONE_PORK33_Candidate_Shortlist_r${state.revision}.pdf`;
  if (scope.scopeType === "REGION") return `FRAMEONE_PORK33_${sanitizePork33PdfFilePart(selection.region!.label)}_Candidate_Shortlist.pdf`;
  if (scope.scopeType === "LOCALITY") return `FRAMEONE_PORK33_${sanitizePork33PdfFilePart(selection.locality!.label)}.pdf`;
  const candidate = selection.candidates[0];
  return `FRAMEONE_PORK33_${candidate.identity.displayCode}_후보점포.pdf`;
}
export async function resolvePork33UserMapSource(displayCode: string) {
  const sourceRoot = path.join(process.cwd(), "data", "pork33-candidate-map-source");
  if (!await exists(sourceRoot)) return null;
  const prefix = `${displayCode}_`;
  const matches = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png") && entry.name.startsWith(prefix))
    .map((entry) => path.join(sourceRoot, entry.name));
  if (matches.length > 1) throw new Error(`${displayCode} 사용자 제공 지도 이미지가 중복되었습니다.`);
  return matches[0] ?? null;
}
export async function generatePork33ShortlistPdf(state: Pork33ShortlistStateV1, scope: Pork33ReportScope = { scopeType: "ALL" }) {
  assertPork33CustomerReportSource(state);
  const pages = buildPork33ReportPages(state, scope);
  if (scope.scopeType === "CANDIDATE" && pages[0]?.kind === "CANDIDATE_BRIEF") {
    const candidate = resolvePork33ReportSelection(state, scope).candidates[0];
    const mapImagePath = await resolvePork33UserMapSource(candidate.identity.displayCode);
    if (mapImagePath) {
      pages[0].card.mapImagePath = mapImagePath;
      pages[0].card.mapImageProvenance = "USER_PROVIDED_LOCATION_MAP";
    }
  }
  const outputRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-candidate-shortlist", randomUUID());
  await mkdir(outputRoot, { recursive: true });
  const bindingPath = path.join(outputRoot, "binding.json");
  const pdfPath = path.join(outputRoot, buildPork33PdfFileName(state, scope));
  const diagnosticsPath = path.join(outputRoot, "diagnostics.json");
  await writeFile(bindingPath, `${JSON.stringify({ pages }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const scriptPath = path.join(process.cwd(), "tools", "pork33-shortlist-pdf", "generate.ps1");
  const invocation = buildPowerShellInvocation(await resolvePowerShellExecutable(), scriptPath, bindingPath, pdfPath, diagnosticsPath);
  await execFileAsync(invocation.executable, invocation.args, { windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" });
  const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8")) as { pageCount: number; overlapCount: number; landscape: boolean };
  if (!diagnostics.landscape || diagnostics.pageCount !== pages.length || diagnostics.overlapCount !== 0) {
    throw new Error("PDF layout validation에 실패했습니다.");
  }
  return { bytes: await readFile(pdfPath), fileName: path.basename(pdfPath), filePath: pdfPath, diagnostics };
}
