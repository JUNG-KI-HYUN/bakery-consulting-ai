import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import ts from "typescript";

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
const bulk = require(path.join(root, "lib/pork33-candidate-shortlist/bulk-review.ts"));
const report = require(path.join(root, "lib/pork33-candidate-shortlist/report.ts"));
const repository = require(path.join(root, "lib/pork33-candidate-shortlist/repository.server.ts"));
const commands = require(path.join(root, "lib/pork33-candidate-shortlist/commands.server.ts"));
const seedProvider = require(path.join(root, "lib/pork33-candidate-shortlist/seed-provider.server.ts"));
const seedResolution = await seedProvider.loadPork33SeedPackage();
let tempRoot;

before(() => { tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p33-bulk-review-")); });
after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"];
  Module._load = previousModuleLoad;
});

const initial = () => stateModule.createPork33InitialState(undefined, seedResolution.seed);
const candidateId = (index = 0) => initial().candidates[index].identity.candidateStoreId;
const options = (name) => ({ repositoryRoot: path.join(tempRoot, name), randomId: randomUUID });

test("01 Bulk Review에 27 Candidate가 표시될 입력을 제공한다", () => assert.equal(bulk.filterPork33BulkReviewCandidates(initial(), "ALL").length, 27));
test("02 Candidate 1 선택과 인접 이동 identity를 결정한다", () => { const rows = bulk.filterPork33BulkReviewCandidates(initial(), "ALL"); assert.equal(bulk.getAdjacentPork33CandidateId(rows, rows[0].identity.candidateStoreId, 1), rows[1].identity.candidateStoreId); });
test("03 Raw Field Note를 그대로 제공한다", () => { const s = initial(); assert.equal(s.candidates[0].normalized.fieldNoteRaw, s.candidates[0].raw.fieldNote); });
test("04 Draft 편집은 새 HUMAN_EDIT Revision을 추가한다", async () => { const opts = options("draft-edit"); const s = initial(); const payload = { ...s.candidates[0].draft.payload, locationSummary: "현장 원문을 기준으로 수정했습니다." }; const out = await commands.executePork33ShortlistCommand({ type: "SAVE_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), payload }, opts); assert.equal(out.candidates[0].contentRevisions.length, 2); assert.equal(stateModule.getActivePork33Revision(out.candidates[0]).origin, "HUMAN_EDIT"); });
test("05 DRAFT에서 REVIEWED로 전이한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "REVIEWED" }, options("draft-reviewed")); assert.equal(stateModule.getActivePork33Revision(out.candidates[0]).status, "REVIEWED"); });
test("06 DRAFT에서 APPROVED로 전이한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, options("draft-approved")); assert.equal(stateModule.getActivePork33Revision(out.candidates[0]).status, "APPROVED"); });
test("07 REVIEWED에서 APPROVED로 전이한다", async () => { const opts = options("reviewed-approved"); await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "REVIEWED" }, opts); const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, opts); assert.equal(stateModule.getActivePork33Revision(out.candidates[0]).status, "APPROVED"); });
test("08 승인 후 다음 Candidate는 source order의 다음 ID다", () => { const rows = initial().candidates; assert.equal(bulk.getAdjacentPork33CandidateId(rows, rows[7].identity.candidateStoreId, 1), rows[8].identity.candidateStoreId); });
test("09 Approved count가 승인 후 동적으로 증가한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, options("progress-approved")); assert.equal(bulk.getPork33BulkReviewProgress(out).approved, 1); assert.equal(bulk.getPork33BulkReviewProgress(out).draft, 26); });
test("10 KEEP과 사유를 명시적으로 저장한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "KEEP", reviewReason: "생활동선 확인" } }, options("keep")); assert.equal(out.candidates[0].normalized.reviewStatus, "KEEP"); assert.equal(out.candidates[0].reviewReason, "생활동선 확인"); });
test("11 SHORTLIST를 명시적으로 저장한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "SHORTLIST" } }, options("shortlist")); assert.equal(out.candidates[0].normalized.reviewStatus, "SHORTLIST"); });
test("12 HOLD를 명시적으로 저장한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "HOLD" } }, options("hold")); assert.equal(out.candidates[0].normalized.reviewStatus, "HOLD"); });
test("13 DROP을 명시적으로 저장한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "DROP" } }, options("drop")); assert.equal(out.candidates[0].normalized.reviewStatus, "DROP"); });
test("14 Approval은 Lifecycle을 자동 변경하지 않는다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, options("no-auto-lifecycle")); assert.equal(out.candidates[0].normalized.reviewStatus, "REVIEW"); });
test("15 APPROVED Field Note만 PDF Card에 포함한다", async () => { const opts = options("approved-pdf"); const payload = { ...initial().candidates[0].draft.payload, reportSummary: "SANITIZED FIXTURE APPROVED SUMMARY" }; await commands.executePork33ShortlistCommand({ type: "SAVE_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), payload }, opts); const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, opts); assert.equal(report.toPork33ReportCard(out, out.candidates[0]).approvedSummary, "SANITIZED FIXTURE APPROVED SUMMARY"); });
test("16 DRAFT는 PDF Card에서 제외한다", () => assert.equal(report.toPork33ReportCard(initial(), initial().candidates[0]).approvedSummary, "현장메모 검토 필요"));
test("17 Region Compare에 승인 장점과 확인사항을 반영한다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, options("region-approved")); const page = report.buildPork33ReportPages(out).find((item) => item.kind === "REGION_COMPARE" && item.rows.some((row) => row.displayCode === "P33-001")); const row = page.rows.find((item) => item.displayCode === "P33-001"); assert.deepEqual(row.strengths, out.candidates[0].draft.payload.strengths); assert.deepEqual(row.checks, out.candidates[0].draft.payload.checks); });
test("18 Final Shortlist Summary에 SHORTLIST Candidate를 반영한다", async () => { const opts = options("final-shortlist"); const payload = { ...initial().candidates[0].draft.payload, reportSummary: "SANITIZED FIXTURE SHORTLIST SUMMARY" }; await commands.executePork33ShortlistCommand({ type: "SAVE_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), payload }, opts); await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "SHORTLIST" } }, opts); const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, opts); const finalPage = report.buildPork33ReportPages(out).find((item) => item.kind === "FINAL"); assert.equal(finalPage.rows[0].displayCode, "P33-001"); assert.equal(finalPage.rows[0].approvedSummary, "SANITIZED FIXTURE SHORTLIST SUMMARY"); });
test("19 reload 후 APPROVED Revision을 유지한다", async () => { const opts = options("reload-approved"); await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, opts); const loaded = await repository.loadCurrentPork33State({ rootDir: opts.repositoryRoot }); assert.equal(stateModule.getActivePork33Revision(loaded.candidates[0]).status, "APPROVED"); });
test("20 reload 후 Lifecycle과 사유를 유지한다", async () => { const opts = options("reload-lifecycle"); await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "HOLD", reviewReason: "노출도 추가 확인" } }, opts); const loaded = await repository.loadCurrentPork33State({ rootDir: opts.repositoryRoot }); assert.equal(loaded.candidates[0].normalized.reviewStatus, "HOLD"); assert.equal(loaded.candidates[0].reviewReason, "노출도 추가 확인"); });
test("21 P33-005는 Geocode Review Required를 유지한다", () => assert.equal(initial().candidates[4].normalized.geocodeStatus, "GEOCODE_REVIEW_REQUIRED"));
test("22 Draft/Approval/Lifecycle 명령은 Raw Field Note를 변경하지 않는다", async () => { const opts = options("raw-immutable"); const before = initial().candidates[0].normalized.fieldNoteRaw; await commands.executePork33ShortlistCommand({ type: "UPDATE_CANDIDATE", actor: "reviewer", candidateStoreId: candidateId(), patch: { reviewStatus: "KEEP" } }, opts); const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(), targetStatus: "APPROVED" }, opts); assert.equal(out.candidates[0].normalized.fieldNoteRaw, before); });
test("23 Candidate A Revision이 Candidate B에 혼입되지 않는다", async () => { const out = await commands.executePork33ShortlistCommand({ type: "TRANSITION_DRAFT", actor: "reviewer", candidateStoreId: candidateId(0), targetStatus: "APPROVED" }, options("isolation")); assert.equal(stateModule.getActivePork33Revision(out.candidates[0]).status, "APPROVED"); assert.equal(stateModule.getActivePork33Revision(out.candidates[1]).status, "DRAFT"); assert.equal(stateModule.getActivePork33Revision(out.candidates[1]).candidateStoreId, candidateId(1)); });
test("24 Apartment Area filter를 적용한다", () => { const s = initial(); const areaId = s.candidates[11].linkage.apartmentAreaId; const rows = bulk.filterPork33BulkReviewCandidates(s, "ALL", "", areaId); assert.equal(rows.length, 4); assert.ok(rows.every((item) => item.linkage.apartmentAreaId === areaId)); });
test("25 Region filter를 적용한다", () => { const s = initial(); const regionId = s.candidates[15].linkage.regionId; const rows = bulk.filterPork33BulkReviewCandidates(s, "ALL", regionId); assert.ok(rows.length > 0 && rows.every((item) => item.linkage.regionId === regionId)); });
test("26 미저장 Draft 유실 방지 UI가 이동과 unload를 차단한다", () => { const source = fs.readFileSync(path.join(root, "app/tools/pork33-candidate-shortlist/Pork33BulkReview.tsx"), "utf8"); assert.match(source, /저장되지 않은 Draft 변경/); assert.match(source, /window\.confirm/); assert.match(source, /beforeunload/); });
