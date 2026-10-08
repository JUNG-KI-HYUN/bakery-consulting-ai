export const CANDIDATE_ECONOMIC_SELECTION_SCHEMA_VERSION = "frameone.candidate-economic-selection.v1" as const;

export interface CandidateEconomicVersionIdentity {
  analysisRunId: string;
  generatedAt: string;
  assumptionRevision: number;
  engineVersion: string;
}

export interface CandidateEconomicSelection extends CandidateEconomicVersionIdentity {
  schemaVersion: typeof CANDIDATE_ECONOMIC_SELECTION_SCHEMA_VERSION;
  candidateId: string;
  caseId: string;
  selectedAt: string;
}

export interface CandidateEconomicVersionOption extends CandidateEconomicVersionIdentity {
  monthlyBepSales: number | null;
  baseMonthlySales: number | null;
  validationErrorCount: number;
}

export interface CandidateEconomicSelectionView {
  analysisRunId: string | null;
  versions: CandidateEconomicVersionOption[];
  selection: CandidateEconomicSelection | null;
}

export function sameEconomicVersionIdentity(
  left: CandidateEconomicVersionIdentity,
  right: CandidateEconomicVersionIdentity,
) {
  return left.analysisRunId === right.analysisRunId
    && left.generatedAt === right.generatedAt
    && left.assumptionRevision === right.assumptionRevision
    && left.engineVersion === right.engineVersion;
}
