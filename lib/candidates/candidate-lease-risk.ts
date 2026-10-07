import {
  CANDIDATE_LEASE_CHECK_KEYS,
  CANDIDATE_LEASE_CHECK_LABELS,
  type CandidateLeaseAssessment,
  type CandidateLeaseCheck,
  type CandidateLeaseCheckKey,
} from "./candidate-lease-assessment-contract";

export interface CandidateLeaseRiskItem {
  key: CandidateLeaseCheckKey;
  label: string;
  reason: string;
  nextAction?: string;
}

export interface CandidateLeaseRiskSummary {
  hardIssues: CandidateLeaseRiskItem[];
  conditionalIssues: CandidateLeaseRiskItem[];
  unresolvedChecks: CandidateLeaseRiskItem[];
  verifiedCount: number;
  nextActions: string[];
}

function isTrustedHardSource(check: CandidateLeaseCheck) {
  return check.sourceType === "DOCUMENT" || check.sourceType === "LANDLORD" || check.sourceType === "EXPERT" || check.sourceType === "AUTHORITY";
}

function isHardIssue(key: CandidateLeaseCheckKey, check: CandidateLeaseCheck) {
  if (check.state !== "UNACCEPTABLE" || check.verificationStatus !== "VERIFIED") return false;
  if (key === "businessUseRestriction") return isTrustedHardSource(check);
  if (key === "requiredWorksConsent") return check.sourceType === "LANDLORD" || check.sourceType === "DOCUMENT";
  return false;
}

function isSubstantivelyVerified(key: CandidateLeaseCheckKey, check: CandidateLeaseCheck | undefined) {
  if (!check || check.state === "UNKNOWN" || check.verificationStatus !== "VERIFIED") return false;
  if ((key === "businessUseRestriction" || key === "requiredWorksConsent") && check.state === "UNACCEPTABLE") return isHardIssue(key, check);
  return true;
}

function nextAction(key: CandidateLeaseCheckKey, check: CandidateLeaseCheck | undefined) {
  const label = CANDIDATE_LEASE_CHECK_LABELS[key];
  switch (check?.verificationStatus) {
    case "LANDLORD_CONFIRM_REQUIRED": return `${label}: 임대인 확인`;
    case "DOCUMENT_CONFIRM_REQUIRED": return `${label}: 계약문서 확인`;
    case "EXPERT_CONFIRM_REQUIRED": return `${label}: 공인중개사·변호사 확인`;
    case "AUTHORITY_CONFIRM_REQUIRED": return `${label}: 관할기관 확인`;
    default: return `${label}: 확인자료 확보`;
  }
}

export function calculateCandidateLeaseRiskSummary(
  assessment: Pick<CandidateLeaseAssessment, "checks"> | null | undefined,
): CandidateLeaseRiskSummary {
  const hardIssues: CandidateLeaseRiskItem[] = [];
  const conditionalIssues: CandidateLeaseRiskItem[] = [];
  const unresolvedChecks: CandidateLeaseRiskItem[] = [];
  const nextActions: string[] = [];
  let verifiedCount = 0;

  for (const key of CANDIDATE_LEASE_CHECK_KEYS) {
    const check = assessment?.checks[key];
    const label = CANDIDATE_LEASE_CHECK_LABELS[key];
    const verified = isSubstantivelyVerified(key, check);
    if (verified) verifiedCount += 1;
    if (check && isHardIssue(key, check)) {
      hardIssues.push({
        key,
        label,
        reason: key === "businessUseRestriction"
          ? "계약·임대인 또는 전문가 근거에서 목표 업종 사용 금지가 확인됐습니다."
          : "영업에 필요한 필수공사에 대한 임대인 거절이 확인됐습니다.",
      });
      continue;
    }
    if (check?.state === "CONDITIONAL") {
      const action = verified ? undefined : nextAction(key, check);
      conditionalIssues.push({ key, label, reason: check.note ?? "계약 전에 조건 변경·서면확인 또는 협의가 필요합니다.", ...(action ? { nextAction: action } : {}) });
      if (action) nextActions.push(action);
      continue;
    }
    if (!verified || check?.state === "UNACCEPTABLE") {
      const action = nextAction(key, check);
      unresolvedChecks.push({
        key,
        label,
        reason: check?.state === "UNACCEPTABLE" ? "불가 의견이 있으나 Hard Issue 확정에 필요한 근거가 부족합니다." : "아직 확인이 필요합니다.",
        nextAction: action,
      });
      nextActions.push(action);
    }
  }

  return { hardIssues, conditionalIssues, unresolvedChecks, verifiedCount, nextActions };
}
