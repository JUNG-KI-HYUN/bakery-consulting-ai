import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const {
  economicPlanDraftFromResult,
  economicPlanFromDraft,
  economicResultStatusForDraft,
  emptyEconomicPlanDraft,
} = require(path.join(root, "lib/economic-feasibility/assumption-draft.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

function plan() {
  return {
    expectedTicket: 11_000,
    operatingDaysPerMonth: 26,
    salesScenario: {
      conservativeDailyTransactions: 60,
      baseDailyTransactions: 82,
      upsideDailyTransactions: 105,
    },
    variableCostRates: {
      materialCostRate: 0.3,
      packagingCostRate: 0.04,
      cardFeeRate: 0.02,
      deliveryVariableRate: 0,
      otherVariableRate: 0.01,
    },
    fixedMonthlyCosts: {
      laborMonthly: 5_000_000,
      rentMonthly: 3_400_000,
      managementFeeMonthly: 300_000,
      utilitiesMonthly: 500_000,
      marketingMonthly: 200_000,
      posAccountingMonthly: 100_000,
      insuranceMonthly: 100_000,
      otherFixedMonthly: 200_000,
      deliveryFixedMonthly: 0,
    },
    rentPlanning: { targetRentBurdenRate: 0.1 },
  };
}

function boundResult(inputPlan = plan(), revision = 7) {
  const binding = {
    analysisRunId: "run-a",
    officialBenchmarkIdentity: null,
    rentalConfirmationId: null,
    assumptionRevision: revision,
  };
  return {
    generatedAt: "2026-10-13T00:00:00.000Z",
    binding,
    result: { inputs: inputPlan },
  };
}

test("persisted Economic result rehydrates its exact bound assumptions", () => {
  const version = boundResult();
  const draft = economicPlanDraftFromResult(version);
  assert.deepEqual(economicPlanFromDraft(draft).plan, version.result.inputs);
  assert.equal(economicResultStatusForDraft(version, version.binding, draft), "CURRENT");
});

test("a different assumption version never becomes current by latest fallback", () => {
  const displayed = boundResult(plan(), 7);
  const otherPlan = plan();
  otherPlan.expectedTicket = 15_000;
  const otherDraft = economicPlanDraftFromResult(boundResult(otherPlan, 8));
  assert.equal(economicResultStatusForDraft(displayed, displayed.binding, otherDraft), "STALE");
});

test("missing assumptions block recalculation and remain distinct from explicit zero", () => {
  const missing = emptyEconomicPlanDraft();
  const missingValidation = economicPlanFromDraft(missing);
  assert.equal(missingValidation.plan, null);
  assert.match(missingValidation.errors.join(" "), /월 인건비/);
  assert.match(missingValidation.errors.join(" "), /월세/);
  assert.equal(economicResultStatusForDraft(boundResult(), boundResult().binding, missing), "STALE");

  const explicitZero = economicPlanDraftFromResult(boundResult());
  explicitZero.fixedMonthlyCosts.laborMonthly = 0;
  explicitZero.fixedMonthlyCosts.rentMonthly = 0;
  explicitZero.rentPlanning.targetRentBurdenRate = 0;
  const validated = economicPlanFromDraft(explicitZero);
  assert.equal(validated.errors.length, 0);
  assert.equal(validated.plan.fixedMonthlyCosts.laborMonthly, 0);
  assert.equal(validated.plan.fixedMonthlyCosts.rentMonthly, 0);
  assert.equal(validated.plan.rentPlanning.targetRentBurdenRate, 0);
});

test("missing target rent burden remains optional while other assumptions stay required", () => {
  const optionalTarget = economicPlanDraftFromResult(boundResult());
  optionalTarget.rentPlanning.targetRentBurdenRate = null;
  const validated = economicPlanFromDraft(optionalTarget);

  assert.deepEqual(validated.errors, []);
  assert.ok(validated.plan);
  assert.deepEqual(validated.plan.rentPlanning, {});
  assert.equal("targetRentBurdenRate" in validated.plan.rentPlanning, false);

  const invalidTarget = economicPlanDraftFromResult(boundResult());
  invalidTarget.rentPlanning.targetRentBurdenRate = -0.01;
  const invalid = economicPlanFromDraft(invalidTarget);
  assert.equal(invalid.plan, null);
  assert.match(invalid.errors.join(" "), /목표 월세부담률.*0 이상/);
});

test("Economics UI keeps Case references read-only and guards recalculation", () => {
  const client = fs.readFileSync(path.join(root, "app/markets/economic-feasibility/EconomicFeasibilityClient.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "app/markets/economic-feasibility/page.tsx"), "utf8");
  assert.match(client, /disabled=\{!activeTarget \|\| !draftValidation\.plan \|\| versionSelectionRequired\}/);
  assert.match(client, /고객 목표 세전 영업이익/);
  assert.match(client, /FRAMEONE 권장 월세 상한/);
  assert.match(client, /자동 반영하지 않습니다/);
  assert.match(client, /목표 월세부담률 미설정/);
  assert.match(client, /사업계획 버전 선택 필요/);
  assert.match(page, /customerProfile\?\.targetMonthlyOwnerIncomeWon/);
  assert.match(page, /frameoneRecommendation\?\.recommendedMonthlyRentMaxWon/);
});

test("Candidate selector disables invalid Economic history", () => {
  const selector = fs.readFileSync(path.join(root, "components/candidates/CandidateEconomicVersionSelector.tsx"), "utf8");
  assert.match(selector, /const invalid = version\.validationErrorCount > 0/);
  assert.match(selector, /disabled=\{invalid \|\| selected \|\| pendingKey !== null\}/);
  assert.match(selector, /유효하지 않아 선택 불가/);
});
