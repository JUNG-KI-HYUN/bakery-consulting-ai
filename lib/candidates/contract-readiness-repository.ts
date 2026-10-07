import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAnalysisRunSnapshot } from "../analysis-runs/analysis-run-repository";
import { getBakeryFacilityAssessment } from "./bakery-facility-assessment-repository";
import { getCandidateStore } from "./candidate-repository";
import { getCandidateLeaseAssessment } from "./candidate-lease-assessment-repository";
import {
  CONTRACT_READINESS_RULE_VERSION,
  CONTRACT_READINESS_SCHEMA_VERSION,
  contractReadinessInputBinding,
  isContractReadinessSnapshotStale,
  type CandidateContractReadinessSnapshot,
  type CandidateContractReadinessView,
  type ContractReadinessIssue,
  type ContractReadinessResult,
} from "./contract-readiness-contract";
import { calculateContractReadiness } from "./contract-readiness";

let pendingWrite = Promise.resolve();

export class ContractReadinessRepositoryError extends Error {}
export class ContractReadinessReferenceError extends Error {
  constructor(message: string, readonly status: 400 | 404) { super(message); }
}

function readinessFilePath() {
  const override = process.env.FRAMEONE_CONTRACT_READINESS_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "candidate-contract-readiness.json");
}

async function ensureFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try { await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validIssueArray(value: unknown): value is ContractReadinessIssue[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object"
    && typeof (item as ContractReadinessIssue).code === "string"
    && typeof (item as ContractReadinessIssue).source === "string"
    && typeof (item as ContractReadinessIssue).message === "string");
}

function assertStoredSnapshot(value: unknown): asserts value is CandidateContractReadinessSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Contract Readiness Snapshot이 객체가 아닙니다.");
  const snapshot = value as Partial<CandidateContractReadinessSnapshot>;
  if (typeof snapshot.readinessSnapshotId !== "string" || !snapshot.readinessSnapshotId.startsWith("contract-readiness-")) throw new TypeError("Snapshot ID가 올바르지 않습니다.");
  if (typeof snapshot.candidateId !== "string" || !snapshot.candidateId || typeof snapshot.caseId !== "string" || !snapshot.caseId) throw new TypeError("Snapshot 소유권 정보가 올바르지 않습니다.");
  if (snapshot.schemaVersion !== CONTRACT_READINESS_SCHEMA_VERSION || snapshot.ruleVersion !== CONTRACT_READINESS_RULE_VERSION) throw new TypeError("Snapshot engine version이 올바르지 않습니다.");
  if (!snapshot.result || !["BLOCKED", "REVIEW_REQUIRED", "READY"].includes(snapshot.result.readinessStatus ?? "")) throw new TypeError("Snapshot 결과가 올바르지 않습니다.");
  if (!validIssueArray(snapshot.result.blockingIssues) || !validIssueArray(snapshot.result.reviewIssues) || !validIssueArray(snapshot.result.evidenceGaps) || !Array.isArray(snapshot.result.nextActions)) throw new TypeError("Snapshot issue 목록이 올바르지 않습니다.");
  if (!snapshot.inputBinding || !snapshot.sourceReferences) throw new TypeError("Snapshot binding이 올바르지 않습니다.");
  if (!validTimestamp(snapshot.evaluatedAt) || !validTimestamp(snapshot.savedAt)) throw new TypeError("Snapshot 시각이 올바르지 않습니다.");
  if (snapshot.createsVerdict !== false || snapshot.createsApproval !== false) throw new TypeError("Snapshot은 Verdict 또는 Approval을 생성할 수 없습니다.");
}

