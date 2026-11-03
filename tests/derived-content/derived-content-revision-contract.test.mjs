import assert from "node:assert/strict";
import fs from "node:fs";
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

const contract = require(path.join(workspaceRoot, "lib/derived-content/index.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const CASE_ID = "case-derived-content";
const CANDIDATE_ID = "store_11111111-1111-4111-8111-111111111111";
const SURVEY_ID = "survey_22222222-2222-4222-8222-222222222222";
const PHOTO_ID = "photo_33333333-3333-4333-8333-333333333333";
const REV_1 = "derived_rev_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REV_2 = "derived_rev_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REV_3 = "derived_rev_cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const APPROVED_REV = "derived_rev_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const T1 = "2026-11-01T00:00:00.000Z";
const T2 = "2026-11-01T01:00:00.000Z";
const T3 = "2026-11-01T02:00:00.000Z";

function fieldPayload(overrides = {}) {
  return {
    locationSummary: "아파트 생활동선과 후보점포가 연결됩니다.",
    strengths: ["주동선 가시성"],
    checks: ["퇴근 시간대 재확인"],
    competitionNotes: ["인근 경쟁점 확인"],
    vehicleAccessNotes: ["단기정차 확인 필요"],
    fieldObservations: ["현장 관찰 원문 기반"],
    reportSummary: "현장 관찰을 구조화한 초안입니다.",
    ...overrides,
  };
}

function emptyFieldPayload() {
  return {
    locationSummary: "",
    strengths: [],
    checks: [],
    competitionNotes: [],
    vehicleAccessNotes: [],
    fieldObservations: [],
    reportSummary: "",
  };
}

function fieldRevision(overrides = {}) {
  return {
    schemaVersion: contract.DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
    revisionId: REV_1,
    revisionSequence: 1,
    contentKind: "FIELD_NOTE_STRUCTURE",
    caseId: CASE_ID,
    candidateStoreId: CANDIDATE_ID,
    subjectRef: SURVEY_ID,
    rawSourceRef: "field-note-raw-rev-1",
    parentRevisionId: null,
    supersedesApprovedRevisionId: null,
    status: "DRAFT",
    origin: "AI",
    promptContractVersion: "field-note-structure-prompt-v1",
    modelId: null,
    createdAt: T1,
    createdBy: "system-ai",
    reviewedAt: null,
    reviewedBy: null,
    approvedAt: null,
    approvedBy: null,
    payload: fieldPayload(),
    ...overrides,
  };
}

function photoRevision(overrides = {}) {
  return {
    schemaVersion: contract.DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
    revisionId: REV_1,
    revisionSequence: 1,
    contentKind: "PHOTO_CAPTION",
    caseId: CASE_ID,
    candidateStoreId: CANDIDATE_ID,
    subjectRef: PHOTO_ID,
    rawSourceRef: "photo-metadata-rev-1",
    parentRevisionId: null,
    supersedesApprovedRevisionId: null,
    status: "DRAFT",
    origin: "AI",
    promptContractVersion: "photo-caption-prompt-v1",
    modelId: null,
    createdAt: T1,
    createdBy: "system-ai",
    reviewedAt: null,
    reviewedBy: null,
    approvedAt: null,
    approvedBy: null,
    payload: { title: "매장 정면", caption: "후보점포 정면과 간판 가시성을 확인합니다.", needsConfirmation: true },
    ...overrides,
  };
}

function approvedFieldRevision(overrides = {}) {
  return fieldRevision({
    revisionId: APPROVED_REV,
    status: "APPROVED",
    approvedAt: T2,
    approvedBy: "reviewer-1",
    ...overrides,
  });
}

function builderInput(revision) {
  const input = { ...revision };
  delete input.schemaVersion;
  delete input.contentKind;
  return input;
}

function expectFailure(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
}

test("1. Field Note DRAFT를 생성한다", () => {
  const value = contract.createFieldNoteStructuredRevisionV1(builderInput(fieldRevision()));
  assert.equal(value.status, "DRAFT");
  assert.equal(value.contentKind, "FIELD_NOTE_STRUCTURE");
});

test("2. Photo Caption DRAFT를 생성한다", () => {
  const value = contract.createPhotoCaptionRevisionV1(builderInput(photoRevision()));
  assert.equal(value.status, "DRAFT");
  assert.equal(value.contentKind, "PHOTO_CAPTION");
});

test("3. contentKind와 반대 payload 조합을 차단한다", () => {
  assert.equal(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: photoRevision().payload })).ok, false);
  assert.equal(contract.validateDerivedContentRevisionV1(photoRevision({ payload: fieldPayload() })).ok, false);
});

