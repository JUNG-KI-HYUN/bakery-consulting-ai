/**
 * SPACE FIT Geometry → Decision Evidence.
 * OVERLAP/OUT_OF_BOUNDS를 Risk/Verdict로 변환하지 않는다.
 * Geometry는 geometryIssues에만 넣고 observedConstraints에 중복하지 않는다.
 */

import type { GeometryWarning } from "../space-fit/geometry";
import { createDecisionEvidenceItem } from "./helpers";
import type { DecisionEvidenceItem } from "./types";

export function buildGeometryDecisionEvidence(
  warnings: readonly GeometryWarning[],
): {
  readonly geometryIssues: readonly DecisionEvidenceItem[];
} {
  const geometryIssues: DecisionEvidenceItem[] = [];
  for (const warning of warnings) {
    const target = warning.elementId ?? "layout";
    const other = warning.otherElementId ? `↔${warning.otherElementId}` : "";
    geometryIssues.push(
      createDecisionEvidenceItem({
        sourceDomain: "SPACE_FIT",
        bucket: "GEOMETRY_ISSUE",
        category: "GEOMETRY",
        key: `${warning.code}:${target}:${warning.otherElementId ?? ""}`,
        title: `Geometry ${warning.code}`,
        description: `${warning.message}${other ? ` (${target}${other})` : warning.elementId ? ` (${target})` : ""}`,
        importance: warning.code === "INVALID_GEOMETRY" ? "CORE" : "SUPPORTING",
        sourceRef: {
          elementId: warning.elementId,
          otherElementId: warning.otherElementId,
          warningCode: warning.code,
        },
      }),
    );
  }
  return Object.freeze({
    geometryIssues: Object.freeze(geometryIssues),
  });
}
