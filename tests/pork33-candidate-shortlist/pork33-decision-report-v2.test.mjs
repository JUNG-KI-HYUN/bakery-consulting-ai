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
} from "./pork33-test-support.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
Module._load = function (request, parent, isMain) { if (request === "server-only") return {}; return previousModuleLoad.call(this, request, parent, isMain); };
after(() => { if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"]; Module._load = previousModuleLoad; });

const decision = require(path.join(root, "lib/pork33-candidate-shortlist/decision-report.ts"));
const briefing = require(path.join(root, "lib/pork33-candidate-shortlist/briefing-report.ts"));
const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const state = resolvePork33TestState(root, seedResolution, stateModule);
const privateAssets = seedResolution.mode === "LOCAL_PRIVATE" ? loadPrivatePork33AssetMetadata(root) : null;
const privateRegressionAvailable = privateAssets !== null && state.sourceDatasetId === "PORK33_FIELD_SOURCE_2026_10";
const assets = privateAssets ?? createMetadataOnlyPork33Assets(state);
const makeSbiz = () => createSanitizedSbizSnapshotMap(state, (_candidate, index) => ({
  peakFloatingTime: index % 2 ? "15~18시" : "18~23시",
  peakGenderAge: index % 2 ? "fixture-group-a" : "fixture-group-b",
  meatShopCount: index === 0 ? 0 : 3 + (index % 9),
  householdCount: 4000 + (index * 100),
  residentialPopulation: 10000 + (index * 200),
}));
const clone = () => structuredClone(state);
const pages = decision.buildPork33DecisionPages(state, assets, makeSbiz(), { scopeType: "ALL" });
const areaPage = (allPages, areaId) => allPages.find((page) => page.kind === "APARTMENT_AREA_ANALYSIS" && page.area.apartmentAreaId === areaId);
const comparePages = (allPages, areaId) => allPages.filter((page) => page.kind === "CANDIDATE_COMPARE" && page.apartmentAreaId === areaId);

test("01 V2 ALL plan has the dynamic six-stage ordering and 95 pages", privateTestOptions(privateRegressionAvailable), () => {
  assert.deepEqual(decision.projectPork33DecisionPageCount(pages), { total: 95, regionOverview: 5, regionDemand: 5, apartmentArea: 17, candidateCompare: 17, candidateSummary: 27, fieldPhoto: 24 });
  assert.deepEqual(pages.slice(0, 6).map((page) => page.kind), ["REGION_OVERVIEW", "REGION_DEMAND_SUMMARY", "APARTMENT_AREA_ANALYSIS", "CANDIDATE_COMPARE", "CANDIDATE_SUMMARY", "FIELD_PHOTO"]);
});
test("02 one-Candidate Area uses a single compare card", () => assert.equal(comparePages(pages, "area_p33_gwanjeo_neuriul")[0].candidates.length, 1));
test("03 two-Candidate Area keeps P33-008 and P33-009 together", () => assert.deepEqual(comparePages(pages, "area_p33_doan_linfull18")[0].candidates.map((item) => item.displayCode), ["P33-008", "P33-009"]));
test("04 three-Candidate Area keeps P33-019 through P33-021 together", () => assert.deepEqual(comparePages(pages, "area_p33_eunpyeong_gupabal")[0].candidates.map((item) => item.displayCode), ["P33-019", "P33-020", "P33-021"]));
test("05 four-Candidate Area preserves the established combined 1·2단지 relationship", () => assert.deepEqual(comparePages(pages, "area_p33_daejeon_iparkcity")[0].candidates.map((item) => item.displayCode), ["P33-012", "P33-013", "P33-014", "P33-015"]));
test("06 five-plus compare pagination is four per page", () => assert.deepEqual(decision.paginatePork33CompareCandidates([1, 2, 3, 4, 5]), [[1, 2, 3, 4], [5]]));
test("07 photo-missing Candidates have no invented representative photo", privateTestOptions(privateRegressionAvailable), () => { const rows = comparePages(pages, "area_p33_daejeon_iparkcity")[0].candidates.filter((item) => ["P33-013", "P33-014", "P33-015"].includes(item.displayCode)); assert.ok(rows.every((item) => item.representativePhotoRef === null)); });
test("08 unknown SBIZ values remain unknown and are not converted to zero", () => { const sbiz = makeSbiz(); sbiz["P33-008"].meatShopCount = null; sbiz["P33-009"].meatShopCount = null; const localPages = decision.buildPork33DecisionPages(state, assets, sbiz, { scopeType: "REGION", regionId: "region_p33_daejeon" }); assert.equal(areaPage(localPages, "area_p33_doan_linfull18").area.competitionDisplay, "자료 확인 필요"); });
test("09 explicit SBIZ zero is preserved in compare and Area range", () => { const localPages = decision.buildPork33DecisionPages(state, assets, makeSbiz(), { scopeType: "REGION", regionId: "region_p33_daejeon" }); const first = comparePages(localPages, "area_p33_gwanjeo_daejayeon")[0].candidates[0]; assert.equal(first.competitionEnvironment, "반경 500m 정육점 0곳"); assert.equal(areaPage(localPages, "area_p33_gwanjeo_daejayeon").area.competitionDisplay, "후보별 0~4곳 · 2곳 확인"); });
test("10 explicit authoritative Site Grade U is preserved", () => { const current = clone(); current.candidates.find((item) => item.identity.displayCode === "P33-008").normalized.siteGrade = "U"; const localPages = decision.buildPork33DecisionPages(current, assets, makeSbiz(), { scopeType: "REGION", regionId: "region_p33_daejeon" }); const row = comparePages(localPages, "area_p33_doan_linfull18")[0].candidates[0]; assert.equal(row.siteGrade, "U"); assert.equal(row.siteGradeSource, "AUTHORITATIVE_STORED"); });
test("11 missing Site Grade is not manufactured as U", () => { const row = comparePages(pages, "area_p33_doan_linfull18")[0].candidates[0]; assert.equal(row.siteGrade, "확인 필요"); assert.equal(row.siteGradeSource, "UNAVAILABLE"); });
test("12 Lifecycle SHORTLIST KEEP HOLD DROP maps without automatic recommendation", () => { const current = clone(); const ids = ["P33-012", "P33-013", "P33-014", "P33-015"]; const statuses = ["SHORTLIST", "KEEP", "HOLD", "DROP"]; ids.forEach((id, index) => { current.candidates.find((item) => item.identity.displayCode === id).normalized.reviewStatus = statuses[index]; }); const localPages = decision.buildPork33DecisionPages(current, assets, makeSbiz(), { scopeType: "REGION", regionId: "region_p33_daejeon" }); assert.deepEqual(comparePages(localPages, "area_p33_daejeon_iparkcity")[0].candidates.map((item) => [item.lifecycleCode, item.lifecycle]), [["SHORTLIST", "우선 검토"], ["KEEP", "검토 유지"], ["HOLD", "보류"], ["DROP", "제외"]]); });
test("13 Region aggregation uses ranges instead of double-counted sums", () => { const sbiz = makeSbiz(); Object.values(sbiz).forEach((snapshot) => { snapshot.householdCount = 5000; snapshot.residentialPopulation = 12000; }); const localPages = decision.buildPork33DecisionPages(state, assets, sbiz, { scopeType: "REGION", regionId: "region_p33_daejeon" }); const demand = localPages.find((page) => page.kind === "REGION_DEMAND_SUMMARY").demand; assert.equal(demand.householdRange.display, "후보별 5,000세대 · 15곳 확인"); assert.equal(demand.residentialPopulationRange.display, "후보별 12,000명 · 15곳 확인"); assert.doesNotMatch(JSON.stringify(demand), /75,000|180,000/u); });
test("14 Region demand keeps snapshot count, distribution, Area count and Candidate count", () => { const demand = pages.find((page) => page.kind === "REGION_DEMAND_SUMMARY" && page.demand.regionId === "region_p33_daejeon").demand; assert.equal(demand.snapshotCount, 15); assert.equal(demand.apartmentAreaCount, 9); assert.equal(demand.candidateCount, 15); assert.match(demand.peakTimeDistribution, /곳/u); });
test("15 V2 reads V1 SBIZ snapshot repository without importing source PDFs", () => { const source = fs.readFileSync(path.join(root, "lib/pork33-candidate-shortlist/decision-snapshots.server.ts"), "utf8"); assert.match(source, /SBIZ365_SNAPSHOTS\.json/u); assert.doesNotMatch(source, /extractPdfPageText|importSbiz365Text|pork33-sbiz365-source/u); });
test("16 P33-022 remains customer-confirmed 남가좌동 384", privateTestOptions(privateRegressionAvailable), () => { const summary = pages.find((page) => page.kind === "CANDIDATE_SUMMARY" && page.candidate.displayCode === "P33-022"); assert.match(summary.candidate.address, /남가좌동 384/u); assert.doesNotMatch(summary.candidate.address, /남가좌동 385/u); });
test("17 actual representative Area relationships remain isolated", () => { assert.deepEqual(areaPage(pages, "area_p33_yeokbuk_seohee").area.candidateIds, ["P33-025"]); assert.deepEqual(areaPage(pages, "area_p33_yeokbuk_prugio_gold").area.candidateIds, ["P33-026", "P33-027"]); });
test("18 no internal placeholder or foreign Candidate appears", () => assert.doesNotMatch(JSON.stringify(pages), /REGION HERO PHOTO INSERT|대표사진 INSERT|INSERT IMAGE|PHOTO MATCH REQUIRED|UNMATCHED/u));
test("19 existing V1 output contract remains 56 pages", privateTestOptions(privateRegressionAvailable), () => assert.deepEqual(briefing.projectPork33BriefingPageCount(briefing.buildPork33BriefingPages(state, assets, makeSbiz(), { scopeType: "ALL" })), { total: 56, regionOverview: 5, candidateSummary: 27, fieldPhoto: 24 }));
test("20 V2 UI, preview and isolated export routes exist", () => { const ui = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/Pork33BriefingWorkspace.tsx"), "utf8"); assert.match(ui, /PORK33 의사결정 리포트 V2 생성/u); assert.match(ui, /PORK33 본사 브리핑 PDF 생성/u); assert.ok(fs.existsSync(path.join(root, "app/tools/pork33-candidate-shortlist/decision-preview/page.tsx"))); assert.ok(fs.existsSync(path.join(root, "app/api/tools/pork33-candidate-shortlist/decision-export/route.ts"))); });
