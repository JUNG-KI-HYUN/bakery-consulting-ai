/**
 * Risk evaluator, Risk Register, Final Decision Policy Readiness가 읽는
 * Candidate Decision Evidence bundle schema allow-list.
 *
 * candidate-decision-evidence-v1과 candidate-decision-evidence-v2만 허용한다.
 * 이후 version은 이 목록에 넣기 전에는 거부한다.
 */

import {
  CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION,
  CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION,
  type CandidateDecisionEvidenceBundle,
  type CandidateDecisionEvidenceBundleV2,
} from "../decision-evidence/candidate-bundle";

export const SUPPORTED_CANDIDATE_EVIDENCE_VERSIONS = Object.freeze([
  CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION,
  CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION,
] as const);

export type SupportedCandidateEvidenceVersion = (typeof SUPPORTED_CANDIDATE_EVIDENCE_VERSIONS)[number];

export type SupportedCandidateDecisionEvidenceBundle =
  | CandidateDecisionEvidenceBundle
  | CandidateDecisionEvidenceBundleV2;

const SUPPORTED_CANDIDATE_EVIDENCE_VERSION_SET: ReadonlySet<string> = new Set(
  SUPPORTED_CANDIDATE_EVIDENCE_VERSIONS,
);

/** 정확 일치만 허용한다. prefix 일치는 허용하지 않는다. */
export function isSupportedCandidateEvidenceVersion(
  value: unknown,
): value is SupportedCandidateEvidenceVersion {
  return typeof value === "string" && SUPPORTED_CANDIDATE_EVIDENCE_VERSION_SET.has(value);
}

export function unsupportedCandidateEvidenceVersionError(): string {
  return `evidenceBundle.schemaVersion은 ${CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION} 또는 ${CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION}이어야 합니다.`;
}
