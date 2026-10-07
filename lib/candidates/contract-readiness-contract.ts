import type { AnalysisRunSnapshot } from "../analysis-runs/analysis-run-snapshot";
import type { BakeryFacilityAssessment } from "./bakery-facility-assessment-contract";
import type { CandidateStore } from "./candidate-contract";
import type { CandidateLeaseAssessment } from "./candidate-lease-assessment-contract";

export const CONTRACT_READINESS_SCHEMA_VERSION = "frameone.contract-readiness.v1" as const;
export const CONTRACT_READINESS_RULE_VERSION = "contract-readiness-v1" as const;

export type ContractReadinessStatus = "BLOCKED" | "REVIEW_REQUIRED" | "READY";
export type ContractReadinessIssueSource = "FACILITY" | "LEASE" | "ANALYSIS_RUN" | "ECONOMIC";

export interface ContractReadinessIssue {
  code: string;
  source: ContractReadinessIssueSource;
  message: string;
}

export interface ContractReadinessSourceReferences {
  facility: {
    assessmentId: string;
    revisionId: string;
    recordedAt: string;
    updatedAt: string;
  } | null;
  lease: {
    assessmentId: string;
    revisionId: string;
    recordedAt: string;
    updatedAt: string;
  } | null;
  analysisRun: {
    analysisRunId: string;
    linkedAt: string;
    snapshotUpdatedAt: string;
  } | null;
  economic: {
    analysisRunId: string;
    generatedAt: string;
    assumptionRevision: number;
    engineVersion: string;
  } | null;
}

export interface ContractReadinessResult {
  schemaVersion: typeof CONTRACT_READINESS_SCHEMA_VERSION;
  ruleVersion: typeof CONTRACT_READINESS_RULE_VERSION;
  candidateId: string;
  caseId: string;
  readinessStatus: ContractReadinessStatus;
  blockingIssues: ContractReadinessIssue[];
  reviewIssues: ContractReadinessIssue[];
  evidenceGaps: ContractReadinessIssue[];
  nextActions: string[];
  sourceReferences: ContractReadinessSourceReferences;
  evaluatedAt: string;
}

export interface ContractReadinessInput {
  candidate: Pick<CandidateStore, "candidateId" | "caseId" | "analysisLinks">;
  facilityAssessment: BakeryFacilityAssessment | null;
  leaseAssessment: CandidateLeaseAssessment | null;
  analysisRun: AnalysisRunSnapshot | null;
  evaluatedAt: string;
}

export class ContractReadinessInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractReadinessInputError";
  }
}
