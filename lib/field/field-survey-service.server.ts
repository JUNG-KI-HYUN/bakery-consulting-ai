import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createCandidateStoreLink,
  parseCandidateStoreLink,
  type CandidateStoreLink,
} from "./candidate-store-link";
import { createCandidateStoreId, isCandidateStoreId, isSiteSurveyId } from "./identifiers";
import { storageFail, storageOk, type FieldStorageFailure, type FieldStorageResult } from "./storage-result";
import { toSiteSurveyDraftRef, type SiteSurveyDraftRef, type SiteSurveyDraftStore } from "./survey-draft-contract";
import { parseSiteSurvey } from "./survey-record";
import {
  ACTIVE_SITE_SURVEY_STATUSES,
  createSiteSurveyDraft,
  type SiteSurvey,
  type SiteSurveyStatus,
  type SurveyStageStates,
} from "./types";

export const DEFAULT_FIELD_SURVEY_ROOT = path.join(process.cwd(), "data", "field-surveys");
const FIELD_STAFF_SURVEYOR = "field-staff";

/**
 * consultationId / surveyId 파일명 조각 허용 문자.
 * 기존 Consultation ID(`sample-001`, `consult-<epoch>`)를 막지 않되
 * `/` `\` `..` 절대경로 형태는 거부한다. 잘못된 값은 sanitize하지 않고 INVALID_DATA로 거절한다.
 */
const SAFE_STORAGE_KEY = /^[A-Za-z0-9._-]+$/;

export interface FieldSurveyService extends SiteSurveyDraftStore {
  readLink(consultationId: string): Promise<FieldStorageResult<CandidateStoreLink | null>>;
  ensureLink(input: {
    consultationId: string;
    existingCandidateStoreId?: string | null;
  }): Promise<FieldStorageResult<CandidateStoreLink>>;
  getSurvey(surveyId: string): Promise<FieldStorageResult<SiteSurvey>>;
  listSurveysForCandidateStore(
    candidateStoreId: string,
  ): Promise<FieldStorageResult<readonly SiteSurvey[]>>;
  findActiveSurveyForCandidateStore(
    candidateStoreId: string,
  ): Promise<FieldStorageResult<SiteSurvey | null>>;
  startSurvey(input: {
    consultationId: string;
    candidateStoreId: string;
  }): Promise<FieldStorageResult<{ survey: SiteSurvey; created: boolean }>>;
  updateSurveyDraft(input: {
    surveyId: string;
    expectedDraftVersion: number;
    stageStates?: SurveyStageStates;
    status?: SiteSurveyStatus;
  }): Promise<FieldStorageResult<SiteSurvey>>;
}

export interface FieldSurveyServiceOptions {
  readonly rootDir?: string;
  readonly now?: () => string;
}

export function isSafeFieldStorageKey(value: string): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.includes("/") || value.includes("\\")) return false;
  if (value.includes("..")) return false;
  if (path.isAbsolute(value)) return false;
  return SAFE_STORAGE_KEY.test(value);
}

function storageKeyOrFail(value: string, label: string): FieldStorageResult<string> {
  if (!isSafeFieldStorageKey(value)) {
    return storageFail("INVALID_DATA", `${label} is not a safe storage key`);
  }
  return storageOk(value);
}

/**
 * path.resolve 결과가 storage root 밖이면 거부한다.
 * 파일명 조각이 이미 검증된 뒤에도 경로 결합 실수로 root 탈출이 나지 않게 한다.
 */
export function resolveUnderFieldRoot(
  rootDir: string,
  ...segments: string[]
): FieldStorageResult<string> {
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return storageFail("INVALID_DATA", "FIELD storage path escapes storage root");
  }
  return storageOk(resolved);
}

function ioFail(error: unknown): FieldStorageFailure {
  const message = error instanceof Error ? error.message : "FIELD storage IO failed";
  return storageFail("IO_ERROR", message);
}

/**
 * Best-effort safe JSON replacement.
 *
 * Unix에서는 같은 디렉터리 rename으로 대체가 가능한 경우가 많다.
 * Windows에서는 대상 파일이 이미 있으면 rename이 실패하므로 temp → copyFile(덮어쓰기) → temp 삭제를 쓴다.
 * 대상 경로가 잠깐 사라지는 unlink+rename은 피한다.
 * Node 기본 API만으로는 Windows에서 완전한 atomic replace를 보장하지 않는다.
 */
