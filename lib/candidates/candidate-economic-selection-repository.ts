import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAnalysisRunSnapshot } from "../analysis-runs/analysis-run-repository";
import { getCandidateStore } from "./candidate-repository";
import {
  CANDIDATE_ECONOMIC_SELECTION_SCHEMA_VERSION,
  sameEconomicVersionIdentity,
  type CandidateEconomicSelection,
  type CandidateEconomicSelectionView,
  type CandidateEconomicVersionIdentity,
  type CandidateEconomicVersionOption,
} from "./candidate-economic-selection-contract";

let pendingWrite = Promise.resolve();

export class CandidateEconomicSelectionRepositoryError extends Error {}
export class CandidateEconomicSelectionReferenceError extends Error {
  constructor(message: string, readonly status: 400 | 404) { super(message); }
}

function selectionFilePath() {
  const override = process.env.FRAMEONE_CANDIDATE_ECONOMIC_SELECTIONS_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "candidate-economic-selections.json");
}

async function ensureFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try { await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

function validIdentity(value: Partial<CandidateEconomicVersionIdentity>) {
  return typeof value.analysisRunId === "string" && value.analysisRunId.length > 0
    && typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt))
    && Number.isInteger(value.assumptionRevision) && (value.assumptionRevision ?? -1) >= 0
    && typeof value.engineVersion === "string" && value.engineVersion.length > 0;
}

function assertStoredSelection(value: unknown): asserts value is CandidateEconomicSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Economic 선택값이 객체가 아닙니다.");
  const selection = value as Partial<CandidateEconomicSelection>;
  if (selection.schemaVersion !== CANDIDATE_ECONOMIC_SELECTION_SCHEMA_VERSION
    || typeof selection.candidateId !== "string" || !selection.candidateId
    || typeof selection.caseId !== "string" || !selection.caseId
    || !validIdentity(selection)
    || typeof selection.selectedAt !== "string" || !Number.isFinite(Date.parse(selection.selectedAt))) {
    throw new TypeError("Economic 선택값이 올바르지 않습니다.");
  }
}

