import { getEvidenceForField } from "./field";
import {
  getEvidenceCoveragePolicy,
  type EvidenceCoverageFieldDefinition,
  type EvidenceCoveragePolicyVersion,
} from "./coverage-policy";
import type { Evidence, VerificationStatus } from "./types";

export interface EvidenceCoverageField extends EvidenceCoverageFieldDefinition {
  /** record.evidence 전체 또는 미리 고른 근거. 정확히 일치하는 fieldPath만 계산한다. */
  readonly evidence?: readonly Evidence[];
}

export interface EvidenceCoverageSummary {
  fieldCount: number;
  achievedWeight: number;
  possibleWeight: number;
  /** 0~100 정수, 가장 가까운 정수로 반올림. 분모 0은 0%이며 fieldCount로 구분한다. */
  coveragePercent: number;
}

export interface EvidenceCoverageFieldResult extends EvidenceCoverageFieldDefinition {
  /** null은 일치하는 근거 없음. Evidence의 검증상태를 새로 생성하거나 변경하지 않는다. */
  status: VerificationStatus | null;
  evidenceCount: number;
  coverageWeight: number;
  achievedWeight: number;
  unresolved: boolean;
}

export interface EvidenceCoverageResult {
  policyVersion: EvidenceCoveragePolicyVersion;
  totalCoverage: EvidenceCoverageSummary;
  criticalCoverage: EvidenceCoverageSummary;
  fields: EvidenceCoverageFieldResult[];
  /** 필드별 집계상태. 원본 Evidence 각각의 상태 및 개수와는 다르다. */
  fieldsByStatus: Record<VerificationStatus, string[]>;
  missingEvidenceFields: string[];
  criticalUnresolvedFields: string[];
  /** 핵심 판단자료의 확인 부족만 나타낸다. 계약에 대한 최종 판정이 아니다. */
  hasCriticalUnresolved: boolean;
}

function summarize(fields: readonly EvidenceCoverageFieldResult[]): EvidenceCoverageSummary {
  const possibleWeight = fields.reduce((sum, field) => sum + field.weight, 0);
  const achievedWeight = fields.reduce((sum, field) => sum + field.achievedWeight, 0);
  if (!Number.isFinite(possibleWeight) || !Number.isFinite(achievedWeight)) {
    throw new RangeError("Evidence coverage weight total must be finite");
  }
  return {
    fieldCount: fields.length,
    achievedWeight,
    possibleWeight,
    coveragePercent: possibleWeight === 0 ? 0 : Math.round((achievedWeight / possibleWeight) * 100),
  };
}

/**
 * 동일 field 정의·근거 snapshot과 policyVersion은 항상 동일 결과를 낸다.
 * V1 시설 범위는 getEvidenceCoveragePolicy(version).fields를 사용해 구성한다.
 * 다른 업무 범위를 전달하는 경우에도 field 정의는 재현에 필요한 입력이다.
 * 중복 경로·잘못된 weight·미지원 버전/상태는 오류로 거부하며 임의 보정하지 않는다.
 * checkedAt/expiresAt에 시계를 적용하지 않는다. STALE은 저장된 검증상태만 사용한다.
 * sourceType, valueType, assertedValue를 평가하거나 원본 근거를 수정하지 않는다.
 */
export function calculateEvidenceCoverage(
  fields: readonly EvidenceCoverageField[],
  policyVersion: EvidenceCoveragePolicyVersion,
): EvidenceCoverageResult {
  const policy = getEvidenceCoveragePolicy(policyVersion);
  const seenPaths = new Set<string>();
  const fieldsByStatus: Record<VerificationStatus, string[]> = {
    VERIFIED: [], ESTIMATED: [], UNKNOWN: [], CONFLICTED: [], STALE: [],
  };
  const missingEvidenceFields: string[] = [];
  const criticalUnresolvedFields: string[] = [];

  const fieldResults = fields.map((field): EvidenceCoverageFieldResult => {
    if (field.fieldPath.trim() === "" || seenPaths.has(field.fieldPath)) {
      throw new RangeError("Evidence coverage requires unique, non-empty field paths");
    }
    if (!Number.isFinite(field.weight) || field.weight <= 0) {
      throw new RangeError("Evidence coverage field weight must be positive and finite");
    }
    seenPaths.add(field.fieldPath);

    const matches = getEvidenceForField(field.evidence, field.fieldPath);
    for (const item of matches) {
      if (!Object.hasOwn(policy.statusWeights, item.verificationStatus)) {
        throw new RangeError("Unsupported evidence verification status");
      }
    }
    const status = policy.statusPriority.find(
      (candidate) => matches.some((item) => item.verificationStatus === candidate),
    ) ?? null;
    const coverageWeight = status === null ? 0 : policy.statusWeights[status];
    const unresolved = !policy.resolvedStatuses.some((resolved) => resolved === status);

    if (status === null) missingEvidenceFields.push(field.fieldPath);
    else fieldsByStatus[status].push(field.fieldPath);
    if (field.critical && unresolved) criticalUnresolvedFields.push(field.fieldPath);

    return {
      fieldPath: field.fieldPath,
      label: field.label,
      critical: field.critical,
      weight: field.weight,
      status,
      evidenceCount: matches.length,
      coverageWeight,
      achievedWeight: field.weight * coverageWeight,
      unresolved,
    };
  });

  return {
    policyVersion: policy.policyVersion,
    totalCoverage: summarize(fieldResults),
    criticalCoverage: summarize(fieldResults.filter((field) => field.critical)),
    fields: fieldResults,
    fieldsByStatus,
    missingEvidenceFields,
    criticalUnresolvedFields,
    hasCriticalUnresolved: criticalUnresolvedFields.length > 0,
  };
}
