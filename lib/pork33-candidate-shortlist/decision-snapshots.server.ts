import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadPork33BriefingAssetInputs } from "./briefing-assets.server";
import type { Pork33Sbiz365SnapshotV1 } from "./briefing-report";
import { createSanitizedPork33Sbiz365Snapshots } from "./sanitized-sbiz-fixture";
import { isPork33PrivateState } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

type BriefingManifest = {
  schemaVersion?: string;
  batchId?: string;
  generatedAt?: string;
  allPdfCount?: number;
  regionPdfCount?: number;
  candidatePdfCount?: number;
  failed?: unknown[];
};

export type Pork33DecisionServerInputs = Awaited<ReturnType<typeof loadPork33BriefingAssetInputs>> & {
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>;
  sbizSnapshotSourceBatchId: string;
};

function briefingOutputRoot(rootDir?: string) {
  return rootDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "output", "pork33-briefing");
}

function privateSnapshotPath(filePath?: string) {
  return filePath ?? path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "pork33-candidate-shortlist",
    "private",
    "SBIZ365_SNAPSHOTS.json",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown, field: string) {
  if (value === null || typeof value === "string") return value;
  throw new Error(`${field}는 string 또는 null이어야 합니다.`);
}

function nullableNumber(value: unknown, field: string) {
  if (value === null || (typeof value === "number" && Number.isFinite(value))) return value;
  throw new Error(`${field}는 number 또는 null이어야 합니다.`);
}

function parseSnapshot(value: unknown): Pork33Sbiz365SnapshotV1 {
  if (!isRecord(value)) throw new Error("SBIZ365 Snapshot은 객체여야 합니다.");
  if (value.schemaVersion !== "frameone.pork33-sbiz365-candidate-snapshot.v1") throw new Error("SBIZ365 Snapshot schemaVersion이 올바르지 않습니다.");
  if (typeof value.candidateId !== "string" || !/^P33-\d{3}$/u.test(value.candidateId)) throw new Error("SBIZ365 Candidate ID가 올바르지 않습니다.");
  if (typeof value.sourceFileName !== "string" || value.sourceFileName.trim() === "") throw new Error(`${value.candidateId} sourceFileName이 없습니다.`);
  if (!(new Set(["MATCHED", "USER_CONFIRMED_OVERRIDE", "REVIEW_REQUIRED"])).has(value.addressVerification as string)) throw new Error(`${value.candidateId} addressVerification이 올바르지 않습니다.`);
  if (value.analysisRadiusMeters !== 500) throw new Error(`${value.candidateId} analysisRadiusMeters가 500이 아닙니다.`);
  if (value.radiusSource !== "USER_PROVIDED") throw new Error(`${value.candidateId} radiusSource가 USER_PROVIDED가 아닙니다.`);
  if (typeof value.extractionStatus !== "string" || value.extractionStatus.trim() === "") throw new Error(`${value.candidateId} extractionStatus가 없습니다.`);
  return {
    schemaVersion: "frameone.pork33-sbiz365-candidate-snapshot.v1",
    candidateId: value.candidateId,
    sourceFileName: value.sourceFileName,
    addressVerification: value.addressVerification as Pork33Sbiz365SnapshotV1["addressVerification"],
    analysisRadiusMeters: nullableNumber(value.analysisRadiusMeters, "analysisRadiusMeters"),
    radiusSource: "USER_PROVIDED",
    analysisDate: nullableString(value.analysisDate, "analysisDate"),
    peakFloatingTime: nullableString(value.peakFloatingTime, "peakFloatingTime"),
    peakGenderAge: nullableString(value.peakGenderAge, "peakGenderAge"),
    meatShopCount: nullableNumber(value.meatShopCount, "meatShopCount"),
    householdCount: nullableNumber(value.householdCount, "householdCount"),
    residentialPopulation: nullableNumber(value.residentialPopulation, "residentialPopulation"),
    extractionStatus: value.extractionStatus,
  };
}

function validCompletedManifest(value: unknown): value is BriefingManifest & { batchId: string; generatedAt: string } {
  if (!isRecord(value)) return false;
  return value.schemaVersion === "frameone.pork33-briefing-batch.v1"
    && typeof value.batchId === "string"
    && typeof value.generatedAt === "string"
    && value.allPdfCount === 1
    && value.regionPdfCount === 5
    && value.candidatePdfCount === 27
    && Array.isArray(value.failed)
    && value.failed.length === 0;
}

