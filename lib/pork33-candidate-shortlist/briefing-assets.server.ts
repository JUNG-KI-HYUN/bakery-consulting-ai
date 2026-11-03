import "server-only";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractPdfPageText } from "@/lib/sbiz365-import/pdf-text-extractor.server";
import { importSbiz365Text } from "@/lib/sbiz365-import/importer";
import { buildPork33RelevantProfile } from "@/lib/sbiz365-import/pork33-relevance";
import type { Sbiz365ExtractedFact } from "@/lib/sbiz365-import/types";
import type {
  Pork33BriefingAssetIndex,
  Pork33BriefingPhotoAsset,
  Pork33Sbiz365SnapshotV1,
} from "./briefing-report";
import { createSanitizedPork33Sbiz365Snapshots } from "./sanitized-sbiz-fixture";
import { isPork33PrivateState } from "./seed-types";
import type { Pork33ShortlistStateV1 } from "./types";

type PhotoManifest = {
  candidates: Array<{
    candidateId: string;
    candidateStoreId: string;
    photos: Array<{ sequence: number; outputPath: string; width: number; height: number }>;
  }>;
};

export type Pork33BriefingServerInputs = {
  assets: Pork33BriefingAssetIndex;
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>;
  assetPaths: Record<string, string>;
};

export type Pork33BriefingAssetInputs = Omit<Pork33BriefingServerInputs, "sbiz365ByCandidateId">;

function rootPath(...parts: string[]) {
  return path.join(/* turbopackIgnore: true */ process.cwd(), ...parts);
}

function assertInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Report asset path가 허용 범위를 벗어났습니다.");
}

function normalizedAddress(value: string) {
  return value.normalize("NFKC").replace(/[\s_.·-]+/gu, "").replace(/(특별시|광역시|시|구|군|읍|면)/gu, "");
}

function sourceAddressToken(fileName: string, candidateId: string) {
  return path.basename(fileName, path.extname(fileName)).replace(`${candidateId}_`, "").replace(/_500m$/u, "");
}

function numberFromFact(fact: Sbiz365ExtractedFact | undefined) {
  if (!fact) return null;
  const matched = fact.value.replace(/,/gu, "").match(/-?\d+(?:\.\d+)?/u);
  return matched ? Number(matched[0]) : null;
}

function peakKey(values: Record<string, number> | null) {
  if (!values || Object.keys(values).length === 0) return null;
  return Object.entries(values).reduce((best, current) => current[1] > best[1] ? current : best)[0];
}

