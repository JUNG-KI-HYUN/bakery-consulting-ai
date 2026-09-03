import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Existing node:test + TypeScript transpilation convention; all inputs below are isolated fixtures.
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText, filename);
};
after(() => {
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const { calculateEvidenceCoverage } = loadModule(path.join(repositoryRoot, "lib/evidence/coverage.ts"));
const { EVIDENCE_COVERAGE_POLICY_V1: policy, getEvidenceCoveragePolicy } = loadModule(path.join(repositoryRoot, "lib/evidence/coverage-policy.ts"));
const { sampleConsultation } = loadModule(path.join(repositoryRoot, "lib/diagnosis/sample-data.ts"));
const version = policy.policyVersion;
const electricity = policy.fields.find((field) => field.fieldPath.endsWith(".electricCapacity"));
const expansion = policy.fields.find((field) => field.fieldPath.endsWith(".electricExpansionPossible"));
const exhaust = policy.fields.find((field) => field.fieldPath.endsWith(".exhaustPossible"));

// Existing consultation fields, used only to test a mixed critical/non-critical calculation scope.
// These definitions are fixture policy inputs, not additions to the V1 facility policy.
const normalFixtureFields = Object.freeze([
  { fieldPath: "candidateStore.address", label: "주소 fixture", critical: false, weight: 1 },
  { fieldPath: "candidateStore.deposit", label: "보증금 fixture", critical: false, weight: 1 },
  { fieldPath: "candidateStore.rent", label: "월세 fixture", critical: false, weight: 1 },
  { fieldPath: "candidateStore.exclusiveArea", label: "전용면적 fixture", critical: false, weight: 1 },
].map((field) => Object.freeze(field)));
const mixedFixtureFields = Object.freeze([...policy.fields, ...normalFixtureFields]);

function evidenceFixture(fieldPath, verificationStatus = "VERIFIED", overrides = {}) {
  return Object.freeze({
    id: `fixture-${fieldPath}-${verificationStatus}`,
    fieldPath,
    sourceType: "DOCUMENT",
    verificationStatus,
    description: "Coverage fixture only; not an actual observation",
    ...overrides,
  });
}

function verifiedFixtures(definitions = policy.fields) {
  return definitions.map((field) => evidenceFixture(field.fieldPath));
}

function fieldsFixture(evidence, definitions = policy.fields) {
  return Object.freeze(definitions.map((field) => Object.freeze({ ...field, evidence })));
}

function calculateFixture(evidence, definitions = policy.fields) {
  return calculateEvidenceCoverage(fieldsFixture(evidence, definitions), version);
}

test("V1 policy is explicit, immutable and limited to the six existing facility fields", () => {
  assert.equal(version, "evidence-coverage-v1");
  assert.strictEqual(getEvidenceCoveragePolicy(version), policy);
  assert.equal(policy.fields.length, 6);
  assert.equal(sampleConsultation.consultation.sampleData, true);
  for (const field of mixedFixtureFields) {
    const [section, key] = field.fieldPath.split(".");
    assert.ok(Object.hasOwn(sampleConsultation[section], key));
  }
  assert.ok(expansion);
  assert.ok(policy.fields.every((field) => field.critical === (field !== expansion) && field.weight === 1));
  assert.deepEqual(policy.statusWeights, { VERIFIED: 1, ESTIMATED: 0.5, UNKNOWN: 0, CONFLICTED: 0, STALE: 0 });
  assert.deepEqual(policy.statusPriority, ["CONFLICTED", "VERIFIED", "ESTIMATED", "STALE", "UNKNOWN"]);
  assert.deepEqual(policy.resolvedStatuses, ["VERIFIED"]);
  assert.throws(() => { policy.statusWeights.UNKNOWN = 1; }, TypeError);
  assert.throws(() => { policy.fields[0].critical = false; }, TypeError);
  assert.throws(() => { policy.statusPriority.reverse(); }, TypeError);
});

test("CASE A: all required fields VERIFIED achieve total and critical maximum with no blocker", () => {
  const result = calculateFixture(verifiedFixtures(mixedFixtureFields), mixedFixtureFields);
  assert.equal(result.policyVersion, version);
  assert.deepEqual(result.totalCoverage, { fieldCount: 10, achievedWeight: 10, possibleWeight: 10, coveragePercent: 100 });
  assert.deepEqual(result.criticalCoverage, { fieldCount: 5, achievedWeight: 5, possibleWeight: 5, coveragePercent: 100 });
  assert.equal(result.fieldsByStatus.VERIFIED.length, 10);
  assert.deepEqual(result.criticalUnresolvedFields, []);
  assert.equal(result.hasCriticalUnresolved, false);
});

test("CASE B: no Evidence computes zero and identifies missing fields without inventing UNKNOWN records", () => {
  const result = calculateFixture(undefined);
  assert.deepEqual(result, calculateFixture([]));
  assert.deepEqual(result.totalCoverage, { fieldCount: 6, achievedWeight: 0, possibleWeight: 6, coveragePercent: 0 });
  assert.deepEqual(result.criticalCoverage, { fieldCount: 5, achievedWeight: 0, possibleWeight: 5, coveragePercent: 0 });
  assert.deepEqual(result.missingEvidenceFields, policy.fields.map((field) => field.fieldPath));
  assert.deepEqual(result.fieldsByStatus.UNKNOWN, []);
  assert.deepEqual(result.criticalUnresolvedFields, policy.fields.filter((field) => field.critical).map((field) => field.fieldPath));
  assert.ok(result.fields.every((field) => field.status === null && field.evidenceCount === 0 && field.unresolved));
  assert.equal(result.hasCriticalUnresolved, true);
});

test("CASE C: non-critical UNKNOWN contributes zero while retaining its separate status", () => {
  const field = normalFixtureFields[0];
  const result = calculateFixture([evidenceFixture(field.fieldPath, "UNKNOWN")], [field]);
  assert.equal(result.totalCoverage.achievedWeight, 0);
  assert.equal(result.totalCoverage.coveragePercent, 0);
  assert.deepEqual(result.fieldsByStatus.UNKNOWN, [field.fieldPath]);
  assert.deepEqual(result.missingEvidenceFields, []);
  assert.equal(result.hasCriticalUnresolved, false);
});

test("CASE D: non-critical CONFLICTED contributes zero", () => {
  const field = normalFixtureFields[0];
  const result = calculateFixture([evidenceFixture(field.fieldPath, "CONFLICTED")], [field]);
  assert.equal(result.fields[0].coverageWeight, 0);
  assert.equal(result.totalCoverage.coveragePercent, 0);
  assert.deepEqual(result.fieldsByStatus.CONFLICTED, [field.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, false);
});

test("CASE E: 90% total coverage still reports the critical UNKNOWN exhaust blocker", () => {
  const evidence = mixedFixtureFields.map((field) => evidenceFixture(
    field.fieldPath, field === exhaust ? "UNKNOWN" : "VERIFIED",
  ));
  const result = calculateFixture(evidence, mixedFixtureFields);
  assert.deepEqual(result.totalCoverage, { fieldCount: 10, achievedWeight: 9, possibleWeight: 10, coveragePercent: 90 });
  assert.deepEqual(result.criticalCoverage, { fieldCount: 5, achievedWeight: 4, possibleWeight: 5, coveragePercent: 80 });
  assert.deepEqual(result.criticalUnresolvedFields, [exhaust.fieldPath]);
  assert.deepEqual(result.fieldsByStatus.UNKNOWN, [exhaust.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
});

test("CASE F: missing critical exhaust Evidence remains a blocker independently of UNKNOWN", () => {
  const evidence = verifiedFixtures().filter((item) => item.fieldPath !== exhaust.fieldPath);
  const result = calculateFixture(evidence);
  assert.deepEqual(result.missingEvidenceFields, [exhaust.fieldPath]);
  assert.deepEqual(result.fieldsByStatus.UNKNOWN, []);
  assert.deepEqual(result.criticalUnresolvedFields, [exhaust.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
});

test("CASE G: ESTIMATED receives exactly half weight and remains critical unresolved", () => {
  const result = calculateFixture([evidenceFixture(exhaust.fieldPath, "ESTIMATED")], [exhaust]);
  assert.deepEqual(result.totalCoverage, { fieldCount: 1, achievedWeight: 0.5, possibleWeight: 1, coveragePercent: 50 });
  assert.deepEqual(result.criticalCoverage, result.totalCoverage);
  assert.deepEqual(result.fieldsByStatus.ESTIMATED, [exhaust.fieldPath]);
  assert.deepEqual(result.criticalUnresolvedFields, [exhaust.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
});

test("CASE H: STALE contributes zero and remains identifiable for recheck", () => {
  const result = calculateFixture([evidenceFixture(exhaust.fieldPath, "STALE")], [exhaust]);
  assert.equal(result.totalCoverage.coveragePercent, 0);
  assert.deepEqual(result.fieldsByStatus.STALE, [exhaust.fieldPath]);
  assert.deepEqual(result.criticalUnresolvedFields, [exhaust.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
});

test("CASE I: UNKNOWN owner + VERIFIED field check resolve once, without value conflict inference", () => {
  const evidence = Object.freeze([
    evidenceFixture(electricity.fieldPath, "UNKNOWN", { sourceType: "OWNER_STATEMENT", assertedValue: 50, checkedAt: "2026-09-01T00:00:00Z" }),
    evidenceFixture(electricity.fieldPath, "VERIFIED", { sourceType: "FIELD_CHECK", assertedValue: 30, checkedAt: "2026-09-02T00:00:00Z" }),
  ]);
  const result = calculateFixture(evidence, [electricity]);
  assert.equal(result.totalCoverage.coveragePercent, 100);
  assert.equal(result.fields[0].evidenceCount, 2);
  assert.equal(result.fields[0].status, "VERIFIED");
  assert.deepEqual(result.fieldsByStatus.CONFLICTED, []);
  assert.equal(result.hasCriticalUnresolved, false);
  assert.deepEqual(result, calculateFixture([...evidence].reverse(), [electricity]));
  const repeated = calculateFixture([...evidence, evidence[1], evidence[1]], [electricity]);
  assert.deepEqual(repeated.totalCoverage, result.totalCoverage);
  assert.deepEqual(repeated.criticalCoverage, result.criticalCoverage);
});

test("CASE J: explicit CONFLICTED always overrides VERIFIED, even if many verified records exist", () => {
  const evidence = [
    evidenceFixture(electricity.fieldPath, "CONFLICTED"),
    ...Array.from({ length: 5 }, () => evidenceFixture(electricity.fieldPath)),
  ];
  const result = calculateFixture(evidence, [electricity]);
  assert.equal(result.fields[0].status, "CONFLICTED");
  assert.equal(result.totalCoverage.coveragePercent, 0);
  assert.equal(result.hasCriticalUnresolved, true);
  assert.deepEqual(result, calculateFixture([...evidence].reverse(), [electricity]));
});

test("CASE K: zero fields and zero critical fields use a finite zero-percent contract", () => {
  const result = calculateEvidenceCoverage([], version);
  const empty = { fieldCount: 0, achievedWeight: 0, possibleWeight: 0, coveragePercent: 0 };
  assert.deepEqual(result.totalCoverage, empty);
  assert.deepEqual(result.criticalCoverage, empty);
  assert.deepEqual(result.fields, []);
  assert.deepEqual(result.criticalUnresolvedFields, []);
  assert.equal(result.hasCriticalUnresolved, false);
  const normal = calculateFixture(verifiedFixtures(normalFixtureFields), normalFixtureFields);
  assert.deepEqual(normal.criticalCoverage, empty);
  assert.equal(normal.totalCoverage.coveragePercent, 100);
  for (const summary of [result.totalCoverage, result.criticalCoverage, normal.criticalCoverage]) {
    assert.ok(Object.values(summary).every(Number.isFinite));
  }
});

test("CASE L: actual/estimated and source type neither promote nor demote verification", () => {
  for (const valueType of ["actual", "estimated", undefined]) {
    for (const sourceType of ["PUBLIC_DATA", "OWNER_STATEMENT", "FIELD_CHECK"]) {
      for (const verificationStatus of ["VERIFIED", "UNKNOWN"]) {
        const evidence = Object.freeze([evidenceFixture(electricity.fieldPath, verificationStatus, {
          valueType, sourceType, assertedValue: 30,
        })]);
        const before = structuredClone(evidence);
        const result = calculateFixture(evidence, [electricity]);
        assert.equal(result.fields[0].status, verificationStatus);
        assert.equal(result.totalCoverage.coveragePercent, verificationStatus === "VERIFIED" ? 100 : 0);
        assert.deepEqual(evidence, before);
      }
    }
  }
});

test("mixed importance weights use separate denominators and nearest integer rounding", () => {
  const definitions = [{ ...electricity, weight: 3 }, { ...normalFixtureFields[0], weight: 1 }];
  const evidence = [evidenceFixture(electricity.fieldPath), evidenceFixture(definitions[1].fieldPath, "ESTIMATED")];
  const result = calculateFixture(evidence, definitions);
  assert.deepEqual(result.totalCoverage, { fieldCount: 2, achievedWeight: 3.5, possibleWeight: 4, coveragePercent: 88 });
  assert.deepEqual(result.criticalCoverage, { fieldCount: 1, achievedWeight: 3, possibleWeight: 3, coveragePercent: 100 });
  assert.equal(result.hasCriticalUnresolved, false);
});

test("exact path matching reuses existing field semantics; unrelated or missing paths do not count", () => {
  const evidence = [undefined, ` ${electricity.fieldPath} `, `${electricity.fieldPath}.extra`, exhaust.fieldPath]
    .map((fieldPath) => evidenceFixture(fieldPath));
  const result = calculateFixture(evidence, [electricity]);
  assert.deepEqual(result.missingEvidenceFields, [electricity.fieldPath]);
  assert.equal(result.totalCoverage.coveragePercent, 0);
});

test("CASE M: STALE + VERIFIED resolves VERIFIED without changing history or deriving state from dates", () => {
  const evidence = Object.freeze([evidenceFixture(exhaust.fieldPath, "STALE"), evidenceFixture(exhaust.fieldPath)]);
  const snapshot = structuredClone(evidence);
  const result = calculateFixture(evidence, [exhaust]);
  assert.equal(result.fields[0].status, "VERIFIED");
  assert.equal(result.totalCoverage.coveragePercent, 100);
  assert.equal(result.criticalCoverage.coveragePercent, 100);
  assert.equal(result.hasCriticalUnresolved, false);
  assert.deepEqual(result.criticalUnresolvedFields, []);
  assert.deepEqual(result, calculateFixture([...evidence].reverse(), [exhaust]));
  assert.deepEqual(evidence, snapshot);
  const dated = calculateFixture([evidenceFixture(exhaust.fieldPath, "VERIFIED", {
    checkedAt: "2000-01-01T00:00:00Z", expiresAt: "2000-01-02T00:00:00Z",
  })], [exhaust]);
  assert.equal(dated.fields[0].status, "VERIFIED");
  assert.equal(dated.totalCoverage.coveragePercent, 100);
});

test("CASE N: STALE + ESTIMATED resolves ESTIMATED with half coverage and critical unresolved", () => {
  const evidence = Object.freeze([
    evidenceFixture(exhaust.fieldPath, "STALE"), evidenceFixture(exhaust.fieldPath, "ESTIMATED"),
  ]);
  const snapshot = structuredClone(evidence);
  const result = calculateFixture(evidence, [exhaust]);
  assert.equal(result.fields[0].status, "ESTIMATED");
  assert.equal(result.totalCoverage.achievedWeight, 0.5);
  assert.equal(result.totalCoverage.coveragePercent, 50);
  assert.equal(result.criticalCoverage.coveragePercent, 50);
  assert.deepEqual(result.criticalUnresolvedFields, [exhaust.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
  assert.deepEqual(result, calculateFixture([...evidence].reverse(), [exhaust]));
  assert.deepEqual(evidence, snapshot);
});

test("CASE O: CONFLICTED + VERIFIED still resolves CONFLICTED alongside STALE and ESTIMATED history", () => {
  const evidence = ["CONFLICTED", "VERIFIED", "STALE", "ESTIMATED"]
    .map((status) => evidenceFixture(exhaust.fieldPath, status));
  const result = calculateFixture(evidence, [exhaust]);
  assert.equal(result.fields[0].status, "CONFLICTED");
  assert.equal(result.totalCoverage.achievedWeight, 0);
  assert.equal(result.totalCoverage.coveragePercent, 0);
  assert.deepEqual(result.criticalUnresolvedFields, [exhaust.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
  assert.deepEqual(result, calculateFixture([...evidence].reverse(), [exhaust]));
});

test("CASE P: missing expansion Evidence lowers total coverage but does not create a critical blocker", () => {
  const evidence = verifiedFixtures().filter((item) => item.fieldPath !== expansion.fieldPath);
  const result = calculateFixture(evidence);
  assert.deepEqual(result.totalCoverage, { fieldCount: 6, achievedWeight: 5, possibleWeight: 6, coveragePercent: 83 });
  assert.deepEqual(result.criticalCoverage, { fieldCount: 5, achievedWeight: 5, possibleWeight: 5, coveragePercent: 100 });
  assert.equal(result.fields.find((field) => field.fieldPath === electricity.fieldPath).status, "VERIFIED");
  assert.deepEqual(result.missingEvidenceFields, [expansion.fieldPath]);
  assert.deepEqual(result.criticalUnresolvedFields, []);
  assert.equal(result.hasCriticalUnresolved, false);
});

test("CASE Q: VERIFIED expansion cannot resolve UNKNOWN electric capacity", () => {
  const evidence = policy.fields.map((field) => evidenceFixture(
    field.fieldPath, field === electricity ? "UNKNOWN" : "VERIFIED",
  ));
  const result = calculateFixture(evidence);
  assert.deepEqual(result.totalCoverage, { fieldCount: 6, achievedWeight: 5, possibleWeight: 6, coveragePercent: 83 });
  assert.deepEqual(result.criticalCoverage, { fieldCount: 5, achievedWeight: 4, possibleWeight: 5, coveragePercent: 80 });
  assert.equal(result.fields.find((field) => field.fieldPath === expansion.fieldPath).status, "VERIFIED");
  assert.deepEqual(result.fieldsByStatus.UNKNOWN, [electricity.fieldPath]);
  assert.deepEqual(result.criticalUnresolvedFields, [electricity.fieldPath]);
  assert.equal(result.hasCriticalUnresolved, true);
});

test("invalid inputs fail explicitly instead of silently inflating coverage or returning NaN/Infinity", () => {
  assert.throws(() => calculateEvidenceCoverage([], "fixture-unsupported-version"), RangeError);
  for (const weight of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => calculateFixture([], [{ ...electricity, weight }]), RangeError);
  }
  assert.throws(() => calculateFixture([], [electricity, electricity]), RangeError);
  assert.throws(() => calculateFixture([], [{ ...electricity, fieldPath: " " }]), RangeError);
  assert.throws(() => calculateFixture([], [
    { ...electricity, weight: Number.MAX_VALUE }, { ...exhaust, weight: Number.MAX_VALUE },
  ]), RangeError);
  assert.throws(() => calculateFixture([
    evidenceFixture(electricity.fieldPath, "fixture-invalid-status"), evidenceFixture(electricity.fieldPath),
  ], [electricity]), RangeError);
});

test("repeated calculations preserve frozen input snapshots and never share mutable result state", () => {
  const evidence = Object.freeze(verifiedFixtures());
  const fields = fieldsFixture(evidence);
  const snapshot = structuredClone(fields);
  const result = calculateEvidenceCoverage(fields, version);
  assert.deepEqual(calculateEvidenceCoverage(fields, version), result);
  assert.deepEqual(fields, snapshot);
  result.fieldsByStatus.VERIFIED.length = 0;
  result.fields[0].status = "UNKNOWN";
  assert.equal(calculateEvidenceCoverage(fields, version).fieldsByStatus.VERIFIED.length, 6);
  assert.deepEqual(fields, snapshot);
});
