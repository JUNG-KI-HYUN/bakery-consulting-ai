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
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
Module._load = function (request, parent, isMain) { if (request === "server-only") return {}; return previousModuleLoad.call(this, request, parent, isMain); };
after(() => { if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"]; Module._load = previousModuleLoad; });

const contracts = require(path.join(root, "lib/store-development-core/contracts.ts"));
const resolution = require(path.join(root, "lib/store-development-core/resolution.ts"));
const pork33 = require(path.join(root, "lib/store-development-core/pork33.ts"));
const pork33Criteria = require(path.join(root, "lib/site-criteria/pork33.ts"));
const siteCriteriaValidation = require(path.join(root, "lib/site-criteria/validation.ts"));
const pork33Adapter = require(path.join(root, "lib/store-development-core/pork33-adapter.ts"));
const reportContracts = require(path.join(root, "lib/store-development-report/contracts.ts"));
const reportPresets = require(path.join(root, "lib/store-development-report/presets.ts"));
const reportCenter = require(path.join(root, "lib/store-development-report/report-center.ts"));
const briefing = require(path.join(root, "lib/pork33-candidate-shortlist/briefing-report.ts"));
const decision = require(path.join(root, "lib/pork33-candidate-shortlist/decision-report.ts"));

const expectedDimensions = [
  "LOCATION", "ACCESSIBILITY", "VISIBILITY", "PEDESTRIAN_FLOW", "RESIDENTIAL_DEMAND", "COMMERCIAL_DEMAND", "COMPETITION",
  "VEHICLE_ACCESS", "SHORT_STOP", "PARKING", "LEASE_COST", "DEPOSIT", "MANAGEMENT_FEE", "GOODWILL", "AREA_SIZE", "FLOOR",
  "FRONTAGE", "SIGNAGE", "ENTRY_LOCATION", "SPACE_CONDITION", "CONTRACT_RISK", "EVIDENCE_COMPLETENESS",
];

function genericRetailProfile(overrides = {}) {
  return Object.freeze({
    schemaVersion: contracts.INDUSTRY_PROFILE_SCHEMA_VERSION,
    industryId: "GENERIC_RETAIL",
    version: "1",
    name: "일반 소매",
    category: "RETAIL",
    competitorTerminology: "동종 소매점",
    requiredDimensions: Object.freeze(["LOCATION", "ACCESSIBILITY", "LEASE_COST"]),
    optionalDimensions: Object.freeze(["VISIBILITY", "COMPETITION"]),
    reportSections: Object.freeze(["REGION_OVERVIEW", "CANDIDATE_COMPARE", "CANDIDATE_SUMMARY", "SOURCE"]),
    extensionIds: Object.freeze([]),
    ...overrides,
  });
}

const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const state = resolvePork33TestState(root, seedResolution, stateModule);
const privateAssets = seedResolution.mode === "LOCAL_PRIVATE" ? loadPrivatePork33AssetMetadata(root) : null;
const privateRegressionAvailable = privateAssets !== null && state.sourceDatasetId === "PORK33_FIELD_SOURCE_2026_10";
const assets = privateAssets ?? createMetadataOnlyPork33Assets(state, { mapCount: 27, photoCount: 24 });
const sbiz = createSanitizedSbizSnapshotMap(state);

test("01 common core exposes the exact 22 minimum Candidate dimensions", () => {
  assert.deepEqual([...contracts.STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS], expectedDimensions);
});

test("02 PORK33 IndustryProfile is industry-level and has no active extension", () => {
  assert.equal(resolution.assertIndustryProfileV1(pork33.PORK33_INDUSTRY_PROFILE_V1), pork33.PORK33_INDUSTRY_PROFILE_V1);
  assert.deepEqual([pork33.PORK33_INDUSTRY_PROFILE_V1.industryId, pork33.PORK33_INDUSTRY_PROFILE_V1.name, pork33.PORK33_INDUSTRY_PROFILE_V1.competitorTerminology], ["MEAT_RETAIL", "정육·신선식품 소매", "정육점"]);
  assert.deepEqual(pork33.PORK33_INDUSTRY_PROFILE_V1.extensionIds, []);
});

test("03 PORK33 BrandProfile links Industry and the existing SiteCriteria profile", () => {
  const criteria = pork33Criteria.PORK33_SITE_CRITERIA_PROFILE_V1;
  assert.equal(siteCriteriaValidation.validateSiteCriteriaProfile(criteria).ok, true);
  assert.equal(resolution.assertBrandProfileV1(pork33.PORK33_BRAND_PROFILE_V1, pork33.PORK33_INDUSTRY_PROFILE_V1, criteria), pork33.PORK33_BRAND_PROFILE_V1);
  assert.deepEqual(pork33.PORK33_BRAND_PROFILE_V1.criteriaProfileRef, { profileId: "pork33-site-criteria", profileVersion: "1" });
  assert.equal(criteria.criteria.find((item) => item.key === "exclusiveArea").target.reference, 10);
  assert.equal(criteria.criteria.find((item) => item.key === "goodwill").target, 0);
  assert.equal(criteria.criteria.find((item) => item.key === "householdBase").target, 1500);
});

test("04 a generic retail profile needs no PORK33 or bakery-only field", () => {
  const profile = resolution.assertIndustryProfileV1(genericRetailProfile());
  assert.deepEqual(profile.extensionIds, []);
  assert.doesNotMatch(JSON.stringify(profile), /PORK33|OVEN|MIXER|PROOFER|BAKERY/u);
});

test("05 an industry without an extension resolves only declared common dimensions", () => {
  assert.deepEqual(resolution.resolveIndustryDimensionsV1(genericRetailProfile()), ["LOCATION", "ACCESSIBILITY", "LEASE_COST", "VISIBILITY", "COMPETITION"]);
});

test("06 a mock bakery facility extension extends contracts without runtime implementation", () => {
  const industry = genericRetailProfile({ industryId: "BAKERY_RETAIL", extensionIds: Object.freeze(["BAKERY_FACILITY"]) });
  const extension = Object.freeze({
    schemaVersion: contracts.INDUSTRY_EXTENSION_SCHEMA_VERSION,
    extensionId: "BAKERY_FACILITY",
    version: "1",
    industryIds: Object.freeze(["BAKERY_RETAIL"]),
    additionalDimensions: Object.freeze(["ELECTRICAL_CAPACITY", "EXHAUST", "WATER_DRAINAGE", "EQUIPMENT_ACCESS", "WORKSPACE_FIT"]),
    reportSections: Object.freeze(["FACILITY_FIT"]),
  });
  assert.ok(resolution.resolveIndustryDimensionsV1(industry, [extension]).includes("ELECTRICAL_CAPACITY"));
  assert.ok(resolution.resolveReportSectionsV1(industry, [extension]).includes("FACILITY_FIT"));
  assert.throws(() => resolution.resolveIndustryDimensionsV1(genericRetailProfile(), [extension]), /적용할 수 없습니다|선언되지 않았습니다/u);
});

test("07 terminology is injected by Industry and may be overridden by Brand", () => {
  assert.deepEqual(resolution.resolveTerminologyV1(genericRetailProfile()), { candidate: "후보점포", region: "Region", area: "분석권역", competitor: "동종 소매점" });
  assert.equal(resolution.resolveTerminologyV1(genericRetailProfile(), { competitor: "브랜드 지정 경쟁점" }).competitor, "브랜드 지정 경쟁점");
});

test("08 common Report Section resolution is deterministic and duplicate-free", () => {
  const sections = resolution.resolveReportSectionsV1(pork33.PORK33_INDUSTRY_PROFILE_V1);
  assert.deepEqual(sections, contracts.STORE_DEVELOPMENT_REPORT_SECTIONS);
  assert.equal(new Set(sections).size, sections.length);
});

test("09 generic readiness preserves gaps and only blocks required blocking inputs", () => {
  const requirements = resolution.resolveReadinessRequirementsV1(genericRetailProfile());
  const readiness = resolution.deriveStoreDevelopmentCoreReadinessV1(requirements, [
    { key: "CANDIDATES", availableCount: 2, expectedCount: 2, unknownCount: 0 },
    { key: "MAPS", availableCount: 1, expectedCount: 2, unknownCount: 1 },
    { key: "MARKET_DATA", availableCount: 2, expectedCount: 2, unknownCount: 0 },
    { key: "FIELD_SUMMARIES", availableCount: 1, expectedCount: 2, unknownCount: 1 },
  ]);
  assert.equal(readiness.overallStatus, "READY_WITH_GAPS");
  assert.equal(readiness.items.find((item) => item.key === "MAPS").status, "PARTIAL");
});

test("10 CandidateComparisonDimension preserves explicit zero and UNKNOWN", () => {
  const item = Object.freeze({ dimensionId: "GOODWILL", label: "권리금", displayValue: "0원", evaluation: "MATCH", evidenceStatus: "UNKNOWN" });
  assert.equal(item.displayValue, "0원");
  assert.equal(item.evidenceStatus, "UNKNOWN");
  assert.ok(contracts.CANDIDATE_COMPARISON_EVALUATIONS.includes(item.evaluation));
});

test("11 PORK33 ReportPreset binds Brand, Industry, Criteria and generic report contracts", () => {
  const preset = reportPresets.PORK33_STORE_DEVELOPMENT_PRESET_V1;
  assert.deepEqual([preset.core.brandProfileRef.id, preset.core.industryProfileRef.id, preset.core.criteriaProfileRef.profileId], ["PORK33", "MEAT_RETAIL", "pork33-site-criteria"]);
  assert.equal(preset.core.terminology.competitor, "정육점");
  assert.equal(preset.candidateCriteriaProfileId, "pork33-site-criteria");
});

test("12 Report Center resolves Case to Brand, Industry and existing PORK33 Preset", () => {
  const item = reportCenter.buildPork33StoreDevelopmentCase(state);
  assert.deepEqual([item.brandProfileId, item.industryProfileId, item.industryProfileVersion], ["PORK33", "MEAT_RETAIL", "1"]);
  assert.deepEqual(item.presetIds, ["PORK33_STORE_DEVELOPMENT_V1"]);
});

test("13 the PORK33 readiness adapter maps source vocabulary without mutating it", () => {
  const source = reportCenter.derivePork33ReportDataReadiness(state, assets, sbiz, "DECISION_REPORT", "2026-11-02T00:00:00.000Z");
  const before = structuredClone(source);
  const core = pork33Adapter.adaptPork33ReadinessToCoreV1(source);
  assert.equal(core.items.find((item) => item.key === "MARKET_DATA").availableCount, 27);
  assert.deepEqual(source, before);
});

test("14 existing Field Briefing V1 remains 56 pages", privateTestOptions(privateRegressionAvailable), () => {
  const pages = briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "ALL" });
  assert.equal(briefing.projectPork33BriefingPageCount(pages).total, 56);
});

test("15 existing Decision Report V2 remains 95 pages", privateTestOptions(privateRegressionAvailable), () => {
  const pages = decision.buildPork33DecisionPages(state, assets, sbiz, { scopeType: "ALL" });
  assert.equal(decision.projectPork33DecisionPageCount(pages).total, 95);
});

test("16 Report Center remains the existing route and no fake industry case is created", () => {
  assert.equal(reportPresets.STORE_DEVELOPMENT_REPORT_PRESETS_V1.length, 1);
  assert.equal(reportCenter.buildPork33StoreDevelopmentCase(state).caseId, "case_pork33_field_2026_10");
  assert.ok(fs.existsSync(path.join(root, "app/tools/store-development-report/page.tsx")));
  assert.equal(reportContracts.REPORT_PRESET_SCHEMA_VERSION, "frameone.report-preset.v1");
});