async function loadPhotoAssets(state: Pork33ShortlistStateV1, assetPaths: Record<string, string>) {
  const sourceRoot = rootPath("data", "pork33-candidate-photos-extracted");
  let manifest: PhotoManifest;
  try {
    manifest = JSON.parse(await readFile(path.join(sourceRoot, "manifest.json"), "utf8")) as PhotoManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const byStore = new Map(state.candidates.map((candidate) => [candidate.identity.candidateStoreId, candidate.identity.displayCode]));
  const result: Record<string, Pork33BriefingPhotoAsset[]> = {};
  for (const candidate of manifest.candidates) {
    if (byStore.get(candidate.candidateStoreId) !== candidate.candidateId) throw new Error(`${candidate.candidateId} Photo manifest Candidate identity가 일치하지 않습니다.`);
    result[candidate.candidateId] = [];
    for (const photo of candidate.photos.slice().sort((a, b) => a.sequence - b.sequence)) {
      const absolutePath = path.resolve(process.cwd(), photo.outputPath);
      assertInside(sourceRoot, absolutePath);
      await access(absolutePath);
      const assetRef = `PHOTO:${candidate.candidateId}:${photo.sequence}`;
      if (assetPaths[assetRef]) throw new Error(`${assetRef} Photo asset이 중복되었습니다.`);
      assetPaths[assetRef] = absolutePath;
      result[candidate.candidateId].push({ assetRef, sequence: photo.sequence, width: photo.width, height: photo.height });
    }
  }
  return result;
}

async function loadMapAssets(state: Pork33ShortlistStateV1, assetPaths: Record<string, string>) {
  const sourceRoot = rootPath("data", "pork33-candidate-map-source");
  let files;
  try {
    files = (await readdir(sourceRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const result: Pork33BriefingAssetIndex["mapsByCandidateId"] = {};
  for (const candidate of state.candidates) {
    const code = candidate.identity.displayCode;
    const matches = files.filter((entry) => entry.name.startsWith(`${code}_`));
    if (matches.length > 1) throw new Error(`${code} Map source가 중복되었습니다.`);
    if (matches.length === 0) continue;
    const absolutePath = path.join(sourceRoot, matches[0].name);
    const assetRef = `MAP:${code}`;
    assetPaths[assetRef] = absolutePath;
    result[code] = { assetRef, sourceFileName: matches[0].name };
  }
  return result;
}

async function loadSbizSnapshot(candidateId: string, currentAddress: string, filePath: string): Promise<Pork33Sbiz365SnapshotV1> {
  const sourceFileName = path.basename(filePath);
  try {
    const buffer = await readFile(filePath);
    const text = await extractPdfPageText(buffer);
    const imported = importSbiz365Text({
      fileName: sourceFileName,
      text,
      importedAt: new Date().toISOString(),
      textExtractor: "pdfplumber",
    }, { expectedIndustry: null, expectedRadiusMeters: 500 });
    const profile = buildPork33RelevantProfile(imported);
    const gender = peakKey(profile.purchasePattern.buyerGenderShares.value);
    const age = profile.purchasePattern.primaryBuyerAgeBand.value;
    const tokenMatches = normalizedAddress(currentAddress).includes(normalizedAddress(sourceAddressToken(sourceFileName, candidateId)));
    return {
      schemaVersion: "frameone.pork33-sbiz365-candidate-snapshot.v1",
      candidateId,
      sourceFileName,
      addressVerification: candidateId === "P33-022" ? "USER_CONFIRMED_OVERRIDE" : tokenMatches ? "MATCHED" : "REVIEW_REQUIRED",
      analysisRadiusMeters: imported.analysisRadiusMeters ?? 500,
      radiusSource: "USER_PROVIDED",
      analysisDate: imported.referencePeriod,
      peakFloatingTime: profile.footTraffic.peakTimeBand.value,
      peakGenderAge: gender || age ? [gender, age].filter(Boolean).join(" · ") : null,
      meatShopCount: profile.industryDemand.storeCount.value,
      householdCount: profile.residentialBase.households.value,
      residentialPopulation: numberFromFact(imported.facts.residentPopulation),
      extractionStatus: imported.extractionStatus,
    };
  } catch {
    return {
      schemaVersion: "frameone.pork33-sbiz365-candidate-snapshot.v1",
      candidateId,
      sourceFileName,
      addressVerification: candidateId === "P33-022" ? "USER_CONFIRMED_OVERRIDE" : "REVIEW_REQUIRED",
      analysisRadiusMeters: null,
      radiusSource: "USER_PROVIDED",
      analysisDate: null,
      peakFloatingTime: null,
      peakGenderAge: null,
      meatShopCount: null,
      householdCount: null,
      residentialPopulation: null,
      extractionStatus: "EXTRACTION_FAILED",
    };
  }
}

async function loadSbizSnapshots(state: Pork33ShortlistStateV1) {
  if (!isPork33PrivateState(state)) {
    return Object.fromEntries(createSanitizedPork33Sbiz365Snapshots(
      state.candidates.map((candidate) => candidate.identity.displayCode),
    ).map((snapshot) => [snapshot.candidateId, snapshot]));
  }
  const sourceRoot = rootPath("data", "pork33-sbiz365-source");
  let files;
  try {
    files = (await readdir(sourceRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const result: Record<string, Pork33Sbiz365SnapshotV1> = {};
  const jobs = state.candidates.map((candidate) => async () => {
    const code = candidate.identity.displayCode;
    const matches = files.filter((entry) => entry.name.startsWith(`${code}_`));
    if (matches.length > 1) throw new Error(`${code} SBIZ365 source가 중복되었습니다.`);
    if (matches.length === 0) return null;
    return [code, await loadSbizSnapshot(code, candidate.normalized.addressFull, path.join(sourceRoot, matches[0].name))] as const;
  });
  for (let index = 0; index < jobs.length; index += 4) {
    const rows = await Promise.all(jobs.slice(index, index + 4).map((job) => job()));
    for (const row of rows) if (row) result[row[0]] = row[1];
  }
  return result;
}

export async function loadPork33BriefingServerInputs(state: Pork33ShortlistStateV1): Promise<Pork33BriefingServerInputs> {
  const [assetInputs, sbiz365ByCandidateId] = await Promise.all([
    loadPork33BriefingAssetInputs(state),
    loadSbizSnapshots(state),
  ]);
  return { ...assetInputs, sbiz365ByCandidateId };
}

/** V2가 기존 지도/사진 연결만 재사용하고 SBIZ365 원본 PDF를 다시 읽지 않도록 분리한 read adapter다. */
export async function loadPork33BriefingAssetInputs(state: Pork33ShortlistStateV1): Promise<Pork33BriefingAssetInputs> {
  if (!isPork33PrivateState(state)) {
    return { assets: { mapsByCandidateId: {}, photosByCandidateId: {} }, assetPaths: {} };
  }
  const assetPaths: Record<string, string> = {};
  const [photosByCandidateId, mapsByCandidateId] = await Promise.all([
    loadPhotoAssets(state, assetPaths),
    loadMapAssets(state, assetPaths),
  ]);
  return { assets: { mapsByCandidateId, photosByCandidateId }, assetPaths };
}

export async function readPork33BriefingAsset(state: Pork33ShortlistStateV1, assetRef: string) {
  const assetPaths: Record<string, string> = {};
  await Promise.all([loadPhotoAssets(state, assetPaths), loadMapAssets(state, assetPaths)]);
  const filePath = assetPaths[assetRef];
  if (!filePath) throw new Error("Report asset을 찾을 수 없습니다.");
  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === ".png" ? "image/png" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : null;
  if (!contentType) throw new Error("지원하지 않는 Report asset입니다.");
  return { bytes: await readFile(filePath), contentType };
}