test("4. malformed status를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ status: "PUBLISHED" })), "INVALID_STATUS");
});

test("5. invalid origin을 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ origin: "SYSTEM" })), "INVALID_ORIGIN");
});

test("6. empty caseId를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ caseId: "" })), "INVALID_CONTEXT");
});

test("7. malformed Candidate ID를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ candidateStoreId: "candidate-1" })), "INVALID_CONTEXT");
});

test("8. empty subjectRef를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ subjectRef: "" })), "INVALID_SUBJECT_REFERENCE");
});

test("9. empty rawSourceRef를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ rawSourceRef: "" })), "INVALID_RAW_SOURCE_REFERENCE");
});

test("10. stable revision ID는 derived_rev UUID를 사용한다", () => {
  const first = contract.createDerivedContentRevisionId();
  const second = contract.createDerivedContentRevisionId();
  assert.equal(contract.isDerivedContentRevisionId(first), true);
  assert.notEqual(first, second);
});

test("11. 1 미만 및 비정수 revisionSequence를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ revisionSequence: 0 })), "INVALID_REVISION_SEQUENCE");
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ revisionSequence: 1.5 })), "INVALID_REVISION_SEQUENCE");
});

test("12. DRAFT에는 review/approval timestamp와 actor가 없어야 한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ reviewedAt: T2, reviewedBy: "reviewer-1" })), "INVALID_STATUS_METADATA");
});

test("13. REVIEWED에는 reviewedAt/reviewedBy가 모두 필요하다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ status: "REVIEWED" })), "INVALID_STATUS_METADATA");
  assert.equal(contract.validateDerivedContentRevisionV1(fieldRevision({ status: "REVIEWED", reviewedAt: T2, reviewedBy: "reviewer-1" })).ok, true);
});

test("14. APPROVED에는 approvedAt/approvedBy가 모두 필요하다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ status: "APPROVED" })), "INVALID_STATUS_METADATA");
  assert.equal(contract.validateDerivedContentRevisionV1(approvedFieldRevision()).ok, true);
});

