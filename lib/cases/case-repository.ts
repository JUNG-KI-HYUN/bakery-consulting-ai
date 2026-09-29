import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertStoredCaseRecord,
  CaseValidationError,
  parseCaseCreateInput,
  parseCaseUpdateInput,
  statusForLifecycle,
  validateUpdatedBudgetRange,
  type CaseRecord,
} from "./case-contract";

let pendingWrite = Promise.resolve();

export class CaseRepositoryError extends Error {}

function casesFilePath() {
  const override = process.env.FRAMEONE_CASES_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "cases.json");
}

async function ensureCasesFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function readCases(filePath: string): Promise<CaseRecord[]> {
  await ensureCasesFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Case repository root must be an array.");
    for (const record of parsed) assertStoredCaseRecord(record);
    return parsed as CaseRecord[];
  } catch (error) {
    if (error instanceof CaseRepositoryError) throw error;
    throw new CaseRepositoryError("Case 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeCases(filePath: string, records: CaseRecord[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new CaseRepositoryError("Case 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

export async function listCases(): Promise<CaseRecord[]> {
  await pendingWrite;
  return structuredClone(await readCases(casesFilePath()));
}

export async function getCase(caseId: string): Promise<CaseRecord | null> {
  const cases = await listCases();
  return cases.find((record) => record.caseId === caseId) ?? null;
}

export function createCase(input: unknown): Promise<CaseRecord> {
  const parsed = parseCaseCreateInput(input);
  let result!: CaseRecord;
  const filePath = casesFilePath();
  const operation = pendingWrite.then(async () => {
    const cases = await readCases(filePath);
    const timestamp = new Date().toISOString();
    result = {
      ...parsed,
      caseId: `case-${randomUUID()}`,
      lifecycleStage: "EXPLORING",
      status: "ACTIVE",
      analysisRunIds: [],
      consultationIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    cases.push(result);
    await writeCases(filePath, cases);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export function updateCase(caseId: string, input: unknown): Promise<CaseRecord | null> {
  const parsed = parseCaseUpdateInput(input);
  let result: CaseRecord | null = null;
  const filePath = casesFilePath();
  const operation = pendingWrite.then(async () => {
    const cases = await readCases(filePath);
    const index = cases.findIndex((record) => record.caseId === caseId);
    if (index < 0) return;
    const current = cases[index];
    validateUpdatedBudgetRange(current, parsed);
    const lifecycleStage = parsed.lifecycleStage ?? current.lifecycleStage;
    const next: CaseRecord = {
      ...current,
      ...parsed,
      lifecycleStage,
      status: statusForLifecycle(lifecycleStage),
      updatedAt: new Date().toISOString(),
    };
    cases[index] = next;
    await writeCases(filePath, cases);
    result = structuredClone(next);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => result);
}

export { CaseValidationError };
