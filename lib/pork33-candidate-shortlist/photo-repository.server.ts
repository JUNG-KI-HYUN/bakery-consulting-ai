import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION,
  validateCandidatePhotoCollectionV1,
} from "../candidate-photo";
import { getPork33SeedPackage } from "./state";
import { loadPork33SeedPackage } from "./seed-provider.server";
import type { Pork33SeedPackage } from "./seed-types";
import {
  PORK33_CANDIDATE_PHOTO_STATE_SCHEMA_VERSION,
  type Pork33CandidatePhotoStateV1,
} from "./photo-types";

export type Pork33PhotoRepositoryOptions = {
  readonly rootDir?: string;
  readonly now?: () => Date;
  readonly randomId?: () => string;
  readonly seedSourcePath?: string;
};

function root(options: Pork33PhotoRepositoryOptions = {}) {
  return options.rootDir ?? path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "pork33-candidate-shortlist",
    "photo-runtime",
  );
}
function isSnapshotName(name: string) {
  return /^pork33-photo-state-\d{6}-[a-zA-Z0-9-]+\.json$/u.test(name);
}
export function createInitialPork33CandidatePhotoState(
  now = new Date("2026-11-01T00:00:00.000Z"),
  seedPackage?: Pork33SeedPackage,
): Pork33CandidatePhotoStateV1 {
  const seed = getPork33SeedPackage(seedPackage);
  return {
    schemaVersion: PORK33_CANDIDATE_PHOTO_STATE_SCHEMA_VERSION,
    snapshotId: "p33_photo_state_seed_v1",
    parentSnapshotId: null,
    revision: 1,
    createdAt: now.toISOString(),
    createdBy: "pork33-photo-seed-v1",
    profiles: seed.candidates.map((candidate) => ({
      schemaVersion: CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION,
      profileVersion: "1",
      caseId: candidate.draft.caseId,
      candidateStoreId: candidate.identity.candidateStoreId,
      primaryPhotoId: null,
      photoIds: [],
      updatedAt: now.toISOString(),
    })),
    photos: [],
  };
}
export function validatePork33CandidatePhotoState(
  input: unknown,
  seedPackage?: Pork33SeedPackage,
): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["photo state는 객체여야 합니다."];
  const state = input as Partial<Pork33CandidatePhotoStateV1>;
  const errors: string[] = [];
  if (state.schemaVersion !== PORK33_CANDIDATE_PHOTO_STATE_SCHEMA_VERSION) errors.push("photo state schemaVersion이 올바르지 않습니다.");
  if (!Number.isInteger(state.revision) || (state.revision ?? 0) < 1) errors.push("photo state revision은 1 이상이어야 합니다.");
  if (!Array.isArray(state.profiles) || !Array.isArray(state.photos)) return [...errors, "profiles와 photos 배열이 필요합니다."];

  const seed = getPork33SeedPackage(seedPackage);
  const candidates = new Map(seed.candidates.map((candidate) => [candidate.identity.candidateStoreId, candidate]));
  if (state.profiles.length !== candidates.size) errors.push("모든 PORK33 Candidate Photo Profile이 필요합니다.");
  const profileIds = new Set<string>();
  for (const profile of state.profiles) {
    const candidate = candidates.get(profile.candidateStoreId);
    if (!candidate || profileIds.has(profile.candidateStoreId)) {
      errors.push("Photo Profile Candidate가 없거나 중복입니다.");
      continue;
    }
    profileIds.add(profile.candidateStoreId);
    if (profile.caseId !== candidate.draft.caseId) errors.push(`${profile.candidateStoreId} Photo Profile Case가 일치하지 않습니다.`);
    const photos = state.photos.filter((photo) => photo.candidateStoreId === profile.candidateStoreId);
    const result = validateCandidatePhotoCollectionV1(profile, photos);
    if (!result.ok) errors.push(`${profile.candidateStoreId}: ${result.code} ${result.errors.join(" ")}`);
  }
  for (const photo of state.photos) {
    if (!profileIds.has(photo.candidateStoreId)) errors.push(`${photo.photoId}는 PORK33 Candidate Profile에 속하지 않습니다.`);
  }
  return errors;
}
export async function loadCurrentPork33CandidatePhotoState(
  options: Pork33PhotoRepositoryOptions = {},
): Promise<Pork33CandidatePhotoStateV1> {
  const { seed } = await loadPork33SeedPackage({ localSourcePath: options.seedSourcePath });
  let files: string[];
  try {
    files = (await fs.readdir(root(options))).filter(isSnapshotName).sort().reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return createInitialPork33CandidatePhotoState(undefined, seed);
    throw error;
  }
  for (const file of files) {
    try {
      const value: unknown = JSON.parse(await fs.readFile(path.join(root(options), file), "utf8"));
      if (validatePork33CandidatePhotoState(value, seed).length === 0) return value as Pork33CandidatePhotoStateV1;
    } catch {
      // 손상된 최신 파일을 건너뛰고 이전 유효 Snapshot을 찾는다.
    }
  }
  return createInitialPork33CandidatePhotoState(undefined, seed);
}
export function createNextPork33CandidatePhotoSnapshot(
  current: Pork33CandidatePhotoStateV1,
  actor: string,
  options: Pork33PhotoRepositoryOptions = {},
): Pork33CandidatePhotoStateV1 {
  return {
    ...structuredClone(current),
    snapshotId: `p33_photo_state_${options.randomId?.() ?? randomUUID()}`,
    parentSnapshotId: current.snapshotId,
    revision: current.revision + 1,
    createdAt: (options.now?.() ?? new Date()).toISOString(),
    createdBy: actor,
  };
}
export async function appendPork33CandidatePhotoState(
  next: Pork33CandidatePhotoStateV1,
  options: Pork33PhotoRepositoryOptions = {},
): Promise<Pork33CandidatePhotoStateV1> {
  const { seed } = await loadPork33SeedPackage({ localSourcePath: options.seedSourcePath });
  const errors = validatePork33CandidatePhotoState(next, seed);
  if (errors.length > 0) throw new TypeError(errors.join("\n"));
  const current = await loadCurrentPork33CandidatePhotoState(options);
  if (next.parentSnapshotId !== current.snapshotId || next.revision !== current.revision + 1) {
    throw new Error("최신 Photo Snapshot 이후의 변경만 저장할 수 있습니다. 화면을 새로고침해 주세요.");
  }
  const directory = root(options);
  const safeSnapshotId = next.snapshotId.replace(/[^a-zA-Z0-9-]/gu, "-");
  const target = path.join(directory, `pork33-photo-state-${String(next.revision).padStart(6, "0")}-${safeSnapshotId}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return next;
}
