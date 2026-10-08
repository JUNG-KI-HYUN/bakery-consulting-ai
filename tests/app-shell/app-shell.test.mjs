import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("App Shell routes Case-dependent candidate and report areas through the Case Inbox", () => {
  const shell = read("components/app-shell/AppShell.tsx");
  for (const route of ["/", "/markets", "/", "/"]) {
    assert.match(shell, new RegExp(`href: \\\"${route.replaceAll("/", "\\/")}\\\"`));
  }
  for (const label of ["홈", "분석", "후보점포", "리포트"]) {
    assert.match(shell, new RegExp(`label: \\\"${label}\\\"`));
  }
  assert.doesNotMatch(shell, /href: "\/consultations"/);
  assert.doesNotMatch(shell, /href: "\/reports\/sample-001"/);
  assert.doesNotMatch(shell, /href="\/consultations\/new"/);
  assert.match(shell, /Case에서 후보점포 등록/);
});

test("App Navigation and the seven-step analysis workflow remain separate hierarchies", () => {
  const shell = read("components/app-shell/AppShell.tsx");
  const workflow = `${read("app/markets/AnalysisWorkflow.tsx")}\n${read("lib/navigation/case-aware-market-navigation.ts")}`;
  assert.match(shell, /FRAMEONE 주요 메뉴/);
  assert.match(workflow, /상권분석 업무 흐름/);
  for (const label of ["1. 분석대상", "2. 입지·상권", "3. 경쟁환경", "4. 임대시장", "5. 사업성·손익", "6. 후보점포 진단", "7. 데이터·근거"]) {
    assert.match(workflow, new RegExp(label.replace("·", "\\·")));
  }
});

test("shared header reuses active target and presents result states in user language", () => {
  const shell = read("components/app-shell/AppShell.tsx");
  const workflow = read("app/markets/AnalysisWorkflow.tsx");
  assert.match(workflow, /AnalysisHeaderBridge/);
  assert.match(shell, /targetLabel/);
  assert.match(shell, /radiusM/);
  for (const label of ["최신 분석", "다시 분석 필요", "아직 분석하지 않음"]) {
    assert.match(shell, new RegExp(label));
  }
  for (const developerTerm of ["analysisRunId", "targetKey", "schemaVersion", "officialMarketCode"]) {
    assert.equal(shell.includes(developerTerm), false);
  }
});

test("responsive shell keeps sidebar off mobile and compacts it on tablet widths", () => {
  const shell = read("components/app-shell/AppShell.tsx");
  assert.match(shell, /hidden border-r[\s\S]*md:flex/);
  assert.match(shell, /md:grid-cols-\[4\.75rem_minmax\(0,1fr\)\]/);
  assert.match(shell, /xl:grid-cols-\[13rem_minmax\(0,1fr\)\]/);
  assert.match(shell, /md:hidden/);
  assert.match(shell, /min-w-0/);
});

test("root layout applies one persistent App Shell and home contains no invented KPI", () => {
  const layout = read("app/layout.tsx");
  const home = read("app/page.tsx");
  assert.match(layout, /<AppShell>\{children\}<\/AppShell>/);
  assert.match(home, /상권·입지 분석 시작/);
  assert.match(home, /후보점포 확인/);
  for (const fakeMetric of ["진행중 Case", "오늘 할 일", "조건부 추천 점포 수", "보류\/위험 점포 수"]) {
    assert.equal(home.includes(fakeMetric), false);
  }
});
