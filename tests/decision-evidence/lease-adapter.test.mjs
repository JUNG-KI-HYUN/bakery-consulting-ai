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

const { buildLeaseDecisionEvidence } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/lease-adapter.ts"),
);
const { decisionEvidenceCreatesNoVerdictScoreRisk } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/helpers.ts"),
);

const FORBIDDEN_PHRASE_PATTERN =
  /적정\s*월세|안전한\s*월세|비싼\s*월세|저렴한\s*월세|과도한\s*월세|계약\s*가능|계약\s*불가|좋은\s*조건|나쁜\s*조건|위험\s*점포|\b위험\b|추천|조건부\s*추천|보류|안전/;

function baseResult(overrides = {}) {
  return {
    schemaVersion: "frameone.rental-market-analysis.v1",
    filters: {},
    sampleCount: 3,
    sampleSufficiency: "REFERENCE_ONLY",
    selectedRecordIds: ["rec-a", "rec-b", "rec-c"],
    sourceComposition: {
      ONLINE_LISTING: 1,
      BROKER_CONFIRMED: 2,
    },
    referenceDate: "2026-09-01",
    deposit: { sampleCount: 3, median: 50_000_000, min: 30_000_000, max: 80_000_000 },
    rent: { sampleCount: 3, median: 4_500_000, min: 3_500_000, max: 6_000_000 },
    managementFee: { sampleCount: 2, median: 75_000, min: 50_000, max: 100_000 },
    rentPerExclusivePyeong: { sampleCount: 3, median: 200_000, min: 150_000, max: 250_000 },
    priceHistory: [],
    limitations: [
      "FRAMEONE이 확인한 조사표본의 참고용 통계이며 모집단 전체의 시장가격이 아닙니다.",
      "ONLINE_LISTING은 광고가격이며 실제 계약가격과 다를 수 있습니다.",
      "실제 계약 전 중개확인과 계약조건 확인이 필요합니다.",
    ],
    ...overrides,
  };
}

function matchingBinding(result) {
  return {
    selectedResearchRecordIds: [...result.selectedRecordIds],
    referenceDate: result.referenceDate,
  };
}

function allText(evidence) {
  return [
    ...evidence.observedFacts,
    ...evidence.missingInformation,
    ...evidence.expertReviewItems,
  ]
    .map((item) => `${item.title}\n${item.description}`)
    .join("\n");
}

test("1. builds Lease Evidence from a normal RentalMarketResult", () => {
  const result = baseResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  assert.ok(evidence.observedFacts.length > 0);
  assert.ok(evidence.observedFacts.every((item) => item.sourceDomain === "LEASE"));
  assert.ok(evidence.observedFacts.every((item) => item.category === "LEASE"));
  assert.ok(evidence.observedFacts.every((item) => item.bucket === "OBSERVED_FACT"));
  assert.ok(evidence.observedFacts.every((item) => item.nature === "REFERENCE_SUMMARY"));
  assert.equal(evidence.observedConstraints, undefined);
  assert.deepEqual(evidence.referenceLimitations, result.limitations);
  assert.equal(evidence.expertReviewItems.length, 0);
  assert.notEqual(evidence.referenceLimitations, result.limitations);
});

test("2. preserves sampleCount / rent median / min / max exactly", () => {
  const result = baseResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  const text = allText(evidence);
  assert.match(text, new RegExp(`sampleCount=${result.sampleCount}`));
  assert.match(text, new RegExp(`median=${result.rent.median}`));
  assert.match(text, new RegExp(`min=${result.rent.min}`));
  assert.match(text, new RegExp(`max=${result.rent.max}`));
  const rentFact = evidence.observedFacts.find((item) => item.sourceRef.fieldKey === "rent");
  assert.ok(rentFact);
  assert.equal(rentFact.nature, "REFERENCE_SUMMARY");
  assert.match(rentFact.description, /median=4500000/);
  assert.match(rentFact.description, /min=3500000/);
  assert.match(rentFact.description, /max=6000000/);
  for (const fieldKey of ["deposit", "managementFee", "rentPerExclusivePyeong"]) {
    const fact = evidence.observedFacts.find((item) => item.sourceRef.fieldKey === fieldKey);
    assert.ok(fact, fieldKey);
    assert.equal(fact.nature, "REFERENCE_SUMMARY");
  }
});

test("3. preserves managementFee NumericSummary when some samples are null", () => {
  const result = baseResult({
    managementFee: { sampleCount: 2, median: 75_000, min: 50_000, max: 100_000 },
  });
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  const feeFact = evidence.observedFacts.find(
    (item) => item.sourceRef.fieldKey === "managementFee",
  );
  assert.ok(feeFact);
  assert.equal(feeFact.nature, "REFERENCE_SUMMARY");
  assert.match(feeFact.description, /sampleCount=2/);
  assert.match(feeFact.description, /median=75000/);
  assert.match(feeFact.description, /min=50000/);
  assert.match(feeFact.description, /max=100000/);
});

