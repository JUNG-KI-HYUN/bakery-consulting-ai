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

const { CANDIDATE_SCREENING_SCHEMA_VERSION } = loadModule(
  path.join(repositoryRoot, "lib/candidate-screening/types.ts"),
);
const { validateCandidateScreening } = loadModule(
  path.join(repositoryRoot, "lib/candidate-screening/validation.ts"),
);

const STORE_ID = "store_11111111-1111-4111-8111-111111111111";

function fixture(lifecycleStatus = "DISCOVERED", overrides = {}) {
  return {
    schemaVersion: CANDIDATE_SCREENING_SCHEMA_VERSION,
    candidateStoreId: STORE_ID,
    analysisClusterId: "analysis-cluster:seoul-review-001",
    lifecycleStatus,
    criteriaProfileRef: { profileId: "pork33-site-criteria", profileVersion: "1" },
    createdAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

function success(input) {
  const result = validateCandidateScreening(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  return result.value;
}

function failure(input, pattern) {
  const result = validateCandidateScreening(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), pattern);
}

for (const [index, status] of [
  "DISCOVERED", "FIELD_REVIEWED", "KEEP", "REVIEW", "SHORTLIST", "HOLD", "DROP",
].entries()) {
  test(`${index + 1}. Candidate ${status} 상태를 명시적으로 보존한다`, () => {
    assert.equal(success(fixture(status)).lifecycleStatus, status);
  });
}

test("8. malformed Candidate ID를 거부한다", () => {
  failure(fixture("DISCOVERED", { candidateStoreId: "STORE-20261030-001" }), /candidateStoreId/);
});

test("9. 빈 Cluster ID를 거부한다", () => {
  failure(fixture("DISCOVERED", { analysisClusterId: " " }), /analysisClusterId/);
});

test("10. invalid lifecycleStatus와 빈 review metadata를 거부한다", () => {
  failure(fixture("AUTO_DROP"), /lifecycleStatus/);
  failure(fixture("REVIEW", { reviewedBy: "" }), /reviewedBy/);
});

test("11. Candidate와 Cluster 원본을 복제하지 않고 reference만 보존한다", () => {
  const record = success(fixture("KEEP"));
  assert.deepEqual(Object.keys(record).sort(), [
    "analysisClusterId", "candidateStoreId", "createdAt", "criteriaProfileRef",
    "lifecycleStatus", "schemaVersion",
  ]);
  assert.equal("candidate" in record, false);
  assert.equal("analysisCluster" in record, false);
});

test("12. 입력 불변성과 readonly 결과를 보장한다", () => {
  const input = fixture("REVIEW", { reviewedBy: "staff_ref_01", reviewedAt: "2026-10-30T01:00:00.000Z" });
  const before = structuredClone(input);
  const record = success(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.criteriaProfileRef), true);
});

test("13. Site Grade와 Final Decision 필드를 확정하지 않는다", () => {
  failure({ ...fixture(), siteGrade: "A" }, /siteGrade/);
  failure({ ...fixture(), decision: "RECOMMEND" }, /decision/);
});
