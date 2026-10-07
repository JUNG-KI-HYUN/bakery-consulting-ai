import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getCandidateContractReadinessView } from "./contract-readiness-repository";
import {
  ALLOWED_VERDICTS_BY_READINESS,
  HUMAN_DECISION_SCHEMA_VERSION,
  isHumanDecisionStale,
  isVerdictAllowed,
  type CandidateHumanDecision,
  type CandidateHumanDecisionView,
  type CreateHumanDecisionInput,
  type HumanDecisionSupport,
} from "./human-decision-contract";

let pendingWrite = Promise.resolve();

export class HumanDecisionRepositoryError extends Error {}
export class HumanDecisionRequestError extends Error {}

function decisionFilePath() {
  const override = process.env.FRAMEONE_CANDIDATE_DECISIONS_FILE?.trim();
  return override ? path.resolve(override) : path.join(process.cwd(), "data", "candidate-human-decisions.json");
}

async function ensureFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try { await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function assertStoredDecision(value: unknown): asserts value is CandidateHumanDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Human Decision이 객체가 아닙니다.");
  const decision = value as Partial<CandidateHumanDecision>;
  if (typeof decision.decisionId !== "string" || !decision.decisionId.startsWith("human-decision-")) throw new TypeError("Decision ID가 올바르지 않습니다.");
  if (typeof decision.candidateId !== "string" || !decision.candidateId || typeof decision.caseId !== "string" || !decision.caseId) throw new TypeError("Decision 소유권 정보가 올바르지 않습니다.");
  if (decision.schemaVersion !== HUMAN_DECISION_SCHEMA_VERSION) throw new TypeError("Decision schema version이 올바르지 않습니다.");
  if (!decision.basis || typeof decision.basis.readinessSnapshotId !== "string" || !validTimestamp(decision.basis.readinessSavedAt) || !decision.basis.readinessInputBinding) throw new TypeError("Decision 기준 Snapshot이 올바르지 않습니다.");
  if (!Object.hasOwn(ALLOWED_VERDICTS_BY_READINESS, decision.basis.readinessStatus ?? "")) throw new TypeError("Decision 기준 Readiness가 올바르지 않습니다.");
  if (!Object.hasOwn({ RECOMMEND: true, CONDITIONAL_RECOMMEND: true, HOLD: true, RISK: true }, decision.verdict ?? "")) throw new TypeError("Decision verdict가 올바르지 않습니다.");
  if (!isVerdictAllowed(decision.basis.readinessStatus!, decision.verdict!)) throw new TypeError("Decision과 Readiness의 조합이 올바르지 않습니다.");
  if (typeof decision.rationale !== "string" || !decision.rationale.trim() || typeof decision.reviewerName !== "string" || !decision.reviewerName.trim()) throw new TypeError("Decision 판단정보가 올바르지 않습니다.");
  const support = decision.support as Partial<HumanDecisionSupport> | undefined;
  if (!support || !validStringArray(support.positiveFactors) || !validStringArray(support.keyRisks) || !validStringArray(support.unresolvedConditions) || !validStringArray(support.conditionsBeforeProceeding) || !validStringArray(support.landlordConfirmations) || !validStringArray(support.expertConfirmations) || !validStringArray(support.nextActions)) throw new TypeError("Decision 지원정보가 올바르지 않습니다.");
  if (!validTimestamp(decision.decidedAt) || !(decision.previousDecisionId === null || typeof decision.previousDecisionId === "string")) throw new TypeError("Decision 이력정보가 올바르지 않습니다.");
  if (decision.createsAutomaticRecommendation !== false || decision.decidedByHuman !== true) throw new TypeError("Decision 안전정보가 올바르지 않습니다.");
}