test("4. INSUFFICIENT_REFERENCE_ONLY produces missingInformation", () => {
  const result = baseResult({
    sampleCount: 2,
    sampleSufficiency: "INSUFFICIENT_REFERENCE_ONLY",
    selectedRecordIds: ["rec-a", "rec-b"],
  });
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  const insufficient = evidence.missingInformation.find((item) =>
    item.id.includes("insufficient"),
  );
  assert.ok(insufficient);
  assert.equal(insufficient.nature, "REFERENCE_SUMMARY");
  assert.ok(
    evidence.missingInformation.some((item) =>
      item.description.includes("비교 임대료 표본이 충분하지 않습니다"),
    ),
  );
  assert.equal(evidence.expertReviewItems.length, 0);
  assert.equal(evidence.referenceLimitations.length, result.limitations.length);
});

test("5. REFERENCE_ONLY does not claim samples are sufficient", () => {
  const result = baseResult({ sampleSufficiency: "REFERENCE_ONLY" });
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  const text = allText(evidence);
  assert.doesNotMatch(text, /충분합니다|충분한 표본|표본이 충분/);
  assert.match(text, /참고용|참고값|FRAMEONE 확인 표본/);
  assert.match(text, /표본 충분 여부를 단정하지 않습니다/);
});

test("6. null RentalMarketResult produces missingInformation", () => {
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: null,
    leaseBinding: {
      selectedResearchRecordIds: ["rec-a"],
      referenceDate: "2026-09-01",
    },
  });
  const absent = evidence.missingInformation.find((item) =>
    item.description.includes("RentalMarketResult"),
  );
  assert.ok(absent);
  assert.equal(absent.nature, "INTEGRATION_STATE");
  assert.equal(evidence.observedFacts.length, 0);
  assert.deepEqual(evidence.referenceLimitations, []);
  assert.equal(evidence.expertReviewItems.length, 0);
});

test("7. null leaseBinding produces missing/integration evidence", () => {
  const result = baseResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: null,
  });
  const unbound = evidence.missingInformation.find((item) =>
    item.description.includes("leaseBinding"),
  );
  assert.ok(unbound);
  assert.equal(unbound.nature, "INTEGRATION_STATE");
  assert.ok(evidence.observedFacts.length > 0);
  assert.ok(evidence.observedFacts.every((item) => item.nature === "REFERENCE_SUMMARY"));
  assert.deepEqual(evidence.referenceLimitations, result.limitations);
});

test("8. selectedResearchRecordIds mismatch is missing/integration, not Risk", () => {
  const result = baseResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: {
      selectedResearchRecordIds: ["rec-other"],
      referenceDate: "2099-01-01",
    },
  });
  const idMismatch = evidence.missingInformation.find((item) =>
    item.id.includes("selected-record-ids-mismatch"),
  );
  const dateMismatch = evidence.missingInformation.find((item) =>
    item.id.includes("reference-date-mismatch"),
  );
  assert.ok(idMismatch);
  assert.ok(dateMismatch);
  assert.equal(idMismatch.bucket, "MISSING_INFORMATION");
  assert.equal(idMismatch.nature, "INTEGRATION_STATE");
  assert.equal(dateMismatch.nature, "INTEGRATION_STATE");
  assert.equal(evidence.createsRisk, false);
  assert.ok(!("riskScore" in evidence));
  assert.ok(!("verdict" in evidence));
});

test("9. does not mutate source RentalMarketResult or leaseBinding", () => {
  const result = baseResult();
  const binding = matchingBinding(result);
  const resultSnapshot = structuredClone(result);
  const bindingSnapshot = structuredClone(binding);
  const limitationsSnapshot = [...result.limitations];
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: binding,
  });
  assert.deepEqual(result, resultSnapshot);
  assert.deepEqual(binding, bindingSnapshot);
  assert.deepEqual(result.limitations, limitationsSnapshot);
  result.limitations.push("mutated-source");
  assert.equal(evidence.referenceLimitations.includes("mutated-source"), false);
  result.limitations.pop();
});

test("10. Lease Decision Evidence result is JSON serializable", () => {
  const result = baseResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  const json = JSON.stringify(evidence);
  const parsed = JSON.parse(json);
  assert.equal(parsed.createsRisk, false);
  assert.ok(Array.isArray(parsed.observedFacts));
  assert.ok(parsed.observedFacts[0].sourceDomain === "LEASE");
  assert.equal(parsed.observedFacts[0].nature, "REFERENCE_SUMMARY");
  assert.deepEqual(parsed.referenceLimitations, result.limitations);
  assert.equal(parsed.expertReviewItems.length, 0);
});