test("15. DRAFT에서 REVIEWED로 새 Revision을 만든다", () => {
  const result = contract.transitionDerivedContentRevisionV1(fieldRevision(), "REVIEWED", {
    revisionId: REV_2, revisionSequence: 2, actor: "reviewer-1", transitionedAt: T2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.status, "REVIEWED");
});

test("16. REVIEWED에서 APPROVED로 새 Revision을 만든다", () => {
  const reviewed = contract.transitionDerivedContentRevisionV1(fieldRevision(), "REVIEWED", {
    revisionId: REV_2, revisionSequence: 2, actor: "reviewer-1", transitionedAt: T2,
  }).value;
  const approved = contract.transitionDerivedContentRevisionV1(reviewed, "APPROVED", {
    revisionId: REV_3, revisionSequence: 3, actor: "approver-1", transitionedAt: T3,
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.value.approvedBy, "approver-1");
  assert.equal(approved.value.reviewedBy, "reviewer-1");
});

test("17. DRAFT에서 APPROVED 직접 전이는 actor/time이 있으면 허용한다", () => {
  const result = contract.transitionDerivedContentRevisionV1(fieldRevision(), "APPROVED", {
    revisionId: REV_2, revisionSequence: 2, actor: "approver-1", transitionedAt: T2,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.reviewedAt, null);
  assert.equal(result.value.approvedAt, T2);
});

test("18. APPROVED downgrade를 차단한다", () => {
  expectFailure(contract.transitionDerivedContentRevisionV1(approvedFieldRevision(), "REVIEWED", {
    revisionId: REV_2, revisionSequence: 2, actor: "reviewer-1", transitionedAt: T3,
  }), "INVALID_STATUS_TRANSITION");
});

test("19. 전이 후 기존 APPROVED Revision은 immutable하다", () => {
  const existing = approvedFieldRevision();
  const before = structuredClone(existing);
  contract.transitionDerivedContentRevisionV1(existing, "DRAFT", {
    revisionId: REV_2, revisionSequence: 2, actor: "editor-1", transitionedAt: T3,
  });
  assert.deepEqual(existing, before);
});

test("20. AI regeneration은 기존 것을 바꾸지 않고 새 DRAFT다", () => {
  const existing = approvedFieldRevision();
  const regenerated = contract.createFieldNoteStructuredRevisionV1(builderInput(fieldRevision({
    revisionId: REV_2,
    revisionSequence: 2,
    parentRevisionId: existing.revisionId,
    payload: fieldPayload({ reportSummary: "새 원문에서 다시 생성한 초안입니다." }),
  })));
  assert.equal(regenerated.status, "DRAFT");
  assert.notEqual(regenerated.revisionId, existing.revisionId);
  assert.equal(existing.status, "APPROVED");
});

test("21. 전이 결과에 parentRevisionId 계보를 유지한다", () => {
  const result = contract.transitionDerivedContentRevisionV1(fieldRevision(), "REVIEWED", {
    revisionId: REV_2, revisionSequence: 2, actor: "reviewer-1", transitionedAt: T2,
  });
  assert.equal(result.value.parentRevisionId, REV_1);
});

test("22. self parent reference를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ parentRevisionId: REV_1 })), "INVALID_REVISION_LINK");
});

test("23. 새 APPROVED에 supersedesApprovedRevisionId를 연결한다", () => {
  const result = contract.transitionDerivedContentRevisionV1(fieldRevision(), "APPROVED", {
    revisionId: REV_2,
    revisionSequence: 2,
    actor: "approver-1",
    transitionedAt: T2,
    supersedesApprovedRevisionId: APPROVED_REV,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.supersedesApprovedRevisionId, APPROVED_REV);
});

test("24. self supersede reference를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(approvedFieldRevision({ supersedesApprovedRevisionId: APPROVED_REV })), "INVALID_REVISION_LINK");
});

test("25. Field Note locationSummary 2문장 예산을 검증한다", () => {
  assert.equal(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: fieldPayload({ locationSummary: "첫 문장입니다. 두 번째 문장입니다." }) })).ok, true);
  assert.equal(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: fieldPayload({ locationSummary: "첫 문장. 둘째 문장. 셋째 문장." }) })).ok, false);
});

test("26. strengths 3개를 거부한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: fieldPayload({ strengths: ["1", "2", "3"] }) })), "INVALID_FIELD_NOTE_PAYLOAD");
});

test("27. checks 3개를 거부한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: fieldPayload({ checks: ["1", "2", "3"] }) })), "INVALID_FIELD_NOTE_PAYLOAD");
});

test("28. reportSummary 3문장 초과를 거부한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: fieldPayload({ reportSummary: "하나. 둘. 셋. 넷." }) })), "INVALID_FIELD_NOTE_PAYLOAD");
});

test("29. Photo caption은 1~2문장만 허용한다", () => {
  assert.equal(contract.validateDerivedContentRevisionV1(photoRevision({ payload: { ...photoRevision().payload, caption: "하나. 둘." } })).ok, true);
  assert.equal(contract.validateDerivedContentRevisionV1(photoRevision({ payload: { ...photoRevision().payload, caption: "하나. 둘. 셋." } })).ok, false);
});

