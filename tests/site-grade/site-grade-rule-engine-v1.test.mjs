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
  SITE_GRADE_RULE_V1,
  createSiteGradeResultIdV1,
  deriveSiteGradeV1,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/rule-engine-v1.ts"));
const {
  HARD_RISK_GATE_RESULT_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/hard-risk-gate-types.ts"));
const {
  validateHardRiskGateResult,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/hard-risk-gate-validation.ts"));
const {
  SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/types.ts"));
const {
  SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
  CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/evaluation-types.ts"));

const STORE_ID = "store_33333333-3333-4333-8333-333333333333";
const CLUSTER_ID = "cluster:pork33:rule-engine";
const PROFILE_REF = Object.freeze({ profileId: "pork33-site-criteria", profileVersion: "1" });
const GENERATED_AT = "2026-10-30T03:00:00.000Z";
const CRITERIA = Object.freeze([
  ["exclusiveArea", "REQUIRED", "RANGE", { min: 9, max: 11 }, "pyeong"],
  ["deposit", "CONDITIONAL", "RANGE", { preferredMin: 10_000_000, preferredMax: 20_000_000, exceptionMax: 30_000_000 }, "KRW"],
  ["rent", "PREFERRED", "RANGE", { min: 1_000_000, max: 2_000_000 }, "KRW_PER_MONTH"],
  ["goodwill", "REQUIRED", "EQUALS", 0, "KRW"],
  ["vehicleAccess", "PREFERRED", "QUALITATIVE", "FIELD_REVIEW", undefined],
]);

function profile(overrides = {}) {
  return {
    schemaVersion: SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
    profileId: PROFILE_REF.profileId,
    profileVersion: PROFILE_REF.profileVersion,
    profileScope: "BRAND_SPECIFIC",
    brandId: "PORK33",
    industry: "BAKERY",
    storeFormat: "PORK33_STANDARD",
    criteria: CRITERIA.map(([key, importance, comparisonType, target, unit]) => ({
      key,
      label: key,
      importance,
      comparisonType,
      target,
      ...(unit ? { unit } : {}),
    })),
    createdAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

function evaluation(criterionKey, result = "MATCH", overrides = {}) {
  const confirmed = result !== "UNKNOWN";
  return {
    schemaVersion: SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
    evaluationId: `evaluation:${criterionKey}`,
    candidateStoreId: STORE_ID,
    analysisClusterId: CLUSTER_ID,
    criteriaProfileRef: { ...PROFILE_REF },
    criterionKey,
    result,
    ...(confirmed ? { observed: { value: true, sourceSummary: "rule-engine fixture" } } : {}),
    rationale: confirmed ? "명시된 Evaluation fixture" : "Evidence 부족",
    evidenceRefs: confirmed ? [`evidence:${criterionKey}`] : [],
    evaluatedAt: "2026-10-30T02:30:00.000Z",
    ...overrides,
  };
}

function evaluationSet(results = {}, overrides = {}) {
  return {
    schemaVersion: CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
    evaluationSetId: "evaluation-set:pork33:rule-engine",
    candidateStoreId: STORE_ID,
    analysisClusterId: CLUSTER_ID,
    criteriaProfileRef: { ...PROFILE_REF },
    evaluations: CRITERIA.map(([key]) => evaluation(key, results[key] ?? "MATCH")),
    createdAt: "2026-10-30T02:45:00.000Z",
    ...overrides,
  };
}

function engineInput(results = {}, overrides = {}) {
  return {
    profile: profile(),
    evaluationSet: evaluationSet(results),
    ruleSetVersion: SITE_GRADE_RULE_V1,
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

function deriveSuccess(input) {
  const result = deriveSiteGradeV1(input);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  return result.value;
}

function deriveFailure(input, expected) {
  const result = deriveSiteGradeV1(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), expected);
}

test("1. CASE A — 모든 REQUIRED MATCH와 Preferred 문제 없음은 Grade A", () => {
  const result = deriveSuccess(engineInput());
  assert.equal(result.grade, "A");
  assert.match(result.rationale[0], /^FULL_REQUIRED_MATCH:/);
});

test("2. CASE B — REQUIRED CONDITIONAL_MATCH는 Grade B", () => {
  const result = deriveSuccess(engineInput({ goodwill: "CONDITIONAL_MATCH" }));
  assert.equal(result.grade, "B");
  assert.match(result.rationale[0], /^REQUIRED_CONDITIONAL:/);
});

test("3. CASE C — REQUIRED GAP은 Grade C", () => {
  const result = deriveSuccess(engineInput({ goodwill: "GAP" }));
  assert.equal(result.grade, "C");
  assert.match(result.rationale[0], /^REQUIRED_GAP:/);
});

test("4. CASE D — REQUIRED HARD_GAP은 Grade D", () => {
  const result = deriveSuccess(engineInput({ goodwill: "HARD_GAP" }));
  assert.equal(result.grade, "D");
  assert.match(result.rationale[0], /^REQUIRED_HARD_GAP:/);
});

test("5. CASE U — REQUIRED UNKNOWN은 Grade U", () => {
  const result = deriveSuccess(engineInput({ goodwill: "UNKNOWN" }));
  assert.equal(result.grade, "U");
  assert.match(result.rationale[0], /^REQUIRED_UNKNOWN:/);
});

test("6. REQUIRED HARD_GAP + UNKNOWN은 HARD_GAP 우선으로 D", () => {
  const result = deriveSuccess(engineInput({ exclusiveArea: "UNKNOWN", goodwill: "HARD_GAP" }));
  assert.equal(result.grade, "D");
  assert.match(result.rationale[0], /^REQUIRED_HARD_GAP:/);
});

test("7. REQUIRED UNKNOWN + GAP은 UNKNOWN 우선으로 U", () => {
  const result = deriveSuccess(engineInput({ exclusiveArea: "UNKNOWN", goodwill: "GAP" }));
  assert.equal(result.grade, "U");
  assert.match(result.rationale[0], /^REQUIRED_UNKNOWN:/);
});

test("8. REQUIRED GAP + CONDITIONAL_MATCH는 C", () => {
  assert.equal(deriveSuccess(engineInput({
    exclusiveArea: "GAP",
    goodwill: "CONDITIONAL_MATCH",
  })).grade, "C");
});

test("9. REQUIRED 모두 MATCH + PREFERRED GAP은 B", () => {
  const result = deriveSuccess(engineInput({ rent: "GAP" }));
  assert.equal(result.grade, "B");
  assert.match(result.rationale[0], /^PREFERRED_GAP:/);
});

test("10. PREFERRED UNKNOWN은 Grade를 U로 바꾸지 않아 A 가능", () => {
  const result = deriveSuccess(engineInput({ vehicleAccess: "UNKNOWN" }));
  assert.equal(result.grade, "A");
  assert.equal(result.unknownCriteriaKeys.includes("vehicleAccess"), true);
});

test("11. CONDITIONAL importance HARD_GAP은 V1 Grade를 직접 강등하지 않는다", () => {
  const result = deriveSuccess(engineInput({ deposit: "HARD_GAP" }));
  assert.equal(result.grade, "A");
  assert.equal(result.hardGapCriteriaKeys.includes("deposit"), true);
});

test("12. explicit zero observed를 UNKNOWN으로 변환하지 않는다", () => {
  const set = evaluationSet({}, {
    evaluations: evaluationSet().evaluations.map((item) => item.criterionKey === "goodwill"
      ? evaluation("goodwill", "MATCH", {
          observed: { value: 0, unit: "KRW" },
          evidenceRefs: ["evidence:goodwill-zero"],
        })
      : item),
  });
  const result = deriveSuccess(engineInput({}, { evaluationSet: set }));
  assert.equal(result.grade, "A");
  assert.equal(result.matchedCriteriaKeys.includes("goodwill"), true);
});

test("13. Evaluation result에서 criterion key 그룹을 한 번씩 구성한다", () => {
  const result = deriveSuccess(engineInput({
    deposit: "CONDITIONAL_MATCH",
    rent: "GAP",
    goodwill: "HARD_GAP",
    vehicleAccess: "UNKNOWN",
  }));
  assert.deepEqual(result.matchedCriteriaKeys, ["exclusiveArea"]);
  assert.deepEqual(result.conditionalCriteriaKeys, ["deposit"]);
  assert.deepEqual(result.gapCriteriaKeys, ["rent"]);
  assert.deepEqual(result.hardGapCriteriaKeys, ["goodwill"]);
  assert.deepEqual(result.unknownCriteriaKeys, ["vehicleAccess"]);
});

test("14. Profile/Evaluation version mismatch면 Grade를 생성하지 않는다", () => {
  const mismatchedRef = { ...PROFILE_REF, profileVersion: "2" };
  const set = evaluationSet({}, {
    criteriaProfileRef: mismatchedRef,
    evaluations: evaluationSet().evaluations.map((item) => ({
      ...item,
      criteriaProfileRef: mismatchedRef,
    })),
  });
  deriveFailure(engineInput({}, { evaluationSet: set }), /profileVersion/);
});

test("15. missing/foreign criterion이면 Grade를 생성하지 않는다", () => {
  const missing = evaluationSet({}, { evaluations: evaluationSet().evaluations.slice(0, -1) });
  deriveFailure(engineInput({}, { evaluationSet: missing }), /누락/);
  const foreign = evaluationSet({}, {
    evaluations: [...evaluationSet().evaluations, evaluation("foreignCriterion", "MATCH")],
  });
  deriveFailure(engineInput({}, { evaluationSet: foreign }), /Profile에 없습니다/);
});

test("16. 같은 입력은 같은 Result와 안정적인 Result ID를 만든다", () => {
  const input = engineInput({ rent: "GAP" });
  const first = deriveSuccess(input);
  const second = deriveSuccess(structuredClone(input));
  assert.deepEqual(first, second);
  assert.equal(first.siteGradeResultId, createSiteGradeResultIdV1(
    input.evaluationSet.evaluationSetId,
    input.ruleSetVersion,
    input.generatedAt,
  ));
});

test("17. ruleSetVersion을 Result에 고정한다", () => {
  const result = deriveSuccess(engineInput({}, { ruleSetVersion: "PORK33_SITE_GRADE_V1" }));
  assert.equal(result.ruleSetVersion, "PORK33_SITE_GRADE_V1");
  deriveFailure(engineInput({}, { ruleSetVersion: "" }), /ruleSetVersion/);
});

test("18. Grade A와 Hard Risk BLOCKED를 독립적으로 표현한다", () => {
  const grade = deriveSuccess(engineInput());
  const gate = validateHardRiskGateResult({
    schemaVersion: HARD_RISK_GATE_RESULT_SCHEMA_VERSION,
    gateResultId: "hard-risk-gate:blocked:engine-test",
    candidateStoreId: STORE_ID,
    analysisClusterId: CLUSTER_ID,
    status: "BLOCKED",
    blockingRiskRefs: ["finding:critical-exhaust"],
    reviewRiskRefs: [],
    rationale: ["기존 Risk finding 참조"],
    evaluatedAt: GENERATED_AT,
    riskRuleVersion: "RISK_V2_RULES_1",
  });
  assert.equal(grade.grade, "A");
  assert.equal(gate.ok, true);
  assert.equal(gate.ok && gate.value.status, "BLOCKED");
});

test("19. Grade Result에 Decision, lifecycle, score, confidence를 생성하지 않는다", () => {
  const result = deriveSuccess(engineInput());
  for (const key of ["contractDecision", "humanDecision", "lifecycleStatus", "score", "evidenceConfidence"]) {
    assert.equal(key in result, false, `${key} must not be generated`);
  }
});

test("20. Engine은 입력을 mutate하지 않고 결과를 freeze한다", () => {
  const input = engineInput({ vehicleAccess: "UNKNOWN" });
  const before = structuredClone(input);
  const result = deriveSuccess(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rationale), true);
  assert.equal(Object.isFrozen(result.unknownCriteriaKeys), true);
});

test("21. REQUIRED criterion이 없는 Profile은 안전한 fallback U", () => {
  const noRequiredProfile = profile({
    criteria: profile().criteria.map((criterion) => ({ ...criterion, importance: "PREFERRED" })),
  });
  const result = deriveSuccess(engineInput({}, { profile: noRequiredProfile }));
  assert.equal(result.grade, "U");
  assert.match(result.rationale[0], /^FALLBACK_UNGRADED:/);
});
