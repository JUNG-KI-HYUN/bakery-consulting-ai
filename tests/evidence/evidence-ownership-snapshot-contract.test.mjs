import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(
    specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
  );
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

after(() => {
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const {
  EVIDENCE_OWNERSHIP_SCHEMA_VERSION,
  EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/evidence/ownership-snapshot-types.ts"));
const {
  toEvidenceSnapshotReferenceV1,
  validateEvidenceOwnershipBindingsV1,
  validateEvidenceOwnershipV1,
  validateEvidenceSnapshotV1,
} = loadModule(path.join(repositoryRoot, "lib/evidence/ownership-snapshot-validation.ts"));

const CASE_X = "fixture:case:x";
const CASE_Y = "fixture:case:y";
const CLUSTER_C1 = "fixture:cluster:c1";
const CLUSTER_C2 = "fixture:cluster:c2";
const A01 = "store_11111111-1111-4111-8111-111111111111";
const A02 = "store_22222222-2222-4222-8222-222222222222";
const REFS = Object.freeze({
  case: "fixture:evidence:case",
  cluster: "fixture:evidence:cluster-c1",
  candidate: "fixture:evidence:candidate-a01",
  candidateA02: "fixture:evidence:candidate-a02",
  clusterC2: "fixture:evidence:cluster-c2",
  caseY: "fixture:evidence:case-y",
  newEvidence: "fixture:evidence:new",
});

function ownership(scopeType, overrides = {}) {
  return {
    schemaVersion: EVIDENCE_OWNERSHIP_SCHEMA_VERSION,
    scopeType,
    caseId: CASE_X,
    ...(scopeType === "ANALYSIS_CLUSTER" ? { analysisClusterId: CLUSTER_C1 } : {}),
    ...(scopeType === "CANDIDATE" ? { analysisClusterId: CLUSTER_C1, candidateStoreId: A01 } : {}),
    ...overrides,
  };
}

function bindings() {
  return [
    { evidenceRef: REFS.case, ownership: ownership("CASE") },
    { evidenceRef: REFS.cluster, ownership: ownership("ANALYSIS_CLUSTER") },
    { evidenceRef: REFS.candidate, ownership: ownership("CANDIDATE") },
    { evidenceRef: REFS.candidateA02, ownership: ownership("CANDIDATE", { candidateStoreId: A02 }) },
    { evidenceRef: REFS.clusterC2, ownership: ownership("ANALYSIS_CLUSTER", { analysisClusterId: CLUSTER_C2 }) },
    { evidenceRef: REFS.caseY, ownership: ownership("CASE", { caseId: CASE_Y }) },
  ];
}

function snapshot(overrides = {}) {
  return {
    schemaVersion: EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: "fixture:evidence-snapshot:a01:v1",
    caseId: CASE_X,
    ownershipContext: ownership("CANDIDATE"),
    evidenceRefs: [REFS.case, REFS.cluster, REFS.candidate],
    capturedAt: "2026-10-30T12:00:00.000Z",
    snapshotVersion: "1",
    createdBy: "fixture-system",
    sourceManifestVersion: "fixture-manifest-v1",
    ...overrides,
  };
}

function expectSnapshotSuccess(value = snapshot(), sidecars = bindings()) {
  const result = validateEvidenceSnapshotV1(value, sidecars);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  return result.value;
}

function expectSnapshotFailure(value, sidecars, code) {
  const result = validateEvidenceSnapshotV1(value, sidecars);
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.equal("value" in result, false);
  return result;
}

test("1. invalid scopeType을 거부한다", () => {
  const result = validateEvidenceOwnershipV1(ownership("CANDIDATE", { scopeType: "SHARED" }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_EVIDENCE_OWNERSHIP");
});

test("2. CANDIDATE scope에 candidateStoreId가 없으면 거부한다", () => {
  const value = ownership("CANDIDATE");
  delete value.candidateStoreId;
  assert.equal(validateEvidenceOwnershipV1(value).ok, false);
});

test("3. ANALYSIS_CLUSTER scope에 analysisClusterId가 없으면 거부한다", () => {
  const value = ownership("ANALYSIS_CLUSTER");
  delete value.analysisClusterId;
  assert.equal(validateEvidenceOwnershipV1(value).ok, false);
});

test("4. scope에 맞지 않는 ID 조합을 거부한다", () => {
  assert.equal(validateEvidenceOwnershipV1(ownership("CASE", { candidateStoreId: A01 })).ok, false);
  assert.equal(validateEvidenceOwnershipV1(ownership("ANALYSIS_CLUSTER", { candidateStoreId: A01 })).ok, false);
});

test("5. Case X + Cluster C1 + Candidate A01 Snapshot을 허용한다", () => {
  const value = expectSnapshotSuccess();
  assert.deepEqual(value.evidenceRefs, [REFS.case, REFS.cluster, REFS.candidate]);
});

test("6. A01 Snapshot의 A02 Candidate Evidence를 거부한다", () => {
  expectSnapshotFailure(
    snapshot({ evidenceRefs: [REFS.case, REFS.candidateA02] }),
    bindings(),
    "FOREIGN_CANDIDATE_EVIDENCE",
  );
});

test("7. C1 Snapshot의 C2 Cluster Evidence를 거부한다", () => {
  expectSnapshotFailure(
    snapshot({ evidenceRefs: [REFS.case, REFS.clusterC2] }),
    bindings(),
    "FOREIGN_CLUSTER_EVIDENCE",
  );
});

test("8. Case X Snapshot의 Case Y Evidence를 거부한다", () => {
  expectSnapshotFailure(
    snapshot({ evidenceRefs: [REFS.caseY] }),
    bindings(),
    "FOREIGN_CASE_EVIDENCE",
  );
});

test("9. duplicate evidenceRef와 빈 evidenceRef를 거부한다", () => {
  expectSnapshotFailure(
    snapshot({ evidenceRefs: [REFS.case, REFS.case] }),
    bindings(),
    "INVALID_EVIDENCE_SNAPSHOT",
  );
  expectSnapshotFailure(
    snapshot({ evidenceRefs: [REFS.case, ""] }),
    bindings(),
    "INVALID_EVIDENCE_SNAPSHOT",
  );
});

test("10. snapshotVersion과 capturedAt을 필수로 요구한다", () => {
  expectSnapshotFailure(snapshot({ snapshotVersion: "" }), bindings(), "INVALID_EVIDENCE_SNAPSHOT");
  expectSnapshotFailure(snapshot({ capturedAt: "" }), bindings(), "INVALID_EVIDENCE_SNAPSHOT");
});

test("11. ownership 없는 Evidence reference를 거부한다", () => {
  expectSnapshotFailure(
    snapshot({ evidenceRefs: [REFS.case, "fixture:evidence:unbound"] }),
    bindings(),
    "EVIDENCE_OWNERSHIP_NOT_FOUND",
  );
});

test("12. ownership binding의 중복 ID를 거부한다", () => {
  const sidecars = bindings();
  const result = validateEvidenceOwnershipBindingsV1([...sidecars, sidecars[0]]);
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_EVIDENCE_OWNERSHIP_BINDING");
});

test("13. Snapshot 생성은 입력을 mutate하지 않고 nested 값을 freeze한다", () => {
  const input = snapshot();
  const sidecars = bindings();
  const inputBefore = structuredClone(input);
  const sidecarsBefore = structuredClone(sidecars);
  const value = expectSnapshotSuccess(input, sidecars);
  assert.deepEqual(input, inputBefore);
  assert.deepEqual(sidecars, sidecarsBefore);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.ownershipContext), true);
  assert.equal(Object.isFrozen(value.evidenceRefs), true);
});

test("14. Snapshot V1은 새 Evidence 추가 후에도 불변이며 V2를 별도로 만든다", () => {
  const sidecars = [...bindings(), {
    evidenceRef: REFS.newEvidence,
    ownership: ownership("CANDIDATE"),
  }];
  const v1 = expectSnapshotSuccess(snapshot(), sidecars);
  const v2 = expectSnapshotSuccess(snapshot({
    snapshotId: "fixture:evidence-snapshot:a01:v2",
    snapshotVersion: "2",
    evidenceRefs: [...snapshot().evidenceRefs, REFS.newEvidence],
  }), sidecars);
  assert.deepEqual(v1.evidenceRefs, [REFS.case, REFS.cluster, REFS.candidate]);
  assert.equal(v2.evidenceRefs.includes(REFS.newEvidence), true);
  assert.notEqual(v1.snapshotId, v2.snapshotId);
  assert.notEqual(v1.snapshotVersion, v2.snapshotVersion);
});

test("15. explicit 0, false, negative Evidence는 수정 없이 reference만 pinning한다", () => {
  const sourceEvidence = [
    { id: REFS.case, assertedValue: 0 },
    { id: REFS.cluster, assertedValue: false },
    { id: REFS.candidate, assertedValue: -1 },
  ];
  const before = structuredClone(sourceEvidence);
  const value = expectSnapshotSuccess(snapshot({ evidenceRefs: sourceEvidence.map((item) => item.id) }));
  assert.deepEqual(sourceEvidence, before);
  assert.deepEqual(value.evidenceRefs, sourceEvidence.map((item) => item.id));
  assert.equal("evidence" in value, false);
});

test("16. Phase 4G/4H EvidenceSnapshotReferenceV1 shape으로 lossless 변환한다", () => {
  const value = expectSnapshotSuccess();
  const reference = toEvidenceSnapshotReferenceV1(value);
  assert.deepEqual(reference, {
    snapshotId: value.snapshotId,
    snapshotVersion: value.snapshotVersion,
    capturedAt: value.capturedAt,
    evidenceRefs: value.evidenceRefs,
  });
  assert.equal(reference.evidenceRefs, value.evidenceRefs);
  assert.equal(Object.isFrozen(reference), true);
});

test("17. Snapshot 안에 Evidence 객체나 값 필드를 넣지 못한다", () => {
  const result = expectSnapshotFailure(
    { ...snapshot(), evidence: [{ id: REFS.case }], assertedValue: 0 },
    bindings(),
    "INVALID_EVIDENCE_SNAPSHOT",
  );
  assert.match(result.errors.join("\n"), /허용되지 않습니다/);
});