async function readSnapshots(filePath: string): Promise<CandidateContractReadinessSnapshot[]> {
  await ensureFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Contract Readiness 저장소 root가 배열이 아닙니다.");
    parsed.forEach(assertStoredSnapshot);
    return parsed;
  } catch (error) {
    throw new ContractReadinessRepositoryError("Contract Readiness 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeSnapshots(filePath: string, snapshots: CandidateContractReadinessSnapshot[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(snapshots, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new ContractReadinessRepositoryError("Contract Readiness 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

async function ownedCandidate(candidateId: string, caseId: string) {
  if (!caseId.trim()) throw new ContractReadinessReferenceError("caseId는 필수입니다.", 400);
  const candidate = await getCandidateStore(candidateId);
  if (!candidate) throw new ContractReadinessReferenceError("후보점포를 찾을 수 없습니다.", 404);
  if (candidate.caseId !== caseId) throw new ContractReadinessReferenceError("다른 Case의 후보점포에는 접근할 수 없습니다.", 404);
  return candidate;
}

async function currentEvaluation(candidateId: string, caseId: string): Promise<ContractReadinessResult> {
  const candidate = await ownedCandidate(candidateId, caseId);
  const [facilityAssessment, leaseAssessment] = await Promise.all([
    getBakeryFacilityAssessment(candidateId, caseId),
    getCandidateLeaseAssessment(candidateId, caseId),
  ]);
  const analysisRun = candidate.analysisLinks.length === 1
    ? await getAnalysisRunSnapshot(candidate.analysisLinks[0].analysisRunId)
    : null;
  return calculateContractReadiness({
    candidate,
    facilityAssessment,
    leaseAssessment,
    analysisRun,
    evaluatedAt: new Date().toISOString(),
  });
}

function viewFrom(
  evaluation: ContractReadinessResult,
  candidateSnapshots: CandidateContractReadinessSnapshot[],
): CandidateContractReadinessView {
  const latestSavedSnapshot = candidateSnapshots.at(-1) ?? null;
  return {
    currentEvaluation: structuredClone(evaluation),
    latestSavedSnapshot: structuredClone(latestSavedSnapshot),
    snapshotCount: candidateSnapshots.length,
    isLatestSnapshotStale: latestSavedSnapshot
      ? isContractReadinessSnapshotStale(latestSavedSnapshot, evaluation)
      : null,
  };
}

export async function getCandidateContractReadinessView(candidateId: string, caseId: string) {
  await pendingWrite;
  const [evaluation, snapshots] = await Promise.all([
    currentEvaluation(candidateId, caseId),
    readSnapshots(readinessFilePath()),
  ]);
  return viewFrom(evaluation, snapshots.filter((item) => item.candidateId === candidateId && item.caseId === caseId));
}

export async function getCandidateContractReadinessSnapshot(
  candidateId: string,
  caseId: string,
  readinessSnapshotId: string,
) {
  await pendingWrite;
  await ownedCandidate(candidateId, caseId);
  const snapshots = await readSnapshots(readinessFilePath());
  return structuredClone(snapshots.find((item) =>
    item.readinessSnapshotId === readinessSnapshotId
    && item.candidateId === candidateId
    && item.caseId === caseId
  ) ?? null);
}

export function saveCandidateContractReadinessSnapshot(candidateId: string, caseId: string): Promise<CandidateContractReadinessView> {
  const filePath = readinessFilePath();
  let view!: CandidateContractReadinessView;
  const operation = pendingWrite.then(async () => {
    const evaluation = await currentEvaluation(candidateId, caseId);
    const snapshots = await readSnapshots(filePath);
    const savedAt = new Date().toISOString();
    const snapshot: CandidateContractReadinessSnapshot = {
      readinessSnapshotId: `contract-readiness-${randomUUID()}`,
      candidateId,
      caseId,
      schemaVersion: evaluation.schemaVersion,
      ruleVersion: evaluation.ruleVersion,
      result: {
        readinessStatus: evaluation.readinessStatus,
        blockingIssues: structuredClone(evaluation.blockingIssues),
        reviewIssues: structuredClone(evaluation.reviewIssues),
        evidenceGaps: structuredClone(evaluation.evidenceGaps),
        nextActions: structuredClone(evaluation.nextActions),
      },
      inputBinding: contractReadinessInputBinding(evaluation.sourceReferences),
      sourceReferences: structuredClone(evaluation.sourceReferences),
      evaluatedAt: evaluation.evaluatedAt,
      savedAt,
      createsVerdict: false,
      createsApproval: false,
    };
    snapshots.push(snapshot);
    await writeSnapshots(filePath, snapshots);
    view = viewFrom(evaluation, snapshots.filter((item) => item.candidateId === candidateId && item.caseId === caseId));
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(view));
}
