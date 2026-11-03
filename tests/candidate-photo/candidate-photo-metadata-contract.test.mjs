import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(workspaceRoot, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const contract = require(path.join(workspaceRoot, "lib/candidate-photo/index.ts"));
const ownership = require(path.join(workspaceRoot, "lib/evidence/ownership-snapshot-types.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const CASE_A = "case-photo-metadata-a";
const CASE_B = "case-photo-metadata-b";
const CANDIDATE_A = "store_11111111-1111-4111-8111-111111111111";
const CANDIDATE_B = "store_22222222-2222-4222-8222-222222222222";
const PHOTO_1 = "photo_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO_2 = "photo_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-11-01T00:00:00.000Z";

function asset(caseId = CASE_A, candidateStoreId = CANDIDATE_A, fileName = "photo-1.png") {
  return contract.createCandidatePhotoAssetRefV1(caseId, candidateStoreId, fileName);
}

function metadata(overrides = {}) {
  return {
    schemaVersion: contract.CANDIDATE_PHOTO_METADATA_SCHEMA_VERSION,
    metadataVersion: "1",
    photoId: PHOTO_1,
    caseId: CASE_A,
    candidateStoreId: CANDIDATE_A,
    assetRef: asset(),
    evidenceRef: null,
    category: "FRONT",
    sortOrder: 0,
    includeInBriefing: null,
    includeInReport: null,
    fieldMemoRaw: null,
    uploadedAt: NOW,
    takenAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function profile(photoIds = [PHOTO_1], overrides = {}) {
  return {
    schemaVersion: contract.CANDIDATE_PHOTO_PROFILE_SCHEMA_VERSION,
    profileVersion: "1",
    caseId: CASE_A,
    candidateStoreId: CANDIDATE_A,
    primaryPhotoId: photoIds[0] ?? null,
    photoIds,
    updatedAt: NOW,
    ...overrides,
  };
}

function candidateEvidence(evidenceRef = "evidence-photo-1", candidateStoreId = CANDIDATE_A, caseId = CASE_A) {
  return {
    evidenceRef,
    ownership: {
      schemaVersion: ownership.EVIDENCE_OWNERSHIP_SCHEMA_VERSION,
      scopeType: "CANDIDATE",
      caseId,
      candidateStoreId,
    },
  };
}

function expectFailure(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
}

test("1. 정상 metadata를 strict validation한다", () => {
  const result = contract.validateCandidatePhotoMetadataV1(metadata());
  assert.equal(result.ok, true);
  assert.equal(result.value.photoId, PHOTO_1);
});

test("2. 사진 0개 profile을 허용한다", () => {
  const result = contract.validateCandidatePhotoCollectionV1(profile([], { primaryPhotoId: null }), []);
  assert.equal(result.ok, true);
  assert.equal(result.value.photos.length, 0);
});

test("3. 사진 1개 profile을 검증한다", () => {
  assert.equal(contract.validateCandidatePhotoCollectionV1(profile(), [metadata()]).ok, true);
});

test("4. 사진 15개 profile을 검증한다", () => {
  const photos = Array.from({ length: 15 }, (_, index) => {
    const suffix = (index + 1).toString(16).padStart(12, "0");
    const photoId = `photo_00000000-0000-4000-8000-${suffix}`;
    return metadata({ photoId, assetRef: asset(CASE_A, CANDIDATE_A, `photo-${index}.png`), sortOrder: index });
  });
  const result = contract.validateCandidatePhotoCollectionV1(profile(photos.map((photo) => photo.photoId)), photos);
  assert.equal(result.ok, true);
  assert.equal(result.value.photos.length, 15);
});

test("5. stable photo ID는 filename/index와 무관한 photo UUID다", () => {
  const first = contract.createCandidatePhotoId();
  const second = contract.createCandidatePhotoId();
  assert.equal(contract.isCandidatePhotoId(first), true);
  assert.notEqual(first, second);
  assert.equal(first.includes("photo-1.png"), false);
});

test("6. metadata collection의 duplicate photoId를 차단한다", () => {
  const duplicate = metadata({ assetRef: asset(CASE_A, CANDIDATE_A, "photo-2.png") });
  expectFailure(contract.validateCandidatePhotoCollectionV1(profile([PHOTO_1]), [metadata(), duplicate]), "DUPLICATE_PHOTO_ID");
});

test("7. foreign Candidate metadata를 차단한다", () => {
  const foreign = metadata({ candidateStoreId: CANDIDATE_B, assetRef: asset(CASE_A, CANDIDATE_B) });
  expectFailure(contract.validateCandidatePhotoCollectionV1(profile(), [foreign]), "FOREIGN_CANDIDATE_PHOTO");
});

test("8. foreign Case metadata를 차단한다", () => {
  const foreign = metadata({ caseId: CASE_B, assetRef: asset(CASE_B, CANDIDATE_A) });
  expectFailure(contract.validateCandidatePhotoCollectionV1(profile(), [foreign]), "FOREIGN_CASE_PHOTO");
});

test("9. assetRef Candidate mismatch를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ assetRef: asset(CASE_A, CANDIDATE_B) })), "FOREIGN_CANDIDATE_PHOTO");
});

test("10. assetRef Case mismatch를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ assetRef: asset(CASE_B, CANDIDATE_A) })), "FOREIGN_CASE_PHOTO");
});

test("11. malformed candidateStoreId를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ candidateStoreId: "candidate-a" })), "INVALID_PHOTO_METADATA");
});

test("12. 허용된 신규 category를 보존한다", () => {
  const result = contract.validateCandidatePhotoMetadataV1(metadata({ category: "STORE_FROM_APARTMENT" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.category, "STORE_FROM_APARTMENT");
});

test("13. 미등록 category를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ category: "AI_GUESSED" })), "INVALID_PHOTO_METADATA");
});

test("14. legacy DetailedPhoto category를 additive compatibility로 보존한다", () => {
  const result = contract.validateCandidatePhotoMetadataV1(metadata({ category: "POWER_PANEL" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.category, "POWER_PANEL");
});

test("15. sortOrder 0을 유효값으로 보존한다", () => {
  const result = contract.validateCandidatePhotoMetadataV1(metadata({ sortOrder: 0 }));
  assert.equal(result.ok, true);
  assert.equal(result.value.sortOrder, 0);
  const tied = contract.orderCandidatePhotoMetadataV1([
    result.value,
    contract.validateCandidatePhotoMetadataV1(metadata({ photoId: PHOTO_2, assetRef: asset(CASE_A, CANDIDATE_A, "photo-2.png"), sortOrder: 0 })).value,
  ]);
  assert.deepEqual(tied.map((photo) => photo.photoId), [PHOTO_1, PHOTO_2]);
});

test("16. 음수 sortOrder를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ sortOrder: -1 })), "INVALID_PHOTO_METADATA");
});

test("17. NaN과 Infinity sortOrder를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ sortOrder: Number.NaN })), "INVALID_PHOTO_METADATA");
  expectFailure(contract.validateCandidatePhotoMetadataV1(metadata({ sortOrder: Number.POSITIVE_INFINITY })), "INVALID_PHOTO_METADATA");
});

test("18. includeInBriefing true를 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ includeInBriefing: true })).value.includeInBriefing, true);
});

test("19. includeInBriefing false를 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ includeInBriefing: false })).value.includeInBriefing, false);
});

test("20. includeInBriefing null을 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ includeInBriefing: null })).value.includeInBriefing, null);
});

