import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";
import {
  createSanitizedSbizSnapshotMap,
  createMetadataOnlyPork33Assets,
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

const briefing = require(path.join(root, "lib/pork33-candidate-shortlist/briefing-report.ts"));
const importer = require(path.join(root, "lib/sbiz365-import/importer.ts"));
const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const state = resolvePork33TestState(root, seedResolution, stateModule);
const privateAssets = seedResolution.mode === "LOCAL_PRIVATE" ? loadPrivatePork33AssetMetadata(root) : null;
const privateRegressionAvailable = privateAssets !== null && state.sourceDatasetId === "PORK33_FIELD_SOURCE_2026_10";
const assets = privateAssets ?? createMetadataOnlyPork33Assets(state);
const sbiz = createSanitizedSbizSnapshotMap(state, (_candidate, index) => ({ meatShopCount: index === 0 ? 0 : null }));
const pages = briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "ALL" });
const byCode = (code) => state.candidates.find((candidate) => candidate.identity.displayCode === code);
const sbizSourceRoot = path.join(root, "data/pork33-sbiz365-source");
const sbizSourceCount = fs.existsSync(sbizSourceRoot) ? fs.readdirSync(sbizSourceRoot).filter((name) => /^P33-\d{3}_.+\.pdf$/iu.test(name)).length : 0;

test("01 map assets cover all 27 stable Candidate IDs", privateTestOptions(privateRegressionAvailable), () => assert.equal(Object.keys(assets.mapsByCandidateId).length, 27));
test("02 photo assets cover only the 24 Candidates with source photos", privateTestOptions(privateRegressionAvailable), () => assert.equal(Object.keys(assets.photosByCandidateId).length, 24));
test("02-1 private SBIZ source covers all 27 Candidates", privateTestOptions(privateRegressionAvailable), () => assert.equal(sbizSourceCount, 27));
test("03 ALL report dynamically plans 56 pages", privateTestOptions(privateRegressionAvailable), () => assert.deepEqual(briefing.projectPork33BriefingPageCount(pages), { total: 56, regionOverview: 5, candidateSummary: 27, fieldPhoto: 24 }));
test("04 every Candidate Summary retains P33 stable identity", () => assert.ok(pages.filter((page) => page.kind === "CANDIDATE_SUMMARY").every((page) => /^P33-\d{3}$/u.test(page.candidate.displayCode))));
test("05 photo-free Candidates have no Field Photo page", privateTestOptions(privateRegressionAvailable), () => assert.deepEqual(pages.filter((page) => page.kind === "FIELD_PHOTO").map((page) => page.candidate.displayCode).filter((id) => ["P33-013", "P33-014", "P33-015"].includes(id)), []));
test("06 every Candidate Summary uses its own map ref", privateTestOptions(privateRegressionAvailable), () => assert.ok(pages.filter((page) => page.kind === "CANDIDATE_SUMMARY").every((page) => page.candidate.mapRef === `MAP:${page.candidate.displayCode}`)));
test("07 P33-022 customer address is user-confirmed 384", privateTestOptions(privateRegressionAvailable), () => { const page = pages.find((item) => item.kind === "CANDIDATE_SUMMARY" && item.candidate.displayCode === "P33-022"); assert.match(page.candidate.address, /남가좌동 384/u); assert.doesNotMatch(page.candidate.address, /남가좌동 385/u); });
test("08 Candidate without photos has one page", () => assert.equal(briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "CANDIDATE", candidateStoreId: byCode("P33-013").identity.candidateStoreId }).length, 1));
test("09 Candidate with photos has Summary and Field Photo pages", privateTestOptions(privateRegressionAvailable), () => assert.deepEqual(briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "CANDIDATE", candidateStoreId: byCode("P33-001").identity.candidateStoreId }).map((page) => page.kind), ["CANDIDATE_SUMMARY", "FIELD_PHOTO"]));
test("10 Daejeon Region omits three empty photo pages", privateTestOptions(privateRegressionAvailable), () => assert.equal(briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "REGION", regionId: "region_p33_daejeon" }).length, 28));
test("11 customer pages contain no internal placeholders", () => assert.doesNotMatch(JSON.stringify(pages), /REGION HERO PHOTO INSERT|대표사진 INSERT|INSERT IMAGE|PHOTO MATCH REQUIRED|UNMATCHED/u));
test("12 explicit SBIZ zero is preserved", () => { const page = pages.find((item) => item.kind === "CANDIDATE_SUMMARY" && item.candidate.displayCode === "P33-001"); assert.equal(page.candidate.sbiz365.meatShopCount, 0); });
test("13 Region report contains no foreign Candidate", privateTestOptions(privateRegressionAvailable), () => { const regionPages = briefing.buildPork33BriefingPages(state, assets, sbiz, { scopeType: "REGION", regionId: "region_p33_seoul_seodaemun" }); assert.deepEqual(regionPages.filter((page) => page.kind === "CANDIDATE_SUMMARY").map((page) => page.candidate.displayCode), ["P33-022", "P33-024"]); });
test("14 500m SBIZ report is accepted only when explicitly configured", () => { const text = "상권명: 샘플지역\n업종: 정육점\n분석범위: 반경 500m\n기준시점: 2026년 하반기\n주소: 샘플주소"; const base = { fileName: "P33-001_sample.pdf", text, importedAt: "2026-11-01T00:00:00.000Z", textExtractor: "SAMPLE_FIXTURE" }; assert.equal(importer.importSbiz365Text(base).extractionStatus, "VALIDATION_FAILED"); assert.equal(importer.importSbiz365Text(base, { expectedRadiusMeters: 500 }).extractionStatus, "SUCCESS"); });
test("15 UI and server routes expose one-click briefing generation", () => { const ui = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/Pork33BriefingWorkspace.tsx"), "utf8"); assert.match(ui, /PORK33 본사 브리핑 PDF 생성/u); assert.match(ui, /전체 통합본/u); assert.match(ui, /지역별/u); assert.match(ui, /후보별/u); assert.ok(fs.existsSync(path.join(root, "app/api/tools/pork33-candidate-shortlist/briefing-export/route.ts"))); assert.ok(fs.existsSync(path.join(root, "app/tools/pork33-candidate-shortlist/briefing-preview/page.tsx"))); });
