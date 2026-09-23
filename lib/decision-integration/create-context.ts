/**
 * createCandidateDecisionContext — pure factory.
 * source Domain object를 mutation하지 않는다.
 */

import type {
  CandidateDecisionContext,
  CandidateDecisionValidationResult,
  EconomicAnalysisBinding,
  FieldSpaceBinding,
  LeaseAnalysisBinding,
  LocationAnalysisBinding,
} from "./types";
import { CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION } from "./types";
import { validateCandidateDecisionContext } from "./validation";

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
