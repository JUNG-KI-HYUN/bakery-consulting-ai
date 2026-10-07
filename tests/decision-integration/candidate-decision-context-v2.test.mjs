import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "server-only") return {};
  return previousLoad.call(this, request, parent, isMain);
};
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = (specifier) =>
    originalRequire(
      specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
    );
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};
after(() => {
  Module._load = previousLoad;
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const lib = (relative) => loadModule(path.join(repositoryRoot, relative));
const { createCandidateStoreId, createSiteSurveyId } = lib("lib/field/identifiers.ts");
const { createLayoutId } = lib("lib/space-fit/identifiers.ts");
const { createCandidateDecisionContext, createCandidateDecisionContextV2 } =
  lib("lib/decision-integration/create-context.ts");
const {
  validateCandidateDecisionContext,
  validateCandidateDecisionContextV2,
  validateCandidateLeaseEvidenceBinding,
} = lib("lib/decision-integration/validation.ts");
const { CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION, CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION } =
  lib("lib/decision-integration/types.ts");

// ---- fixtures (sample/demo only; not real store or lease data) ----

const CREATED_AT = "2026-10-01T00:00:00.000Z";
const DEMO_SNAPSHOT_ID = "demo-lease-snapshot-001";

function fullInput(overrides = {}) {
  return {
    candidateStoreId: createCandidateStoreId(),
    createdAt: CREATED_AT,
    locationBinding: { analysisRunId: "demo-run-001" },
    leaseBinding: { selectedResearchRecordIds: ["demo-rec-1", "demo-rec-2"], referenceDate: "2026-09-01" },
    candidateLeaseBinding: { snapshotId: DEMO_SNAPSHOT_ID },
    economicBinding: { generatedAt: "2026-09-23T01:00:00.000Z", engineVersion: "economic-feasibility-v1" },
    fieldBinding: { surveyId: createSiteSurveyId(), layoutId: createLayoutId() },
    ...overrides,
  };
}

function expectV2(input) {
  const result = createCandidateDecisionContextV2(input);
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.value;
}

const V1_KEYS = [
  "schemaVersion",
  "candidateStoreId",
  "locationBinding",
  "leaseBinding",
  "economicBinding",
  "fieldBinding",
  "createdAt",
  "createsVerdict",
  "createsScore",
  "createsRisk",
].sort();

// ---- tests ----

test("1. creates a valid V2 context with every binding", () => {
  const input = fullInput();
  const context = expectV2(input);
  assert.equal(context.schemaVersion, "candidate-decision-context-v2");
  assert.equal(context.schemaVersion, CANDIDATE_DECISION_CONTEXT_V2_SCHEMA_VERSION);
  assert.equal(context.candidateStoreId, input.candidateStoreId);
  assert.deepEqual(context.locationBinding, input.locationBinding);
  assert.deepEqual(context.leaseBinding, input.leaseBinding);
  assert.deepEqual(context.candidateLeaseBinding, { snapshotId: DEMO_SNAPSHOT_ID });
  assert.deepEqual(context.economicBinding, input.economicBinding);
  assert.deepEqual(context.fieldBinding, input.fieldBinding);
  assert.deepEqual(Object.keys(context).sort(), [...V1_KEYS, "candidateLeaseBinding"].sort());
});

test("1b. leaseBinding keeps the Rental Market Reference shape and is independent of candidateLeaseBinding", () => {
  const context = expectV2(fullInput());
  assert.deepEqual(Object.keys(context.leaseBinding).sort(), ["referenceDate", "selectedResearchRecordIds"]);
  assert.deepEqual(Object.keys(context.candidateLeaseBinding), ["snapshotId"]);
  const marketOnly = expectV2(fullInput({ candidateLeaseBinding: null }));
  assert.deepEqual(marketOnly.leaseBinding, context.leaseBinding);
  const candidateOnly = expectV2(fullInput({ leaseBinding: null }));
  assert.deepEqual(candidateOnly.candidateLeaseBinding, context.candidateLeaseBinding);
  assert.equal(candidateOnly.leaseBinding, null);
});

test("2. candidateLeaseBinding null (or omitted) is valid", () => {
  assert.equal(expectV2(fullInput({ candidateLeaseBinding: null })).candidateLeaseBinding, null);
  const omitted = fullInput();
  delete omitted.candidateLeaseBinding;
  assert.equal(expectV2(omitted).candidateLeaseBinding, null);
  const allNull = expectV2({ candidateStoreId: createCandidateStoreId(), createdAt: CREATED_AT });
  for (const key of ["locationBinding", "leaseBinding", "candidateLeaseBinding", "economicBinding", "fieldBinding"]) {
    assert.equal(allNull[key], null, key);
  }
});

test("3. a valid snapshotId binding is trimmed and frozen", () => {
  const context = expectV2(fullInput({ candidateLeaseBinding: { snapshotId: `  ${DEMO_SNAPSHOT_ID}  ` } }));
  assert.equal(context.candidateLeaseBinding.snapshotId, DEMO_SNAPSHOT_ID);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.candidateLeaseBinding), true);
  const direct = validateCandidateLeaseEvidenceBinding({ snapshotId: DEMO_SNAPSHOT_ID });
  assert.equal(direct.ok, true);
  assert.equal(validateCandidateLeaseEvidenceBinding(null).ok, true);
});

