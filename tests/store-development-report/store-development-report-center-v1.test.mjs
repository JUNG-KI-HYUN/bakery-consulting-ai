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

const contracts = require(path.join(root, "lib/store-development-report/contracts.ts"));
const presets = require(path.join(root, "lib/store-development-report/presets.ts"));
const center = require(path.join(root, "lib/store-development-report/report-center.ts"));
const briefing = require(path.join(root, "lib/pork33-candidate-shortlist/briefing-report.ts"));
const decision = require(path.join(root, "lib/pork33-candidate-shortlist/decision-report.ts"));
const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const state = resolvePork33TestState(root, seedResolution, stateModule);
const privateAssets = seedResolution.mode === "LOCAL_PRIVATE" ? loadPrivatePork33AssetMetadata(root) : null;
const privateRegressionAvailable = privateAssets !== null && state.sourceDatasetId === "PORK33_FIELD_SOURCE_2026_10";
const assets = privateAssets ?? createMetadataOnlyPork33Assets(state, { mapCount: 27, photoCount: 24 });
const sbiz = createSanitizedSbizSnapshotMap(state);
const request = (reportType, scope) => ({ schemaVersion: contracts.REPORT_GENERATION_REQUEST_SCHEMA_VERSION, caseId: presets.PORK33_CASE_ID, presetId: presets.PORK33_STORE_DEVELOPMENT_PRESET_ID, reportType, scope, outputFormat: "PDF" });

test("01 PORK33 preset loads as the sole real V1 preset", () => {
  assert.equal(presets.STORE_DEVELOPMENT_REPORT_PRESETS_V1.length, 1);
  assert.equal(presets.PORK33_STORE_DEVELOPMENT_PRESET_V1.presetId, "PORK33_STORE_DEVELOPMENT_V1");
  assert.equal(presets.PORK33_STORE_DEVELOPMENT_PRESET_V1.industryLabel, "정육·신선식품 소매");
  assert.equal(presets.PORK33_STORE_DEVELOPMENT_PRESET_V1.competitorLabel, "정육점");
});

test("02 Case binds to the PORK33 preset through stable Case identity", () => {
  const item = center.buildPork33StoreDevelopmentCase(state);
  assert.equal(item.caseId, "case_pork33_field_2026_10");
  assert.deepEqual(item.presetIds, ["PORK33_STORE_DEVELOPMENT_V1"]);
  assert.deepEqual([item.candidateCount, item.regionCount, item.apartmentAreaCount], [27, 5, 17]);
});

test("03 data readiness reports all 27 user-provided location maps READY", () => {
  const readiness = center.derivePork33ReportDataReadiness(state, assets, sbiz, "DECISION_REPORT", "2026-11-02T00:00:00.000Z");
  const maps = readiness.items.find((item) => item.key === "MAPS");
  assert.deepEqual([maps.status, maps.availableCount, maps.expectedCount, maps.source], ["READY", 27, 27, "USER_PROVIDED_LOCATION_MAP"]);
});

test("04 missing Candidate photos remain PARTIAL and do not BLOCK the report", () => {
  const readiness = center.derivePork33ReportDataReadiness(state, assets, sbiz, "FIELD_BRIEFING", "2026-11-02T00:00:00.000Z");
  const photos = readiness.items.find((item) => item.key === "FIELD_PHOTOS");
  assert.deepEqual([photos.status, photos.availableCount, photos.expectedCount], ["PARTIAL", 24, 27]);
  assert.equal(readiness.overallStatus, "READY_WITH_GAPS");
});

test("05 the completed V1 SBIZ365 snapshot set is READY", () => {
  const readiness = center.derivePork33ReportDataReadiness(state, assets, sbiz, "DECISION_REPORT", "2026-11-02T00:00:00.000Z");
  const item = readiness.items.find((row) => row.key === "SBIZ365");
  assert.deepEqual([item.status, item.availableCount, item.expectedCount], ["READY", 27, 27]);
});

test("06 UNKNOWN Site Grade is never counted as Complete or manufactured as U", () => {
  const readiness = center.derivePork33ReportDataReadiness(state, assets, sbiz, "DECISION_REPORT", "2026-11-02T00:00:00.000Z");
  const item = readiness.items.find((row) => row.key === "SITE_GRADES");
  assert.notEqual(item.status, "READY");
  assert.equal(item.unknownCount, 27 - item.availableCount);
  assert.match(item.limitation, /UNKNOWN/u);
});

