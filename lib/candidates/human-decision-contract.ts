import type {
  CandidateContractReadinessSnapshot,
  ContractReadinessInputBinding,
  ContractReadinessResult,
  ContractReadinessStatus,
} from "./contract-readiness-contract";
import { contractReadinessInputBinding } from "./contract-readiness-contract";

export const HUMAN_DECISION_SCHEMA_VERSION = "frameone.candidate-human-decision.v1" as const;

export type HumanDecisionVerdict = "RECOMMEND" | "CONDITIONAL_RECOMMEND" | "HOLD" | "RISK";

export const HUMAN_DECISION_VERDICT_LABELS: Record<HumanDecisionVerdict, string> = {
  RECOMMEND: "추천",
  CONDITIONAL_RECOMMEND: "조건부 추천",
  HOLD: "보류",
  RISK: "위험",
};

export const ALLOWED_VERDICTS_BY_READINESS: Record<ContractReadinessStatus, HumanDecisionVerdict[]> = {
  BLOCKED: ["HOLD", "RISK"],
  REVIEW_REQUIRED: ["CONDITIONAL_RECOMMEND", "HOLD", "RISK"],
  READY: ["RECOMMEND", "CONDITIONAL_RECOMMEND", "HOLD", "RISK"],
};

export interface HumanDecisionSupport {
  positiveFactors: string[];
  keyRisks: string[];
  unresolvedConditions: string[];
  conditionsBeforeProceeding: string[];
  landlordConfirmations: string[];
  expertConfirmations: string[];
  nextActions: string[];
}

export interface CandidateHumanDecision {
  decisionId: string;
  candidateId: string;
  caseId: string;
  schemaVersion: typeof HUMAN_DECISION_SCHEMA_VERSION;
  basis: {
    readinessSnapshotId: string;
    readinessStatus: ContractReadinessStatus;
    readinessSavedAt: string;
    readinessInputBinding: ContractReadinessInputBinding;
  };
  verdict: HumanDecisionVerdict;
  rationale: string;
  support: HumanDecisionSupport;
  reviewerName: string;
  decidedAt: string;
  previousDecisionId: string | null;
  createsAutomaticRecommendation: false;
  decidedByHuman: true;
}

export interface CandidateHumanDecisionView {
  latestDecision: CandidateHumanDecision | null;
  decisionCount: number;
  currentReadiness: ContractReadinessResult;
  latestReadinessSnapshot: CandidateContractReadinessSnapshot | null;
  canCreateDecision: boolean;
  blockReason: string | null;
  isLatestDecisionStale: boolean | null;
}

export interface CreateHumanDecisionInput extends HumanDecisionSupport {
  verdict: HumanDecisionVerdict;
  rationale: string;
  reviewerName: string;
}

export function isVerdictAllowed(
  readinessStatus: ContractReadinessStatus,
  verdict: HumanDecisionVerdict,
) {
  return ALLOWED_VERDICTS_BY_READINESS[readinessStatus].includes(verdict);
}

export function isHumanDecisionStale(
  decision: Pick<CandidateHumanDecision, "basis">,
  currentReadiness: Pick<ContractReadinessResult, "sourceReferences">,
) {
  const currentBinding: ContractReadinessInputBinding = contractReadinessInputBinding(currentReadiness.sourceReferences);
  return JSON.stringify(decision.basis.readinessInputBinding) !== JSON.stringify(currentBinding);
}
