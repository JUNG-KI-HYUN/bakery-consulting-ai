import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);

function installTypeScriptLoader() {
  const previousLoader = loadModule.extensions[".ts"];
  loadModule.extensions[".ts"] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) => originalRequire(specifier.startsWith("@/")
      ? path.join(repositoryRoot, specifier.slice(2))
      : specifier);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    module._compile(output, filename);
  };
  return () => {
    if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
    else delete loadModule.extensions[".ts"];
  };
}

const restoreLoader = installTypeScriptLoader();
const { analyzeRentalMarket, median } = loadModule(path.join(repositoryRoot, "lib/research/rental-market-analysis.ts"));

function record(id, overrides = {}) {
  return {
    schemaVersion: "frameone.lease-research-record.v1.2",
    recordId: id,
    source: {
      sourceUrl: `https://example.invalid/${id}`,
      sourceName: "fixture source",
      sourceType: "ONLINE_LISTING",
      collectedAt: "2026-09-20T00:00:00.000Z",
      pageTitle: "fixture",
      ...overrides.source,
    },
    property: {
      addressRaw: "서울 fixture로 1",
      address: "서울 fixture로 1",
      floor: "1",
      contractAreaM2: 66.12,
      contractAreaPyeong: 20,
      exclusiveAreaM2: 49.59,
      exclusiveAreaPyeong: 15,
      ...overrides.property,
    },
    lease: {
      depositAmount: 50_000_000,
      rentAmount: 4_500_000,
      managementFeeAmount: 100_000,
      premiumAmount: null,
      premiumStatus: "NEGOTIABLE",
      vatStatus: "UNKNOWN",
      ...overrides.lease,
    },
    optional: { parking: null, moveIn: null, existingBusinessType: null, buildingName: null },
    quality: {
      verificationStatus: "CONFIRMED",
      freshnessStatus: "CURRENT_30D",
      duplicateStatus: "NO_MATCH",
      warnings: [],
      ...overrides.quality,
    },
    evidence: { raw: {}, normalized: {}, fieldStatus: {}, excerpts: {} },
    history: overrides.history ?? [],
  };
}

test.after(() => restoreLoader());

test("median은 1·2·3·4개 표본에서 홀수 중앙과 짝수 가운데 평균을 반환한다", () => {
  assert.equal(median([7]), 7);
  assert.equal(median([10, 2]), 6);
  assert.equal(median([9, 1, 4]), 4);
  assert.equal(median([8, 2, 10, 4]), 6);
});

test("CONFIRMED만 임대시장 표본에 포함한다", () => {
  const records = ["CONFIRMED", "COLLECTED", "REVIEW_REQUIRED", "EXCLUDED"]
    .map((status) => record(`status-${status}`, { quality: { verificationStatus: status } }));
  const result = analyzeRentalMarket(records, { referenceDate: "2026-09-22" });
  assert.equal(result.sampleCount, 1);
  assert.deepEqual(result.selectedRecordIds, ["status-CONFIRMED"]);
});

test("전용평당월세는 월세/전용평수이며 null·0 전용면적과 계약면적 대체를 제외한다", () => {
  const result = analyzeRentalMarket([
    record("valid-area", { lease: { rentAmount: 4_500_000 }, property: { exclusiveAreaPyeong: 15 } }),
    record("null-area", { property: { exclusiveAreaPyeong: null, contractAreaPyeong: 30 } }),
    record("zero-area", { property: { exclusiveAreaPyeong: 0, contractAreaPyeong: 30 } }),
  ], { referenceDate: "2026-09-22" });
  assert.equal(result.rentPerExclusivePyeong.sampleCount, 1);
  assert.equal(result.rentPerExclusivePyeong.median, 300_000);
});

test("보증금·월세·관리비는 값 있는 확정 표본의 median/min/max를 각각 계산한다", () => {
  const result = analyzeRentalMarket([
    record("summary-a", { lease: { depositAmount: 30_000_000, rentAmount: 3_500_000, managementFeeAmount: 50_000 } }),
    record("summary-b", { lease: { depositAmount: 50_000_000, rentAmount: 4_500_000, managementFeeAmount: 100_000 } }),
    record("summary-c", { lease: { depositAmount: 80_000_000, rentAmount: 6_000_000, managementFeeAmount: null } }),
  ], { referenceDate: "2026-09-22" });
  assert.deepEqual(result.deposit, { sampleCount: 3, median: 50_000_000, min: 30_000_000, max: 80_000_000 });
  assert.deepEqual(result.rent, { sampleCount: 3, median: 4_500_000, min: 3_500_000, max: 6_000_000 });
  assert.deepEqual(result.managementFee, { sampleCount: 2, median: 75_000, min: 50_000, max: 100_000 });
});

