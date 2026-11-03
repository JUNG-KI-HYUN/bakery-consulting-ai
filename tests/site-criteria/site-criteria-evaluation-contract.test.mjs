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
  SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
  CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/evaluation-types.ts"));
const {
  validateSiteCriterionEvaluation,
  validateCandidateCriteriaEvaluationSet,
} = loadModule(path.join(repositoryRoot, "lib/site-criteria/evaluation-validation.ts"));
const { validateSiteCriteriaProfile } = loadModule(
  path.join(repositoryRoot, "lib/site-criteria/validation.ts"),
);
const { SITE_CRITERIA_PROFILE_SCHEMA_VERSION } = loadModule(
  path.join(repositoryRoot, "lib/site-criteria/types.ts"),
);

const STORE_A = "store_11111111-1111-4111-8111-111111111111";
const STORE_B = "store_22222222-2222-4222-8222-222222222222";
const PROFILE_REF = Object.freeze({ profileId: "pork33-site-criteria", profileVersion: "1" });
const CLUSTER_A = "analysis-cluster:seoul-review-001";

const PORK33_PROFILE = {
  schemaVersion: SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
  profileId: PROFILE_REF.profileId,
  profileVersion: PROFILE_REF.profileVersion,
  profileScope: "BRAND_SPECIFIC",
  brandLabel: "PORK33",
  industry: "FRESH_FOOD_RETAIL",
  storeFormat: "SMALL_NEIGHBORHOOD_RETAIL",
  criteria: [
    { key: "exclusiveArea", label: "전용 약 10평", importance: "PREFERRED", comparisonType: "QUALITATIVE", target: { reference: 10, qualifier: "APPROXIMATE" }, unit: "pyeong" },
    { key: "deposit", label: "보증금 선호 및 예외 범위", importance: "CONDITIONAL", comparisonType: "RANGE", target: { preferredMin: 10_000_000, preferredMax: 20_000_000, exceptionalMax: 30_000_000 }, unit: "KRW" },
    { key: "rent", label: "월세 100~200만원 선호", importance: "PREFERRED", comparisonType: "RANGE", target: { min: 1_000_000, max: 2_000_000 }, unit: "KRW_PER_MONTH" },
    { key: "goodwill", label: "무권리 원칙", importance: "REQUIRED", comparisonType: "EQUALS", target: 0, unit: "KRW" },
    { key: "vehicleAccess", label: "차량 접근", importance: "PREFERRED", comparisonType: "PRESENCE", target: true },
  ],
  createdAt: "2026-10-30T00:00:00.000Z",
};

function evaluation(criterionKey, result, overrides = {}) {
  const confirmed = result !== "UNKNOWN";
  return {
    schemaVersion: SITE_CRITERION_EVALUATION_SCHEMA_VERSION,
    evaluationId: `evaluation:${criterionKey}`,
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    criteriaProfileRef: { ...PROFILE_REF },
    criterionKey,
    result,
    ...(confirmed ? { observed: { value: true, sourceSummary: "명시적 contract fixture" } } : {}),
    rationale: confirmed ? "확인된 fixture Evidence 기준 수동 평가" : "판단에 필요한 Evidence 미확보",
    evidenceRefs: confirmed ? [`EVID-${criterionKey}`] : [],
    evaluatedAt: "2026-10-30T01:00:00.000Z",
    evaluationSource: "HUMAN",
    ...overrides,
  };
}

function evaluationSet(evaluations, overrides = {}) {
  return {
    schemaVersion: CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION,
    evaluationSetId: "evaluation-set:pork33-candidate-a-v1",
    candidateStoreId: STORE_A,
    analysisClusterId: CLUSTER_A,
    criteriaProfileRef: { ...PROFILE_REF },
    evaluations,
    createdAt: "2026-10-30T01:10:00.000Z",
    ...overrides,
  };
}

function successEvaluation(input) {
  const result = validateSiteCriterionEvaluation(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  return result.value;
}

function successSet(input) {
  const result = validateCandidateCriteriaEvaluationSet(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  return result.value;
}

function failureEvaluation(input, pattern) {
  const result = validateSiteCriterionEvaluation(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), pattern);
}

function failureSet(input, pattern) {
  const result = validateCandidateCriteriaEvaluationSet(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), pattern);
}