test("4. blank or non-string snapshotId is invalid", () => {
  for (const snapshotId of ["", "   ", null, 42, undefined]) {
    const result = createCandidateDecisionContextV2(fullInput({ candidateLeaseBinding: { snapshotId } }));
    assert.equal(result.ok, false, String(snapshotId));
    if (!result.ok) {
      assert.equal(result.code, "INVALID_BINDING");
      assert.match(result.message, /snapshotId/);
    }
  }
  for (const binding of ["demo", [], 1]) {
    const result = createCandidateDecisionContextV2(fullInput({ candidateLeaseBinding: binding }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /candidateLeaseBinding/);
  }
});

test("4b. candidateLeaseBinding carries the id only (no amounts, conditions, consents, evidence, or judgement)", () => {
  for (const extra of [
    { monthlyRentAmount: 2_500_000 },
    { contractConditions: {} },
    { landlordConsents: {} },
    { evidence: [] },
    { risk: "HIGH" },
    { verdict: "demo" },
    { score: 1 },
  ]) {
    const result = createCandidateDecisionContextV2(
      fullInput({ candidateLeaseBinding: { snapshotId: DEMO_SNAPSHOT_ID, ...extra } }),
    );
    assert.equal(result.ok, false, JSON.stringify(extra));
    if (!result.ok) assert.match(result.message, new RegExp(`candidateLeaseBinding must not include ${Object.keys(extra)[0]}`));
  }
});

test("5. unknown V2 top-level keys are rejected, not dropped", () => {
  const base = expectV2(fullInput());
  for (const key of ["extra", "candidateLease", "candidateLeaseSnapshot", "verdict", "riskScore", "score", "recommendation"]) {
    const result = validateCandidateDecisionContextV2({ ...base, [key]: "demo" });
    assert.equal(result.ok, false, key);
    if (!result.ok) assert.match(result.message, new RegExp(`must not include ${key}`));
  }
});

test("5b. V1 and V2 schema versions are not interchangeable", () => {
  const v2 = expectV2(fullInput());
  const asV1 = validateCandidateDecisionContextV2({ ...v2, schemaVersion: CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION });
  assert.equal(asV1.ok, false);
  if (!asV1.ok) assert.match(asV1.message, /schemaVersion/);
  const v1Validator = validateCandidateDecisionContext(v2);
  assert.equal(v1Validator.ok, false);
  if (!v1Validator.ok) assert.match(v1Validator.message, /schemaVersion/);
});

test("6. V2 creates* flags are always false and cannot be overridden", () => {
  const context = expectV2(fullInput());
  assert.equal(context.createsVerdict, false);
  assert.equal(context.createsScore, false);
  assert.equal(context.createsRisk, false);
  for (const flag of ["createsVerdict", "createsScore", "createsRisk"]) {
    const result = validateCandidateDecisionContextV2({ ...context, [flag]: true });
    assert.equal(result.ok, false, flag);
    if (!result.ok) assert.match(result.message, new RegExp(flag));
  }
});

test("6b. V2 is JSON serializable, round-trips, and does not mutate inputs", () => {
  const input = fullInput();
  const before = JSON.stringify(input);
  const context = expectV2(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input.candidateLeaseBinding), false);
  const parsed = JSON.parse(JSON.stringify(context));
  const roundTrip = validateCandidateDecisionContextV2(parsed);
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok) assert.deepEqual(roundTrip.value, context);
});

test("6c. V2 keeps V1 binding validation semantics", () => {
  const cases = [
    [{ locationBinding: { analysisRunId: "" } }, /analysisRunId/],
    [{ leaseBinding: { selectedResearchRecordIds: ["r", "r"], referenceDate: null } }, /duplicate/i],
    [{ fieldBinding: { surveyId: "", layoutId: null } }, /surveyId/],
    [{ economicBinding: { generatedAt: "2026-09-23T00:00:00.000Z", engineVersion: "other" } }, /engineVersion/],
    [{ candidateStoreId: "demo-store" }, /store_<uuid>/],
  ];
  for (const [overrides, pattern] of cases) {
    const v1 = createCandidateDecisionContext({ ...fullInput(), ...overrides });
    const v2 = createCandidateDecisionContextV2(fullInput(overrides));
    assert.equal(v1.ok, false);
    assert.equal(v2.ok, false);
    if (!v1.ok && !v2.ok) {
      assert.match(v2.message, pattern);
      assert.equal(v2.message, v1.message);
    }
  }
});

test("7. V1 keeps its exact existing behavior", () => {
  assert.equal(CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION, "candidate-decision-context-v1");
  const v1Input = fullInput();
  delete v1Input.candidateLeaseBinding;
  const created = createCandidateDecisionContext(v1Input);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const v1 = created.value;
  assert.equal(v1.schemaVersion, "candidate-decision-context-v1");
  assert.deepEqual(Object.keys(v1).sort(), V1_KEYS);
  assert.equal(Object.hasOwn(v1, "candidateLeaseBinding"), false);

  // V1 validator still drops unknown keys (including candidateLeaseBinding) without rejecting them.
  const withCandidateLease = validateCandidateDecisionContext({ ...v1, candidateLeaseBinding: { snapshotId: DEMO_SNAPSHOT_ID } });
  assert.equal(withCandidateLease.ok, true);
  if (withCandidateLease.ok) {
    assert.equal(Object.hasOwn(withCandidateLease.value, "candidateLeaseBinding"), false);
    assert.deepEqual(withCandidateLease.value, v1);
  }
  const withExtra = validateCandidateDecisionContext({ ...v1, extra: "demo" });
  assert.equal(withExtra.ok, true);
  if (withExtra.ok) assert.equal(Object.hasOwn(withExtra.value, "extra"), false);

  // V1 forbidden-key rejection is unchanged.
  const withVerdict = validateCandidateDecisionContext({ ...v1, verdict: "demo" });
  assert.equal(withVerdict.ok, false);
  if (!withVerdict.ok) assert.match(withVerdict.message, /verdict/);
});
