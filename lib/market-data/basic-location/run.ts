export type BasicLocationRadiusMeters = 300 | 500;

export type AnalysisResultStatus = "CURRENT" | "STALE" | "NOT_RUN";

export interface ActiveOfficialMarketReference {
  marketCode: string;
  marketName: string;
  spatialRelation: "INSIDE" | "RADIUS_OVERLAP";
  selectionMethod: "AUTO_SINGLE_CANDIDATE" | "MANUAL";
  selectedAt: string;
}

export interface ActiveAnalysisTarget {
  schemaVersion: "active-analysis-target-v2";
  /** Canonical identity. targetKey is a compatibility alias, never a second ID. */
  analysisRunId: string;
  targetKey: string;
  label: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: BasicLocationRadiusMeters;
  source: "address" | "map" | "candidate_store";
  explorationSnapshot: Readonly<{
    marketId: string | null;
    marketName: string | null;
    submarketId: string | null;
    submarketName: string | null;
    nodeId: string | null;
    nodeName: string | null;
  }>;
  officialReference: ActiveOfficialMarketReference | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveAnalysisTargetInput {
  analysis: {
    label?: string | null;
    address?: string | null;
    latitude: number;
    longitude: number;
    radiusM: BasicLocationRadiusMeters;
    source: ActiveAnalysisTarget["source"];
  };
  explorationSnapshot?: Partial<ActiveAnalysisTarget["explorationSnapshot"]> | null;
  officialReference?: ActiveOfficialMarketReference | null;
}

export interface AnalysisRunSnapshotInput {
  target: {
    source: "address" | "map";
    confirmedAddress: string | null;
    latitude: number;
    longitude: number;
    radiusMeters: BasicLocationRadiusMeters;
  };
  frameone: {
    districtId?: string | null;
    districtName?: string | null;
    marketId: string;
    marketName: string;
    submarketId?: string | null;
    submarketName?: string | null;
    nodeId?: string | null;
    nodeName?: string | null;
  };
}

export interface AnalysisRunSnapshot {
  analysisRunId: string;
  createdAt: string;
  target: Readonly<AnalysisRunSnapshotInput["target"]>;
  frameone: Readonly<{
    districtId: string | null;
    districtName: string | null;
    marketId: string;
    marketName: string;
    submarketId: string | null;
    submarketName: string | null;
    nodeId: string | null;
    nodeName: string | null;
  }>;
}

export interface AnalysisRunRuntime {
  randomUUID?: () => string;
  now?: () => Date;
}

function normalizedExplorationSnapshot(
  value: ActiveAnalysisTargetInput["explorationSnapshot"],
): ActiveAnalysisTarget["explorationSnapshot"] {
  return {
    marketId: value?.marketId?.trim() || null,
    marketName: value?.marketName?.trim() || null,
    submarketId: value?.submarketId?.trim() || null,
    submarketName: value?.submarketName?.trim() || null,
    nodeId: value?.nodeId?.trim() || null,
    nodeName: value?.nodeName?.trim() || null,
  };
}

export class AnalysisRunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisRunValidationError";
  }
}

function requireNonEmpty(value: string, path: string) {
  if (value.trim().length === 0) {
    throw new AnalysisRunValidationError(`${path}가 비어 있습니다.`);
  }
}

function requireOptionalPair(id: string | null, name: string | null, path: string) {
  if ((id === null) !== (name === null)) {
    throw new AnalysisRunValidationError(`${path} ID와 이름은 함께 있어야 합니다.`);
  }
  if (id !== null) requireNonEmpty(id, `${path}Id`);
  if (name !== null) requireNonEmpty(name, `${path}Name`);
}

function defaultRandomUUID() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new AnalysisRunValidationError("안전한 UUID 생성기를 사용할 수 없습니다.");
  }
  return globalThis.crypto.randomUUID();
}

export function createAnalysisRunId(randomUUID: () => string = defaultRandomUUID) {
  const uuid = randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new AnalysisRunValidationError("UUID 생성 결과가 올바르지 않습니다.");
  }
  return `basic-location-run:${uuid.toLowerCase()}`;
}

