import type { ReportPresetV1 } from "./contracts";

export const CUSTOMER_CONFIRMATION_REQUIRED = "확인 필요" as const;

export type IndustryMetricSemantic = "COMPETITOR_LOCATION_COUNT" | "RELATED_BUSINESS_COUNT";

type ReportTerminology = ReportPresetV1["terminology"];

const lifecycleLabels: Readonly<Record<string, string>> = Object.freeze({
  DISCOVERED: "추가 확인 필요",
  FIELD_REVIEWED: "추가 확인 필요",
  KEEP: "검토 유지",
  REVIEW: "추가 확인 필요",
  SHORTLIST: "우선 검토",
  HOLD: "보류",
  DROP: "제외",
});

const availabilityLabels: Readonly<Record<string, string>> = Object.freeze({
  AVAILABLE: "확인됨",
  VERIFIED: "확인됨",
  READY: "확인됨",
  PARTIAL: "일부 확인",
  REVIEW: "추가 확인 필요",
  REVIEW_REQUIRED: "추가 확인 필요",
  UNKNOWN: CUSTOMER_CONFIRMATION_REQUIRED,
  UNAVAILABLE: CUSTOMER_CONFIRMATION_REQUIRED,
  MISSING: CUSTOMER_CONFIRMATION_REQUIRED,
});

const sourceLabels: Readonly<Record<string, string>> = Object.freeze({
  USER_PROVIDED: "사용자 제공 자료",
  USER_PROVIDED_LOCATION_MAP: "사용자 제공 위치표시 지도",
  PUBLIC_DATA: "공공데이터",
  FIELD_CHECK: "현장조사",
  PHOTO: "현장사진",
  DOCUMENT: "문서자료",
  CUSTOMER_INPUT: "고객 제공 자료",
  OWNER_STATEMENT: "소유자 진술",
  TENANT_STATEMENT: "임차인 진술",
  EXPERT_STATEMENT: "전문가 확인",
  SYSTEM_CALCULATION: "시스템 계산",
});

const timeCodeLabels: Readonly<Record<string, string>> = Object.freeze({
  MORNING: "오전",
  LUNCH: "점심시간",
  AFTERNOON: "오후",
  EVENING: "저녁",
  NIGHT: "야간",
});

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
export function formatGenderForCustomer(value: string | null | undefined): string {
  const normalized = clean(value);
  if (!normalized || /^(?:UNKNOWN|UNAVAILABLE|NULL)$/iu.test(normalized)) return CUSTOMER_CONFIRMATION_REQUIRED;
  const match = normalized.match(/^(female|male|여성|남성)(?:\s*·\s*(\d{1,3}대\+?))?$/iu);
  if (!match) return CUSTOMER_CONFIRMATION_REQUIRED;
  const gender = /^(?:female|여성)$/iu.test(match[1]) ? "여성" : "남성";
  if (match[2]) return `${gender} · ${match[2]}`;
  return gender;
}
export function formatTimeForCustomer(value: string | null | undefined): string {
  const normalized = clean(value);
  if (!normalized || /^(?:UNKNOWN|UNAVAILABLE|NULL)$/iu.test(normalized)) return CUSTOMER_CONFIRMATION_REQUIRED;
  const range = normalized.match(/^(\d{1,2})\s*(?:~|～|-)\s*(\d{1,2})\s*(?:시)?$/u);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start >= 0 && start <= 24 && end >= 0 && end <= 24) return `${start}~${end}시`;
  }
  return timeCodeLabels[normalized.toUpperCase()] ?? CUSTOMER_CONFIRMATION_REQUIRED;
}
export function formatLifecycleForCustomer(value: string | null | undefined): string {
  const normalized = clean(value).toUpperCase();
  return lifecycleLabels[normalized] ?? CUSTOMER_CONFIRMATION_REQUIRED;
}
export function formatAvailabilityForCustomer(value: string | null | undefined): string {
  const normalized = clean(value).toUpperCase();
  return availabilityLabels[normalized] ?? CUSTOMER_CONFIRMATION_REQUIRED;
}
export function formatSourceForCustomer(value: string | null | undefined): string {
  const normalized = clean(value).toUpperCase();
  return sourceLabels[normalized] ?? CUSTOMER_CONFIRMATION_REQUIRED;
}
export function formatIndustryMetricForCustomer(
  count: number | null | undefined,
  terminology: ReportTerminology,
  semantic: IndustryMetricSemantic,
) {
  const label = semantic === "COMPETITOR_LOCATION_COUNT" ? terminology.competitor : "관련 업종";
  const value = formatCountForCustomer(count, "곳");
  return Object.freeze({ label, value });
}
export function formatCountForCustomer(
  value: number | null | undefined,
  unit: "곳" | "세대" | "명" | "건" | "개소",
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("ko-KR")}${unit}`
    : CUSTOMER_CONFIRMATION_REQUIRED;
}
export function formatFieldSummaryForCustomer(
  status: string | null | undefined,
  approvedContent: string | null | undefined,
): string {
  const normalizedStatus = clean(status).toUpperCase();
  const content = clean(approvedContent);
  if (normalizedStatus === "APPROVED") return content || "현장 검토내용 확인 필요";
  if (normalizedStatus === "DRAFT" || normalizedStatus === "REVIEWED") return "현장 검토내용 정리 중";
  return "현장 검토내용 확인 필요";
}
