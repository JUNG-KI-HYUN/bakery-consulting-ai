import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import ts from "typescript";
import {
  privateTestOptions,
  resolvePork33TestState,
} from "./pork33-test-support.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
Module._load = function (request, parent, isMain) { if (request === "server-only") return {}; return previousModuleLoad.call(this, request, parent, isMain); };

const locality = require(path.join(root, "lib/pork33-candidate-shortlist/locality.ts"));
const report = require(path.join(root, "lib/pork33-candidate-shortlist/report.ts"));
const batch = require(path.join(root, "lib/pork33-candidate-shortlist/batch-export.server.ts"));
const pdfExport = require(path.join(root, "lib/pork33-candidate-shortlist/pdf-export.server.ts"));
const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const state = resolvePork33TestState(root, seedResolution, stateModule);
const privateRegressionAvailable = seedResolution.mode === "LOCAL_PRIVATE" && state.sourceDatasetId === "PORK33_FIELD_SOURCE_2026_10";
const byCode = (code) => state.candidates.find((candidate) => candidate.identity.displayCode === code);
const groups = locality.groupPork33CandidatesByLocality(state);
const groupByLocality = (name) => groups.find((group) => group.localityName === name);
let tempRoot;
let successManifest;
let failureManifest;
let counter = 0;

function fakeGenerator(failCode = "") {
  return async (current, scope) => {
    const selection = report.resolvePork33ReportSelection(current, scope);
    if (scope.scopeType === "CANDIDATE" && selection.candidates[0].identity.displayCode === failCode) throw new Error("fixture candidate failure");
    const pages = report.buildPork33ReportPages(current, scope);
    assert.ok(pages.length > 0);
    const sourceDir = path.join(tempRoot, "sources");
    fs.mkdirSync(sourceDir, { recursive: true });
    const filePath = path.join(sourceDir, `source-${++counter}.pdf`);
    fs.writeFileSync(filePath, `%PDF-fixture-${scope.scopeType}`);
    return { bytes: fs.readFileSync(filePath), fileName: path.basename(filePath), filePath, diagnostics: { pageCount: pages.length, overlapCount: 0, landscape: true } };
  };
}