async function readSelections(filePath: string): Promise<CandidateEconomicSelection[]> {
  await ensureFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Economic 선택 저장소 root가 배열이 아닙니다.");
    parsed.forEach(assertStoredSelection);
    return parsed;
  } catch (error) {
    throw new CandidateEconomicSelectionRepositoryError("Economic 선택 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeSelections(filePath: string, selections: CandidateEconomicSelection[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(selections, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new CandidateEconomicSelectionRepositoryError("Economic 선택 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

async function ownedCandidate(candidateId: string, caseId: string) {
  if (!caseId.trim()) throw new CandidateEconomicSelectionReferenceError("caseId는 필수입니다.", 400);
  const candidate = await getCandidateStore(candidateId);
  if (!candidate) throw new CandidateEconomicSelectionReferenceError("후보점포를 찾을 수 없습니다.", 404);
  if (candidate.caseId !== caseId) throw new CandidateEconomicSelectionReferenceError("다른 Case의 후보점포에는 접근할 수 없습니다.", 404);
  return candidate;
}

function versionIdentity(version: {
  generatedAt: string;
  binding: { analysisRunId: string; assumptionRevision: number };
  result: { metadata: { engineVersion: string } };
}): CandidateEconomicVersionIdentity {
  return {
    analysisRunId: version.binding.analysisRunId,
    generatedAt: version.generatedAt,
    assumptionRevision: version.binding.assumptionRevision,
    engineVersion: version.result.metadata.engineVersion,
  };
}

async function candidateRun(candidateId: string, caseId: string) {
  const candidate = await ownedCandidate(candidateId, caseId);
  if (candidate.analysisLinks.length !== 1) return { candidate, run: null };
  const run = await getAnalysisRunSnapshot(candidate.analysisLinks[0].analysisRunId);
  return { candidate, run };
}

export async function getCandidateEconomicSelection(candidateId: string, caseId: string) {
  await pendingWrite;
  await ownedCandidate(candidateId, caseId);
  const selections = await readSelections(selectionFilePath());
  return structuredClone(selections.find((item) => item.candidateId === candidateId && item.caseId === caseId) ?? null);
}

export async function getCandidateEconomicSelectionView(candidateId: string, caseId: string): Promise<CandidateEconomicSelectionView> {
  await pendingWrite;
  const [{ run }, selections] = await Promise.all([
    candidateRun(candidateId, caseId),
    readSelections(selectionFilePath()),
  ]);
  const versions: CandidateEconomicVersionOption[] = (run?.sections.economic?.versions ?? []).map((version) => ({
    ...versionIdentity(version),
    monthlyBepSales: version.result.bep.monthlyBepSales,
    baseMonthlySales: version.result.scenarios?.base?.monthlySales ?? null,
    validationErrorCount: version.result.validation.errors.length,
  }));
  return {
    analysisRunId: run?.analysisRunId ?? null,
    versions,
    selection: structuredClone(selections.find((item) => item.candidateId === candidateId && item.caseId === caseId) ?? null),
  };
}

function parseSelectionInput(input: unknown): CandidateEconomicVersionIdentity & { caseId: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CandidateEconomicSelectionReferenceError("요청 본문이 올바르지 않습니다.", 400);
  const body = input as Record<string, unknown>;
  const parsed = {
    caseId: typeof body.caseId === "string" ? body.caseId.trim() : "",
    analysisRunId: typeof body.analysisRunId === "string" ? body.analysisRunId.trim() : "",
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : "",
    assumptionRevision: typeof body.assumptionRevision === "number" ? body.assumptionRevision : -1,
    engineVersion: typeof body.engineVersion === "string" ? body.engineVersion.trim() : "",
  };
  if (!parsed.caseId || !validIdentity(parsed)) throw new CandidateEconomicSelectionReferenceError("Economic version identity가 올바르지 않습니다.", 400);
  return parsed;
}

export function saveCandidateEconomicSelection(candidateId: string, input: unknown): Promise<CandidateEconomicSelectionView> {
  const requested = parseSelectionInput(input);
  const filePath = selectionFilePath();
  let result!: CandidateEconomicSelectionView;
  const operation = pendingWrite.then(async () => {
    const { candidate, run } = await candidateRun(candidateId, requested.caseId);
    if (candidate.analysisLinks.length !== 1 || !run) throw new CandidateEconomicSelectionReferenceError("선택할 Analysis Run을 확인할 수 없습니다.", 400);
    if (requested.analysisRunId !== run.analysisRunId) throw new CandidateEconomicSelectionReferenceError("Candidate의 Analysis Run과 선택 identity가 일치하지 않습니다.", 400);
    const versions = run.sections.economic?.versions ?? [];
    const selected = versions.find((version) => sameEconomicVersionIdentity(versionIdentity(version), requested));
    if (!selected) throw new CandidateEconomicSelectionReferenceError("해당 Economic version을 찾을 수 없습니다.", 400);
    const selections = await readSelections(filePath);
    const selection: CandidateEconomicSelection = {
      schemaVersion: CANDIDATE_ECONOMIC_SELECTION_SCHEMA_VERSION,
      candidateId,
      caseId: requested.caseId,
      ...versionIdentity(selected),
      selectedAt: new Date().toISOString(),
    };
    const previousIndex = selections.findIndex((item) => item.candidateId === candidateId && item.caseId === requested.caseId);
    if (previousIndex >= 0) selections[previousIndex] = selection;
    else selections.push(selection);
    await writeSelections(filePath, selections);
    result = {
      analysisRunId: run.analysisRunId,
      versions: versions.map((version) => ({
        ...versionIdentity(version),
        monthlyBepSales: version.result.bep.monthlyBepSales,
        baseMonthlySales: version.result.scenarios?.base?.monthlySales ?? null,
        validationErrorCount: version.result.validation.errors.length,
      })),
      selection,
    };
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}
