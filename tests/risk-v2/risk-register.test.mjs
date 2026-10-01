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
const { buildRiskRegister, validateRiskRegister, RISK_REGISTER_SCHEMA_VERSION } =
  lib("lib/risk-v2/risk-register.ts");
const { buildDecisionReviewCompleteness } = lib("lib/risk-v2/decision-review.ts");
const { evaluateRiskRules, riskFindingId } = lib("lib/risk-v2/evaluate.ts");
const { RISK_RULE_SET_V1_VERSION } = lib("lib/risk-v2/rule-registry.ts");
const { RISK_EVALUATION_RESULT_SCHEMA_VERSION } = lib("lib/risk-v2/types.ts");
const { buildCandidateDecisionEvidenceBundle } = lib("lib/decision-evidence/candidate-bundle.ts");
const { buildTechnicalDecisionEvidence } = lib("lib/decision-evidence/technical-adapter.ts");
const { createDecisionEvidenceItem } = lib("lib/decision-evidence/helpers.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createCandidateStoreId } = lib("lib/field/identifiers.ts");

// ---- fixtures (sample/demo only; not real store, customer, or facility data) ----

const NOW = "2026-10-01T00:00:00.000Z";
const ACCEPTANCE = Object.freeze({ acceptedByRef: "staff_fixture", acceptedAt: "2026-10-01T06:00:00.000Z", reason: "fixture 인지 후 수용" });

function baseBundle() {
  const context = createCandidateDecisionContext({ candidateStoreId: createCandidateStoreId(), createdAt: NOW });
  assert.equal(context.ok, true);
  return buildCandidateDecisionEvidenceBundle({
    context: context.value,
    generatedAt: "2026-10-01T05:00:00.000Z",
    fieldBundle: null,
    locationSource: null,
    rentalMarketResult: null,
    economicResult: null,
  });
}

function aspect(kind, status = "NOT_APPLICABLE") {
  return { kind, status, message: `fixture ${kind} ${status}` };
}

function equipmentCheck(id, statuses = {}) {
  return {
    equipmentInstanceId: `fixture-eq-${id}`,
    equipmentDefinitionId: `fixture-def-${id}`,
    equipmentName: `fixture equipment ${id}`,
    dataStatus: "VERIFIED",
    electrical: aspect("electrical", statuses.electrical),
    water: aspect("water", statuses.water),
    drainage: aspect("drainage", statuses.drainage),
    exhaust: aspect("exhaust", statuses.exhaust),
    delivery: aspect("delivery", statuses.delivery),
  };
}

/** real Technical adapter output + CORE missing from real candidate bundle + one ECONOMIC fixture fact */
function mixedBundle() {
  const technical = buildTechnicalDecisionEvidence({
    equipmentChecks: [
      equipmentCheck("a", { electrical: "CONSTRAINT_OBSERVED", exhaust: "EXPERT_REVIEW_REQUIRED" }),
      equipmentCheck("b", { water: "CONSTRAINT_OBSERVED" }),
    ],
    powerSummary: { arithmeticStatus: "NOT_APPLICABLE", arithmeticMessage: null },
  });
  const economicFact = createDecisionEvidenceItem({
    sourceDomain: "ECONOMIC",
    bucket: "OBSERVED_FACT",
    category: "BEP",
    key: "fixture-bep",
    title: "fixture",
    description: "fixture economic derived calculation",
    nature: "DERIVED_CALCULATION",
  });
  return {
    ...baseBundle(),
    observedFacts: [economicFact],
    observedConstraints: technical.observedConstraints,
    expertReviewItems: technical.expertReviewItems,
  };
}

function emptyBundle() {
  return {
    ...baseBundle(),
    observedFacts: [],
    observedConstraints: [],
    missingInformation: [],
    expertReviewItems: [],
    geometryIssues: [],
  };
}

function realEvaluation(bundle) {
  const outcome = evaluateRiskRules({ evidenceBundle: bundle, ruleSetVersion: RISK_RULE_SET_V1_VERSION });
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function evaluationFromFindings(bundle, findings) {
  const unresolved = findings.filter((entry) => entry.resolutionStatus !== "RESOLVED");
  const count = (riskClass) => unresolved.filter((entry) => entry.riskClass === riskClass).length;
  return {
    schemaVersion: RISK_EVALUATION_RESULT_SCHEMA_VERSION,
    candidateStoreId: bundle.candidateStoreId,
    ruleSetVersion: "fixture-rule-set",
    findings,
    unresolvedFindingCount: unresolved.length,
    unresolvedHardBlockerCount: count("HARD_BLOCKER"),
    unresolvedConditionalBlockerCount: count("CONDITIONAL_BLOCKER"),
    unresolvedEconomicStressCount: count("ECONOMIC_STRESS"),
    unresolvedEvidenceGapCount: count("EVIDENCE_GAP"),
    unresolvedHumanReviewRequiredCount: count("HUMAN_REVIEW_REQUIRED"),
    createsVerdict: false,
    createsScore: false,
  };
}

/** fixture finding whose evidence ids exist in mixedBundle() */
function fixtureFinding(bundle, riskClass, resolutionStatus, suffix = "") {
  const pick = {
    HARD_BLOCKER: ["ELECTRICAL", bundle.observedConstraints.find((entry) => entry.category === "ELECTRICAL").id, "OPEN"],
    CONDITIONAL_BLOCKER: ["WATER", bundle.observedConstraints.find((entry) => entry.category === "WATER").id, "CONDITION_REQUIRED"],
    ECONOMIC_STRESS: ["ECONOMIC", bundle.observedFacts.find((entry) => entry.sourceDomain === "ECONOMIC").id, "OPEN"],
    EVIDENCE_GAP: ["EVIDENCE", bundle.missingInformation.find((entry) => entry.importance === "CORE").id, "NEEDS_CONFIRMATION"],
    HUMAN_REVIEW_REQUIRED: ["EXHAUST", bundle.expertReviewItems[0].id, "EXPERT_REVIEW_REQUIRED"],
  }[riskClass];
  const [domain, evidenceId, initialStatus] = pick;
  const status = resolutionStatus ?? initialStatus;
  const ruleId = `FIXTURE.${riskClass}${suffix}`;
  return {
    findingId: riskFindingId(ruleId, "1", [evidenceId]),
    ruleId,
    ruleVersion: "1",
    domain,
    riskClass,
    severity: riskClass === "HARD_BLOCKER" ? "CRITICAL" : "MEDIUM",
    title: `fixture ${riskClass}`,
    description: "fixture finding",
    evidenceIds: [evidenceId],
    missingRequirementKeys: [],
    resolutionStatus: status,
    remediation: [],
    requiresHumanApproval: riskClass === "HUMAN_REVIEW_REQUIRED" || status === "EXPERT_REVIEW_REQUIRED",
    ...(status === "ACCEPTED_BY_HUMAN" ? { humanAcceptance: ACCEPTANCE } : {}),
  };
}

function register(bundle, evaluation) {
  const outcome = buildRiskRegister({ evidenceBundle: bundle, evaluation });
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function review(bundle, findings) {
  const reg = register(bundle, evaluationFromFindings(bundle, findings));
  const outcome = buildDecisionReviewCompleteness(reg);
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.value;
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, strings));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, strings));
  return strings;
}