test("사람이 같은 매물로 연결한 확정 snapshot은 최신 한 건만 표본이고 가격변경 이력은 보존한다", () => {
  const previous = record("listing-old", {
    source: { collectedAt: "2026-09-01T00:00:00.000Z" },
    lease: { rentAmount: 5_000_000 },
  });
  const current = record("listing-new", {
    source: { collectedAt: "2026-09-20T00:00:00.000Z" },
    lease: { rentAmount: 4_500_000 },
    history: [{
      type: "DUPLICATE_REVIEWED",
      changedAt: "2026-09-20T01:00:00.000Z",
      relatedRecordId: "listing-old",
      decision: "SAME_LISTING",
    }],
  });
  const result = analyzeRentalMarket([previous, current], { referenceDate: "2026-09-22" });
  assert.equal(result.sampleCount, 1);
  assert.deepEqual(result.selectedRecordIds, ["listing-new"]);
  const rentChange = result.priceHistory[0].changes.find((change) => change.field === "rentAmount");
  assert.equal(rentChange.changeAmount, -500_000);
  assert.equal(rentChange.changeRate, -10);
});

test("중복 후보일 뿐 SAME_LISTING 확인이 없으면 자동 병합하지 않는다", () => {
  const result = analyzeRentalMarket([
    record("candidate-a", { quality: { duplicateStatus: "LIKELY_DUPLICATE" } }),
    record("candidate-b", { quality: { duplicateStatus: "LIKELY_DUPLICATE" } }),
  ], { referenceDate: "2026-09-22" });
  assert.equal(result.sampleCount, 2);
});

test("source composition은 의미가 다른 출처 유형을 분리한다", () => {
  const result = analyzeRentalMarket([
    record("online"),
    record("broker", { source: { sourceType: "BROKER_CONFIRMED" } }),
    record("contract", { source: { sourceType: "ACTUAL_CONTRACT" } }),
  ], { referenceDate: "2026-09-22" });
  assert.deepEqual(result.sourceComposition, { ONLINE_LISTING: 1, BROKER_CONFIRMED: 1, ACTUAL_CONTRACT: 1 });
});

test("freshness·floor·전용면적 범위·출처 필터를 결정적으로 적용한다", () => {
  const result = analyzeRentalMarket([
    record("match", { property: { floor: "1", exclusiveAreaPyeong: 15 } }),
    record("stale", { source: { collectedAt: "2026-01-01T00:00:00.000Z" }, property: { floor: "1", exclusiveAreaPyeong: 15 } }),
    record("floor", { property: { floor: "2", exclusiveAreaPyeong: 15 } }),
    record("area", { property: { floor: "1", exclusiveAreaPyeong: 25 } }),
    record("broker", { source: { sourceType: "BROKER_CONFIRMED" }, property: { floor: "1", exclusiveAreaPyeong: 15 } }),
  ], {
    referenceDate: "2026-09-22",
    filters: {
      floor: "1",
      exclusiveAreaMinPyeong: 10,
      exclusiveAreaMaxPyeong: 20,
      freshness: ["CURRENT_30D"],
      sourceTypes: ["ONLINE_LISTING"],
    },
  });
  assert.deepEqual(result.selectedRecordIds, ["match"]);
});

test("serializable result와 표본수·참고용 제한 문구를 제공한다", () => {
  const result = analyzeRentalMarket([record("one")], { referenceDate: "2026-09-22" });
  assert.equal(result.sampleCount, 1);
  assert.equal(result.sampleSufficiency, "INSUFFICIENT_REFERENCE_ONLY");
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.ok(result.limitations.some((limitation) => limitation.includes("참고용")));
  const page = fs.readFileSync(path.join(repositoryRoot, "app/markets/rental-research/page.tsx"), "utf8");
  assert.match(page, /FRAMEONE 확인 표본 \{result\.sampleCount\}건/);
  assert.doesNotMatch(page, /적정 월세|시장가격 확정|이 지역 평균 월세/);
});
