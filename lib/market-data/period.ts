export interface ValidPeriod {
  status: "valid";
  referencePeriod: string;
  rawValue: string;
}

export interface InvalidPeriod {
  status: "invalid";
  referencePeriod: null;
  rawValue: string | null;
  reason: string;
}

export type PeriodParseResult = ValidPeriod | InvalidPeriod;

function rawText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function parseSeoulQuarterCode(value: unknown): PeriodParseResult {
  const rawValue = rawText(value);
  if (!rawValue) {
    return {
      status: "invalid",
      referencePeriod: null,
      rawValue,
      reason: "분기 코드가 없습니다.",
    };
  }

  const match = /^(\d{4})([1-4])$/.exec(rawValue);
  if (!match) {
    return {
      status: "invalid",
      referencePeriod: null,
      rawValue,
      reason: "분기 코드는 YYYYQ 형식이며 Q는 1~4여야 합니다.",
    };
  }

  return {
    status: "valid",
    referencePeriod: `${match[1]}-Q${match[2]}`,
    rawValue,
  };
}

export function parseSeoulLivingPeriod(
  rawDateValue: unknown,
  rawHourValue: unknown,
): PeriodParseResult {
  const rawDate = rawText(rawDateValue);
  const rawHour = rawText(rawHourValue);
  const rawValue =
    rawDate === null && rawHour === null
      ? null
      : `${rawDate ?? ""} ${rawHour ?? ""}`.trim();

  if (!rawDate || !/^\d{8}$/.test(rawDate)) {
    return {
      status: "invalid",
      referencePeriod: null,
      rawValue,
      reason: "생활인구 일자는 YYYYMMDD 형식이어야 합니다.",
    };
  }

  if (!rawHour || !/^(?:[01]\d|2[0-3])$/.test(rawHour)) {
    return {
      status: "invalid",
      referencePeriod: null,
      rawValue,
      reason: "생활인구 시간은 00~23의 두 자리 값이어야 합니다.",
    };
  }

  const year = Number(rawDate.slice(0, 4));
  const month = Number(rawDate.slice(4, 6));
  const day = Number(rawDate.slice(6, 8));
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const validCalendarDate =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;

  if (!validCalendarDate) {
    return {
      status: "invalid",
      referencePeriod: null,
      rawValue,
      reason: "생활인구 일자가 유효한 달력 날짜가 아닙니다.",
    };
  }

  return {
    status: "valid",
    referencePeriod: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${rawHour}:00`,
    rawValue: `${rawDate} ${rawHour}`,
  };
}