function validateSnapshotSet(
  state: Pork33ShortlistStateV1,
  raw: unknown,
): Record<string, Pork33Sbiz365SnapshotV1> {
  if (!Array.isArray(raw)) throw new Error("SBIZ365_SNAPSHOTS.json은 배열이어야 합니다.");
  const snapshots = raw.map(parseSnapshot);
  const expectedIds = state.candidates.map((candidate) => candidate.identity.displayCode).sort();
  const actualIds = snapshots.map((snapshot) => snapshot.candidateId).sort();
  if (new Set(actualIds).size !== actualIds.length) throw new Error("SBIZ365 Snapshot Candidate ID가 중복되었습니다.");
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error("SBIZ365 Snapshot Candidate 집합이 현재 PORK33 Candidate와 일치하지 않습니다.");
  const p33022 = snapshots.find((snapshot) => snapshot.candidateId === "P33-022");
  if (p33022?.addressVerification !== "USER_CONFIRMED_OVERRIDE") throw new Error("P33-022 SBIZ365 Snapshot은 USER_CONFIRMED_OVERRIDE여야 합니다.");
  return Object.fromEntries(snapshots.map((snapshot) => [snapshot.candidateId, snapshot]));
}

export async function loadLatestPork33Sbiz365Snapshots(
  state: Pork33ShortlistStateV1,
  rootDir?: string,
  provisionedSnapshotPath?: string,
): Promise<{ batchId: string; byCandidateId: Record<string, Pork33Sbiz365SnapshotV1> }> {
  if (!isPork33PrivateState(state)) {
    const snapshots = createSanitizedPork33Sbiz365Snapshots(
      state.candidates.map((candidate) => candidate.identity.displayCode),
    );
    return {
      batchId: "sanitized-fixture-v1",
      byCandidateId: validateSnapshotSet(state, snapshots),
    };
  }

  const provisionedPath = privateSnapshotPath(provisionedSnapshotPath);
  try {
    const raw: unknown = JSON.parse(await readFile(provisionedPath, "utf8"));
    return { batchId: "local-private-snapshot", byCandidateId: validateSnapshotSet(state, raw) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const root = briefingOutputRoot(rootDir);
  let directories;
  try {
    directories = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^batch-[0-9A-Za-z-]+$/u.test(entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("PORK33 private SBIZ365 Snapshot이 provisioning되지 않았습니다.");
    }
    throw error;
  }
  const manifests: Array<{ directory: string; manifest: BriefingManifest & { batchId: string; generatedAt: string } }> = [];
  for (const directory of directories) {
    try {
      const value: unknown = JSON.parse(await readFile(path.join(root, directory.name, "manifest.json"), "utf8"));
      if (validCompletedManifest(value) && value.batchId === directory.name) manifests.push({ directory: directory.name, manifest: value });
    } catch {
      // 불완전하거나 손상된 V1 batch는 Snapshot source로 사용하지 않는다.
    }
  }
  manifests.sort((left, right) => right.manifest.generatedAt.localeCompare(left.manifest.generatedAt));
  const source = manifests[0];
  if (!source) throw new Error("PORK33 private SBIZ365 Snapshot이 provisioning되지 않았고 완료된 legacy V1 batch도 없습니다.");
  const raw: unknown = JSON.parse(await readFile(path.join(root, source.directory, "SBIZ365_SNAPSHOTS.json"), "utf8"));
  return { batchId: source.directory, byCandidateId: validateSnapshotSet(state, raw) };
}

export async function loadPork33DecisionServerInputs(state: Pork33ShortlistStateV1): Promise<Pork33DecisionServerInputs> {
  const [assetInputs, snapshots] = await Promise.all([
    loadPork33BriefingAssetInputs(state),
    loadLatestPork33Sbiz365Snapshots(state),
  ]);
  return {
    ...assetInputs,
    sbiz365ByCandidateId: snapshots.byCandidateId,
    sbizSnapshotSourceBatchId: snapshots.batchId,
  };
}