async function writeJsonBestEffort(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${globalThis.crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EEXIST" || code === "EPERM") {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath);
        return;
      }
      throw error;
    }
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function readTextFile(filePath: string): Promise<FieldStorageResult<string | null>> {
  try {
    return storageOk(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return storageOk(null);
    return ioFail(error);
  }
}

function parseJsonValue(raw: string): FieldStorageResult<unknown> {
  try {
    return storageOk(JSON.parse(raw) as unknown);
  } catch {
    return storageFail("INVALID_DATA", "FIELD JSON is corrupt");
  }
}

export function createFieldSurveyService(options: FieldSurveyServiceOptions = {}): FieldSurveyService {
  const rootDir = options.rootDir ?? DEFAULT_FIELD_SURVEY_ROOT;
  const now = options.now ?? (() => new Date().toISOString());
  const surveysDir = path.join(rootDir, "surveys");

  function linkPath(consultationId: string): FieldStorageResult<string> {
    return resolveUnderFieldRoot(rootDir, "links", `${consultationId}.json`);
  }

  function surveyPath(surveyId: string): FieldStorageResult<string> {
    return resolveUnderFieldRoot(rootDir, "surveys", `${surveyId}.json`);
  }

  async function readLink(
    consultationId: string,
  ): Promise<FieldStorageResult<CandidateStoreLink | null>> {
    const key = storageKeyOrFail(consultationId, "consultationId");
    if (!key.ok) return key;
    const file = linkPath(key.value);
    if (!file.ok) return file;
    const raw = await readTextFile(file.value);
    if (!raw.ok) return raw;
    if (raw.value === null) return storageOk(null);
    const parsedJson = parseJsonValue(raw.value);
    if (!parsedJson.ok) return parsedJson;
    const parsed = parseCandidateStoreLink(parsedJson.value);
    if (!parsed.ok) return parsed;
    if (parsed.value.consultationId !== consultationId) {
      return storageFail("INVALID_DATA", "CandidateStoreLink.consultationId does not match the file");
    }
    return parsed;
  }

  async function ensureLink(input: {
    consultationId: string;
    existingCandidateStoreId?: string | null;
  }): Promise<FieldStorageResult<CandidateStoreLink>> {
    const existing = await readLink(input.consultationId);
    if (!existing.ok) return existing;
    if (existing.value) return storageOk(existing.value);

    const assignedId =
      input.existingCandidateStoreId && isCandidateStoreId(input.existingCandidateStoreId)
        ? input.existingCandidateStoreId
        : createCandidateStoreId();
    const link = createCandidateStoreLink({
      consultationId: input.consultationId,
      candidateStoreId: assignedId,
      createdAt: now(),
    });
    const key = storageKeyOrFail(input.consultationId, "consultationId");
    if (!key.ok) return key;
    const file = linkPath(key.value);
    if (!file.ok) return file;
    try {
      await writeJsonBestEffort(file.value, link);
    } catch (error) {
      return ioFail(error);
    }
    return storageOk(link);
  }

  async function getSurvey(surveyId: string): Promise<FieldStorageResult<SiteSurvey>> {
    if (!isSiteSurveyId(surveyId) || !isSafeFieldStorageKey(surveyId)) {
      return storageFail("INVALID_DATA", "surveyId is invalid");
    }
    const file = surveyPath(surveyId);
    if (!file.ok) return file;
    const raw = await readTextFile(file.value);
    if (!raw.ok) return raw;
    if (raw.value === null) return storageFail("NOT_FOUND", "SiteSurvey was not found");
    const parsedJson = parseJsonValue(raw.value);
    if (!parsedJson.ok) return parsedJson;
    const parsed = parseSiteSurvey(parsedJson.value);
    if (!parsed.ok) return parsed;
    if (parsed.value.surveyId !== surveyId) {
      return storageFail("INVALID_DATA", "SiteSurvey.surveyId does not match the file");
    }
    return parsed;
  }

  async function listSurveysForCandidateStore(
    candidateStoreId: string,
  ): Promise<FieldStorageResult<readonly SiteSurvey[]>> {
    if (!isCandidateStoreId(candidateStoreId)) {
      return storageFail("INVALID_DATA", "candidateStoreId is invalid");
    }
    let names: string[];
    try {
      names = await fs.readdir(surveysDir);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") return storageOk([]);
      return ioFail(error);
    }

    const surveys: SiteSurvey[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const surveyId = name.slice(0, -".json".length);
      if (!isSiteSurveyId(surveyId)) continue;
      const loaded = await getSurvey(surveyId);
      if (!loaded.ok) {
        if (loaded.code === "NOT_FOUND") continue;
        return loaded;
      }
      if (loaded.value.candidateStoreId === candidateStoreId) surveys.push(loaded.value);
    }
    return storageOk(Object.freeze(surveys));
  }

  async function findActiveSurveyForCandidateStore(
    candidateStoreId: string,
  ): Promise<FieldStorageResult<SiteSurvey | null>> {
    const listed = await listSurveysForCandidateStore(candidateStoreId);
    if (!listed.ok) return listed;
    const active = listed.value
      .filter((survey) => ACTIVE_SITE_SURVEY_STATUSES.some((status) => status === survey.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.surveySequence - left.surveySequence);
    return storageOk(active[0] ?? null);
  }

  async function startSurvey(input: {
    consultationId: string;
    candidateStoreId: string;
  }): Promise<FieldStorageResult<{ survey: SiteSurvey; created: boolean }>> {
    const active = await findActiveSurveyForCandidateStore(input.candidateStoreId);
    if (!active.ok) return active;
    if (active.value) return storageOk({ survey: active.value, created: false });

    const listed = await listSurveysForCandidateStore(input.candidateStoreId);
    if (!listed.ok) return listed;
    const nextSequence =
      listed.value.reduce((max, survey) => Math.max(max, survey.surveySequence), 0) + 1;
    const createdAt = now();
    const survey = createSiteSurveyDraft({
      candidateStoreId: input.candidateStoreId,
      consultationId: input.consultationId,
      surveySequence: nextSequence,
      surveyor: FIELD_STAFF_SURVEYOR,
      createdAt,
    });
    const file = surveyPath(survey.surveyId);
    if (!file.ok) return file;
    try {
      await writeJsonBestEffort(file.value, survey);
    } catch (error) {
      return ioFail(error);
    }
    return storageOk({ survey, created: true });
  }

  async function updateSurveyDraft(input: {
    surveyId: string;
    expectedDraftVersion: number;
    stageStates?: SurveyStageStates;
    status?: SiteSurveyStatus;
  }): Promise<FieldStorageResult<SiteSurvey>> {
    const loaded = await getSurvey(input.surveyId);
    if (!loaded.ok) return loaded;
    if (loaded.value.draftVersion !== input.expectedDraftVersion) {
      return storageFail("VERSION_CONFLICT", "SiteSurvey draftVersion does not match the stored draft");
    }
    const next = Object.freeze({
      ...loaded.value,
      stageStates: input.stageStates ?? loaded.value.stageStates,
      status: input.status ?? loaded.value.status,
      draftVersion: loaded.value.draftVersion + 1,
      updatedAt: now(),
    });
    const file = surveyPath(next.surveyId);
    if (!file.ok) return file;
    try {
      await writeJsonBestEffort(file.value, next);
    } catch (error) {
      return ioFail(error);
    }
    return storageOk(next);
  }

  async function loadDraft(surveyId: string): Promise<SiteSurvey | null> {
    const loaded = await getSurvey(surveyId);
    if (loaded.ok) return loaded.value;
    if (loaded.code === "NOT_FOUND") return null;
    throw new Error(loaded.message);
  }

  async function saveDraft(survey: SiteSurvey): Promise<SiteSurveyDraftRef> {
    const existing = await getSurvey(survey.surveyId);
    if (existing.ok) {
      if (existing.value.draftVersion !== survey.draftVersion) {
        throw new Error("VERSION_CONFLICT");
      }
      const updated = await updateSurveyDraft({
        surveyId: survey.surveyId,
        expectedDraftVersion: survey.draftVersion,
        stageStates: survey.stageStates,
        status: survey.status,
      });
      if (!updated.ok) throw new Error(updated.code);
      return toSiteSurveyDraftRef(updated.value);
    }
    if (existing.code !== "NOT_FOUND") throw new Error(existing.code);
    const file = surveyPath(survey.surveyId);
    if (!file.ok) throw new Error(file.code);
    try {
      await writeJsonBestEffort(file.value, survey);
    } catch (error) {
      throw new Error(ioFail(error).message);
    }
    return toSiteSurveyDraftRef(survey);
  }

  async function listDrafts(candidateStoreId: string): Promise<readonly SiteSurveyDraftRef[]> {
    const listed = await listSurveysForCandidateStore(candidateStoreId);
    if (!listed.ok) throw new Error(listed.code);
    return listed.value.map((survey) => toSiteSurveyDraftRef(survey));
  }

  return {
    readLink,
    ensureLink,
    getSurvey,
    listSurveysForCandidateStore,
    findActiveSurveyForCandidateStore,
    startSurvey,
    updateSurveyDraft,
    loadDraft,
    saveDraft,
    listDrafts,
  };
}

let defaultService: FieldSurveyService | undefined;

export function getFieldSurveyService(): FieldSurveyService {
  defaultService ??= createFieldSurveyService();
  return defaultService;
}