test("30. empty Photo caption을 거부한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(photoRevision({ payload: { ...photoRevision().payload, caption: "" } })), "INVALID_PHOTO_CAPTION_PAYLOAD");
});

test("31. needsConfirmation은 boolean만 허용한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(photoRevision({ payload: { ...photoRevision().payload, needsConfirmation: "yes" } })), "INVALID_PHOTO_CAPTION_PAYLOAD");
  assert.equal(contract.validateDerivedContentRevisionV1(photoRevision({ payload: { ...photoRevision().payload, needsConfirmation: false } })).value.payload.needsConfirmation, false);
});

test("32. AI origin에는 promptContractVersion이 필요하다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(fieldRevision({ promptContractVersion: null })), "INVALID_PROVENANCE");
});

test("33. Provider 미연결 상태의 modelId null을 허용한다", () => {
  const result = contract.validateDerivedContentRevisionV1(fieldRevision({ modelId: null }));
  assert.equal(result.ok, true);
  assert.equal(result.value.modelId, null);
});

test("34. parent 없는 initial HUMAN_EDIT Revision을 허용한다", () => {
  const result = contract.validateDerivedContentRevisionV1(fieldRevision({
    origin: "HUMAN_EDIT", promptContractVersion: null, modelId: null, createdBy: "staff-1",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.parentRevisionId, null);
});

test("35. DRAFT는 Report eligibility false다", () => {
  assert.equal(contract.isDerivedContentRevisionReportEligibleV1(fieldRevision()), false);
});

test("36. REVIEWED는 Report eligibility false다", () => {
  assert.equal(contract.isDerivedContentRevisionReportEligibleV1(fieldRevision({ status: "REVIEWED", reviewedAt: T2, reviewedBy: "reviewer-1" })), false);
});

test("37. APPROVED만 Report eligibility true다", () => {
  assert.equal(contract.isDerivedContentRevisionReportEligibleV1(approvedFieldRevision()), true);
  assert.throws(() => contract.isDerivedContentRevisionReportEligibleV1({ ...approvedFieldRevision(), unexpected: true }), TypeError);
});

test("38. 실질 내용이 없는 Field Note APPROVED payload를 차단한다", () => {
  expectFailure(contract.validateDerivedContentRevisionV1(approvedFieldRevision({ payload: emptyFieldPayload() })), "EMPTY_APPROVED_CONTENT");
  assert.equal(contract.validateDerivedContentRevisionV1(fieldRevision({ payload: emptyFieldPayload() })).ok, true);
});

test("39. validation과 transition은 입력을 mutate하지 않는다", () => {
  const input = fieldRevision();
  const before = structuredClone(input);
  contract.validateDerivedContentRevisionV1(input);
  contract.transitionDerivedContentRevisionV1(input, "REVIEWED", {
    revisionId: REV_2, revisionSequence: 2, actor: "reviewer-1", transitionedAt: T2,
  });
  assert.deepEqual(input, before);
});

test("40. nested payload arrays까지 output을 freeze한다", () => {
  const value = contract.validateDerivedContentRevisionV1(fieldRevision()).value;
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.payload), true);
  assert.equal(Object.isFrozen(value.payload.strengths), true);
});

test("41. 동일 입력 validation output은 deterministic하다", () => {
  const first = contract.validateDerivedContentRevisionV1(fieldRevision());
  const second = contract.validateDerivedContentRevisionV1(fieldRevision());
  assert.deepEqual(first, second);
});

test("42. Derived Content contract는 Evidence를 생성하거나 포함하지 않는다", () => {
  const value = contract.validateDerivedContentRevisionV1(fieldRevision()).value;
  assert.equal("evidence" in value, false);
  assert.equal("evidenceRef" in value, false);
  assert.equal(JSON.stringify(value).includes("EvidenceOwnership"), false);
});
