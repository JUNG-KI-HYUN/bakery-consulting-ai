import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";
import {
  createMetadataOnlyPork33Assets,
  createSanitizedSbizSnapshotMap,
  loadPrivatePork33AssetMetadata,
  privateTestOptions,
  resolvePork33TestState,
} from "../pork33-candidate-shortlist/pork33-test-support.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
Module._load = function (request, parent, isMain) { if (request === "server-only") return {}; return previousModuleLoad.call(this, request, parent, isMain); };
after(() => { if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"]; Module._load = previousModuleLoad; });

const presentation = require(path.join(root, "lib/store-development-report/presentation.ts"));
const preset = require(path.join(root, "lib/store-development-report/presets.ts")).PORK33_STORE_DEVELOPMENT_PRESET_V1;
const briefing = require(path.join(root, "lib/pork33-candidate-shortlist/briefing-report.ts"));
const decision = require(path.join(root, "lib/pork33-candidate-shortlist/decision-report.ts"));
const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const state = resolvePork33TestState(root, seedResolution, stateModule);
const privateAssets = seedResolution.mode === "LOCAL_PRIVATE" ? loadPrivatePork33AssetMetadata(root) : null;
const privateRegressionAvailable = privateAssets !== null && state.sourceDatasetId === "PORK33_FIELD_SOURCE_2026_10";
const assets = privateAssets ?? createMetadataOnlyPork33Assets(state);
const sbiz = createSanitizedSbizSnapshotMap(state, (_candidate, index) => ({
  peakFloatingTime: index % 2 ? "15~18시" : "18-23",
  peakGenderAge: index % 2 ? "female · 50대" : "male · 60대+",
  meatShopCount: index === 0 ? 0 : 1,
  householdCount: 12,
  residentialPopulation: 34,
}));

test("01 female becomes 여성", () => assert.equal(presentation.formatGenderForCustomer("female · 50대"), "여성 · 50대"));
test("02 male becomes 남성", () => assert.equal(presentation.formatGenderForCustomer("male · 60대+"), "남성 · 60대+"));
test("03 unknown gender is customer-safe", () => assert.equal(presentation.formatGenderForCustomer("UNSUPPORTED"), "확인 필요"));
test("04 normalized time is preserved and raw range is normalized", () => { assert.equal(presentation.formatTimeForCustomer("15~18시"), "15~18시"); assert.equal(presentation.formatTimeForCustomer("18-23"), "18~23시"); });
test("05 lifecycle mapping uses customer language", () => assert.deepEqual(["SHORTLIST", "KEEP", "REVIEW", "HOLD", "DROP"].map(presentation.formatLifecycleForCustomer), ["우선 검토", "검토 유지", "추가 확인 필요", "보류", "제외"]));
test("06 availability mapping hides raw enums", () => assert.deepEqual([presentation.formatAvailabilityForCustomer("AVAILABLE"), presentation.formatAvailabilityForCustomer("REVIEW_REQUIRED"), presentation.formatAvailabilityForCustomer("UNKNOWN")], ["확인됨", "추가 확인 필요", "확인 필요"]));
test("06-1 source provenance hides internal enum", () => assert.equal(presentation.formatSourceForCustomer("USER_PROVIDED"), "사용자 제공 자료"));
test("07 missing and pending summaries are customer-safe", () => { assert.equal(presentation.formatFieldSummaryForCustomer(null, null), "현장 검토내용 확인 필요"); assert.equal(presentation.formatFieldSummaryForCustomer("DRAFT", null), "현장 검토내용 정리 중"); });
test("08 approved summary is preserved", () => assert.equal(presentation.formatFieldSummaryForCustomer("APPROVED", "승인된 요약"), "승인된 요약"));
test("09 competitor terminology follows preset only for exact semantic", () => { assert.deepEqual(presentation.formatIndustryMetricForCustomer(10, preset.terminology, "COMPETITOR_LOCATION_COUNT"), { label: "정육점", value: "10곳" }); assert.deepEqual(presentation.formatIndustryMetricForCustomer(10, preset.terminology, "RELATED_BUSINESS_COUNT"), { label: "관련 업종", value: "10곳" }); });
test("10 explicit zero remains zero", () => assert.equal(presentation.formatIndustryMetricForCustomer(0, preset.terminology, "COMPETITOR_LOCATION_COUNT").value, "0곳"));
test("10-1 customer count formatter preserves separators and units", () => { assert.equal(presentation.formatCountForCustomer(5731, "세대"), "5,731세대"); assert.equal(presentation.formatCountForCustomer(13591, "명"), "13,591명"); });

const briefingPages = briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "ALL" });
const decisionPages = decision.buildPork33DecisionPages(state, assets, sbiz, { scopeType: "ALL" });
const p33001 = briefingPages.find((page) => page.kind === "CANDIDATE_SUMMARY" && page.candidate.displayCode === "P33-001").candidate;

test("11 Candidate Single projection removes raw gender and internal memo wording", () => { assert.equal(p33001.sbiz365.peakGenderAge, "남성 · 60대+"); assert.equal(p33001.sbiz365HouseholdDisplay, "12세대"); assert.equal(p33001.sbiz365ResidentialPopulationDisplay, "34명"); assert.doesNotMatch(JSON.stringify({ gender: p33001.sbiz365.peakGenderAge, summary: p33001.approvedSummary }), /female|male|현장메모 검토 필요/u); });
test("12 missing strengths and checks are suppressed", privateTestOptions(privateRegressionAvailable), () => { assert.deepEqual(p33001.strengths, []); assert.deepEqual(p33001.checks, []); });
test("13 Preview and PDF consume the same projected fields", () => { const preview = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/briefing-preview/page.tsx"), "utf8"); const pdf = fs.readFileSync(path.join(root, "tools/pork33-briefing-pdf/generate.ps1"), "utf8"); assert.match(preview, /candidate\.competitorMetric\.value/u); assert.match(pdf, /c\.competitorMetric\.value/u); assert.doesNotMatch(preview + pdf, /관련 업종.*meatShopCount/u); });
test("14 V1 regression remains 56 pages", privateTestOptions(privateRegressionAvailable), () => assert.equal(briefing.projectPork33BriefingPageCount(briefingPages).total, 56));
test("15 V2 regression remains 95 pages without raw gender distribution", privateTestOptions(privateRegressionAvailable), () => { assert.equal(decision.projectPork33DecisionPageCount(decisionPages).total, 95); const rendered = decisionPages.filter((page) => page.kind === "REGION_DEMAND_SUMMARY").map((page) => page.demand.peakGenderAgeDistribution).join(" "); assert.doesNotMatch(rendered, /female|male|UNKNOWN/u); });
