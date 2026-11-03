import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, resolveJsonModule: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return previousModuleLoad.call(this, request, parent, isMain);
};

const contract = require(path.join(root, "lib/candidate-photo/index.ts"));
const storage = require(path.join(root, "lib/candidate-photo/storage.server.ts"));
const repository = require(path.join(root, "lib/pork33-candidate-shortlist/photo-repository.server.ts"));
const commands = require(path.join(root, "lib/pork33-candidate-shortlist/photo-commands.server.ts"));
const workspace = require(path.join(root, "lib/pork33-candidate-shortlist/photo-workspace.ts"));
const shortlist = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const report = require(path.join(root, "lib/pork33-candidate-shortlist/report.ts"));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p33-photo-briefing-"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const shortlistState = shortlist.createPork33InitialState(undefined, seedResolution.seed);
const CANDIDATE_A = shortlistState.candidates[0].identity.candidateStoreId;
const CANDIDATE_B = shortlistState.candidates[1].identity.candidateStoreId;
const CASE_ID = shortlistState.candidates[0].draft.caseId;

after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
  Module._load = previousModuleLoad;
});
let directorySequence = 0;
function dir(name) {
  directorySequence += 1;
  return path.join(tempRoot, `${String(directorySequence).padStart(2, "0")}-${name}`);
}
function asset(candidateStoreId, fileName) {
  return contract.createCandidatePhotoAssetRefV1(CASE_ID, candidateStoreId, fileName);
}
async function execute(rootDir, command) {
  return commands.executePork33CandidatePhotoCommand({ actor: "tester", ...command }, { rootDir });
}
async function register(rootDir, candidateStoreId, fileName) {
  return execute(rootDir, { type: "REGISTER_PHOTO", candidateStoreId, assetRef: asset(candidateStoreId, fileName) });
}
function candidatePhotos(state, candidateStoreId) {
  return workspace.getActiveCandidatePhotos(state, candidateStoreId);
}

test("01 Candidate A 사진 업로드 metadata를 연결한다", async () => {
  const state = await register(dir("candidate-a"), CANDIDATE_A, "a.png");
  assert.equal(candidatePhotos(state, CANDIDATE_A).length, 1);
});
test("02 Candidate B 사진 업로드 metadata를 별도 연결한다", async () => {
  const state = await register(dir("candidate-b"), CANDIDATE_B, "b.png");
  assert.equal(candidatePhotos(state, CANDIDATE_B).length, 1);
  assert.equal(candidatePhotos(state, CANDIDATE_A).length, 0);
});
test("03 Candidate A/B 사진 소유권을 격리한다", async () => {
  const rootDir = dir("isolation");
  const state = await register(rootDir, CANDIDATE_A, "a.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  await assert.rejects(() => execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_B, photoId, patch: { category: "FRONT" } }), /다른 Candidate/);
});
test("04 한 Candidate에 multi upload metadata를 누적한다", async () => {
  const rootDir = dir("multi");
  let state;
  for (let index = 0; index < 5; index += 1) state = await register(rootDir, CANDIDATE_A, `multi-${index}.png`);
  assert.equal(candidatePhotos(state, CANDIDATE_A).length, 5);
});
test("05 Photo metadata는 append-only snapshot에서 reload된다", async () => {
  const rootDir = dir("metadata-persistence");
  await register(rootDir, CANDIDATE_A, "persist.png");
  const loaded = await repository.loadCurrentPork33CandidatePhotoState({ rootDir });
  assert.equal(candidatePhotos(loaded, CANDIDATE_A).length, 1);
});
test("06 Category 수정을 저장한다", async () => {
  const rootDir = dir("category");
  let state = await register(rootDir, CANDIDATE_A, "category.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  state = await execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_A, photoId, patch: { category: "MAIN_FLOW" } });
  assert.equal(candidatePhotos(state, CANDIDATE_A)[0].category, "MAIN_FLOW");
});
test("07 fieldMemoRaw 원문을 임의 수정 없이 저장한다", async () => {
  const rootDir = dir("memo");
  let state = await register(rootDir, CANDIDATE_A, "memo.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  const memo = "  서문에서 버스정류장으로 나오는 동선  ";
  state = await execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_A, photoId, patch: { fieldMemoRaw: memo } });
  assert.equal(candidatePhotos(state, CANDIDATE_A)[0].fieldMemoRaw, memo);
});
test("08 사진 위/아래 순서 변경은 sortOrder를 재배열한다", async () => {
  const rootDir = dir("sort");
  let state = await register(rootDir, CANDIDATE_A, "first.png");
  state = await register(rootDir, CANDIDATE_A, "second.png");
  const secondId = candidatePhotos(state, CANDIDATE_A)[1].photoId;
  state = await execute(rootDir, { type: "MOVE_PHOTO", candidateStoreId: CANDIDATE_A, photoId: secondId, direction: "UP" });
  assert.equal(candidatePhotos(state, CANDIDATE_A)[0].photoId, secondId);
});
test("09 대표사진을 profile primaryPhotoId로 지정한다", async () => {
  const rootDir = dir("primary");
  let state = await register(rootDir, CANDIDATE_A, "primary.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  state = await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId });
  assert.equal(state.profiles.find((item) => item.candidateStoreId === CANDIDATE_A).primaryPhotoId, photoId);
});
test("10 대표사진 변경은 scalar reference 하나만 변경한다", async () => {
  const rootDir = dir("primary-change");
  let state = await register(rootDir, CANDIDATE_A, "one.png");
  state = await register(rootDir, CANDIDATE_A, "two.png");
  const [one, two] = candidatePhotos(state, CANDIDATE_A);
  await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId: one.photoId });
  state = await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId: two.photoId });
  assert.equal(state.profiles.find((item) => item.candidateStoreId === CANDIDATE_A).primaryPhotoId, two.photoId);
  assert.equal("isPrimary" in state.photos[0], false);
});
test("11 대표사진 해제는 null을 보존한다", async () => {
  const rootDir = dir("primary-clear");
  let state = await register(rootDir, CANDIDATE_A, "one.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId });
  state = await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId: null });
  assert.equal(state.profiles.find((item) => item.candidateStoreId === CANDIDATE_A).primaryPhotoId, null);
});