// ---- Risk Register ----

test("1-5. normal evaluation → register keeps candidateStoreId, ruleSetVersion, every finding and evidenceIds", () => {
  const bundle = mixedBundle();
  const evaluation = realEvaluation(bundle);
  assert.equal(evaluation.findings.length, 4);
  const reg = register(bundle, evaluation);
  assert.equal(reg.schemaVersion, RISK_REGISTER_SCHEMA_VERSION);
  assert.equal(reg.candidateStoreId, bundle.candidateStoreId);
  assert.equal(reg.ruleSetVersion, "risk-rules-v1");
  assert.equal(reg.entries.length, evaluation.findings.length);
  for (const finding of evaluation.findings) {
    const entry = reg.entries.find((candidate) => candidate.findingId === finding.findingId);
    assert.deepEqual(entry, finding);
  }
  assert.deepEqual(reg.summary, {
    totalFindings: 4,
    unresolvedFindings: 4,
    unresolvedHardBlockers: 0,
    unresolvedConditionalBlockers: 2,
    unresolvedEconomicStress: 0,
    unresolvedEvidenceGaps: 1,
    unresolvedHumanReviews: 1,
  });
});

test("6-9. severity, riskClass, resolutionStatus, humanAcceptance are preserved", () => {
  const bundle = mixedBundle();
  const findings = [
    fixtureFinding(bundle, "HARD_BLOCKER", "ACCEPTED_BY_HUMAN"),
    fixtureFinding(bundle, "CONDITIONAL_BLOCKER", "RESOLVED"),
    fixtureFinding(bundle, "EVIDENCE_GAP"),
  ];
  const reg = register(bundle, evaluationFromFindings(bundle, findings));
  for (const finding of findings) {
    const entry = reg.entries.find((candidate) => candidate.findingId === finding.findingId);
    assert.equal(entry.severity, finding.severity);
    assert.equal(entry.riskClass, finding.riskClass);
    assert.equal(entry.resolutionStatus, finding.resolutionStatus);
  }
  const accepted = reg.entries.find((entry) => entry.resolutionStatus === "ACCEPTED_BY_HUMAN");
  assert.deepEqual(accepted.humanAcceptance, ACCEPTANCE);
  assert.equal(reg.entries.find((entry) => entry.riskClass === "CONDITIONAL_BLOCKER").resolutionStatus, "RESOLVED");
  assert.equal(reg.summary.totalFindings, 3);
  assert.equal(reg.summary.unresolvedFindings, 2);
  assert.equal(reg.summary.unresolvedHardBlockers, 1);
  assert.equal(reg.summary.unresolvedConditionalBlockers, 0);
});