test("21. includeInReport true를 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ includeInReport: true })).value.includeInReport, true);
});

test("22. includeInReport false를 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ includeInReport: false })).value.includeInReport, false);
});

test("23. includeInReport null을 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ includeInReport: null })).value.includeInReport, null);
});

test("24. explicit false는 null과 구분된다", () => {
  const explicit = contract.validateCandidatePhotoMetadataV1(metadata({ includeInReport: false })).value;
  const undecided = contract.validateCandidatePhotoMetadataV1(metadata({ includeInReport: null })).value;
  assert.notEqual(explicit.includeInReport, undecided.includeInReport);
});

test("25. raw memo null을 보존하고 whitespace-only만 null로 정규화한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ fieldMemoRaw: null })).value.fieldMemoRaw, null);
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ fieldMemoRaw: "   " })).value.fieldMemoRaw, null);
});

test("26. nonblank raw memo 원문을 수정하지 않는다", () => {
  const memo = "  현장 메모 원문  ";
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ fieldMemoRaw: memo })).value.fieldMemoRaw, memo);
});

test("27. deletedAt null을 active 상태로 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ deletedAt: null })).value.deletedAt, null);
});

test("28. deletedAt tombstone timestamp를 보존한다", () => {
  assert.equal(contract.validateCandidatePhotoMetadataV1(metadata({ deletedAt: NOW })).value.deletedAt, NOW);
});