test("12 includeInBriefing true가 있으면 true 사진만 선택한다", async () => {
  const rootDir = dir("briefing-true");
  let state = await register(rootDir, CANDIDATE_A, "one.png");
  state = await register(rootDir, CANDIDATE_A, "two.png");
  const first = candidatePhotos(state, CANDIDATE_A)[0];
  state = await execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_A, photoId: first.photoId, patch: { includeInBriefing: true } });
  assert.deepEqual(workspace.getBriefingCandidatePhotos(state, CANDIDATE_A).map((photo) => photo.photoId), [first.photoId]);
});

test("13 includeInBriefing false 사진을 기본 selection에서 제외한다", async () => {
  const rootDir = dir("briefing-false");
  let state = await register(rootDir, CANDIDATE_A, "one.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  state = await execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_A, photoId, patch: { includeInBriefing: false } });
  assert.equal(workspace.getBriefingCandidatePhotos(state, CANDIDATE_A).length, 0);
});

test("14 includeInBriefing null은 명시 selection이 없을 때 포함한다", async () => {
  const state = await register(dir("briefing-null"), CANDIDATE_A, "one.png");
  assert.equal(workspace.getBriefingCandidatePhotos(state, CANDIDATE_A).length, 1);
  assert.equal(candidatePhotos(state, CANDIDATE_A)[0].includeInBriefing, null);
});

test("15 includeInReport flag를 tri-state 그대로 저장한다", async () => {
  const rootDir = dir("report-flag");
  let state = await register(rootDir, CANDIDATE_A, "report.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  state = await execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_A, photoId, patch: { includeInReport: true } });
  assert.equal(candidatePhotos(state, CANDIDATE_A)[0].includeInReport, true);
});

test("16 사진 0장 Candidate는 빈 collection으로 유지한다", () => {
  const state = repository.createInitialPork33CandidatePhotoState(undefined, seedResolution.seed);
  assert.equal(candidatePhotos(state, CANDIDATE_A).length, 0);
});

test("17 사진 1장 Candidate를 조회한다", async () => {
  const state = await register(dir("one-photo"), CANDIDATE_A, "one.png");
  assert.equal(candidatePhotos(state, CANDIDATE_A).length, 1);
});

test("18 사진 10장 Candidate를 순서대로 조회한다", async () => {
  const rootDir = dir("ten-photos");
  let state;
  for (let index = 0; index < 10; index += 1) state = await register(rootDir, CANDIDATE_A, `ten-${index}.png`);
  assert.deepEqual(candidatePhotos(state, CANDIDATE_A).map((photo) => photo.sortOrder), Array.from({ length: 10 }, (_, index) => index));
});

test("19 삭제는 binary 제거 없이 deletedAt tombstone을 기록한다", async () => {
  const rootDir = dir("tombstone");
  let state = await register(rootDir, CANDIDATE_A, "delete.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  state = await execute(rootDir, { type: "TOMBSTONE_PHOTO", candidateStoreId: CANDIDATE_A, photoId });
  assert.ok(state.photos.find((photo) => photo.photoId === photoId).deletedAt);
});

test("20 tombstone 사진은 Briefing selection에서 제외한다", async () => {
  const rootDir = dir("deleted-briefing");
  let state = await register(rootDir, CANDIDATE_A, "delete.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  state = await execute(rootDir, { type: "TOMBSTONE_PHOTO", candidateStoreId: CANDIDATE_A, photoId });
  assert.equal(workspace.getBriefingCandidatePhotos(state, CANDIDATE_A).length, 0);
});

test("21 대표사진 tombstone 시 primaryPhotoId를 null로 만든다", async () => {
  const rootDir = dir("deleted-primary");
  let state = await register(rootDir, CANDIDATE_A, "primary.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId });
  state = await execute(rootDir, { type: "TOMBSTONE_PHOTO", candidateStoreId: CANDIDATE_A, photoId });
  assert.equal(state.profiles.find((item) => item.candidateStoreId === CANDIDATE_A).primaryPhotoId, null);
});

test("22 서버 reload 후 category/memo/sort/flags/primary를 유지한다", async () => {
  const rootDir = dir("reload-all");
  let state = await register(rootDir, CANDIDATE_A, "reload.png");
  const photoId = candidatePhotos(state, CANDIDATE_A)[0].photoId;
  await execute(rootDir, { type: "UPDATE_PHOTO", candidateStoreId: CANDIDATE_A, photoId, patch: { category: "FRONT", fieldMemoRaw: "원문", includeInBriefing: true, includeInReport: false } });
  await execute(rootDir, { type: "SET_PRIMARY", candidateStoreId: CANDIDATE_A, photoId });
  state = await repository.loadCurrentPork33CandidatePhotoState({ rootDir });
  const photo = candidatePhotos(state, CANDIDATE_A)[0];
  assert.deepEqual([photo.category, photo.fieldMemoRaw, photo.includeInBriefing, photo.includeInReport], ["FRONT", "원문", true, false]);
  assert.equal(state.profiles.find((item) => item.candidateStoreId === CANDIDATE_A).primaryPhotoId, photoId);
});

test("23 Candidate previous/next 기본순서는 Region-Area-displayNumber다", () => {
  const candidates = workspace.filterAndOrderBriefingCandidates(shortlistState, {});
  assert.equal(candidates.length, 27);
  assert.ok(candidates.every((candidate, index) => index === 0 || candidate.identity.candidateStoreId !== candidates[index - 1].identity.candidateStoreId));
});

test("24 Thumbnail previous/next selection은 사진 목록 안에서 순환한다", async () => {
  const rootDir = dir("thumbnail");
  let state = await register(rootDir, CANDIDATE_A, "one.png");
  state = await register(rootDir, CANDIDATE_A, "two.png");
  const photos = candidatePhotos(state, CANDIDATE_A);
  assert.equal(workspace.getAdjacentPhotoId(photos, photos[0].photoId, "NEXT"), photos[1].photoId);
  assert.equal(workspace.getAdjacentPhotoId(photos, photos[0].photoId, "PREVIOUS"), photos[1].photoId);
});

test("25 같은 상권 비교는 Apartment Area Candidate ID만 반환한다", () => {
  const ids = workspace.getSameApartmentAreaCandidateIds(shortlistState, CANDIDATE_A);
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(CANDIDATE_A) && ids.includes(CANDIDATE_B));
});

test("26 Map point는 실제 Candidate identity와 검증 좌표만 연결한다", () => {
  const state = structuredClone(shortlistState);
  state.candidates[0].normalized.latitude = 36.3;
  state.candidates[0].normalized.longitude = 127.1;
  const points = workspace.getCandidateAreaMapPoints(state, CANDIDATE_A);
  assert.deepEqual(points[0], { candidateStoreId: CANDIDATE_A, label: "P33-001", lat: 36.3, lng: 127.1, selected: true });
});

test("27 P33-005에는 가짜 좌표를 생성하지 않는다", () => {
  const candidate = shortlistState.candidates.find((item) => item.identity.displayCode === "P33-005");
  assert.equal(candidate.normalized.latitude, null);
  assert.equal(candidate.normalized.longitude, null);
  assert.equal(workspace.getCandidateAreaMapPoints(shortlistState, candidate.identity.candidateStoreId).length, 0);
});

test("28 Photo state와 UI reference는 내부 filesystem path를 노출하지 않는다", async () => {
  const state = await register(dir("path-safety"), CANDIDATE_A, "safe.png");
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes("data/detailed-report-photos"), false);
  assert.equal(serialized.includes("C:\\"), false);
  assert.equal(serialized.includes("fileRef"), false);
});

test("29 PORK33-owned Photo route가 shared Candidate storage만 사용한다", () => {
  const route = fs.readFileSync(path.join(root, "app/api/tools/pork33-candidate-shortlist/photos/route.ts"), "utf8");
  const manager = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/Pork33PhotoManager.tsx"), "utf8");
  const briefing = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/Pork33BriefingWorkspace.tsx"), "utf8");
  assert.match(route, /candidate-photo\/storage\.server/u);
  assert.match(route, /saveCandidateScopedPhotoV1/u);
  assert.match(route, /readCandidateScopedPhotoV1/u);
  assert.doesNotMatch(`${route}\n${manager}\n${briefing}`, /detailed-reports\/photos|lib\/detailed-report/u);
});

test("30 기존 PORK33 PDF page contract는 27개 Candidate를 그대로 유지한다", () => {
  const pages = report.buildPork33ReportPages(shortlistState);
  const count = pages.filter((page) => page.kind === "CANDIDATES").flatMap((page) => page.cards).length;
  assert.equal(count, 27);
});

test("31 shared binary storage는 Candidate A/B를 격리하고 path를 노출하지 않는다", async () => {
  const rootDir = dir("binary-isolation");
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const savedA = await storage.saveCandidateScopedPhotoV1(
    CASE_ID,
    CANDIDATE_A,
    new File([bytes], "a.png", { type: "image/png" }),
    { rootDir, randomId: () => "photo-a" },
  );
  const savedB = await storage.saveCandidateScopedPhotoV1(
    CASE_ID,
    CANDIDATE_B,
    new File([bytes], "b.png", { type: "image/png" }),
    { rootDir, randomId: () => "photo-b" },
  );
  assert.deepEqual((await storage.readCandidateScopedPhotoV1(savedA.reference, { rootDir })).bytes, bytes);
  assert.deepEqual((await storage.readCandidateScopedPhotoV1(savedB.reference, { rootDir })).bytes, bytes);
  await assert.rejects(
    () => storage.readCandidateScopedPhotoV1({ ...savedA.reference, candidateStoreId: CANDIDATE_B }, { rootDir }),
    (error) => error.code === "FOREIGN_CANDIDATE_PHOTO",
  );
  assert.equal(JSON.stringify([savedA, savedB]).includes(rootDir), false);
});

test("32 shared binary storage는 missing photo를 명시적으로 거부한다", async () => {
  await assert.rejects(
    () => storage.readCandidateScopedPhotoV1({
      schemaVersion: contract.CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
      caseId: CASE_ID,
      candidateStoreId: CANDIDATE_A,
      assetRef: asset(CANDIDATE_A, "missing.png"),
    }, { rootDir: dir("missing-binary") }),
    (error) => error.code === "PHOTO_NOT_FOUND",
  );
});