test("10. missing evidenceId → INVALID_RISK_REGISTER", () => {
  const bundle = mixedBundle();
  const evaluation = realEvaluation(bundle);
  const removed = evaluation.findings.find((entry) => entry.riskClass === "CONDITIONAL_BLOCKER").evidenceIds[0];
  const trimmed = { ...bundle, observedConstraints: bundle.observedConstraints.filter((entry) => entry.id !== removed) };
  const outcome = buildRiskRegister({ evidenceBundle: trimmed, evaluation });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "INVALID_RISK_REGISTER");
  assert.ok(outcome.errors.some((entry) => entry.includes(removed)));
});

test("11. candidateStoreId mismatch → INVALID_RISK_REGISTER", () => {
  const bundle = mixedBundle();
  const evaluation = realEvaluation(bundle);
  const outcome = buildRiskRegister({ evidenceBundle: { ...bundle, candidateStoreId: createCandidateStoreId() }, evaluation });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.some((entry) => entry.includes("candidateStoreId")));
  const invalidEvaluation = buildRiskRegister({ evidenceBundle: bundle, evaluation: { ...evaluation, unresolvedFindingCount: 99 } });
  assert.equal(invalidEvaluation.ok, false);
});

test("12. entries are deterministically ordered by riskClass → severity → ruleId → findingId", () => {
  const bundle = mixedBundle();
  const findings = [
    fixtureFinding(bundle, "HUMAN_REVIEW_REQUIRED"),
    fixtureFinding(bundle, "EVIDENCE_GAP"),
    fixtureFinding(bundle, "ECONOMIC_STRESS"),
    fixtureFinding(bundle, "CONDITIONAL_BLOCKER"),
    fixtureFinding(bundle, "HARD_BLOCKER"),
  ];
  const first = register(bundle, evaluationFromFindings(bundle, findings));
  const second = register(bundle, evaluationFromFindings(bundle, [...findings].reverse()));
  assert.deepEqual(first, second);
  assert.deepEqual(first.entries.map((entry) => entry.riskClass), [
    "HARD_BLOCKER",
    "CONDITIONAL_BLOCKER",
    "ECONOMIC_STRESS",
    "EVIDENCE_GAP",
    "HUMAN_REVIEW_REQUIRED",
  ]);
});

