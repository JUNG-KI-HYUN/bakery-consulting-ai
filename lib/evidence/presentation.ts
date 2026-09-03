import type { Evidence, EvidenceSourceType, EvidenceValue, VerificationStatus } from "./types";

const verificationLabels: Record<VerificationStatus, string> = {
  VERIFIED: "확인됨",
  ESTIMATED: "추정",
  UNKNOWN: "미확인",
  CONFLICTED: "정보 상충",
  STALE: "재확인 필요",
};

const sourceLabels: Record<EvidenceSourceType, string> = {
  DOCUMENT: "문서",
  FIELD_CHECK: "현장 확인",
  PHOTO: "사진",
  OWNER_STATEMENT: "임대인 진술",
  TENANT_STATEMENT: "임차인 진술",
  EXPERT_STATEMENT: "전문가 확인/진술",
  PUBLIC_DATA: "공공데이터",
  SYSTEM_CALCULATION: "시스템 계산",
  CUSTOMER_INPUT: "고객 입력",
};

export function getVerificationLabel(status: VerificationStatus): string {
  return verificationLabels[status];
}

export function getEvidenceSourceLabel(source: EvidenceSourceType): string {
  return sourceLabels[source];
}

export function getEvidenceValueTypeLabel(valueType: Evidence["valueType"]): string | undefined {
  if (valueType === "actual") return "실제값";
  if (valueType === "estimated") return "추정값";
  return undefined;
}

export function formatEvidenceValue(value: EvidenceValue | undefined): string {
  if (value === undefined) return "값 미기록";
  if (value === null) return "값 없음 (null)";
  if (typeof value === "boolean") return value ? "참 (true)" : "거짓 (false)";
  if (typeof value === "string") return value === "" ? "빈 문자열" : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "수치 확인 필요";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "값을 표시할 수 없습니다.";
  }
}

/** 원문의 날짜·시각·offset을 유지한다. 브라우저/서버의 현지 시간대로 변환하지 않는다. */
export function formatEvidenceTimestamp(value: string | undefined): string {
  if (value === undefined || value.trim() === "") return "날짜 미기록";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match) return "날짜 확인 필요";
  const [, year, month, day, hour, minute, second, fraction, offset] = match;
  const numericYear = Number(year);
  const leapYear = numericYear % 4 === 0 && (numericYear % 100 !== 0 || numericYear % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    Number(month) < 1 || Number(month) > 12 || Number(day) < 1 ||
    Number(day) > daysInMonth[Number(month) - 1] ||
    (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59)) ||
    (offset && offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))
  ) return "날짜 확인 필요";
  const date = `${year}.${month}.${day}`;
  if (hour === undefined) return date;
  const time = `${hour}:${minute}${second === undefined ? "" : `:${second}${fraction ?? ""}`}`;
  const zone = offset === undefined ? "시간대 미지정" : offset === "Z" ? "UTC" : `UTC${offset}`;
  return `${date} ${time} (${zone})`;
}

export function getEvidenceSourceHref(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}
