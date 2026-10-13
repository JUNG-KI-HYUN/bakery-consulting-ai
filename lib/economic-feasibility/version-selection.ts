import {
  sameEconomicVersionIdentity,
  type CandidateEconomicVersionIdentity,
} from "../candidates/candidate-economic-selection-contract";
import type { BoundEconomicResult } from "./workspace-binding";

export const ECONOMIC_VERSION_QUERY_KEYS = {
  analysisRunId: "economicAnalysisRunId",
  generatedAt: "economicGeneratedAt",
  assumptionRevision: "economicAssumptionRevision",
  engineVersion: "economicEngineVersion",
} as const;

export function economicVersionIdentity(version: BoundEconomicResult): CandidateEconomicVersionIdentity {
  return {
    analysisRunId: version.binding.analysisRunId,
    generatedAt: version.generatedAt,
    assumptionRevision: version.binding.assumptionRevision,
    engineVersion: version.result.metadata.engineVersion,
  };
}

export function isValidEconomicVersion(version: BoundEconomicResult) {
  return version.result.validation.errors.length === 0;
}

export function parseEconomicVersionSelection(
  query: Record<string, string | string[] | undefined>,
): CandidateEconomicVersionIdentity | null {
  const value = (key: string) => {
    const item = query[key];
    return Array.isArray(item) ? item[0] : item;
  };
  const analysisRunId = value(ECONOMIC_VERSION_QUERY_KEYS.analysisRunId)?.trim() ?? "";
  const generatedAt = value(ECONOMIC_VERSION_QUERY_KEYS.generatedAt)?.trim() ?? "";
  const revisionText = value(ECONOMIC_VERSION_QUERY_KEYS.assumptionRevision)?.trim() ?? "";
  const engineVersion = value(ECONOMIC_VERSION_QUERY_KEYS.engineVersion)?.trim() ?? "";
  const assumptionRevision = Number(revisionText);
  if (!analysisRunId || !generatedAt || !engineVersion || revisionText === ""
    || !Number.isInteger(assumptionRevision) || assumptionRevision < 0) return null;
  return { analysisRunId, generatedAt, assumptionRevision, engineVersion };
}

export function hasEconomicVersionSelectionQuery(
  query: Record<string, string | string[] | undefined>,
) {
  return Object.values(ECONOMIC_VERSION_QUERY_KEYS).some((key) => query[key] !== undefined);
}

export function resolveEconomicWorkspaceVersion(
  versions: BoundEconomicResult[],
  requested: CandidateEconomicVersionIdentity | null,
): { selected: BoundEconomicResult | null; selectionRequired: boolean; explicit: boolean } {
  if (requested) {
    const exact = versions.find((version) => sameEconomicVersionIdentity(economicVersionIdentity(version), requested));
    return {
      selected: exact && isValidEconomicVersion(exact) ? exact : null,
      selectionRequired: !exact || !isValidEconomicVersion(exact),
      explicit: true,
    };
  }
  const latest = versions.at(-1) ?? null;
  return {
    selected: latest && isValidEconomicVersion(latest) ? latest : null,
    selectionRequired: Boolean(latest && !isValidEconomicVersion(latest)),
    explicit: false,
  };
}

function queryEntries(query: Record<string, string | string[] | undefined>) {
  const entries: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(query)) {
    for (const value of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) entries.push([key, value]);
  }
  return entries;
}

export function economicVersionHref(
  pathname: string,
  query: Record<string, string | string[] | undefined>,
  identity: CandidateEconomicVersionIdentity | null,
) {
  const params = new URLSearchParams(queryEntries(query));
  for (const key of Object.values(ECONOMIC_VERSION_QUERY_KEYS)) params.delete(key);
  if (identity) {
    params.set(ECONOMIC_VERSION_QUERY_KEYS.analysisRunId, identity.analysisRunId);
    params.set(ECONOMIC_VERSION_QUERY_KEYS.generatedAt, identity.generatedAt);
    params.set(ECONOMIC_VERSION_QUERY_KEYS.assumptionRevision, String(identity.assumptionRevision));
    params.set(ECONOMIC_VERSION_QUERY_KEYS.engineVersion, identity.engineVersion);
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