test("13. inputs are not mutated or frozen", () => {
  const bundle = mixedBundle();
  const evaluation = structuredClone(realEvaluation(bundle));
  const mutableBundle = { ...bundle, observedConstraints: [...bundle.observedConstraints] };
  const before = JSON.stringify({ mutableBundle, evaluation });
  const reg = register(mutableBundle, evaluation);
  buildDecisionReviewCompleteness(reg);
  assert.equal(JSON.stringify({ mutableBundle, evaluation }), before);
  assert.equal(Object.isFrozen(evaluation), false);
  assert.equal(Object.isFrozen(evaluation.findings), false);
  assert.equal(Object.isFrozen(evaluation.findings[0]), false);
  assert.equal(Object.isFrozen(mutableBundle.observedConstraints), false);
  assert.equal(Object.isFrozen(reg), true);
  assert.equal(Object.isFrozen(reg.entries[0].evidenceIds), true);
});

test("14. register and completeness are JSON serializable; register re-validates", () => {
  const bundle = mixedBundle();
  const reg = register(bundle, realEvaluation(bundle));
  const parsed = JSON.parse(JSON.stringify(reg));
  assert.deepEqual(parsed, reg);
  assert.equal(validateRiskRegister(parsed).ok, true);
  assert.equal(validateRiskRegister({ ...parsed, summary: { ...parsed.summary, totalFindings: 0 } }).ok, false);
  assert.equal(validateRiskRegister({ ...parsed, verdict: "x" }).ok, false);
  const completeness = buildDecisionReviewCompleteness(reg).value;
  assert.deepEqual(JSON.parse(JSON.stringify(completeness)), completeness);
});

// ---- Decision Review Completeness ----

test("15. no findings → evidence, expert, and review readiness true", () => {
  const bundle = emptyBundle();
  const evaluation = realEvaluation(bundle);
  assert.equal(evaluation.findings.length, 0);
  const completeness = buildDecisionReviewCompleteness(register(bundle, evaluation)).value;
  assert.equal(completeness.evidenceReady, true);
  assert.equal(completeness.expertReviewReady, true);
  assert.equal(completeness.readyForHumanDecisionReview, true);
  assert.equal(completeness.requiresHumanDecision, true);
});

test("16-18. EVIDENCE_GAP: unresolved/accepted → not ready, resolved → ready", () => {
  const bundle = mixedBundle();
  const open = review(bundle, [fixtureFinding(bundle, "EVIDENCE_GAP")]);
  assert.equal(open.evidenceReady, false);
  assert.equal(open.readyForHumanDecisionReview, false);
  assert.equal(open.unresolvedEvidenceGapFindingIds.length, 1);

  const resolved = review(bundle, [fixtureFinding(bundle, "EVIDENCE_GAP", "RESOLVED")]);
  assert.equal(resolved.evidenceReady, true);
  assert.equal(resolved.readyForHumanDecisionReview, true);
  assert.deepEqual(resolved.unresolvedEvidenceGapFindingIds, []);

  const accepted = review(bundle, [fixtureFinding(bundle, "EVIDENCE_GAP", "ACCEPTED_BY_HUMAN")]);
  assert.equal(accepted.evidenceReady, false);
  assert.equal(accepted.readyForHumanDecisionReview, false);
});

test("19-21. HUMAN_REVIEW_REQUIRED: unresolved/accepted → not ready, resolved → ready", () => {
  const bundle = mixedBundle();
  const open = review(bundle, [fixtureFinding(bundle, "HUMAN_REVIEW_REQUIRED")]);
  assert.equal(open.expertReviewReady, false);
  assert.equal(open.readyForHumanDecisionReview, false);
  assert.equal(open.unresolvedHumanReviewFindingIds.length, 1);

  const resolved = review(bundle, [fixtureFinding(bundle, "HUMAN_REVIEW_REQUIRED", "RESOLVED")]);
  assert.equal(resolved.expertReviewReady, true);
  assert.equal(resolved.readyForHumanDecisionReview, true);

  const accepted = review(bundle, [fixtureFinding(bundle, "HUMAN_REVIEW_REQUIRED", "ACCEPTED_BY_HUMAN")]);
  assert.equal(accepted.expertReviewReady, false);
  assert.equal(accepted.readyForHumanDecisionReview, false);
});

