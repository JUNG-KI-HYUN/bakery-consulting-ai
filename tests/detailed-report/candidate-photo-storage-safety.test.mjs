import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(workspaceRoot, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return previousModuleLoad.call(this, request, parent, isMain);
};

const photos = require(path.join(workspaceRoot, "lib/detailed-report/photo-repository.server.ts"));
const {
  CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
  CandidatePhotoStorageError,
  createCandidateScopedPhotoReferenceV1,
  readCandidateScopedDetailedReportPhotoV1,
  readDetailedReportPhoto,
  saveCandidateScopedDetailedReportPhotoV1,
  saveDetailedReportPhoto,
} = photos;

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
  Module._load = previousModuleLoad;
});

const CASE_X = "case-photo-x";
const CASE_Y = "case-photo-y";
const CANDIDATE_A = "store_11111111-1111-4111-8111-111111111111";
const CANDIDATE_B = "store_22222222-2222-4222-8222-222222222222";
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function pngFile(name = "fixture.png") {
  return new File([PNG], name, { type: "image/png" });
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "frameone-candidate-photo-safety-"));
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.equal(error instanceof CandidatePhotoStorageError, true);
    assert.equal(error.code, code);
    assert.equal(error.message.includes(workspaceRoot), false);
    assert.equal(error.message.includes("data/detailed-report-photos"), false);
    return true;
  });
}

test("1-5. Candidate A/B upload과 read가 분리된 Case/Candidate 경로에서 성공한다", async () => {
  const rootDir = makeRoot();
  try {
    const a = await saveCandidateScopedDetailedReportPhotoV1(CASE_X, CANDIDATE_A, pngFile("a.png"), { rootDir, randomId: () => "photo-a" });
    const b = await saveCandidateScopedDetailedReportPhotoV1(CASE_X, CANDIDATE_B, pngFile("b.png"), { rootDir, randomId: () => "photo-b" });
    assert.equal(fs.existsSync(path.join(rootDir, CASE_X, CANDIDATE_A, "photo-a.png")), true);
    assert.equal(fs.existsSync(path.join(rootDir, CASE_X, CANDIDATE_B, "photo-b.png")), true);
    assert.deepEqual((await readCandidateScopedDetailedReportPhotoV1(a.reference, { rootDir })).bytes, PNG);
    assert.deepEqual((await readCandidateScopedDetailedReportPhotoV1(b.reference, { rootDir })).bytes, PNG);
    assert.notEqual(a.reference.assetRef, b.reference.assetRef);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("6-8. Candidate/Case context mismatch를 구분해 차단한다", async () => {
  const rootDir = makeRoot();
  try {
    const a = await saveCandidateScopedDetailedReportPhotoV1(CASE_X, CANDIDATE_A, pngFile(), { rootDir, randomId: () => "photo-a" });
    await expectCode(() => readCandidateScopedDetailedReportPhotoV1({ ...a.reference, candidateStoreId: CANDIDATE_B }, { rootDir }), "FOREIGN_CANDIDATE_PHOTO");
    const b = await saveCandidateScopedDetailedReportPhotoV1(CASE_X, CANDIDATE_B, pngFile(), { rootDir, randomId: () => "photo-b" });
    await expectCode(() => readCandidateScopedDetailedReportPhotoV1({ ...b.reference, candidateStoreId: CANDIDATE_A }, { rootDir }), "FOREIGN_CANDIDATE_PHOTO");
    await expectCode(() => readCandidateScopedDetailedReportPhotoV1({ ...a.reference, caseId: CASE_Y }, { rootDir }), "FOREIGN_CASE_PHOTO");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("9-10. foreign/invalid write context를 저장 전에 차단한다", async () => {
  const rootDir = makeRoot();
  try {
    await expectCode(() => saveCandidateScopedDetailedReportPhotoV1("../foreign", CANDIDATE_A, pngFile(), { rootDir }), "INVALID_CASE_ID");
    await expectCode(() => saveCandidateScopedDetailedReportPhotoV1(CASE_X, "candidate-b", pngFile(), { rootDir }), "INVALID_CANDIDATE_ID");
    assert.deepEqual(fs.readdirSync(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("11-13. traversal, root escape, path segment mismatch를 차단한다", async () => {
  const rootDir = makeRoot();
  try {
    await expectCode(() => readCandidateScopedDetailedReportPhotoV1({
      schemaVersion: CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
      caseId: CASE_X,
      candidateStoreId: CANDIDATE_A,
      assetRef: "../../outside.png",
    }, { rootDir }), "INVALID_STORAGE_REFERENCE");
    await assert.rejects(
      async () => createCandidateScopedPhotoReferenceV1(CASE_X, CANDIDATE_A, path.relative(workspaceRoot, path.join(rootDir, "..", "outside.png")), { rootDir }),
      (error) => error.code === "INVALID_STORAGE_REFERENCE",
    );
    const nested = path.relative(workspaceRoot, path.join(rootDir, CASE_X, CANDIDATE_A, "nested", "photo.png"));
    assert.throws(
      () => createCandidateScopedPhotoReferenceV1(CASE_X, CANDIDATE_A, nested, { rootDir }),
      (error) => error.code === "PHOTO_PATH_MISMATCH",
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("14. 존재하지 않는 Candidate photo는 안전한 PHOTO_NOT_FOUND를 반환한다", async () => {
  const rootDir = makeRoot();
  try {
    const missingPath = path.relative(workspaceRoot, path.join(rootDir, CASE_X, CANDIDATE_A, "missing.png"));
    const reference = createCandidateScopedPhotoReferenceV1(CASE_X, CANDIDATE_A, missingPath, { rootDir });
    await expectCode(() => readCandidateScopedDetailedReportPhotoV1(reference, { rootDir }), "PHOTO_NOT_FOUND");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("15. legacy case-scoped upload/read 흐름을 유지한다", async () => {
  const rootDir = makeRoot();
  try {
    const saved = await saveDetailedReportPhoto(CASE_X, pngFile(), { rootDir, randomId: () => "legacy-photo" });
    const read = await readDetailedReportPhoto(saved.fileRef, { rootDir });
    assert.deepEqual(read.bytes, PNG);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("17-20. opaque response, input immutable, binary 불변, 실패 read의 파일 삭제 없음", async () => {
  const rootDir = makeRoot();
  try {
    const saved = await saveCandidateScopedDetailedReportPhotoV1(CASE_X, CANDIDATE_A, pngFile(), { rootDir, randomId: () => "stable-photo" });
    const serialized = JSON.stringify(saved);
    assert.equal(serialized.includes(rootDir), false);
    assert.equal(serialized.includes("data/detailed-report-photos"), false);
    assert.equal(serialized.includes("fileRef"), false);
    const reference = Object.freeze({ ...saved.reference });
    const before = structuredClone(reference);
    const binaryPath = path.join(rootDir, CASE_X, CANDIDATE_A, "stable-photo.png");
    const bytesBefore = fs.readFileSync(binaryPath);
    await readCandidateScopedDetailedReportPhotoV1(reference, { rootDir });
    assert.deepEqual(reference, before);
    assert.deepEqual(fs.readFileSync(binaryPath), bytesBefore);
    const filesBefore = fs.readdirSync(path.dirname(binaryPath));
    await expectCode(() => readCandidateScopedDetailedReportPhotoV1({ ...reference, candidateStoreId: CANDIDATE_B }, { rootDir }), "FOREIGN_CANDIDATE_PHOTO");
    assert.deepEqual(fs.readdirSync(path.dirname(binaryPath)), filesBefore);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
