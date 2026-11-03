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
  SITE_GRADE_INPUT_SCHEMA_VERSION,
  SITE_GRADE_RESULT_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/types.ts"));
const {
  validateSiteGradeInput,
  validateSiteGradeResult,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/validation.ts"));
const {
  HARD_RISK_GATE_RESULT_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/hard-risk-gate-types.ts"));
const {
  validateHardRiskGateResult,
} = loadModule(path.join(repositoryRoot, "lib/site-grade/hard-risk-gate-validation.ts"));
const {
  validateProfileEvaluationLink,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/profile-evaluation-validation.ts"));
const {
  SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/types.ts"));
const {
  SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
  CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/evaluation-types.ts"));

const STORE_A = "store_11111111-1111-4111-8111-111111111111";
const STORE_B = "store_22222222-2222-4222-8222-222222222222";
const CLUSTER_A = "cluster:pork33:a";
const PROFILE_REF = Object.freeze({ profileId: "pork33-site-criteria", profileVersion: "1" });
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

const RESULTS = Object.freeze({
  exclusiveArea: "MATCH",
  deposit: "CONDITIONAL_MATCH",
  rent: "GAP",
  goodwill: "HARD_GAP",
  vehicleAccess: "UNKNOWN",
});

function evaluation(criterionKey, overrides = {}) {
  const result = RESULTS[criterionKey] ?? "UNKNOWN";
  const confirmed = result !== "UNKNOWN";
  return {
    schemaVersion: SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
    evaluationId: `evaluation:${criterionKey}`,
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    criteriaProfileRef: { ...PROFILE_REF },
    criterionKey,
    result,
    ...(confirmed ? { observed: { value: true, sourceSummary: "contract fixture" } } : {}),
    rationale: confirmed ? "명시 입력된 계약 검증 fixture" : "현재 Evidence가 없어 UNKNOWN",
    evidenceRefs: confirmed ? [`evidence:${criterionKey}`] : [],
    evaluatedAt: "2026-10-30T01:00:00.000Z",
    ...overrides,
  };
}

function evaluationSet(overrides = {}) {
  return {
    schemaVersion: CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
    evaluationSetId: "evaluation-set:pork33:a",
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    criteriaProfileRef: { ...PROFILE_REF },
    evaluations: CRITERIA.map(([key]) => evaluation(key)),
    createdAt: "2026-10-30T01:05:00.000Z",
    ...overrides,
  };
}

function gradeInput(overrides = {}) {
  return {
    schemaVersion: SITE_GRADE_INPUT_SCHEMA_VERSION,
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    criteriaProfileRef: { ...PROFILE_REF },
    criteriaEvaluationSetId: "evaluation-set:pork33:a",
    ruleSetVersion: "PORK33_SITE_GRADE_V1",
    ...overrides,
  };
}

function gradeResult(grade = "B", overrides = {}) {
  return {
    schemaVersion: SITE_GRADE_RESULT_SCHEMA_VERSION,
    siteGradeResultId: `site-grade:${grade}:a`,
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    criteriaProfileRef: { ...PROFILE_REF },
    evaluationSetId: "evaluation-set:pork33:a",
    ruleSetVersion: "PORK33_SITE_GRADE_V1",
    grade,
    matchedCriteriaKeys: ["exclusiveArea"],
    conditionalCriteriaKeys: ["deposit"],
    gapCriteriaKeys: ["rent"],
    hardGapCriteriaKeys: ["goodwill"],
    unknownCriteriaKeys: ["vehicleAccess"],
    rationale: ["계산 결과가 아닌 contract validation fixture"],
    generatedAt: "2026-10-30T02:00:00.000Z",
    ...overrides,
  };
}

function gate(status = "CLEAR", overrides = {}) {
  return {
    schemaVersion: HARD_RISK_GATE_RESULT_SCHEMA_VERSION,
    gateResultId: `hard-risk-gate:${status.toLowerCase()}:a`,
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    status,
    blockingRiskRefs: status === "BLOCKED" ? ["finding:critical-exhaust"] : [],
    reviewRiskRefs: status === "REVIEW_REQUIRED" ? ["finding:expert-review"] : [],
    rationale: ["기존 Risk finding을 참조하는 contract fixture"],
    evaluatedAt: "2026-10-30T02:01:00.000Z",
    riskRuleVersion: "RISK_V2_RULES_1",
    ...overrides,
  };
}

function success(validator, input) {
  const result = validator(input);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  return result.value;
}

function failure(validator, input, expected) {
  const result = validator(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), expected);
}

for (const [index, grade] of ["A", "B", "C", "D", "U"].entries()) {
  test(`${index + 1}. Site Grade ${grade}를 명시 입력으로 보존한다`, () => {
    assert.equal(success(validateSiteGradeResult, gradeResult(grade)).grade, grade);
  });
}

test("6. invalid Grade를 거부한다", () => {
  failure(validateSiteGradeResult, gradeResult("S"), /grade/);
});

test("7. Site Grade A와 Hard Risk BLOCKED를 독립적으로 허용한다", () => {
  assert.equal(success(validateSiteGradeResult, gradeResult("A")).grade, "A");
  assert.equal(success(validateHardRiskGateResult, gate("BLOCKED")).status, "BLOCKED");
});

test("8. Site Grade A와 Evidence Confidence LOW를 함께 보존한다", () => {
  const result = success(validateSiteGradeResult, gradeResult("A", { evidenceConfidence: "LOW" }));
  assert.equal(result.evidenceConfidence, "LOW");
  assert.equal(result.grade, "A");
});

test("9. U + UNKNOWN confidence + REVIEW_REQUIRED를 독립적으로 허용한다", () => {
  assert.equal(success(validateSiteGradeResult, gradeResult("U", {
    evidenceConfidence: "UNKNOWN",
    reviewRequired: true,
  })).grade, "U");
  assert.equal(success(validateHardRiskGateResult, gate("REVIEW_REQUIRED")).status, "REVIEW_REQUIRED");
});

test("10. Profile ID와 Version을 고정한다", () => {
  assert.deepEqual(success(validateSiteGradeInput, gradeInput()).criteriaProfileRef, PROFILE_REF);
  const mismatchedRef = { ...PROFILE_REF, profileVersion: "2" };
  const mismatch = evaluationSet({
    criteriaProfileRef: mismatchedRef,
    evaluations: evaluationSet().evaluations.map((item) => ({
      ...item,
      criteriaProfileRef: mismatchedRef,
    })),
  });
  failure((input) => validateProfileEvaluationLink(profile(), input), mismatch, /profileVersion/);
});

test("11. Evaluation criterionKey가 실제 Profile에 모두 존재하면 교차검증한다", () => {
  const result = validateProfileEvaluationLink(profile(), evaluationSet());
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
});

test("12. 누락 criterion은 암묵 처리하지 않고 UNKNOWN evaluation 포함을 요구한다", () => {
  const missing = evaluationSet({ evaluations: evaluationSet().evaluations.slice(0, -1) });
  const result = validateProfileEvaluationLink(profile(), missing);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /UNKNOWN으로 포함/);
});

test("13. Profile에 없는 foreign criterionKey를 거부한다", () => {
  const foreign = evaluationSet({ evaluations: [...evaluationSet().evaluations, evaluation("foreignKey")] });
  const result = validateProfileEvaluationLink(profile(), foreign);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Profile에 없습니다/);
});

test("14. Evaluation Set 내부 Candidate/Cluster mismatch를 거부한다", () => {
  const candidateMismatch = evaluationSet({
    evaluations: [evaluation("exclusiveArea", { candidateStoreId: STORE_B }), ...evaluationSet().evaluations.slice(1)],
  });
  assert.equal(validateProfileEvaluationLink(profile(), candidateMismatch).ok, false);
  const clusterMismatch = evaluationSet({
    evaluations: [evaluation("exclusiveArea", { analysisClusterId: "cluster:other" }), ...evaluationSet().evaluations.slice(1)],
  });
  assert.equal(validateProfileEvaluationLink(profile(), clusterMismatch).ok, false);
});

test("15. 중복 Risk reference와 Gate 그룹 간 중복을 거부한다", () => {
  failure(validateHardRiskGateResult, gate("BLOCKED", {
    blockingRiskRefs: ["finding:1", "finding:1"],
  }), /중복 Risk reference/);
  failure(validateHardRiskGateResult, gate("BLOCKED", {
    blockingRiskRefs: ["finding:1"],
    reviewRiskRefs: ["finding:1"],
  }), /두 Gate 그룹/);
});

test("16. CLEAR/BLOCKED/REVIEW_REQUIRED를 모두 보존한다", () => {
  for (const status of ["CLEAR", "BLOCKED", "REVIEW_REQUIRED"]) {
    assert.equal(success(validateHardRiskGateResult, gate(status)).status, status);
  }
});

test("17. Grade Result의 Contract Decision 필드와 Gate의 Site Grade 필드를 거부한다", () => {
  failure(validateSiteGradeResult, { ...gradeResult("D"), contractDecision: "RISK" }, /contractDecision/);
  failure(validateHardRiskGateResult, { ...gate("BLOCKED"), siteGrade: "D" }, /siteGrade/);
});

test("18. lifecycle을 만들거나 자동 변경하지 않는다", () => {
  const result = success(validateSiteGradeResult, gradeResult("A"));
  assert.equal("lifecycleStatus" in result, false);
  failure(validateSiteGradeResult, { ...gradeResult("A"), lifecycleStatus: "SHORTLIST" }, /lifecycleStatus/);
});

test("19. 입력을 mutate하지 않고 nested 결과를 freeze한다", () => {
  const input = gradeResult("B");
  const before = structuredClone(input);
  const result = success(validateSiteGradeResult, input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.criteriaProfileRef), true);
  assert.equal(Object.isFrozen(result.matchedCriteriaKeys), true);
  assert.equal(Object.isFrozen(result.rationale), true);
});

test("20. Grade와 Gate의 Rule Version을 필수로 고정한다", () => {
  failure(validateSiteGradeInput, gradeInput({ ruleSetVersion: "" }), /ruleSetVersion/);
  failure(validateSiteGradeResult, gradeResult("B", { ruleSetVersion: "" }), /ruleSetVersion/);
  failure(validateHardRiskGateResult, gate("CLEAR", { riskRuleVersion: "" }), /riskRuleVersion/);
});

test("21. Candidate N개의 Grade Result identity를 독립 보존한다", () => {
  const first = success(validateSiteGradeResult, gradeResult("A"));
  const second = success(validateSiteGradeResult, gradeResult("C", {
    siteGradeResultId: "site-grade:c:b",
    candidateStoreId: STORE_B,
  }));
  assert.notEqual(first.candidateStoreId, second.candidateStoreId);
  assert.notEqual(first.siteGradeResultId, second.siteGradeResultId);
});

test("22. PORK33 Evaluation 결과 그룹을 계산 없이 명시 입력으로 보존한다", () => {
  const result = success(validateSiteGradeResult, gradeResult("B"));
  assert.deepEqual(result.matchedCriteriaKeys, ["exclusiveArea"]);
  assert.deepEqual(result.conditionalCriteriaKeys, ["deposit"]);
  assert.deepEqual(result.gapCriteriaKeys, ["rent"]);
  assert.deepEqual(result.hardGapCriteriaKeys, ["goodwill"]);
  assert.deepEqual(result.unknownCriteriaKeys, ["vehicleAccess"]);
});

test("23. Grade 결과 그룹 간 criterion 중복을 거부한다", () => {
  failure(validateSiteGradeResult, gradeResult("B", {
    gapCriteriaKeys: ["exclusiveArea", "rent"],
  }), /여러 결과 그룹/);
});

test("24. BLOCKED와 REVIEW_REQUIRED는 해당 Risk reference를 요구한다", () => {
  failure(validateHardRiskGateResult, gate("BLOCKED", { blockingRiskRefs: [] }), /최소 1개/);
  failure(validateHardRiskGateResult, gate("REVIEW_REQUIRED", { reviewRiskRefs: [] }), /최소 1개/);
});
