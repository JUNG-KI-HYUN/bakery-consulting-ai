import type { BasicLocationResult } from "./results";

export const BASIC_LOCATION_RESULT_GROUP_ORDER = [
  "target",
  "frameone",
  "blocked",
  "kakao",
  "officialRelation",
  "officialStats",
  "demand",
] as const;

export type BasicLocationResultGroupName =
  (typeof BASIC_LOCATION_RESULT_GROUP_ORDER)[number];

export type BasicLocationResultGroups = Readonly<
  Record<BasicLocationResultGroupName, readonly BasicLocationResult[]>
>;

export interface CollectBasicLocationResultsInput {
  analysisRunId: string;
  resultGroups: BasicLocationResultGroups;
}

export class BasicLocationResultCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasicLocationResultCollectionError";
  }
}

function requireNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BasicLocationResultCollectionError(`${path}가 비어 있습니다.`);
  }
}

export function collectBasicLocationResults(
  input: CollectBasicLocationResultsInput,
): readonly BasicLocationResult[] {
  requireNonEmptyString(input.analysisRunId, "analysisRunId");

  const collected: BasicLocationResult[] = [];
  const seenResultIds = new Set<string>();

  for (const groupName of BASIC_LOCATION_RESULT_GROUP_ORDER) {
    const group = input.resultGroups[groupName];
    if (!Array.isArray(group)) {
      throw new BasicLocationResultCollectionError(
        `resultGroups.${groupName}은 Result 배열이어야 합니다.`,
      );
    }

    for (const result of group) {
      if (!result || typeof result !== "object") {
        throw new BasicLocationResultCollectionError(
          `resultGroups.${groupName}에 올바르지 않은 Result가 있습니다.`,
        );
      }
      requireNonEmptyString(result.analysisRunId, `${groupName}.analysisRunId`);
      requireNonEmptyString(result.resultId, `${groupName}.resultId`);

      if (result.analysisRunId !== input.analysisRunId) {
        throw new BasicLocationResultCollectionError(
          `Result analysisRunId가 expected analysisRunId와 일치하지 않습니다: ${result.resultId}`,
        );
      }
      if (seenResultIds.has(result.resultId)) {
        throw new BasicLocationResultCollectionError(
          `동일한 resultId가 Result Set에 중복되었습니다: ${result.resultId}`,
        );
      }

      seenResultIds.add(result.resultId);
      collected.push(result);
    }
  }

  return Object.freeze(collected);
}
