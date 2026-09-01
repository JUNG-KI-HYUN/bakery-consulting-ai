import type { ParsedMetricValue } from "./types";

export function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function parseMetricValue(
  value: unknown,
  suppressedMarkers: readonly string[] = [],
): ParsedMetricValue {
  if (value === null || value === undefined) {
    return { value: null, dataStatus: "missing" };
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (text.length === 0) {
      return { value: null, dataStatus: "missing" };
    }
    if (suppressedMarkers.includes(text)) {
      return { value: null, dataStatus: "suppressed" };
    }

    const parsed = Number(text);
    return Number.isFinite(parsed)
      ? { value: parsed, dataStatus: "available" }
      : { value: null, dataStatus: "invalid" };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, dataStatus: "available" };
  }

  return { value: null, dataStatus: "invalid" };
}

export function invalidateMetricValue(
  parsed: ParsedMetricValue,
  contextIsValid: boolean,
): ParsedMetricValue {
  return contextIsValid
    ? parsed
    : {
        value: null,
        dataStatus: "invalid",
      };
}