before(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p33-batch-locality-"));
  if (!privateRegressionAvailable) return;
  successManifest = await batch.generatePork33BatchExport(state, { batchId: "batch-test-success", rootDir: tempRoot, generatePdf: fakeGenerator(), skipRuntimeCheck: true, now: new Date("2026-11-01T00:00:00.000Z") });
  failureManifest = await batch.generatePork33BatchExport(state, { batchId: "batch-test-failure", rootDir: tempRoot, generatePdf: fakeGenerator("P33-012"), skipRuntimeCheck: true, now: new Date("2026-11-01T00:01:00.000Z") });
});
after(() => { fs.rmSync(tempRoot, { recursive: true, force: true }); if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"]; Module._load = previousModuleLoad; });

test("01 actual addresses derive twelve unique localities", privateTestOptions(privateRegressionAvailable), () => assert.equal(groups.length, 12));
test("02 locality candidate totals preserve all 27 Candidates", () => assert.equal(groups.reduce((sum, group) => sum + group.candidates.length, 0), 27));
test("03 Daejeon hierarchy parses province district locality", () => assert.deepEqual(locality.parsePork33Locality("대전시 서구 도안동 1564"), { provinceName: "대전광역시", cityName: null, districtName: "서구", localityName: "도안동", localityKey: "대전광역시__서구__도안동", status: "CONFIRMED", label: "대전광역시 서구 도안동" }));
test("04 Hwaseong hierarchy prefers eup over trailing ri", () => { const parsed = locality.parsePork33Locality("화성시 만세구 남양읍 남양리 2300"); assert.equal(parsed.provinceName, "경기도"); assert.equal(parsed.cityName, "화성시"); assert.equal(parsed.localityName, "남양읍"); });
test("05 Yongin hierarchy includes city and district", () => { const parsed = locality.parsePork33Locality("용인시 처인구 역북동 809"); assert.deepEqual([parsed.provinceName, parsed.cityName, parsed.districtName, parsed.localityName], ["경기도", "용인시", "처인구", "역북동"]); });
test("06 unparseable address remains REVIEW_REQUIRED", () => assert.equal(locality.parsePork33Locality("주소 확인 필요").status, "REVIEW_REQUIRED"));
test("07 locality counts are derived from Candidate source", privateTestOptions(privateRegressionAvailable), () => assert.deepEqual(groups.map((group) => [group.localityName, group.candidates.length]), [["관저동",2],["관저2동",1],["법동",3],["중리동",1],["도안동",4],["상대동",4],["남양읍",3],["진관동",3],["남가좌동",1],["응암동",1],["북가좌동",1],["역북동",3]]));
test("08 Doan has three Apartment Areas", privateTestOptions(privateRegressionAvailable), () => assert.equal(groupByLocality("도안동").apartmentAreaIds.length, 3));
test("09 P33-009 derives west entrance relationship from source", privateTestOptions(privateRegressionAvailable), () => assert.equal(locality.derivePork33ApartmentContext(byCode("P33-009")).entranceRelationship, "WEST_ENTRANCE"));
test("10 P33-009 derives only stated bus and commute flow", privateTestOptions(privateRegressionAvailable), () => assert.deepEqual(locality.derivePork33ApartmentContext(byCode("P33-009")).mainFlowContext, ["버스정류장 인접 동선", "출퇴근 이동동선"]));
test("11 explicit complex retail address is true", privateTestOptions(privateRegressionAvailable), () => assert.equal(locality.derivePork33ApartmentContext(byCode("P33-012")).isComplexRetail, true));
test("12 apartment proximity does not infer complex retail", privateTestOptions(privateRegressionAvailable), () => assert.equal(locality.derivePork33ApartmentContext(byCode("P33-001")).isComplexRetail, null));
test("13 household value remains unverified source reference", privateTestOptions(privateRegressionAvailable), () => { const card = report.toPork33ReportCard(state, byCode("P33-009")); assert.equal(card.household, "기존 조사 기재값 1,600세대"); assert.equal(card.householdVerification, "공식 공동주택 세대수 검증 전"); });
test("14 raw Field Note is not copied to customer card", () => { const candidate = byCode("P33-009"); assert.doesNotMatch(JSON.stringify(report.toPork33ReportCard(state, candidate)), new RegExp(candidate.normalized.fieldNoteRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u")); });
test("15 Doan map contains exactly four resolved Candidate markers", privateTestOptions(privateRegressionAvailable), () => assert.equal(locality.buildPork33LocalityMapPoints(state, groupByLocality("도안동").localityKey).length, 4));
test("16 locality map exposes apartment identity and rent", privateTestOptions(privateRegressionAvailable), () => assert.ok(locality.buildPork33LocalityMapPoints(state, groupByLocality("도안동").localityKey).every((point) => point.mainApartment && point.rent && point.apartmentArea)));
test("17 locality report contains no foreign Candidate", privateTestOptions(privateRegressionAvailable), () => { const target = groupByLocality("도안동"); const ids = new Set(target.candidates.map((candidate) => candidate.identity.candidateStoreId)); const rows = report.buildPork33ReportPages(state, { scopeType: "LOCALITY", localityKey: target.localityKey }).filter((page) => page.kind === "CANDIDATES").flatMap((page) => page.cards); assert.ok(rows.every((row) => ids.has(row.candidateStoreId))); });
test("18 locality overview contains Candidate and Apartment Area counts", privateTestOptions(privateRegressionAvailable), () => { const target = groupByLocality("도안동"); const cover = report.buildPork33ReportPages(state, { scopeType: "LOCALITY", localityKey: target.localityKey })[0]; assert.match(JSON.stringify(cover), /후보점포 4개/u); assert.match(JSON.stringify(cover), /Apartment Area 3개/u); });
test("19 Candidate PDF is one isolated brief page", () => { const candidate = byCode("P33-009"); const pages = report.buildPork33ReportPages(state, { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId }); assert.equal(pages.length, 1); assert.equal(pages[0].card.candidateStoreId, candidate.identity.candidateStoreId); });
test("20 Candidate batch eligibility derives 26 targets", privateTestOptions(privateRegressionAvailable), () => assert.equal(state.candidates.filter((candidate) => batch.getPork33BatchCandidateEligibility(candidate).eligible).length, 26));
test("21 P33-005 is skipped with repository geocode reason", () => assert.deepEqual(batch.getPork33BatchCandidateEligibility(byCode("P33-005")), { eligible: false, reason: "GEOCODE_REVIEW_REQUIRED" }));
test("21-1 sanitized fixture blocks customer batch generation", privateTestOptions(!privateRegressionAvailable, "SKIP: sanitized fixture contract runs only without private source"), async () => { await assert.rejects(() => batch.generatePork33BatchExport(state, { batchId: "batch-fixture-block", rootDir: tempRoot, generatePdf: fakeGenerator(), skipRuntimeCheck: true }), /SANITIZED_FIXTURE/u); });
test("22 success batch creates 26 Candidate PDFs", privateTestOptions(privateRegressionAvailable), () => assert.equal(successManifest.candidatePdfCount, 26));
test("23 success batch creates 12 locality PDFs", privateTestOptions(privateRegressionAvailable), () => assert.equal(successManifest.localityPdfCount, 12));
test("24 success batch creates five Region PDFs", privateTestOptions(privateRegressionAvailable), () => assert.equal(successManifest.regionPdfCount, 5));
test("25 success batch creates one ALL PDF and 44 total", privateTestOptions(privateRegressionAvailable), () => { assert.equal(successManifest.allPdfCount, 1); assert.equal(successManifest.files.length, 44); });
test("26 manifest records generated and skipped Candidate IDs", privateTestOptions(privateRegressionAvailable), () => { assert.equal(successManifest.generatedCandidateIds.length, 26); assert.deepEqual(successManifest.skippedCandidateIds.map((item) => [item.candidateId, item.reason]), [["P33-005", "GEOCODE_REVIEW_REQUIRED"]]); });
test("27 manifest browser payload exposes no absolute paths", privateTestOptions(privateRegressionAvailable), () => { const text = JSON.stringify(successManifest); assert.doesNotMatch(text, /C:\\|\/tmp\//u); assert.ok(successManifest.files.every((file) => file.downloadUrl.startsWith("/api/"))); });
test("28 generated filenames are unique and filesystem safe", privateTestOptions(privateRegressionAvailable), () => { const names = successManifest.files.map((file) => `${file.category}/${file.fileName}`); assert.equal(new Set(names).size, names.length); assert.ok(names.every((name) => !/[<>:"|?*]/u.test(name))); });
test("29 one Candidate failure is isolated from remaining batch", privateTestOptions(privateRegressionAvailable), () => { assert.equal(failureManifest.candidatePdfCount, 25); assert.equal(failureManifest.localityPdfCount, 12); assert.equal(failureManifest.regionPdfCount, 5); assert.equal(failureManifest.allPdfCount, 1); assert.ok(failureManifest.failed.some((item) => item.scopeType === "CANDIDATE" && item.message.includes("fixture candidate failure"))); });
test("30 every manifest file exists under its batch category", privateTestOptions(privateRegressionAvailable), () => assert.ok(successManifest.files.every((file) => fs.existsSync(path.join(tempRoot, successManifest.batchId, file.category, file.fileName)))));
test("31 locality and Candidate filenames preserve Korean safely", privateTestOptions(privateRegressionAvailable), () => { const target = groupByLocality("도안동"); assert.match(pdfExport.buildPork33PdfFileName(state, { scopeType: "LOCALITY", localityKey: target.localityKey }), /대전광역시_서구_도안동/u); assert.equal(pdfExport.buildPork33PdfFileName(state, { scopeType: "CANDIDATE", candidateStoreId: byCode("P33-009").identity.candidateStoreId }), "FRAMEONE_PORK33_P33-009_후보점포.pdf"); });
test("32 PDF runtime contract remains landscape Korean and overlap checked", () => { const script = fs.readFileSync(path.join(root, "tools/pork33-shortlist-pdf/generate.ps1"), "utf8"); assert.match(script, /SlideWidth = 841\.89/u); assert.match(script, /Malgun Gothic/u); assert.match(script, /overlapCount=0/u); });
test("33 whole PORK33 selection remains self-contained", () => {
  const selection = report.resolvePork33ReportSelection(state, { scopeType: "ALL" });
  assert.equal(selection.candidates.length, 27);
  assert.equal(new Set(selection.candidates.map((candidate) => candidate.identity.candidateStoreId)).size, 27);
});
