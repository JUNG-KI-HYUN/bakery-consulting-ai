import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Case Inbox has a truthful empty state and new Case action", () => {
  const home = read("app/page.tsx");
  assert.match(home, /진행 중 Case/);
  assert.match(home, /아직 생성된 Case가 없습니다/);
  assert.match(home, /첫 베이커리 창업 프로젝트를 만들어보세요/);
  assert.match(home, /href="\/cases\/new"/);
  assert.equal(home.includes("진행중 Case 12"), false);
});

test("new Case form keeps only the requested two required fields", () => {
  const fields = read("components/cases/CaseFormFields.tsx");
  const form = read("components/cases/NewCaseForm.tsx");
  for (const label of ["Case 이름 *", "고객명 *", "베이커리 형태", "희망지역", "최소 예산", "최대 예산", "목표 오픈일"]) {
    assert.match(fields, new RegExp(label.replace("*", "\\*")));
  }
  assert.equal((fields.match(/required/g) ?? []).length, 2);
  assert.match(form, /router\.push\(`\/cases\/\$\{encodeURIComponent\(body\.caseId\)\}`\)/);
});

test("all minimal lifecycle stages have Korean user labels", () => {
  const contract = read("lib/cases/case-contract.ts");
  for (const [stage, label] of Object.entries({
    EXPLORING: "탐색중",
    CANDIDATE_REVIEW: "후보검토",
    LEASE_REVIEW: "계약검토",
    LEASE_SIGNED: "계약완료",
    PRE_OPEN: "오픈준비",
    OPERATING: "운영중",
    CLOSED: "종료",
  })) {
    assert.match(contract, new RegExp(`${stage}: \\\"${label}\\\"`));
  }
});

test("Case detail exposes empty analysis, candidate, report areas and only navigates to markets", () => {
  const detail = read("components/cases/CaseDetailClient.tsx");
  for (const copy of ["아직 연결된 분석이 없습니다", "아직 연결된 후보점포가 없습니다", "아직 생성된 리포트가 없습니다"]) {
    assert.match(detail, new RegExp(copy));
  }
  assert.match(detail, /href="\/markets"/);
  assert.match(detail, /상권 분석 시작/);
  assert.equal(detail.includes("analysisRunId:"), false);
});

test("existing markets workflow contracts remain outside the Case implementation", () => {
  const workflow = read("app/markets/AnalysisWorkflow.tsx");
  const run = read("lib/market-data/basic-location/run.ts");
  assert.match(workflow, /activeAnalysisTargetHref/);
  assert.match(run, /analysisRunId/);
  assert.match(run, /"CURRENT" \| "STALE" \| "NOT_RUN"/);
  assert.equal(read("lib/cases/case-contract.ts").includes("ActiveAnalysisTarget"), false);
});
