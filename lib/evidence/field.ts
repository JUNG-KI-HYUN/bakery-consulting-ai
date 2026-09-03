import type { Evidence } from "./types";

/** fieldPath가 정확히 같은 근거만 원본 순서로 반환한다. 경로 추론·정규화·상태 변경은 하지 않는다. */
export function getEvidenceForField(
  evidence: readonly Evidence[] | undefined,
  fieldPath: string,
): Evidence[] {
  if (fieldPath === "") return [];
  return evidence?.filter((item) => item.fieldPath === fieldPath) ?? [];
}
