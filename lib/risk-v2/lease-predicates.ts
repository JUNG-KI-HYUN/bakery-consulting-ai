import { CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION } from "../decision-evidence/candidate-bundle";
import type { SupportedCandidateDecisionEvidenceBundle } from "./candidate-evidence-versions";
import type { RiskPredicate, RiskPredicateContext } from "./predicates";

export const LEASE_BUSINESS_USE_RESTRICTION_PRESENT_PREDICATE_KEY =
  "lease.businessUseRestrictionPresent" as const;
export const LEASE_BAKERY_USE_REFUSED_PREDICATE_KEY = "lease.bakeryUseRefused" as const;
export const LEASE_EXHAUST_CONSENT_REFUSED_PREDICATE_KEY =
  "lease.exhaustConsentRefused" as const;
export const LEASE_ELECTRICAL_UPGRADE_REFUSED_PREDICATE_KEY =
  "lease.electricalUpgradeRefused" as const;
export const LEASE_CONSTRUCTION_CONSENT_REFUSED_PREDICATE_KEY =
  "lease.constructionConsentRefused" as const;

/**
 * Candidate Lease predicate 공통 integration guard.
 * V1 bundle이거나 V2 candidateLease 연결이 실패한 경우 adverse Lease 상태를 추론하지 않는다.
 */
function candidateLeaseEvidence(bundle: SupportedCandidateDecisionEvidenceBundle) {
  if (bundle.schemaVersion !== CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION) return null;
  return bundle.domainEvidence.candidateLease;
}

function leaseBusinessUseRestrictionPresent({ bundle }: RiskPredicateContext): boolean {
  const candidateLease = candidateLeaseEvidence(bundle);
  return (
    candidateLease !== null &&
    candidateLease.typedState.contractConditions.businessUseRestriction.status ===
      "RESTRICTION_PRESENT"
  );
}

function leaseBakeryUseRefused({ bundle }: RiskPredicateContext): boolean {
  const candidateLease = candidateLeaseEvidence(bundle);
  return (
    candidateLease !== null &&
    candidateLease.typedState.landlordConsents.bakeryManufacturingUse.status === "REFUSED"
  );
}

function leaseExhaustConsentRefused({ bundle }: RiskPredicateContext): boolean {
  const candidateLease = candidateLeaseEvidence(bundle);
  return (
    candidateLease !== null &&
    candidateLease.typedState.landlordConsents.exhaust.status === "REFUSED"
  );
}

function leaseElectricalUpgradeRefused({ bundle }: RiskPredicateContext): boolean {
  const candidateLease = candidateLeaseEvidence(bundle);
  return (
    candidateLease !== null &&
    candidateLease.typedState.landlordConsents.electricalUpgrade.status === "REFUSED"
  );
}

function leaseConstructionConsentRefused({ bundle }: RiskPredicateContext): boolean {
  const candidateLease = candidateLeaseEvidence(bundle);
  return (
    candidateLease !== null &&
    candidateLease.typedState.landlordConsents.construction.status === "REFUSED"
  );
}

/** V4 전용 typed predicate. description / title / summary / sourceRef를 읽지 않는다. */
export const CANDIDATE_LEASE_PREDICATES: Readonly<Record<string, RiskPredicate>> = Object.freeze({
  [LEASE_BUSINESS_USE_RESTRICTION_PRESENT_PREDICATE_KEY]:
    leaseBusinessUseRestrictionPresent,
  [LEASE_BAKERY_USE_REFUSED_PREDICATE_KEY]: leaseBakeryUseRefused,
  [LEASE_EXHAUST_CONSENT_REFUSED_PREDICATE_KEY]: leaseExhaustConsentRefused,
  [LEASE_ELECTRICAL_UPGRADE_REFUSED_PREDICATE_KEY]: leaseElectricalUpgradeRefused,
  [LEASE_CONSTRUCTION_CONSENT_REFUSED_PREDICATE_KEY]:
    leaseConstructionConsentRefused,
});
