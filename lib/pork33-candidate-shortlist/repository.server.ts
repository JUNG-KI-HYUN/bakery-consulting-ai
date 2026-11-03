import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createPork33InitialState, validatePork33State } from "./state";
import { loadPork33SeedPackage } from "./seed-provider.server";
import type { Pork33ShortlistStateV1 } from "./types";

type RepositoryOptions = { rootDir?: string; now?: () => Date; randomId?: () => string; seedSourcePath?: string };

function root(options: RepositoryOptions = {}) {
  return options.rootDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "pork33-candidate-shortlist", "runtime");
}
function isSnapshotName(name: string) {
  return /^pork33-shortlist-state-\d{6}-[a-zA-Z0-9-]+\.json$/u.test(name);
}
export async function loadCurrentPork33State(options: RepositoryOptions = {}): Promise<Pork33ShortlistStateV1> {
  const { seed } = await loadPork33SeedPackage({ localSourcePath: options.seedSourcePath });
  let files: string[];
  try {
    files = (await fs.readdir(root(options))).filter(isSnapshotName).sort().reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return createPork33InitialState(undefined, seed);
    throw error;
  }
  for (const file of files) {
    try {
      const value: unknown = JSON.parse(await fs.readFile(path.join(root(options), file), "utf8"));
      if (validatePork33State(value, seed).length === 0) return value as Pork33ShortlistStateV1;
    } catch {
      // 손상 파일을 최신 상태로 사용하지 않고 이전 유효 Snapshot을 계속 찾는다.
    }
  }
  return createPork33InitialState(undefined, seed);
}
export async function appendPork33State(
  next: Pork33ShortlistStateV1,
  options: RepositoryOptions = {},
): Promise<Pork33ShortlistStateV1> {
  const { seed } = await loadPork33SeedPackage({ localSourcePath: options.seedSourcePath });
  const errors = validatePork33State(next, seed);
  if (errors.length > 0) throw new TypeError(errors.join("\n"));
  const current = await loadCurrentPork33State(options);
  if (next.parentSnapshotId !== current.snapshotId || next.revision !== current.revision + 1) {
    throw new Error("최신 Snapshot 이후의 변경만 저장할 수 있습니다. 화면을 새로고침해 주세요.");
  }
  const directory = root(options);
  const fileName = `pork33-shortlist-state-${String(next.revision).padStart(6, "0")}-${next.snapshotId.replace(/[^a-zA-Z0-9-]/gu, "-")}.json`;
  const target = path.join(directory, fileName);
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
export function createNextPork33Snapshot(
  current: Pork33ShortlistStateV1,
  actor: string,
  options: RepositoryOptions = {},
): Pork33ShortlistStateV1 {
  const timestamp = (options.now?.() ?? new Date()).toISOString();
  return {
    ...structuredClone(current),
    snapshotId: `p33_state_${options.randomId?.() ?? randomUUID()}`,
    parentSnapshotId: current.snapshotId,
    revision: current.revision + 1,
    createdAt: timestamp,
    createdBy: actor,
  };
}
