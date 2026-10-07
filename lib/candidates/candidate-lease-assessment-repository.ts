import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { getCandidateStore } from "./candidate-repository";
import {
  assertStoredCandidateLeaseAssessment,
  CandidateLeaseAssessmentValidationError,
  parseCandidateLeaseAssessmentCreateInput,
  parseCandidateLeaseAssessmentUpdateInput,
  type CandidateLeaseAssessment,
  type CandidateLeaseReviewedTerms,
} from "./candidate-lease-assessment-contract";

let pendingWrite = Promise.resolve();

export class CandidateLeaseAssessmentRepositoryError extends Error {}
export class CandidateLeaseAssessmentReferenceError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) { super(message); }
}

function leaseFilePath() {
  const override = process.env.FRAMEONE_CANDIDATE_LEASE_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "candidate-lease-assessments.json");
}

async function ensureFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try { await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

async function readRecords(filePath: string): Promise<CandidateLeaseAssessment[]> {
  await ensureFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Candidate Lease Assessment repository root must be an array.");
    parsed.forEach(assertStoredCandidateLeaseAssessment);
    return parsed;
  } catch (error) {
    throw new CandidateLeaseAssessmentRepositoryError("임대차 검토 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeRecords(filePath: string, records: CandidateLeaseAssessment[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new CandidateLeaseAssessmentRepositoryError("임대차 검토 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

async function candidateWithOwnership(candidateId: string, caseId: string) {
  const candidate = await getCandidateStore(candidateId);
  if (!candidate) throw new CandidateLeaseAssessmentReferenceError("후보점포를 찾을 수 없습니다.", 404);
  if (candidate.caseId !== caseId) throw new CandidateLeaseAssessmentReferenceError("다른 Case의 후보점포에는 접근할 수 없습니다.", 404);
  return candidate;
}

function applyReviewedTermsPatch(current: CandidateLeaseReviewedTerms, patch: CandidateLeaseReviewedTerms) {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key as keyof CandidateLeaseReviewedTerms];
    else Object.assign(next, { [key]: structuredClone(value) });
  }
  return next;
}

export async function getCandidateLeaseAssessment(candidateId: string, caseId: string) {
  await pendingWrite;
  await candidateWithOwnership(candidateId, caseId);
  const records = await readRecords(leaseFilePath());
  return structuredClone(records.find((record) => record.candidateId === candidateId && record.caseId === caseId) ?? null);
}

export function createCandidateLeaseAssessment(input: unknown): Promise<CandidateLeaseAssessment> {
  const parsed = parseCandidateLeaseAssessmentCreateInput(input);
  const filePath = leaseFilePath();
  let result!: CandidateLeaseAssessment;
  const operation = pendingWrite.then(async () => {
    const candidate = await candidateWithOwnership(parsed.candidateId, parsed.caseId);
    const records = await readRecords(filePath);
    if (records.some((record) => record.candidateId === parsed.candidateId)) throw new CandidateLeaseAssessmentReferenceError("이미 임대차 검토가 생성되어 있습니다.", 409);
    const reviewedTerms: CandidateLeaseReviewedTerms = { ...structuredClone(candidate.currentAskingTerms), ...structuredClone(parsed.reviewedTerms) };
    const timestamp = new Date().toISOString();
    result = {
      assessmentId: `lease-assessment-${randomUUID()}`,
      candidateId: parsed.candidateId,
      caseId: parsed.caseId,
      reviewedTerms,
      checks: structuredClone(parsed.checks),
      revisions: [{ revisionId: `lease-revision-${randomUUID()}`, reviewedTerms: structuredClone(reviewedTerms), checks: structuredClone(parsed.checks), recordedAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    records.push(result);
    await writeRecords(filePath, records);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export function updateCandidateLeaseAssessment(candidateId: string, input: unknown): Promise<CandidateLeaseAssessment | null> {
  const parsed = parseCandidateLeaseAssessmentUpdateInput(input);
  const filePath = leaseFilePath();
  let result: CandidateLeaseAssessment | null = null;
  const operation = pendingWrite.then(async () => {
    await candidateWithOwnership(candidateId, parsed.caseId);
    const records = await readRecords(filePath);
    const index = records.findIndex((record) => record.candidateId === candidateId && record.caseId === parsed.caseId);
    if (index < 0) return;
    const reviewedTerms = parsed.reviewedTerms ? applyReviewedTermsPatch(records[index].reviewedTerms, parsed.reviewedTerms) : records[index].reviewedTerms;
    const checks = parsed.checks ? { ...records[index].checks, ...structuredClone(parsed.checks) } : records[index].checks;
    if (isDeepStrictEqual(records[index].reviewedTerms, reviewedTerms) && isDeepStrictEqual(records[index].checks, checks)) {
      result = records[index];
      return;
    }
    const timestamp = new Date().toISOString();
    result = {
      ...records[index],
      reviewedTerms,
      checks,
      revisions: [...records[index].revisions, { revisionId: `lease-revision-${randomUUID()}`, reviewedTerms: structuredClone(reviewedTerms), checks: structuredClone(checks), recordedAt: timestamp }],
      updatedAt: timestamp,
    };
    records[index] = result;
    await writeRecords(filePath, records);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(result));
}

export { CandidateLeaseAssessmentValidationError };
