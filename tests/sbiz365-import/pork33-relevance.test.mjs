import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { importSbiz365Text } = require(path.join(root, "lib/sbiz365-import/importer.ts"));
const { buildPork33RelevantProfile, buildPork33MeetingView, buildPork33SimpleReportInput } = require(path.join(root, "lib/sbiz365-import/pork33-relevance.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});
function representativeText({ fallback = false } = {}) {
  const pages = Array.from({ length: 21 }, () => "");
  pages[0] = "분석날짜 2026년 10월 29일\n대전광역시 샘플구 샘플동\n정육점";
  pages[2] = "분석지역\n대전광역시 샘플구 샘플동\n분석일자\n2026년 10월 29일\n분석업종\n정육점\n11개 -8.3% 118개 -4.1%\n3,558만원 -3.9% 4,104만원 -5.0%";
  pages[3] = [
    "업종분석", "업소수 추이",
    "25.07 25.08 25.09 25.10 25.11 25.12 26.01 26.02 26.03 26.04 26.05 26.06 26.07",
    "업소수 10 10 10 10 10 10 11 11 11 11 11 12 11",
    "샘플동 업소수 9 9 9 9 9 9 9 9 9 9 9 9 9",
    "전국 업소수 100 100 100 100 100 100 100 100 100 100 100 100 100",
  ].join("\n");
  pages[4] = [
    "매출분석", "매출추이", "업소당 월평균 매출액 추이",
    "25.07 25.08 25.09 25.10 25.11 25.12 26.01 26.02 26.03 26.04 26.05 26.06 26.07",
    "매출 3,613 3,523 4,201 4,987 3,963 4,677 4,115 5,159 3,503 3,799 4,242 3,703 3,558",
    ...(fallback ? ["업소 수가 3개 이하인 경우 행정동 단위 월평균 매출액 제공"] : []),
  ].join("\n");
  pages[5] = [
    "매출분석", "업소당 월평균 매출건수 추이",
    "25.07 25.08 25.09 25.10 25.11 25.12 26.01 26.02 26.03 26.04 26.05 26.06 26.07",
    "매출 783 751 1,533 808 833 828 859 720 705 746 843 789 745",
    "선택 영역의 정육점 업종 월평균 매출액은 전년동월대비 1.5% 적습니다.",
  ].join("\n");
  pages[6] = [
    "매출분석", "매출특성",
    "선택 영역 비율 49.5 50.5 9.7 14.5 17.1 13.7 16.0 19.1 9.8",
    "선택 영역 비율 1.1 12.5 12.8 29.6 43.8 0.1",
    "선택 영역 비율 57.3 42.7 0.0 3.9 15.8 21.7 32.4 26.2",
    "선택 영역의 정육점 업종 매출이 가장 많은 요일은 토요일입니다.",
    "선택 영역의 정육점 업종 매출이 가장 많은 시간대는 18-23시입니다.",
  ].join("\n");
  pages[7] = "선택영역 100,000\n비율 50.0 50.0 10.0 10.0 20.0 20.0 20.0 20.0";
  pages[8] = "비율 50.0 50.0 14.0 14.0 14.0 15.0 15.0 14.0 14.0\n비율 10.0 10.0 10.0 20.0 40.0 10.0";
  pages[9] = "주거인구\n선택 영역 1 2 3";
  pages[13] = "직장인구\n선택 영역 1 2 3";
  pages[15] = "지역현황\n세대 수 현황\n선택 영역 14,205 14,453 14,675 15,503";
  pages[16] = [
    "지역현황", "공동주택 현황",
    "선택 영역 7,015 7,649 7,649",
    "선택 영역 38 3,144 47 3,778 47 3,778",
    "선택 영역 2 0 6 2 0 0",
  ].join("\n");
  pages[17] = "지역현황\n주변시설 현황\n선택 영역 3 4 27 13 2 9 0";
  pages[18] = "지역현황\n교통시설현황\n선택 영역 0 56";
  return pages.join("\f");
}

function profile(options) {
  const result = importSbiz365Text({
    fileName: "REPRESENTATIVE_SAMPLE.pdf",
    text: representativeText(options),
    importedAt: "2026-10-29T00:00:00.000Z",
    textExtractor: "REPRESENTATIVE_FORMAT_FIXTURE",
  });
  return { result, profile: buildPork33RelevantProfile(result) };
}

test("applies the PORK33 whitelist while preserving selected-area evidence", () => {
  const { profile: value } = profile();
  assert.equal(value.industryDemand.storeCount.value, 11);
  assert.equal(value.industryDemand.storeCountYoY.value, 10);
  assert.equal(value.industryDemand.monthlySalesPerStore.value, 3558);
  assert.equal(value.industryDemand.salesYoY.value, -1.5);
  assert.equal(value.industryDemand.monthlyTransactionsPerStore.value, 745);
  assert.equal(value.purchasePattern.peakDay.value, "토");
  assert.equal(value.purchasePattern.peakTimeBand.value, "18~23");
  assert.equal(value.purchasePattern.primaryBuyerAgeBand.value, "50대");
  assert.equal(value.residentialBase.households.value, 15503);
  assert.equal(value.residentialBase.apartmentUnits.value, 3778);
  assert.ok(value.evidenceRefs.every((item) => item.sourcePage === null || item.sourcePage > 0));
  assert.ok(value.evidenceRefs.filter((item) => item.source === "SBIZ365_REPORT_IMPORT").every((item) => item.analysisScope === "SELECTION_AREA"));
});
test("keeps explicit zero and unknown distinct", () => {
  const { profile: value } = profile();
  assert.equal(value.residentialBase.complex1500To2000.value, 0);
  assert.equal(value.residentialBase.complex2000Plus.value, 0);
  assert.equal(value.residentialBase.largeComplexSignal, "NEUTRAL");
  assert.equal(value.anchors.stationRidership.value, null);
  assert.equal(value.anchors.stationRidership.status, "NOT_AVAILABLE");
});
test("excludes automated narrative, broad geography and general demographics", () => {
  const { profile: value } = profile();
  assert.ok(value.excludedFacts.some((fact) => fact.reason === "SBIZ365_AUTOMATED_NARRATIVE"));
  assert.ok(value.excludedFacts.some((fact) => fact.reason === "NON_SELECTION_GEOGRAPHY"));
  assert.ok(value.excludedFacts.some((fact) => fact.reason === "GENERAL_DEMOGRAPHIC_NOT_PURCHASE_PATTERN"));
  const serialized = JSON.stringify(buildPork33MeetingView(value));
  assert.equal(serialized.includes("활력이"), false);
  assert.equal(serialized.includes("residentPopulation"), false);
  assert.equal(serialized.includes("전국 업소수"), false);
});
test("handles low-store sales fallback without presenting it as selection-area sales", () => {
  const { profile: value } = profile({ fallback: true });
  assert.equal(value.industryDemand.salesScopeFallback, true);
  assert.equal(value.industryDemand.salesScope, "ADMIN_DONG");
  const evidence = value.evidenceRefs.find((item) => item.id === value.industryDemand.monthlySalesPerStore.evidenceRef);
  assert.equal(evidence.analysisScope, "ADMIN_DONG");
  assert.ok(evidence.dataQualityFlags.includes("LOW_STORE_COUNT"));
});
test("limits the first-meeting view and requires evidence for search priorities", () => {
  const { profile: value } = profile();
  const meeting = buildPork33MeetingView(value);
  const simple = buildPork33SimpleReportInput(value, meeting, { center: null, radiusMeters: 1000 });
  assert.ok(meeting.keyNumbers.length <= 4);
  assert.ok(meeting.positiveSignals.length <= 2);
  assert.ok(meeting.checkRequired.length <= 3);
  assert.ok(meeting.p2MapInsights.length <= 3);
  assert.ok(meeting.p6SearchPriorities.length <= 3);
  assert.ok(meeting.p6SearchPriorities.every((priority) => priority.evidenceRefs.length >= 2));
  assert.equal(simple.p5.combinedCount, null);
  assert.equal(simple.p7.contractDecision, null);
  assert.equal(simple.p7.conclusion, "현재 단계: 지역 스크리닝 완료 / 현장 매물조사 권장");
});
