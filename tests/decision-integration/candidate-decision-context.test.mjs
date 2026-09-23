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

const { createCandidateStoreId, createSiteSurveyId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
);
const { createLayoutId } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/identifiers.ts"),
);
const { createCandidateDecisionContext } = loadModule(
  path.join(repositoryRoot, "lib/decision-integration/create-context.ts"),
);
const { validateCandidateDecisionContext } = loadModule(
  path.join(repositoryRoot, "lib/decision-integration/validation.ts"),
);
const { CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION } = loadModule(
  path.join(repositoryRoot, "lib/decision-integration/types.ts"),
);

const FORBIDDEN_KEYS = [
  "verdict",
  "riskScore",
  "score",
  "recommendation",
  "hardFail",
  "block",
  "reject",
];

test("1. creates a valid CandidateDecisionContext with all bindings", () => {
  const candidateStoreId = createCandidateStoreId();
  const surveyId = createSiteSurveyId();
  const layoutId = createLayoutId();
  const result = createCandidateDecisionContext({
    candidateStoreId,
    createdAt: "2026-09-23T00:00:00.000Z",
    locationBinding: { analysisRunId: "run-abc-001" },
    leaseBinding: {
      selectedResearchRecordIds: ["rec-1", "rec-2"],
      referenceDate: "2026-09-01",
    },
    economicBinding: {
      generatedAt: "2026-09-23T01:00:00.000Z",
      engineVersion: "economic-feasibility-v1",
    },
    fieldBinding: { surveyId, layoutId },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.schemaVersion, CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION);
  assert.equal(result.value.candidateStoreId, candidateStoreId);
  assert.equal(result.value.locationBinding?.analysisRunId, "run-abc-001");
  assert.deepEqual(result.value.leaseBinding?.selectedResearchRecordIds, ["rec-1", "rec-2"]);
  assert.equal(result.value.economicBinding?.generatedAt, "2026-09-23T01:00:00.000Z");
  assert.equal(result.value.fieldBinding?.surveyId, surveyId);
  assert.equal(result.value.fieldBinding?.layoutId, layoutId);
  assert.equal(result.value.createsVerdict, false);
  assert.equal(result.value.createsScore, false);
  assert.equal(result.value.createsRisk, false);
});

test("2. rejects empty candidateStoreId", () => {
  const result = createCandidateDecisionContext({
    candidateStoreId: "   ",
    createdAt: "2026-09-23T00:00:00.000Z",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /candidateStoreId/);
});

test("3. rejects empty analysisRunId", () => {
  const result = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    locationBinding: { analysisRunId: "" },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /analysisRunId/);
});

test("4. rejects empty surveyId and empty layoutId", () => {
  const emptySurvey = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    fieldBinding: { surveyId: "", layoutId: null },
  });
  assert.equal(emptySurvey.ok, false);
  if (!emptySurvey.ok) assert.match(emptySurvey.message, /surveyId/);

  const emptyLayout = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    fieldBinding: { surveyId: createSiteSurveyId(), layoutId: "" },
  });
  assert.equal(emptyLayout.ok, false);
  if (!emptyLayout.ok) assert.match(emptyLayout.message, /layoutId/);
});

test("5. rejects duplicate lease research record ids", () => {
  const result = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    leaseBinding: {
      selectedResearchRecordIds: ["rec-1", "rec-1"],
      referenceDate: null,
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /duplicate/i);
});

test("6. allows null bindings", () => {
  const result = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    locationBinding: null,
    leaseBinding: null,
    economicBinding: null,
    fieldBinding: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.locationBinding, null);
  assert.equal(result.value.leaseBinding, null);
  assert.equal(result.value.economicBinding, null);
  assert.equal(result.value.fieldBinding, null);
});

test("7. does not mutate source domain binding objects", () => {
  const locationBinding = { analysisRunId: "run-xyz" };
  const leaseBinding = {
    selectedResearchRecordIds: ["a", "b"],
    referenceDate: "2026-01-01",
  };
  const economicBinding = {
    generatedAt: "2026-09-23T02:00:00.000Z",
    engineVersion: "economic-feasibility-v1",
  };
  const fieldBinding = {
    surveyId: createSiteSurveyId(),
    layoutId: createLayoutId(),
  };
  const locationSnapshot = { ...locationBinding };
  const leaseSnapshot = {
    ...leaseBinding,
    selectedResearchRecordIds: [...leaseBinding.selectedResearchRecordIds],
  };
  const economicSnapshot = { ...economicBinding };
  const fieldSnapshot = { ...fieldBinding };

  const result = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    locationBinding,
    leaseBinding,
    economicBinding,
    fieldBinding,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(locationBinding, locationSnapshot);
  assert.deepEqual(leaseBinding, leaseSnapshot);
  assert.deepEqual(economicBinding, economicSnapshot);
  assert.deepEqual(fieldBinding, fieldSnapshot);
});

test("8. CandidateDecisionContext is JSON serializable", () => {
  const result = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
    locationBinding: { analysisRunId: "run-1" },
    leaseBinding: {
      selectedResearchRecordIds: ["r1"],
      referenceDate: null,
    },
    economicBinding: {
      generatedAt: "2026-09-23T03:00:00.000Z",
      engineVersion: "economic-feasibility-v1",
    },
    fieldBinding: { surveyId: createSiteSurveyId(), layoutId: null },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const json = JSON.stringify(result.value);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION);
  assert.equal(parsed.fieldBinding.layoutId, null);
  assert.equal(parsed.createsRisk, false);
  const roundTrip = validateCandidateDecisionContext(parsed);
  assert.equal(roundTrip.ok, true);
});

test("9. Risk / Verdict / Score fields must not exist", () => {
  const result = createCandidateDecisionContext({
    candidateStoreId: createCandidateStoreId(),
    createdAt: "2026-09-23T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const key of FORBIDDEN_KEYS) {
    assert.equal(Object.hasOwn(result.value, key), false, `must not have ${key}`);
  }
  const withVerdict = validateCandidateDecisionContext({
    ...result.value,
    verdict: "APPROVE",
  });
  assert.equal(withVerdict.ok, false);
  if (!withVerdict.ok) assert.match(withVerdict.message, /verdict/);
});
