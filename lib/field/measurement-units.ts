/**
 * UI m 단위 ↔ Domain mm 정수 변환.
 * React 컴포넌트에서 ×1000을 반복하지 않는다.
 * 최종 저장은 양의 유한 정수 mm만 허용한다. 0과 UNKNOWN은 구분한다.
 */

export type MeterInputParseResult =
  | { readonly ok: true; readonly mm: number }
  | { readonly ok: false; readonly reason: "EMPTY" | "INVALID" | "NON_POSITIVE" | "NON_FINITE" };

/** "5.8", "5,8", " 1.25 " 등을 mm로 변환한다. 빈 문자열은 EMPTY. */
export function metersInputToMm(raw: string): MeterInputParseResult {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return { ok: false, reason: "EMPTY" };
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { ok: false, reason: "INVALID" };
  const meters = Number(trimmed);
  if (!Number.isFinite(meters)) return { ok: false, reason: "NON_FINITE" };
  if (meters <= 0) return { ok: false, reason: "NON_POSITIVE" };
  // 부동 오차로 5.8*1000이 5799.999가 되지 않도록 반올림한다.
  const mm = Math.round(meters * 1000);
  if (!Number.isInteger(mm) || mm <= 0) return { ok: false, reason: "INVALID" };
  return { ok: true, mm };
}

export function mmToMetersInput(mm: number): string {
  if (!Number.isFinite(mm) || !Number.isInteger(mm) || mm <= 0) {
    throw new RangeError("mmToMetersInput requires a positive integer mm");
  }
  const meters = mm / 1000;
  return Number.isInteger(meters) ? String(meters) : String(Number(meters.toFixed(3)));
}

export function isValidKnownMm(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}
