import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { getCandidateStore } from "./candidate-repository";
import {
  assertStoredBakeryFacilityAssessment,
  BakeryFacilityAssessmentValidationError,
  parseBakeryFacilityAssessmentCreateInput,
  parseBakeryFacilityAssessmentUpdateInput,
  type BakeryFacilityAssessment,
} from "./bakery-facility-assessment-contract";

let pendingWrite = Promise.resolve();

export class BakeryFacilityAssessmentRepositoryError extends Error {}
export class BakeryFacilityAssessmentReferenceError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) { super(message); }
}

function assessmentFilePath() {
  const override = process.env.FRAMEONE_CANDIDATE_FACILITY_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "candidate-facility-assessments.json");
}

async function ensureFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function readRecords(filePath: string): Promise<BakeryFacilityAssessment[]> {
  await ensureFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Facility Assessment repository root must be an array.");
    parsed.forEach(assertStoredBakeryFacilityAssessment);
    return parsed;
  } catch (error) {
    throw new BakeryFacilityAssessmentRepositoryError("시설검토 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeRecords(filePath: string, records: BakeryFacilityAssessment[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new BakeryFacilityAssessmentRepositoryError("시설검토 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

async function assertOwnership(candidateId: string, caseId: string) {
  const candidate = await getCandidateStore(candidateId);
  if (!candidate) throw new BakeryFacilityAssessmentReferenceError("후보점포를 찾을 수 없습니다.", 404);
  if (candidate.caseId !== caseId) throw new BakeryFacilityAssessmentReferenceError("다른 Case의 후보점포에는 접근할 수 없습니다.", 404);
}

export async function getBakeryFacilityAssessment(candidateId: string, caseId: string) {
  await pendingWrite;
  await assertOwnership(candidateId, caseId);
  const records = await readRecords(assessmentFilePath());
  return structuredClone(records.find((record) => record.candidateId === candidateId && record.caseId === caseId) ?? null);
}

export function createBakeryFacilityAssessment(input: unknown): Promise<BakeryFacilityAssessment> {
  const parsed = parseBakeryFacilityAssessmentCreateInput(input);
  const filePath = assessmentFilePath();
  let result!: BakeryFacilityAssessment;
  const operation = pendingWrite.then(async () => {
    await assertOwnership(parsed.candidateId, parsed.caseId);
    const records = await readRecords(filePath);
    if (records.some((record) => record.candidateId === parsed.candidateId)) {
      throw new BakeryFacilityAssessmentReferenceError("이미 시설검토가 생성되어 있습니다.", 409);
    }
    const timestamp = new Date().toISOString();
    result = {
      assessmentId: `facility-assessment-${randomUUID()}`,
      candidateId: parsed.candidateId,
      caseId: parsed.caseId,
      checks: structuredClone(parsed.checks),
      revisions: [{
        revisionId: `facility-revision-${randomUUID()}`,
        checks: structuredClone(parsed.checks),
        recordedAt: timestamp,
      }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    records.push(result);
    await writeRecords(filePath, records);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export function updateBakeryFacilityAssessment(candidateId: string, input: unknown): Promise<BakeryFacilityAssessment | null> {
  const parsed = parseBakeryFacilityAssessmentUpdateInput(input);
  const filePath = assessmentFilePath();
  let result: BakeryFacilityAssessment | null = null;
  const operation = pendingWrite.then(async () => {
    await assertOwnership(candidateId, parsed.caseId);
    const records = await readRecords(filePath);
    const index = records.findIndex((record) => record.candidateId === candidateId && record.caseId === parsed.caseId);
    if (index < 0) return;
    const timestamp = new Date().toISOString();
    const nextChecks = { ...records[index].checks, ...structuredClone(parsed.checks) };
    if (isDeepStrictEqual(records[index].checks, nextChecks)) {
      result = records[index];
      return;
    }
    result = {
      ...records[index],
      checks: nextChecks,
      revisions: [...records[index].revisions, {
        revisionId: `facility-revision-${randomUUID()}`,
        checks: structuredClone(nextChecks),
        recordedAt: timestamp,
      }],
      updatedAt: timestamp,
    };
    records[index] = result;
    await writeRecords(filePath, records);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export { BakeryFacilityAssessmentValidationError };
