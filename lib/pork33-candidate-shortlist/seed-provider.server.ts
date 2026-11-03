import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PORK33_SANITIZED_SEED } from "./sanitized-fixture";
import {
  PORK33_PRIVATE_SOURCE_DATASET_ID,
  type Pork33SeedPackage,
  type Pork33SeedResolution,
} from "./seed-types";

export type Pork33SeedProviderOptions = {
  localSourcePath?: string;
};

export function defaultPork33PrivateSeedPath() {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "pork33-candidate-shortlist",
    "pork33-field-source-2026-10.v1.json",
  );
}

function validatePrivateSeed(value: unknown): Pork33SeedPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PORK33 private seed는 객체여야 합니다.");
  const seed = value as Partial<Pork33SeedPackage>;
  if (seed.sourceDatasetId !== PORK33_PRIVATE_SOURCE_DATASET_ID) throw new Error("PORK33 private seed sourceDatasetId가 올바르지 않습니다.");
  if (!Array.isArray(seed.regions) || !Array.isArray(seed.apartmentAreas) || !Array.isArray(seed.candidates)) throw new Error("PORK33 private seed collection이 누락되었습니다.");
  if (seed.candidates.length !== 27 || new Set(seed.candidates.map((candidate) => candidate.identity?.displayCode)).size !== 27) {
    throw new Error("PORK33 private seed는 고유한 Candidate 27개여야 합니다.");
  }
  if (!seed.sourceAudit) throw new Error("PORK33 private seed sourceAudit가 누락되었습니다.");
  return seed as Pork33SeedPackage;
}

export async function loadPork33SeedPackage(
  options: Pork33SeedProviderOptions = {},
): Promise<Pork33SeedResolution> {
  if (options.localSourcePath === undefined && process.env.PORK33_DATA_MODE === "SANITIZED_FIXTURE") {
    return { mode: "SANITIZED_FIXTURE", sourcePath: null, seed: structuredClone(PORK33_SANITIZED_SEED) };
  }
  const sourcePath = options.localSourcePath ?? defaultPork33PrivateSeedPath();
  try {
    const value: unknown = JSON.parse(await readFile(sourcePath, "utf8"));
    return { mode: "LOCAL_PRIVATE", sourcePath, seed: validatePrivateSeed(value) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { mode: "SANITIZED_FIXTURE", sourcePath: null, seed: structuredClone(PORK33_SANITIZED_SEED) };
  }
}