test("11. createsRisk / createsScore / createsVerdict are false", () => {
  const result = baseResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  assert.equal(evidence.createsVerdict, false);
  assert.equal(evidence.createsScore, false);
  assert.equal(evidence.createsRisk, false);
  assert.equal(decisionEvidenceCreatesNoVerdictScoreRisk(evidence), true);
  assert.equal(evidence.expertReviewItems.length, 0);
});

test("12. forbids judgment phrases such as 적정 월세 / 위험 / 추천", () => {
  const result = baseResult({
    sampleSufficiency: "INSUFFICIENT_REFERENCE_ONLY",
    sampleCount: 2,
    selectedRecordIds: ["rec-a", "rec-b"],
  });
  const cases = [
    buildLeaseDecisionEvidence({
      rentalMarketResult: result,
      leaseBinding: matchingBinding(result),
    }),
    buildLeaseDecisionEvidence({
      rentalMarketResult: null,
      leaseBinding: null,
    }),
    buildLeaseDecisionEvidence({
      rentalMarketResult: result,
      leaseBinding: {
        selectedResearchRecordIds: ["mismatch"],
        referenceDate: null,
      },
    }),
  ];
  for (const evidence of cases) {
    const text = allText(evidence);
    assert.doesNotMatch(text, FORBIDDEN_PHRASE_PATTERN);
    assert.equal(evidence.expertReviewItems.length, 0);
  }
});

function nullSummaryResult() {
  return baseResult({
    deposit: { sampleCount: 0, median: null, min: null, max: null },
    managementFee: { sampleCount: 0, median: null, min: null, max: null },
    rentPerExclusivePyeong: { sampleCount: 1, median: 200_000, min: null, max: null },
  });
}

test("13. null NumericSummary values never appear as the text 'null' in descriptions", () => {
  const result = nullSummaryResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  for (const fieldKey of ["deposit", "managementFee", "rentPerExclusivePyeong"]) {
    const fact = evidence.observedFacts.find((item) => item.sourceRef.fieldKey === fieldKey);
    assert.ok(fact, fieldKey);
    assert.equal(fact.nature, "REFERENCE_SUMMARY");
    assert.equal(fact.description.includes("null"), false, fieldKey);
    assert.doesNotMatch(fact.description, /median=0\b|min=0\b|max=0\b/);
  }
  const deposit = evidence.observedFacts.find((item) => item.sourceRef.fieldKey === "deposit");
  assert.match(deposit.description, /median=확인 필요/);
  const pyeong = evidence.observedFacts.find((item) => item.sourceRef.fieldKey === "rentPerExclusivePyeong");
  assert.match(pyeong.description, /median=200000, min=확인 필요, max=확인 필요/);
  assert.equal(allText(evidence).includes("null"), false);
});

test("14. reference NumericSummaries keep typed null and exact numbers", () => {
  const result = nullSummaryResult();
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  assert.deepEqual(evidence.referenceNumericSummaries.deposit, { sampleCount: 0, median: null, min: null, max: null });
  assert.equal(evidence.referenceNumericSummaries.managementFee.median, null);
  assert.equal(evidence.referenceNumericSummaries.rentPerExclusivePyeong.median, 200_000);
  assert.equal(evidence.referenceNumericSummaries.rentPerExclusivePyeong.min, null);
  assert.deepEqual(evidence.referenceNumericSummaries.rent, result.rent);
  assert.notEqual(evidence.referenceNumericSummaries.deposit, result.deposit);

  const serialized = JSON.stringify(evidence);
  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.match(serialized, /"median":null/);
  assert.equal(serialized.includes('"null"'), false);

  const absent = buildLeaseDecisionEvidence({ rentalMarketResult: null, leaseBinding: null });
  assert.equal(absent.referenceNumericSummaries, null);
});

test("15. null fix keeps REFERENCE_SUMMARY and creates no risk, score, or verdict", () => {
  const result = nullSummaryResult();
  const before = JSON.stringify(result);
  const evidence = buildLeaseDecisionEvidence({
    rentalMarketResult: result,
    leaseBinding: matchingBinding(result),
  });
  assert.equal(JSON.stringify(result), before);
  assert.ok(evidence.observedFacts.every((item) => item.nature === "REFERENCE_SUMMARY"));
  assert.equal(evidence.observedConstraints, undefined);
  assert.equal(evidence.expertReviewItems.length, 0);
  assert.equal(decisionEvidenceCreatesNoVerdictScoreRisk(evidence), true);
  assert.doesNotMatch(allText(evidence), FORBIDDEN_PHRASE_PATTERN);
});
