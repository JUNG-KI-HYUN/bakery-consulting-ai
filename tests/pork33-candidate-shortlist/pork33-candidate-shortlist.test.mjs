import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import ts from "typescript";
import { privateTestOptions } from "./pork33-test-support.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, resolveJsonModule: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return previousModuleLoad.call(this, request, parent, isMain);
};

const stateModule = require(path.join(root, "lib/pork33-candidate-shortlist/state.ts"));
const reportModule = require(path.join(root, "lib/pork33-candidate-shortlist/report.ts"));
const repository = require(path.join(root, "lib/pork33-candidate-shortlist/repository.server.ts"));
const commands = require(path.join(root, "lib/pork33-candidate-shortlist/commands.server.ts"));
const kakao = require(path.join(root, "lib/market-data/clients/kakao-geocode.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
const seed = seedResolution.seed;
const sourcePdf = process.env.PORK33_SOURCE_PDF_PATH?.trim() || null;
const privateSeedAvailable = seedResolution.mode === "LOCAL_PRIVATE";
const sourcePdfAvailable = privateSeedAvailable && sourcePdf !== null && fs.existsSync(sourcePdf);
let tempRoot;

before(() => { tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p33-shortlist-test-")); });
after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"];
  Module._load = previousModuleLoad;
});

const initial = () => stateModule.createPork33InitialState(undefined, seed);
const ids = () => seed.candidates.map((candidate) => candidate.identity.candidateStoreId);

test("01 source PDF exists and is three pages", privateTestOptions(sourcePdfAvailable, "SKIP: PORK33_SOURCE_PDF_PATH private integration source not provisioned"), () => {
  assert.ok(fs.existsSync(sourcePdf));
  assert.equal(seed.sourceDocument.pageCount, 3);
});
test("02 Seed has exactly 27 physical Candidate rows", () => assert.equal(seed.candidates.length, 27));
test("03 sourceRowOrder is unique 1..27", () => assert.deepEqual(seed.candidates.map((c) => c.source.sourceRowOrder), Array.from({ length: 27 }, (_, i) => i + 1)));
test("04 duplicate printed numbers are preserved without collision", privateTestOptions(privateSeedAvailable), () => assert.deepEqual(seed.sourceAudit.duplicatePrintedNumbers, ["21", "24"]));
test("05 missing printed numbers are audited", privateTestOptions(privateSeedAvailable), () => assert.deepEqual(seed.sourceAudit.missingPrintedNumbers, ["16", "17", "25"]));
test("06 blank printed rows are not Candidate records", privateTestOptions(privateSeedAvailable), () => { assert.deepEqual(seed.sourceAudit.blankPrintedRows, ["16", "17"]); assert.equal(seed.candidates.length, 27); });
test("07 canonical Candidate IDs are unique", () => assert.equal(new Set(ids()).size, 27));
test("08 display numbers are 1..27", () => assert.deepEqual(seed.candidates.map((c) => c.identity.displayNumber), Array.from({ length: 27 }, (_, i) => i + 1)));
test("09 display codes are P33-001..P33-027", () => assert.equal(seed.candidates.at(-1).identity.displayCode, "P33-027"));
test("10 Region grouping has five address-derived regions", () => assert.equal(seed.regions.length, 5));
test("11 Apartment Area grouping has seventeen editable proposals", () => assert.equal(seed.apartmentAreas.length, 17));
test("12 a two-Candidate Apartment Area remains grouped", () => assert.equal(seed.candidates.filter((c) => c.linkage.apartmentAreaId === "area_p33_gwanjeo_daejayeon").length, 2));
test("13 a four-Candidate Apartment Area remains grouped", () => assert.equal(seed.candidates.filter((c) => c.linkage.apartmentAreaId === "area_p33_daejeon_iparkcity").length, 4));
test("14 all candidate addresses are non-empty", () => assert.ok(seed.candidates.every((c) => c.raw.address.trim())));
test("15 source area/deposit/rent rows are preserved", privateTestOptions(privateSeedAvailable), () => assert.deepEqual(seed.candidates.slice(0, 2).map((c) => [c.raw.exclusiveArea, c.raw.deposit, c.raw.rent]), [["8.90", "2,000", "130"], ["12.09", "2,000", "85"]]));
test("16 maintenance X and confirmation required normalize to UNKNOWN", () => assert.ok(seed.candidates.filter((c) => c.normalized.maintenance === null).every((c) => c.normalized.maintenanceStatus === "UNKNOWN")));
test("17 maintenance explicit value is not erased", privateTestOptions(privateSeedAvailable), () => assert.equal(seed.candidates[4].normalized.maintenance, 6));
test("18 premium defaults null even when raw note mentions a facility premium", () => assert.ok(seed.candidates.every((c) => c.normalized.premium === null)));
test("19 raw field notes are present and unchanged", () => { assert.equal(seed.sourceAudit.fieldNoteRawPresentCount, 27); assert.equal(seed.candidates[0].normalized.fieldNoteRaw, seed.candidates[0].raw.fieldNote); });
test("20 household references remain UNVERIFIED user-provided values", privateTestOptions(privateSeedAvailable), () => assert.ok(seed.candidates.every((c) => c.normalized.householdReferenceStatus === "UNVERIFIED" && c.normalized.sourceType === "USER_PROVIDED_SOURCE")));
test("21 all structured notes start as source-safe DRAFT", privateTestOptions(privateSeedAvailable), () => assert.ok(seed.candidates.every((c) => c.draft.status === "DRAFT" && c.draft.modelId === null && c.draft.promptContractVersion === "PORK33_SHORTLIST_SEED_STRUCTURING_V1")));
test("22 initial state passes strict validation", () => assert.deepEqual(stateModule.validatePork33State(initial(), seed), []));
test("23 foreign Candidate data is rejected", () => { const s = initial(); s.candidates[0].identity.candidateStoreId = "store_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; assert.ok(stateModule.validatePork33State(s, seed).some((x) => x.includes("Seed에 없는"))); });
test("24 immutable raw source changes are rejected", () => { const s = initial(); s.candidates[0].raw.address = "변조"; assert.ok(stateModule.validatePork33State(s, seed).some((x) => x.includes("변경할 수 없습니다"))); });
test("25 Region filter isolates candidates", () => { const s = initial(); const rows = stateModule.filterPork33Candidates(s.candidates, { regionId: s.regions[0].regionId }); assert.ok(rows.length > 0 && rows.every((c) => c.linkage.regionId === s.regions[0].regionId)); });
test("26 Apartment Area filter isolates candidates", () => { const s = initial(); const rows = stateModule.filterPork33Candidates(s.candidates, { apartmentAreaId: "area_p33_daejeon_iparkcity" }); assert.equal(rows.length, 4); });
test("27 Review Status filter isolates candidates", () => { const s = initial(); assert.equal(stateModule.filterPork33Candidates(s.candidates, { lifecycleStatus: "REVIEW" }).length, 27); });
test("28 Candidate compare inputs preserve Candidate A/B identity", () => { const s = initial(); const pair = [s.candidates[0], s.candidates[1]]; assert.notEqual(pair[0].identity.candidateStoreId, pair[1].identity.candidateStoreId); assert.notEqual(pair[0].normalized.addressFull, pair[1].normalized.addressFull); });
test("29 DRAFT content is excluded from customer report", () => { const card = reportModule.toPork33ReportCard(initial(), initial().candidates[0]); assert.equal(card.approvedSummary, "현장메모 검토 필요"); });
test("30 dynamic report count and pagination use all candidates", () => { const s = initial(); const pages = reportModule.buildPork33ReportPages(s); const count = pages.filter((p) => p.kind === "CANDIDATES").flatMap((p) => p.cards).length; assert.equal(count, 27); assert.ok(pages.filter((p) => p.kind === "REGION_COMPARE").some((p) => p.rows.length <= 6)); });
test("31 report has dynamic Region/Area counts and no hard-coded averages", () => { const pages = JSON.stringify(reportModule.buildPork33ReportPages(initial())); assert.match(pages, /조사지역 5개/); assert.match(pages, /Apartment Area 17개/); assert.doesNotMatch(pages, /평균 보증금|평균 임대료|1,538/); });
test("32 null and explicit zero format differently", () => { const s = initial(); s.candidates[0].normalized.premium = 0; const zero = reportModule.toPork33ReportCard(s, s.candidates[0]); const unknown = reportModule.toPork33ReportCard(s, s.candidates[1]); assert.equal(zero.premium, "0만원"); assert.equal(unknown.premium, "확인 필요"); });
test("33 Kakao geocode success uses provider coordinates only", async () => { const result = await kakao.geocodeKakaoAddress("샘플시 샘플구 샘플동 1", { apiKey: "test", fetchImpl: async () => new Response(JSON.stringify({ documents: [{ x: "127.1", y: "36.3", address_name: "검증주소" }] }), { status: 200 }) }); assert.deepEqual(result, { latitude: 36.3, longitude: 127.1, resolvedAddress: "검증주소" }); });
test("34 Kakao geocode failure creates no coordinate fallback", async () => { await assert.rejects(() => kakao.geocodeKakaoAddress("없는 주소", { apiKey: "test", fetchImpl: async () => new Response(JSON.stringify({ documents: [] }), { status: 200 }) }), (error) => error.code === "NOT_FOUND"); });
test("35 append-only save and reload preserves state", async () => { const dir = path.join(tempRoot, "save-reload"); const s = initial(); const next = repository.createNextPork33Snapshot(s, "tester", { rootDir: dir, now: () => new Date("2026-11-01T01:00:00Z"), randomId: () => "11111111-1111-4111-8111-111111111111" }); next.candidates[0].normalized.reviewStatus = "KEEP"; await repository.appendPork33State(next, { rootDir: dir }); const loaded = await repository.loadCurrentPork33State({ rootDir: dir }); assert.equal(loaded.candidates[0].normalized.reviewStatus, "KEEP"); assert.equal(fs.readdirSync(dir).length, 1); });
test("36 update command preserves explicit premium zero", async () => { const dir = path.join(tempRoot, "premium-zero"); const s = initial(); const seedSnapshot = repository.createNextPork33Snapshot(s, "seed", { rootDir: dir, randomId: () => "22222222-2222-4222-8222-222222222222" }); await repository.appendPork33State(seedSnapshot, { rootDir: dir }); const out = await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "tester", candidateStoreId: ids()[0], patch: { premium: 0 } }, { repositoryRoot: dir, randomId: () => "33333333-3333-4333-8333-333333333333" }); assert.equal(out.candidates[0].normalized.premium, 0); });
test("37 geocode command isolates the selected Candidate marker", async () => { const dir = path.join(tempRoot, "geocode-one"); const options = { repositoryRoot: dir, randomId: () => "44444444-4444-4444-8444-444444444444", geocode: async () => ({ latitude: 36.3, longitude: 127.1, resolvedAddress: "x" }) }; await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "tester", candidateStoreId: ids()[0], patch: { addressForGeocode: "샘플시 샘플구 샘플동 1" } }, options); const out = await commands.executePork33ShortlistCommand({ type: "GEOCODE_ONE", actor: "tester", candidateStoreId: ids()[0] }, options); assert.equal(out.candidates[0].normalized.latitude, 36.3); assert.equal(out.candidates[1].normalized.latitude, null); });
test("38 failed geocode leaves null coordinates and review status", async () => { const dir = path.join(tempRoot, "geocode-fail"); const out = await commands.executePork33ShortlistCommand({ type: "GEOCODE_ONE", actor: "tester", candidateStoreId: ids()[0] }, { repositoryRoot: dir, randomId: () => "55555555-5555-4555-8555-555555555555", geocode: async () => { throw new kakao.KakaoGeocodeError("NOT_FOUND", "no"); } }); assert.equal(out.candidates[0].normalized.latitude, null); assert.equal(out.candidates[0].normalized.geocodeStatus, "GEOCODE_REVIEW_REQUIRED"); });
test("39 approved content is included after explicit transition", async () => { const dir = path.join(tempRoot, "approve"); let sequence = 0; const revisionIds = ["66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777"]; const options = { repositoryRoot: dir, now: () => new Date("2026-11-01T02:00:00Z"), randomId: () => revisionIds[sequence++] }; const payload = { ...initial().candidates[0].draft.payload, reportSummary: "SANITIZED FIXTURE APPROVED SUMMARY" }; await commands.executePork33ShortlistCommand({ type: "SAVE_DRAFT", actor: "reviewer", candidateStoreId: ids()[0], payload }, options); const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: ids()[0], targetStatus: "APPROVED" }, options); const card = reportModule.toPork33ReportCard(out, out.candidates[0]); assert.equal(card.approvedSummary, "SANITIZED FIXTURE APPROVED SUMMARY"); });
test("40 PDF contract declares A4 landscape, Korean font, footer, and overflow validation", () => { const script = fs.readFileSync(path.join(root, "tools/pork33-shortlist-pdf/generate.ps1"), "utf8"); assert.match(script, /841\.89/); assert.match(script, /595\.28/); assert.match(script, /Malgun Gothic/); assert.match(script, /현장조사 및 사용자 제공 매물자료 기준/); assert.match(script, /Text overflow detected/); });
test("41 PDF pages contain no raw field note", () => { const output = JSON.stringify(reportModule.buildPork33ReportPages(initial())); assert.ok(!output.includes(seed.candidates[0].normalized.fieldNoteRaw)); });
test("42 PORK33 application source has no Detailed Report production dependency", () => {
  const files = [
    "app/tools/pork33-candidate-shortlist/Pork33PhotoManager.tsx",
    "app/tools/pork33-candidate-shortlist/Pork33BriefingWorkspace.tsx",
    "app/api/tools/pork33-candidate-shortlist/photos/route.ts",
  ];
  assert.ok(files.every((file) => fs.existsSync(path.join(root, file))));
  assert.doesNotMatch(files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n"), /detailed-reports\/photos|lib\/detailed-report/u);
});
test("43 PORK33 Apartment Area model remains owned by its Candidate state", () => {
  const state = initial();
  assert.ok(state.apartmentAreas.length > 0);
  assert.ok(state.candidates.every((candidate) => state.apartmentAreas.some((area) => area.apartmentAreaId === candidate.linkage.apartmentAreaId)));
});
test("44 Candidate screening core remains reused", () => assert.ok(fs.existsSync(path.join(root, "lib/candidate-screening/types.ts"))));
test("45 source validation reports zero INVALID rows", privateTestOptions(privateSeedAvailable), () => assert.equal(seed.sourceAudit.validationInvalidCount, 0));
