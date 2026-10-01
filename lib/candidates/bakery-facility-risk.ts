import {
  BAKERY_FACILITY_CHECK_KEYS,
  BAKERY_FACILITY_CHECK_LABELS,
  type BakeryFacilityAssessment,
  type BakeryFacilityCheck,
  type BakeryFacilityCheckKey,
} from "./bakery-facility-assessment-contract";

export interface FacilityRiskItem {
  key: BakeryFacilityCheckKey;
  label: string;
  reason: string;
  nextAction?: string;
}

export interface FacilityRiskSummary {
  hardBlockers: FacilityRiskItem[];
  conditionalBlockers: FacilityRiskItem[];
  unresolvedChecks: FacilityRiskItem[];
  verifiedCount: number;
  nextActions: string[];
}

const PHYSICAL_HARD_BLOCKERS = new Set<BakeryFacilityCheckKey>([
  "electricity",
  "waterSupply",
  "drainage",
  "exhaust",
  "equipmentIngress",
  "manufacturingSpace",
]);

const HARD_REASONS: Partial<Record<BakeryFacilityCheckKey, string>> = {
  electricity: "필요 전력 확보가 불가능한 것으로 확인됐습니다.",
  waterSupply: "필수 급수 확보가 불가능한 것으로 확인됐습니다.",
  drainage: "필수 배수 확보가 불가능한 것으로 확인됐습니다.",
  exhaust: "제조형 베이커리에 필요한 배기가 불가능한 것으로 확인됐습니다.",
  landlordConsent: "필수 시설공사에 대한 임대인·관리주체의 거절이 확인됐습니다.",
  equipmentIngress: "핵심 장비 반입이 물리적으로 불가능한 것으로 확인됐습니다.",
  manufacturingSpace: "필요한 제조공간 확보가 불가능한 것으로 확인됐습니다.",
  buildingUsePermit: "전문가·관할기관 확인 결과 목표 업종 사용이 불가능합니다.",
};

function isHardBlocker(key: BakeryFacilityCheckKey, check: BakeryFacilityCheck) {
  if (check.state !== "NOT_FEASIBLE" || check.verificationStatus !== "VERIFIED") return false;
  if (PHYSICAL_HARD_BLOCKERS.has(key)) return true;
  if (key === "landlordConsent") return check.sourceType === "LANDLORD" || check.sourceType === "DOCUMENT";
  if (key === "buildingUsePermit") return check.sourceType === "EXPERT" || check.sourceType === "AUTHORITY";
  return false;
}

function nextAction(key: BakeryFacilityCheckKey, check: BakeryFacilityCheck | undefined) {
  const label = BAKERY_FACILITY_CHECK_LABELS[key];
  switch (check?.verificationStatus) {
    case "LANDLORD_CONFIRM_REQUIRED": return `${label}: 임대인·관리주체 서면 확인`;
    case "EXPERT_CONFIRM_REQUIRED": return `${label}: 전문가 확인`;
    case "AUTHORITY_CONFIRM_REQUIRED": return `${label}: 관할기관 확인`;
    case "FIELD_CHECK_REQUIRED": return `${label}: 현장 확인`;
    default: return `${label}: 확인자료 확보`;
  }
}

function isSubstantivelyVerified(key: BakeryFacilityCheckKey, check: BakeryFacilityCheck | undefined) {
  if (!check || check.state === "UNKNOWN" || check.verificationStatus !== "VERIFIED") return false;
  if (key === "landlordConsent" && check.state === "NOT_FEASIBLE") {
    return check.sourceType === "LANDLORD" || check.sourceType === "DOCUMENT";
  }
  if (key === "buildingUsePermit" && check.state === "NOT_FEASIBLE") {
    return check.sourceType === "EXPERT" || check.sourceType === "AUTHORITY";
  }
  return true;
}

export function calculateBakeryFacilityRiskSummary(
  assessment: Pick<BakeryFacilityAssessment, "checks"> | null | undefined,
): FacilityRiskSummary {
  const hardBlockers: FacilityRiskItem[] = [];
  const conditionalBlockers: FacilityRiskItem[] = [];
  const unresolvedChecks: FacilityRiskItem[] = [];
  const nextActions: string[] = [];
  let verifiedCount = 0;

  for (const key of BAKERY_FACILITY_CHECK_KEYS) {
    const check = assessment?.checks[key];
    const label = BAKERY_FACILITY_CHECK_LABELS[key];
    const verified = isSubstantivelyVerified(key, check);
    if (verified) verifiedCount += 1;
    if (check && isHardBlocker(key, check)) {
      hardBlockers.push({ key, label, reason: HARD_REASONS[key] ?? `${label}이 불가능한 것으로 확인됐습니다.` });
      continue;
    }
    if (check?.state === "CONDITIONAL") {
      const action = verified ? undefined : nextAction(key, check);
      conditionalBlockers.push({
        key,
        label,
        reason: check.note ?? "계약 전에 조건 해소가 필요합니다.",
        ...(action ? { nextAction: action } : {}),
      });
      if (action) nextActions.push(action);
      continue;
    }
    if (!verified || check?.state === "NOT_FEASIBLE") {
      const action = nextAction(key, check);
      unresolvedChecks.push({
        key,
        label,
        reason: check?.state === "NOT_FEASIBLE"
          ? "불가 의견이 있으나 Hard Blocker 확정에 필요한 근거가 부족합니다."
          : "아직 확인이 필요합니다.",
        nextAction: action,
      });
      nextActions.push(action);
    }
  }

  return {
    hardBlockers,
    conditionalBlockers,
    unresolvedChecks,
    verifiedCount,
    nextActions,
  };
}