test("07 FIELD_BRIEFING ALL resolves to the existing V1 generator and Preview", () => {
  const plan = center.resolvePork33ReportGenerationPlan(request("FIELD_BRIEFING", { scopeType: "ALL" }), state);
  assert.equal(plan.sourceGenerator, "PORK33_BRIEFING_V1");
  assert.deepEqual(plan.briefingScope, { scopeType: "ALL" });
  assert.equal(plan.previewUrl, "/tools/pork33-candidate-shortlist/briefing-preview");
});

test("08 DECISION_REPORT REGION resolves to the existing V2 generator and stable Region ID", () => {
  const plan = center.resolvePork33ReportGenerationPlan(request("DECISION_REPORT", { scopeType: "REGION", regionId: "region_p33_daejeon" }), state);
  assert.equal(plan.sourceGenerator, "PORK33_DECISION_V2");
  assert.deepEqual(plan.decisionScope, { scopeType: "REGION", regionId: "region_p33_daejeon" });
  assert.match(plan.previewUrl, /decision-preview\?scopeType=REGION/u);
});

test("09 CANDIDATE_SINGLE uses Candidate Store ID rather than address", () => {
  const candidate = state.candidates[0];
  const plan = center.resolvePork33ReportGenerationPlan(request("CANDIDATE_SINGLE", { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId }), state);
  assert.deepEqual(plan.briefingScope, { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId });
  assert.match(plan.previewUrl, new RegExp(encodeURIComponent(candidate.identity.candidateStoreId), "u"));
  assert.doesNotMatch(plan.previewUrl, new RegExp(candidate.normalized.addressFull, "u"));
});

test("10 incompatible Apartment Area output is rejected instead of silently remapped", () => {
  assert.throws(() => center.resolvePork33ReportGenerationPlan(request("DECISION_REPORT", { scopeType: "APARTMENT_AREA", apartmentAreaId: state.apartmentAreas[0].apartmentAreaId }), state), /지원하지 않는 Scope/u);
});

test("11 common output naming preserves brand, report type, scope and date", privateTestOptions(privateRegressionAvailable), () => {
  const value = request("DECISION_REPORT", { scopeType: "REGION", regionId: "region_p33_daejeon" });
  const plan = center.resolvePork33ReportGenerationPlan(value, state);
  assert.equal(center.buildStoreDevelopmentReportFileName(value, plan, new Date("2026-11-02T00:00:00.000Z")), "FRAMEONE_PORK33_DECISION_REPORT_대전광역시_20261102.pdf");
});

test("12 existing V1 report presentation remains 56 pages on current data", privateTestOptions(privateRegressionAvailable), () => {
  const pages = briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "ALL" });
  assert.deepEqual(briefing.projectPork33BriefingPageCount(pages), { total: 56, regionOverview: 5, candidateSummary: 27, fieldPhoto: 24 });
});

test("13 existing V2 report presentation remains 95 pages on current data", privateTestOptions(privateRegressionAvailable), () => {
  const pages = decision.buildPork33DecisionPages(state, assets, sbiz, { scopeType: "ALL" });
  assert.deepEqual(decision.projectPork33DecisionPageCount(pages), { total: 95, regionOverview: 5, regionDemand: 5, apartmentArea: 17, candidateCompare: 17, candidateSummary: 27, fieldPhoto: 24 });
});

test("14 Report Center uses append-only manifests and existing generators without a new calculation engine", () => {
  const source = fs.readFileSync(path.join(root, "lib/store-development-report/pork33-adapter.server.ts"), "utf8");
  assert.match(source, /frameone\.store-development-report-generation-manifest\.v1/u);
  assert.match(source, /generatePork33BriefingPdf/u);
  assert.match(source, /generatePork33DecisionPdf/u);
  assert.doesNotMatch(source, /extractPdfPageText|importSbiz365Text|calculateSiteGrade|deriveSiteGrade/u);
});

test("15 Report Center route, API, Preview flow and PORK33 backlink exist", () => {
  assert.ok(fs.existsSync(path.join(root, "app/tools/store-development-report/page.tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/api/tools/store-development-report/route.ts")));
  assert.ok(fs.existsSync(path.join(root, "app/api/tools/store-development-report/download/route.ts")));
  const ui = fs.readFileSync(path.join(root, "app/tools/store-development-report/StoreDevelopmentReportCenterClient.tsx"), "utf8");
  assert.match(ui, /미리보기/u);
  assert.match(ui, /PDF 생성/u);
  const pork33 = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/Pork33CandidateShortlistClient.tsx"), "utf8");
  assert.match(pork33, /FRAMEONE 보고서 센터에서 열기/u);
});