for (const [index, result] of ["MATCH", "CONDITIONAL_MATCH", "GAP", "HARD_GAP", "UNKNOWN"].entries()) {
  test(`${index + 1}. ${result} 결과를 명시적으로 보존한다`, () => {
    assert.equal(successEvaluation(evaluation("fixtureCriterion", result)).result, result);
  });
}

test("6. REQUIRED + UNKNOWN을 HARD_GAP으로 바꾸지 않는다", () => {
  const profile = validateSiteCriteriaProfile(PORK33_PROFILE);
  assert.equal(profile.ok, true);
  const importance = profile.value.criteria.find((item) => item.key === "goodwill").importance;
  const result = successEvaluation(evaluation("goodwill", "UNKNOWN"));
  assert.equal(importance, "REQUIRED");
  assert.equal(result.result, "UNKNOWN");
});

test("7. PREFERRED + GAP을 허용한다", () => {
  const result = successEvaluation(evaluation("rent", "GAP", {
    observed: { value: 2_500_000, unit: "KRW_PER_MONTH" },
    evidenceRefs: ["EVID-BROKER-RENT"],
  }));
  assert.equal(result.result, "GAP");
});

test("8. CONDITIONAL importance + MATCH를 허용한다", () => {
  const profile = validateSiteCriteriaProfile(PORK33_PROFILE);
  assert.equal(profile.ok, true);
  assert.equal(profile.value.criteria.find((item) => item.key === "deposit").importance, "CONDITIONAL");
  assert.equal(successEvaluation(evaluation("deposit", "MATCH")).result, "MATCH");
});

test("9. explicit zero를 UNKNOWN과 구분해 보존한다", () => {
  const result = successEvaluation(evaluation("goodwill", "MATCH", {
    observed: { value: 0, unit: "KRW" },
    evidenceRefs: ["EVID-GOODWILL-ZERO"],
  }));
  assert.equal(result.observed.value, 0);
  assert.equal("observed" in successEvaluation(evaluation("vehicleAccess", "UNKNOWN")), false);
});

test("10. UNKNOWN은 Evidence 0개와 observed 미입력을 보존한다", () => {
  const result = successEvaluation(evaluation("vehicleAccess", "UNKNOWN"));
  assert.deepEqual(result.evidenceRefs, []);
  assert.equal(result.result, "UNKNOWN");
});

test("11. profileId + profileVersion을 고정하고 mismatch를 거부한다", () => {
  const pinned = evaluation("rent", "MATCH");
  const set = successSet(evaluationSet([pinned]));
  assert.deepEqual(set.criteriaProfileRef, PROFILE_REF);
  failureSet(evaluationSet([{ ...pinned, criteriaProfileRef: { ...PROFILE_REF, profileVersion: "2" } }]), /criteriaProfileRef/);
});

test("12. duplicate criterion evaluation을 거부한다", () => {
  failureSet(evaluationSet([
    evaluation("rent", "MATCH"),
    { ...evaluation("rent", "GAP"), evaluationId: "evaluation:rent:second" },
  ]), /중복 criterionKey rent/);
});

test("13. Candidate N개는 독립 Evaluation Set을 가진다", () => {
  const first = successSet(evaluationSet([evaluation("rent", "MATCH")]));
  const secondEvaluation = evaluation("rent", "GAP", { candidateStoreId: STORE_B });
  const second = successSet(evaluationSet([secondEvaluation], {
    evaluationSetId: "evaluation-set:pork33-candidate-b-v1",
    candidateStoreId: STORE_B,
  }));
  assert.notEqual(first.candidateStoreId, second.candidateStoreId);
});

test("14. Cluster가 다르면 Evaluation Set identity와 evaluation 연결도 분리된다", () => {
  const clusterB = "analysis-cluster:seoul-review-002";
  const item = evaluation("rent", "MATCH", { analysisClusterId: clusterB });
  const second = successSet(evaluationSet([item], {
    evaluationSetId: "evaluation-set:cluster-b",
    analysisClusterId: clusterB,
  }));
  assert.equal(second.analysisClusterId, clusterB);
});

