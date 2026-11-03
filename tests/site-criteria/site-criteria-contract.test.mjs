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

const { SITE_CRITERIA_PROFILE_SCHEMA_VERSION } = loadModule(
  path.join(repositoryRoot, "lib/site-criteria/types.ts"),
);
const { validateSiteCriteriaProfile } = loadModule(
  path.join(repositoryRoot, "lib/site-criteria/validation.ts"),
);

function criterion(key, label, importance, comparisonType, target, options = {}) {
  return { key, label, importance, comparisonType, target, ...options };
}

function pork33Fixture(overrides = {}) {
  return {
    schemaVersion: SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
    profileId: "pork33-site-criteria",
    profileVersion: "1",
    profileScope: "BRAND_SPECIFIC",
    brandLabel: "PORK33",
    industry: "FRESH_FOOD_RETAIL",
    storeFormat: "SMALL_NEIGHBORHOOD_RETAIL",
    criteria: [
      criterion("exclusiveArea", "전용 약 10평", "PREFERRED", "QUALITATIVE", { reference: 10, qualifier: "APPROXIMATE" }, { unit: "pyeong", evidenceRequirement: "DOCUMENT_REQUIRED" }),
      criterion("deposit", "보증금 1,000~2,000만원 선호", "CONDITIONAL", "RANGE", { preferredMin: 10_000_000, preferredMax: 20_000_000, exceptionalMax: 30_000_000 }, { unit: "KRW", note: "매우 좋은 입지는 예외적으로 3,000만원 검토 가능" }),
      criterion("rent", "월세 100~200만원 선호", "PREFERRED", "RANGE", { min: 1_000_000, max: 2_000_000 }, { unit: "KRW_PER_MONTH" }),
      criterion("goodwill", "무권리 원칙", "REQUIRED", "EQUALS", 0, { unit: "KRW" }),
      criterion("householdBase", "1,500세대 이상 주거배후 선호", "PREFERRED", "MINIMUM", 1500, { unit: "households" }),
      criterion("mainResidentialFlow", "아파트 주생활동선", "PREFERRED", "QUALITATIVE", "IMPORTANT"),
      criterion("vehicleAccess", "차량 접근", "PREFERRED", "PRESENCE", true),
      criterion("shortTermParking", "단기정차", "PREFERRED", "PRESENCE", true),
      criterion("visibility", "가시성", "PREFERRED", "QUALITATIVE", "IMPORTANT"),
      criterion("repeatPurchaseTradeArea", "반복구매 생활상권", "PREFERRED", "QUALITATIVE", "IMPORTANT"),
    ],
    createdAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

function success(input) {
  const result = validateSiteCriteriaProfile(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  return result.value;
}

function failure(input, pattern) {
  const result = validateSiteCriteriaProfile(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), pattern);
}

test("1. PORK33-specific Site Criteria Profile을 생성한다", () => {
  const profile = success(pork33Fixture());
  assert.equal(profile.profileId, "pork33-site-criteria");
  assert.equal(profile.criteria.length, 10);
});

test("2. criterion duplicate key를 거부한다", () => {
  const duplicate = criterion("rent", "중복 월세", "REQUIRED", "MAXIMUM", 2_000_000);
  failure(pork33Fixture({ criteria: [...pork33Fixture().criteria, duplicate] }), /중복 key rent/);
});

test("3. REQUIRED, PREFERRED, CONDITIONAL importance를 서로 분리한다", () => {
  const profile = success(pork33Fixture());
  assert.deepEqual(new Set(profile.criteria.map((item) => item.importance)), new Set(["REQUIRED", "PREFERRED", "CONDITIONAL"]));
  failure(pork33Fixture({ criteria: [criterion("rent", "월세", "HARD_GAP", "MAXIMUM", 2_000_000)] }), /importance/);
});

test("4. PORK33 기준을 Generic profile로 해석하지 않는다", () => {
  const profile = success(pork33Fixture());
  assert.equal(profile.profileScope, "BRAND_SPECIFIC");
  assert.equal(profile.brandLabel, "PORK33");
  failure(pork33Fixture({ profileScope: "GENERIC" }), /GENERIC profile/);
});

test("5. 빈 profile/version/label과 target 누락을 거부한다", () => {
  failure(pork33Fixture({ profileId: "" }), /profileId/);
  failure(pork33Fixture({ profileVersion: "" }), /profileVersion/);
  failure(pork33Fixture({ criteria: [{ key: "rent", label: "", importance: "PREFERRED", comparisonType: "MAXIMUM", target: 2_000_000 }] }), /label/);
  failure(pork33Fixture({ criteria: [{ key: "rent", label: "월세", importance: "PREFERRED", comparisonType: "MAXIMUM" }] }), /target/);
});

test("6. 입력을 mutate하지 않고 target까지 readonly로 반환한다", () => {
  const input = pork33Fixture();
  const before = structuredClone(input);
  const profile = success(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.criteria), true);
  assert.equal(Object.isFrozen(profile.criteria[0].target), true);
});

test("7. Site Grade, evaluation result, Decision 필드를 확정하지 않는다", () => {
  failure({ ...pork33Fixture(), siteGrade: "A" }, /siteGrade/);
  failure({ ...pork33Fixture(), decision: "RECOMMEND" }, /decision/);
  const item = pork33Fixture().criteria[0];
  failure(pork33Fixture({ criteria: [{ ...item, evaluationResult: "MATCH" }] }), /evaluationResult/);
});

test("8. industry와 storeFormat은 profile별 non-empty reference 문자열로 보존한다", () => {
  const profile = success(pork33Fixture());
  assert.equal(profile.industry, "FRESH_FOOD_RETAIL");
  assert.equal(profile.storeFormat, "SMALL_NEIGHBORHOOD_RETAIL");
  failure(pork33Fixture({ industry: " " }), /industry/);
  failure(pork33Fixture({ storeFormat: "" }), /storeFormat/);
});
