import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAnalysisRunSnapshot } from "../analysis-runs/analysis-run-repository";
import { getCase } from "../cases/case-repository";
import {
  applyCandidateStoreUpdate,
  assertStoredCandidateStore,
  candidateStoreFromInput,
  CandidateStoreValidationError,
  parseCandidateStoreCreateInput,
  parseCandidateStoreUpdateInput,
  type CandidateAnalysisRunLink,
  type CandidateStore,
} from "./candidate-contract";

let pendingWrite = Promise.resolve();

export class CandidateStoreRepositoryError extends Error {}

export class CandidateStoreReferenceError extends Error {
  constructor(message: string, readonly status: 400 | 404) {
    super(message);
  }
}

function candidatesFilePath() {
  const override = process.env.FRAMEONE_CANDIDATES_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "candidates.json");
}

async function ensureCandidatesFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function readCandidates(filePath: string): Promise<CandidateStore[]> {
  await ensureCandidatesFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Candidate Store repository root must be an array.");
    parsed.forEach(assertStoredCandidateStore);
    return parsed;
  } catch (error) {
    throw new CandidateStoreRepositoryError("Candidate Store 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeCandidates(filePath: string, records: CandidateStore[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new CandidateStoreRepositoryError("Candidate Store 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

export async function listCandidateStoresByCase(caseId: string): Promise<CandidateStore[]> {
  await pendingWrite;
  const records = await readCandidates(candidatesFilePath());
  return structuredClone(records.filter((record) => record.caseId === caseId));
}

export async function getCandidateStore(candidateId: string): Promise<CandidateStore | null> {
  await pendingWrite;
  const records = await readCandidates(candidatesFilePath());
  return structuredClone(records.find((record) => record.candidateId === candidateId) ?? null);
}

export function createCandidateStore(input: unknown): Promise<CandidateStore> {
  const parsed = parseCandidateStoreCreateInput(input);
  const filePath = candidatesFilePath();
  let result!: CandidateStore;
  const operation = pendingWrite.then(async () => {
    const caseRecord = await getCase(parsed.caseId);
    if (!caseRecord) throw new CandidateStoreReferenceError("Case를 찾을 수 없습니다.", 404);
    const analysisLinks: CandidateAnalysisRunLink[] = [];
    if (parsed.linkedAnalysisRunId) {
      const snapshot = await getAnalysisRunSnapshot(parsed.linkedAnalysisRunId);
      if (!snapshot) throw new CandidateStoreReferenceError("연결할 Analysis Run을 찾을 수 없습니다.", 400);
      analysisLinks.push({
        analysisRunId: snapshot.analysisRunId,
        targetSnapshot: structuredClone(snapshot.targetSnapshot),
        linkedAt: new Date().toISOString(),
      });
    }
    const records = await readCandidates(filePath);
    const timestamp = new Date().toISOString();
    result = candidateStoreFromInput(`candidate-${randomUUID()}`, parsed, analysisLinks, timestamp);
    records.push(result);
    await writeCandidates(filePath, records);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export function updateCandidateStore(candidateId: string, input: unknown): Promise<CandidateStore | null> {
  const parsed = parseCandidateStoreUpdateInput(input);
  const filePath = candidatesFilePath();
  let result: CandidateStore | null = null;
  const operation = pendingWrite.then(async () => {
    const records = await readCandidates(filePath);
    const index = records.findIndex((record) => record.candidateId === candidateId);
    if (index < 0) return;
    result = applyCandidateStoreUpdate(records[index], parsed);
    records[index] = result;
    await writeCandidates(filePath, records);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export { CandidateStoreValidationError };