test("15. EvidenceRefs를 순서대로 보존하고 malformed/duplicate ref를 거부한다", () => {
  const result = successEvaluation(evaluation("deposit", "CONDITIONAL_MATCH", {
    observed: { value: 25_000_000, unit: "KRW" },
    evidenceRefs: ["EVID-BROKER-DEPOSIT", "EVID-CUSTOMER-CONDITION"],
  }));
  assert.deepEqual(result.evidenceRefs, ["EVID-BROKER-DEPOSIT", "EVID-CUSTOMER-CONDITION"]);
  failureEvaluation(evaluation("rent", "MATCH", { evidenceRefs: [""] }), /evidenceRefs\[0\]/);
  failureEvaluation(evaluation("rent", "MATCH", { evidenceRefs: ["EVID-1", "EVID-1"] }), /중복 Evidence/);
});

test("16. Site Grade 필드를 허용하지 않는다", () => {
  failureSet({ ...evaluationSet([]), siteGrade: "A" }, /siteGrade/);
});

test("17. Final Decision 필드를 허용하지 않는다", () => {
  failureSet({ ...evaluationSet([]), decision: "RECOMMEND" }, /decision/);
});

test("18. lifecycle을 생성하거나 자동변경하지 않는다", () => {
  const result = successSet(evaluationSet([evaluation("goodwill", "HARD_GAP", {
    observed: { value: 5_000_000, unit: "KRW" },
    evidenceRefs: ["EVID-GOODWILL-PRESENT"],
  })]));
  assert.equal("lifecycleStatus" in result, false);
  assert.equal("screeningStatus" in result, false);
});

test("19. 입력을 mutate하지 않고 nested 결과까지 freeze한다", () => {
  const input = evaluationSet([evaluation("exclusiveArea", "MATCH", {
    observed: { value: 10, unit: "pyeong" },
    evidenceRefs: ["EVID-AREA-DOCUMENT"],
  })]);
  const before = structuredClone(input);
  const result = successSet(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.evaluations), true);
  assert.equal(Object.isFrozen(result.evaluations[0]), true);
  assert.equal(Object.isFrozen(result.evaluations[0].observed), true);
});

test("20. PORK33 five-case fixture를 한 Evaluation Set에 저장한다", () => {
  const cases = [
    evaluation("exclusiveArea", "MATCH", { observed: { value: 10, unit: "pyeong" }, evidenceRefs: ["EVID-AREA"] }),
    evaluation("deposit", "CONDITIONAL_MATCH", { observed: { value: 25_000_000, unit: "KRW" }, evidenceRefs: ["EVID-DEPOSIT"] }),
    evaluation("rent", "GAP", { observed: { value: 2_500_000, unit: "KRW_PER_MONTH" }, evidenceRefs: ["EVID-RENT"] }),
    evaluation("goodwill", "HARD_GAP", { observed: { value: 5_000_000, unit: "KRW" }, evidenceRefs: ["EVID-GOODWILL"] }),
    evaluation("vehicleAccess", "UNKNOWN"),
  ];
  const result = successSet(evaluationSet(cases));
  assert.deepEqual(result.evaluations.map((item) => item.result), [
    "MATCH", "CONDITIONAL_MATCH", "GAP", "HARD_GAP", "UNKNOWN",
  ]);
});

test("21. 비-UNKNOWN 결과는 observed와 Evidence가 필요하고 rationale은 항상 필요하다", () => {
  failureEvaluation(evaluation("rent", "MATCH", { observed: undefined }), /observed/);
  failureEvaluation(evaluation("rent", "GAP", { evidenceRefs: [] }), /최소 1개/);
  failureEvaluation(evaluation("rent", "UNKNOWN", { rationale: "" }), /rationale/);
});

test("22. malformed Candidate/Cluster/Profile/Criterion reference를 거부한다", () => {
  failureEvaluation(evaluation("rent", "MATCH", { candidateStoreId: "STORE-1" }), /candidateStoreId/);
  failureEvaluation(evaluation("rent", "MATCH", { analysisClusterId: "" }), /analysisClusterId/);
  failureEvaluation(evaluation("rent", "MATCH", { criteriaProfileRef: { profileId: "", profileVersion: "1" } }), /profileId/);
  failureEvaluation(evaluation("", "MATCH"), /criterionKey/);
});