test("22-24. CONDITIONAL / HARD / ECONOMIC alone do not lower review readiness and stay listed", () => {
  const bundle = mixedBundle();
  const conditional = review(bundle, [fixtureFinding(bundle, "CONDITIONAL_BLOCKER")]);
  assert.equal(conditional.readyForHumanDecisionReview, true);
  assert.equal(conditional.openConditionalBlockerFindingIds.length, 1);

  const hard = fixtureFinding(bundle, "HARD_BLOCKER");
  const hardReview = review(bundle, [hard]);
  assert.equal(hardReview.readyForHumanDecisionReview, true);
  assert.deepEqual(hardReview.openHardBlockerFindingIds, [hard.findingId]);

  const economic = review(bundle, [fixtureFinding(bundle, "ECONOMIC_STRESS")]);
  assert.equal(economic.readyForHumanDecisionReview, true);
  assert.equal(economic.openEconomicStressFindingIds.length, 1);

  const resolvedHard = review(bundle, [fixtureFinding(bundle, "HARD_BLOCKER", "RESOLVED")]);
  assert.deepEqual(resolvedHard.openHardBlockerFindingIds, []);
  const acceptedHard = review(bundle, [fixtureFinding(bundle, "HARD_BLOCKER", "ACCEPTED_BY_HUMAN")]);
  assert.equal(acceptedHard.openHardBlockerFindingIds.length, 1);
});

test("25. evidence gap + conditional → not ready, conditional kept in its own list", () => {
  const bundle = mixedBundle();
  const completeness = buildDecisionReviewCompleteness(register(bundle, realEvaluation(bundle))).value;
  assert.equal(completeness.evidenceReady, false);
  assert.equal(completeness.expertReviewReady, false);
  assert.equal(completeness.readyForHumanDecisionReview, false);
  assert.equal(completeness.openConditionalBlockerFindingIds.length, 2);
  assert.deepEqual(completeness.openConditionalBlockerFindingIds, [...completeness.openConditionalBlockerFindingIds].sort());
  assert.deepEqual(completeness.openHardBlockerFindingIds, []);
  assert.deepEqual(completeness.openEconomicStressFindingIds, []);

  const gapAndConditional = review(bundle, [fixtureFinding(bundle, "EVIDENCE_GAP"), fixtureFinding(bundle, "CONDITIONAL_BLOCKER")]);
  assert.equal(gapAndConditional.readyForHumanDecisionReview, false);
  assert.equal(gapAndConditional.openConditionalBlockerFindingIds.length, 1);
});

test("invalid register input to completeness is rejected", () => {
  const bundle = mixedBundle();
  const reg = register(bundle, realEvaluation(bundle));
  const outcome = buildDecisionReviewCompleteness({ ...reg, createsVerdict: true });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "INVALID_RISK_REGISTER");
});

// ---- Boundary ----

test("26-31. createsVerdict/createsScore false, requiresHumanDecision true, no verdict/recommendation/score fields", () => {
  const bundle = mixedBundle();
  const reg = register(bundle, realEvaluation(bundle));
  const completeness = buildDecisionReviewCompleteness(reg).value;
  for (const value of [reg, completeness]) {
    assert.equal(value.createsVerdict, false);
    assert.equal(value.createsScore, false);
    const keys = [...collectKeys(value)];
    assert.deepEqual(
      keys.filter((key) => /verdict|recommend|score|grade|^approv|reject|contract/i.test(key) && !["createsVerdict", "createsScore"].includes(key)),
      [],
    );
  }
  assert.equal(completeness.requiresHumanDecision, true);
});

test("32-33. no final-judgement or contract-decision values", () => {
  const bundle = mixedBundle();
  const reg = register(bundle, realEvaluation(bundle));
  const completeness = buildDecisionReviewCompleteness(reg).value;
  const forbidden = /조건부\s*추천|추천|보류|위험|계약\s*(가능|불가)|진행\s*가능|안전/;
  for (const text of [...collectStrings(reg), ...collectStrings(completeness)]) {
    assert.doesNotMatch(text, forbidden, text);
  }
  for (const source of ["lib/risk-v2/risk-register.ts", "lib/risk-v2/decision-review.ts"]) {
    const code = fs.readFileSync(path.join(repositoryRoot, source), "utf8");
    assert.doesNotMatch(code, /"(추천|조건부 추천|보류|위험|계약 가능|계약 불가)"/);
  }
});