export function createActiveAnalysisTarget(
  input: ActiveAnalysisTargetInput,
  runtime: AnalysisRunRuntime = {},
): ActiveAnalysisTarget {
  const { latitude, longitude, radiusM } = input.analysis;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new AnalysisRunValidationError("latitude가 유효한 범위가 아닙니다.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new AnalysisRunValidationError("longitude가 유효한 범위가 아닙니다.");
  }
  if (radiusM !== 300 && radiusM !== 500) {
    throw new AnalysisRunValidationError("radiusM은 300 또는 500이어야 합니다.");
  }
  const analysisRunId = createAnalysisRunId(runtime.randomUUID);
  const now = (runtime.now ?? (() => new Date()))().toISOString();
  const target: ActiveAnalysisTarget = {
    schemaVersion: "active-analysis-target-v2",
    analysisRunId,
    targetKey: analysisRunId,
    label: input.analysis.label?.trim() || input.analysis.address?.trim() || null,
    address: input.analysis.address?.trim() || null,
    latitude,
    longitude,
    radiusM,
    source: input.analysis.source,
    explorationSnapshot: normalizedExplorationSnapshot(input.explorationSnapshot),
    officialReference: input.officialReference ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return Object.freeze({
    ...target,
    explorationSnapshot: Object.freeze({ ...target.explorationSnapshot }),
    officialReference: target.officialReference
      ? Object.freeze({ ...target.officialReference })
      : null,
  });
}

export function activeAnalysisTargetFromRunSnapshot(
  snapshot: AnalysisRunSnapshot,
  officialReference: ActiveOfficialMarketReference | null = null,
): ActiveAnalysisTarget {
  return Object.freeze({
    schemaVersion: "active-analysis-target-v2",
    analysisRunId: snapshot.analysisRunId,
    targetKey: snapshot.analysisRunId,
    label: snapshot.target.confirmedAddress,
    address: snapshot.target.confirmedAddress,
    latitude: snapshot.target.latitude,
    longitude: snapshot.target.longitude,
    radiusM: snapshot.target.radiusMeters,
    source: snapshot.target.source,
    explorationSnapshot: Object.freeze({
      marketId: snapshot.frameone.marketId,
      marketName: snapshot.frameone.marketName,
      submarketId: snapshot.frameone.submarketId,
      submarketName: snapshot.frameone.submarketName,
      nodeId: snapshot.frameone.nodeId,
      nodeName: snapshot.frameone.nodeName,
    }),
    officialReference: officialReference
      ? Object.freeze({ ...officialReference })
      : null,
    createdAt: snapshot.createdAt,
    updatedAt: officialReference?.selectedAt ?? snapshot.createdAt,
  });
}

export function analysisResultStatus(
  activeAnalysisRunId: string | null | undefined,
  resultAnalysisRunId: string | null | undefined,
): AnalysisResultStatus {
  if (!resultAnalysisRunId) return "NOT_RUN";
  return activeAnalysisRunId === resultAnalysisRunId ? "CURRENT" : "STALE";
}

export function createAnalysisRunSnapshot(
  input: AnalysisRunSnapshotInput,
  runtime: AnalysisRunRuntime = {},
): AnalysisRunSnapshot {
  const { latitude, longitude, radiusMeters } = input.target;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new AnalysisRunValidationError("latitude가 유효한 범위가 아닙니다.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new AnalysisRunValidationError("longitude가 유효한 범위가 아닙니다.");
  }
  if (radiusMeters !== 300 && radiusMeters !== 500) {
    throw new AnalysisRunValidationError("radiusMeters는 300 또는 500이어야 합니다.");
  }

  requireNonEmpty(input.frameone.marketId, "marketId");
  requireNonEmpty(input.frameone.marketName, "marketName");
  const districtId = input.frameone.districtId ?? null;
  const districtName = input.frameone.districtName ?? null;
  const submarketId = input.frameone.submarketId ?? null;
  const submarketName = input.frameone.submarketName ?? null;
  const nodeId = input.frameone.nodeId ?? null;
  const nodeName = input.frameone.nodeName ?? null;
  requireOptionalPair(districtId, districtName, "district");
  requireOptionalPair(submarketId, submarketName, "submarket");
  requireOptionalPair(nodeId, nodeName, "node");
  if (nodeId !== null && submarketId === null) {
    throw new AnalysisRunValidationError("Node snapshot에는 Submarket이 필요합니다.");
  }

  const createdAt = (runtime.now ?? (() => new Date()))().toISOString();
  const snapshot: AnalysisRunSnapshot = {
    analysisRunId: createAnalysisRunId(runtime.randomUUID),
    createdAt,
    target: {
      source: input.target.source,
      confirmedAddress: input.target.confirmedAddress?.trim() || null,
      latitude,
      longitude,
      radiusMeters,
    },
    frameone: {
      districtId,
      districtName,
      marketId: input.frameone.marketId,
      marketName: input.frameone.marketName,
      submarketId,
      submarketName,
      nodeId,
      nodeName,
    },
  };

  Object.freeze(snapshot.target);
  Object.freeze(snapshot.frameone);
  return Object.freeze(snapshot);
}
