/**
 * createCandidateDecisionContext — pure factory.
 * source Domain object를 mutation하지 않는다.
 */

import type {
  CandidateDecisionContext,
  CandidateDecisionContextV2,
  CandidateDecisionValidationResult,
  CandidateLeaseEvidenceBinding,
  EconomicAnalysisBinding,
  FieldSpaceBinding,
  LeaseAnalysisBinding,
  LocationAnalysisBinding,
} from "./types";
import {
  CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION,
  CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION,
} from "./types";
import { validateCandidateDecisionContext, validateCandidateDecisionContextV2 } from "./validation";

export function createCandidateDecisionContext(input: {
  candidateStoreId: string;
  createdAt: string;
  locationBinding?: LocationAnalysisBinding | null;
  leaseBinding?: LeaseAnalysisBinding | null;
  economicBinding?: EconomicAnalysisBinding | null;
  fieldBinding?: FieldSpaceBinding | null;
}): CandidateDecisionValidationResult<CandidateDecisionContext> {
  return validateCandidateDecisionContext({
    schemaVersion: CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION,
    candidateStoreId: input.candidateStoreId,
    createdAt: input.createdAt,
    locationBinding: input.locationBinding ?? null,
    leaseBinding: input.leaseBinding ?? null,
    economicBinding: input.economicBinding ?? null,
    fieldBinding: input.fieldBinding ?? null,
    createsVerdict: false,
    createsScore: false,
    createsRisk: false,
  });
}

export function createCandidateDecisionContextV2(input: {
  candidateStoreId: string;
  createdAt: string;
  locationBinding?: LocationAnalysisBinding | null;
  leaseBinding?: LeaseAnalysisBinding | null;
  candidateLeaseBinding?: CandidateLeaseEvidenceBinding | null;
  economicBinding?: EconomicAnalysisBinding | null;
  fieldBinding?: FieldSpaceBinding | null;
}): CandidateDecisionValidationResult<CandidateDecisionContextV2> {
  return validateCandidateDecisionContextV2({
    schemaVersion: CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION,
    candidateStoreId: input.candidateStoreId,
    createdAt: input.createdAt,
    locationBinding: input.locationBinding ?? null,
    leaseBinding: input.leaseBinding ?? null,
    candidateLeaseBinding: input.candidateLeaseBinding ?? null,
    economicBinding: input.economicBinding ?? null,
    fieldBinding: input.fieldBinding ?? null,
    createsVerdict: false,
    createsScore: false,
    createsRisk: false,
  });
}