async function readDecisions(filePath: string): Promise<CandidateHumanDecision[]> {
  await ensureFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Human Decision 저장소 root가 배열이 아닙니다.");
    parsed.forEach(assertStoredDecision);
    return parsed;
  } catch (error) {
    throw new HumanDecisionRepositoryError("Human Decision 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeDecisions(filePath: string, decisions: CandidateHumanDecision[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(decisions, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new HumanDecisionRepositoryError("Human Decision 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

function cleanList(value: string[]) {
  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeInput(input: CreateHumanDecisionInput): CreateHumanDecisionInput {
  return {
    verdict: input.verdict,
    rationale: input.rationale.trim(),
    reviewerName: input.reviewerName.trim(),
    positiveFactors: cleanList(input.positiveFactors),
    keyRisks: cleanList(input.keyRisks),
    unresolvedConditions: cleanList(input.unresolvedConditions),
    conditionsBeforeProceeding: cleanList(input.conditionsBeforeProceeding),
    landlordConfirmations: cleanList(input.landlordConfirmations),
    expertConfirmations: cleanList(input.expertConfirmations),
    nextActions: cleanList(input.nextActions),
  };
}

function validateInput(input: CreateHumanDecisionInput, readinessStatus: keyof typeof ALLOWED_VERDICTS_BY_READINESS) {
  const verdicts = Object.values(ALLOWED_VERDICTS_BY_READINESS).flat();
  if (!verdicts.includes(input.verdict)) throw new HumanDecisionRequestError("최종 판단을 선택하세요.");
  if (!isVerdictAllowed(readinessStatus, input.verdict)) throw new HumanDecisionRequestError("현재 계약 검토 준비상태에서는 선택한 최종 판단을 저장할 수 없습니다.");
  if (!input.rationale) throw new HumanDecisionRequestError("판단 이유는 필수입니다.");
  if (!input.reviewerName) throw new HumanDecisionRequestError("담당자는 필수입니다.");
  if (input.verdict === "CONDITIONAL_RECOMMEND" && input.conditionsBeforeProceeding.length === 0) throw new HumanDecisionRequestError("조건부 추천에는 계약 전 완료조건이 최소 1개 필요합니다.");
  if (input.verdict === "HOLD" && input.unresolvedConditions.length === 0 && input.nextActions.length === 0) throw new HumanDecisionRequestError("보류에는 미확인 사항 또는 다음 행동이 최소 1개 필요합니다.");
  if (input.verdict === "RISK" && input.keyRisks.length === 0) throw new HumanDecisionRequestError("위험 판단에는 핵심위험이 최소 1개 필요합니다.");
}

function viewFrom(
  readinessView: Awaited<ReturnType<typeof getCandidateContractReadinessView>>,
  candidateDecisions: CandidateHumanDecision[],
): CandidateHumanDecisionView {
  const latestDecision = candidateDecisions.at(-1) ?? null;
  const canCreateDecision = Boolean(readinessView.latestSavedSnapshot && readinessView.isLatestSnapshotStale === false);
  return {
    latestDecision: structuredClone(latestDecision),
    decisionCount: candidateDecisions.length,
    currentReadiness: structuredClone(readinessView.currentEvaluation),
    latestReadinessSnapshot: structuredClone(readinessView.latestSavedSnapshot),
    canCreateDecision,
    blockReason: canCreateDecision ? null : "현재 자료 기준의 계약 검토상태를 먼저 저장하세요.",
    isLatestDecisionStale: latestDecision
      ? isHumanDecisionStale(latestDecision, readinessView.currentEvaluation)
      : null,
  };
}

export async function getCandidateHumanDecisionView(candidateId: string, caseId: string) {
  await pendingWrite;
  const readinessView = await getCandidateContractReadinessView(candidateId, caseId);
  const decisions = await readDecisions(decisionFilePath());
  return viewFrom(readinessView, decisions.filter((item) => item.candidateId === candidateId && item.caseId === caseId));
}

export function saveCandidateHumanDecision(
  candidateId: string,
  caseId: string,
  requestedInput: CreateHumanDecisionInput,
): Promise<CandidateHumanDecisionView> {
  const filePath = decisionFilePath();
  let view!: CandidateHumanDecisionView;
  const operation = pendingWrite.then(async () => {
    const readinessView = await getCandidateContractReadinessView(candidateId, caseId);
    const snapshot = readinessView.latestSavedSnapshot;
    if (!snapshot || readinessView.isLatestSnapshotStale !== false) {
      throw new HumanDecisionRequestError("현재 자료 기준의 계약 검토상태를 먼저 저장하세요.");
    }
    const input = normalizeInput(requestedInput);
    validateInput(input, snapshot.result.readinessStatus);
    const decisions = await readDecisions(filePath);
    const candidateDecisions = decisions.filter((item) => item.candidateId === candidateId && item.caseId === caseId);
    const previousDecision = candidateDecisions.at(-1) ?? null;
    const decision: CandidateHumanDecision = {
      decisionId: `human-decision-${randomUUID()}`,
      candidateId,
      caseId,
      schemaVersion: HUMAN_DECISION_SCHEMA_VERSION,
      basis: {
        readinessSnapshotId: snapshot.readinessSnapshotId,
        readinessStatus: snapshot.result.readinessStatus,
        readinessSavedAt: snapshot.savedAt,
        readinessInputBinding: structuredClone(snapshot.inputBinding),
      },
      verdict: input.verdict,
      rationale: input.rationale,
      support: {
        positiveFactors: input.positiveFactors,
        keyRisks: input.keyRisks,
        unresolvedConditions: input.unresolvedConditions,
        conditionsBeforeProceeding: input.conditionsBeforeProceeding,
        landlordConfirmations: input.landlordConfirmations,
        expertConfirmations: input.expertConfirmations,
        nextActions: input.nextActions,
      },
      reviewerName: input.reviewerName,
      decidedAt: new Date().toISOString(),
      previousDecisionId: previousDecision?.decisionId ?? null,
      createsAutomaticRecommendation: false,
      decidedByHuman: true,
    };
    decisions.push(decision);
    await writeDecisions(filePath, decisions);
    view = viewFrom(readinessView, [...candidateDecisions, decision]);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(view));
}