test("29. 정상 primaryPhotoId reference를 검증한다", () => {
  assert.equal(contract.validateCandidatePhotoCollectionV1(profile(), [metadata()]).value.profile.primaryPhotoId, PHOTO_1);
});

test("30. primaryPhotoId null을 허용한다", () => {
  assert.equal(contract.validateCandidatePhotoCollectionV1(profile([PHOTO_1], { primaryPhotoId: null }), [metadata()]).ok, true);
});

test("31. profile photoIds 밖의 foreign primary reference를 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoProfileV1(profile([PHOTO_1], { primaryPhotoId: PHOTO_2 })), "INVALID_PHOTO_PROFILE");
});

test("32. tombstone photo를 primary로 지정하지 못한다", () => {
  expectFailure(contract.validateCandidatePhotoCollectionV1(profile(), [metadata({ deletedAt: NOW })]), "PRIMARY_PHOTO_DELETED");
});

test("33. primary는 scalar reference 하나만 존재하고 metadata에 isPrimary를 허용하지 않는다", () => {
  const valid = contract.validateCandidatePhotoProfileV1(profile([PHOTO_1, PHOTO_2], { primaryPhotoId: PHOTO_2 }));
  assert.equal(valid.ok, true);
  assert.equal(Array.isArray(valid.value.primaryPhotoId), false);
  expectFailure(contract.validateCandidatePhotoMetadataV1({ ...metadata(), isPrimary: true }), "INVALID_PHOTO_METADATA");
});

test("34. evidenceRef null을 허용한다", () => {
  assert.equal(contract.validateCandidatePhotoCollectionV1(profile(), [metadata({ evidenceRef: null })]).ok, true);
});

test("35. 동일 Candidate Evidence ownership을 연결한다", () => {
  const result = contract.validateCandidatePhotoCollectionV1(
    profile(),
    [metadata({ evidenceRef: "evidence-photo-1" })],
    [candidateEvidence()],
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.photos[0].evidenceRef, "evidence-photo-1");
});

test("36. foreign Candidate Evidence ownership을 차단한다", () => {
  expectFailure(contract.validateCandidatePhotoCollectionV1(
    profile(),
    [metadata({ evidenceRef: "evidence-photo-1" })],
    [candidateEvidence("evidence-photo-1", CANDIDATE_B)],
  ), "FOREIGN_EVIDENCE");
});

test("37. customer-facing metadata contract에 raw filesystem path를 노출하지 않는다", () => {
  const value = contract.validateCandidatePhotoMetadataV1(metadata()).value;
  const serialized = JSON.stringify(value);
  assert.equal("fileRef" in value, false);
  assert.equal("storageReference" in value, false);
  assert.equal(serialized.includes("data/detailed-report-photos"), false);
  assert.equal(serialized.includes("C:\\"), false);
});

test("38. validation은 입력 객체와 배열을 변경하지 않는다", () => {
  const inputMetadata = metadata({ fieldMemoRaw: "  보존  " });
  const inputProfile = profile();
  const beforeMetadata = structuredClone(inputMetadata);
  const beforeProfile = structuredClone(inputProfile);
  contract.validateCandidatePhotoCollectionV1(inputProfile, [inputMetadata]);
  assert.deepEqual(inputMetadata, beforeMetadata);
  assert.deepEqual(inputProfile, beforeProfile);
});

test("39. 동일 입력의 validation output은 deterministic하다", () => {
  const first = contract.validateCandidatePhotoCollectionV1(profile(), [metadata()]);
  const second = contract.validateCandidatePhotoCollectionV1(profile(), [metadata()]);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first.value.photos[0]), true);
});

test("40. metadata validation은 기존 binary bytes를 읽거나 수정하지 않는다", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-photo-metadata-"));
  const binaryPath = path.join(tempDir, "existing.png");
  const before = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  try {
    fs.writeFileSync(binaryPath, before);
    assert.equal(contract.validateCandidatePhotoMetadataV1(metadata()).ok, true);
    assert.deepEqual(fs.readFileSync(binaryPath), before);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
