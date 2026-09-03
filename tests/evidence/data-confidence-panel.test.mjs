import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
let currentFixture;
const previousLoaders = new Map([".ts", ".tsx"].map((extension) => [extension, loadModule.extensions[extension]]));
for (const extension of previousLoaders.keys()) {
  loadModule.extensions[extension] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) => {
      // Render the real staff detail page with fixture-only storage. Never open production JSON.
      if (specifier === "@/lib/diagnosis/diagnosis-service") {
        return { getConsultationById: async (id) => {
          assert.equal(id, currentFixture.consultation.id);
          return currentFixture;
        } };
      }
      return originalRequire(specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier);
    };
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText, filename);
  };
}
after(() => {
  for (const [extension, previousLoader] of previousLoaders) {
    if (previousLoader) loadModule.extensions[extension] = previousLoader;
    else delete loadModule.extensions[extension];
  }
});

const { default: ConsultationDetailPage } = loadModule(path.join(repositoryRoot, "app/consultations/[id]/page.tsx"));
const { DataConfidencePanel } = loadModule(path.join(repositoryRoot, "components/evidence/DataConfidencePanel.tsx"));
const { EVIDENCE_COVERAGE_POLICY_V1: policy } = loadModule(path.join(repositoryRoot, "lib/evidence/coverage-policy.ts"));
const { sampleConsultation } = loadModule(path.join(repositoryRoot, "lib/diagnosis/sample-data.ts"));
const expansion = policy.fields.find((field) => field.fieldPath.endsWith(".electricExpansionPossible"));
const exhaust = policy.fields.find((field) => field.fieldPath.endsWith(".exhaustPossible"));
const fire = policy.fields.find((field) => field.fieldPath.endsWith(".fireSafetyChecked"));
const oven = policy.fields.find((field) => field.fieldPath.endsWith(".ovenMovePossible"));

function evidenceFixture(changedField, status) {
  return Object.freeze(policy.fields.flatMap((field) => (
    field === changedField && status === null ? [] : [Object.freeze({
      id: `fixture-coverage-ui-${field.fieldPath}`,
      fieldPath: field.fieldPath,
      verificationStatus: field === changedField ? status : "VERIFIED",
      sourceType: "FIELD_CHECK",
      description: "UI fixture only; not an actual observation",
    })]
  )));
}

async function renderFixture(evidence) {
  assert.equal(sampleConsultation.consultation.sampleData, true);
  currentFixture = Object.freeze({
    ...sampleConsultation,
    consultation: { ...sampleConsultation.consultation, id: "fixture-coverage-ui", title: "자료 확인도 UI fixture" },
    ...(evidence === undefined ? {} : { evidence }),
  });
  const before = JSON.stringify(currentFixture);
  const tree = await ConsultationDetailPage({ params: Promise.resolve({ id: currentFixture.consultation.id }) });
  const component = tree.props.children.find((child) => child?.type === DataConfidencePanel);
  assert.ok(component, "Staff detail must render the panel using the real page integration");
  assert.equal(component.props.coverage.policyVersion, policy.policyVersion);
  assert.equal(component.props.coverage.totalCoverage.fieldCount, 6);
  assert.equal(component.props.coverage.criticalCoverage.fieldCount, 5);
  const html = renderToStaticMarkup(tree);
  const panel = html.match(/<section aria-label="자료 확인도"[\s\S]*?<\/section>/)?.[0];
  assert.ok(panel);
  assert.ok(!panel.includes("facilityCheck."));
  assert.ok(!panel.includes("fixture-coverage-ui-"));
  assert.equal(JSON.stringify(currentFixture), before);
  return { html, panel };
}

function assertMeters(panel, total, critical) {
  for (const [label, percent] of [["전체 자료 확인도", total], ["핵심 자료 확인도", critical]]) {
    assert.match(panel, new RegExp(`role="progressbar"[^>]+aria-label="${label}"[^>]+aria-valuenow="${percent}"`));
    assert.ok(panel.includes(`${percent}%`));
  }
}

function assertCount(panel, label, count) {
  assert.match(panel, new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${count}개</dd>`));
}

function blocker(panel) {
  return panel.match(/<div aria-label="핵심 확인 필요"[\s\S]*?<\/ul><\/div>/)?.[0];
}

test("UI CASE A: all VERIFIED shows separate 100% meters with no critical blocker", async () => {
  const { html, panel } = await renderFixture(evidenceFixture());
  assertMeters(panel, 100, 100);
  assertCount(panel, "확인됨", 6);
  assert.equal(blocker(panel), undefined);
  assert.ok(html.indexOf(panel) < html.indexOf('aria-label="시설 근거 검토"'));
  assert.ok(panel.includes("6개 확인항목 보기"));
});

test("UI CASE B: legacy records without Evidence render neutral zero coverage and missing evidence", async () => {
  const { panel } = await renderFixture(undefined);
  assert.equal(panel, (await renderFixture([])).panel);
  assertMeters(panel, 0, 0);
  assertCount(panel, "근거 없음", 6);
  assertCount(panel, "미확인", 0);
  assert.ok(panel.includes("아직 이 확인항목에 기록된 근거가 없습니다."));
  assert.ok(blocker(panel).includes("핵심 확인 필요 5개"));
  assert.ok(!blocker(panel).includes(expansion.label));
  assert.ok(!/안전|나쁜 점포|성공|추천|보류|위험/.test(panel));
});

test("UI CASE C: missing expansion shows 83% total and 100% critical with no blocker", async () => {
  const { panel } = await renderFixture(evidenceFixture(expansion, null));
  assertMeters(panel, 83, 100);
  assertCount(panel, "근거 없음", 1);
  assertCount(panel, "확인됨", 5);
  assert.equal(blocker(panel), undefined);
  assert.ok(panel.includes(expansion.label));
  assert.ok(panel.includes("전체 자료에 포함 · 기본 핵심 확인항목 아님"));
});

test("UI CASE D: UNKNOWN exhaust remains prominently unresolved despite high total coverage", async () => {
  const { panel } = await renderFixture(evidenceFixture(exhaust, "UNKNOWN"));
  assertMeters(panel, 83, 80);
  assertCount(panel, "미확인", 1);
  assert.ok(blocker(panel).includes(exhaust.label));
  assert.ok(blocker(panel).includes("미확인"));
  assert.ok(panel.indexOf(blocker(panel)) < panel.indexOf("<details"));
});

test("UI CASE E: ESTIMATED exhaust has partial coverage and remains critical unresolved", async () => {
  const { panel } = await renderFixture(evidenceFixture(exhaust, "ESTIMATED"));
  assertMeters(panel, 92, 90);
  assertCount(panel, "추정", 1);
  assert.ok(blocker(panel).includes(exhaust.label));
  assert.ok(blocker(panel).includes("추정"));
  assert.ok(!blocker(panel).includes("확인됨"));
});

test("UI CASE F: CONFLICTED fire-safety evidence displays information conflict and required follow-up", async () => {
  const { panel } = await renderFixture(evidenceFixture(fire, "CONFLICTED"));
  assertMeters(panel, 83, 80);
  assertCount(panel, "정보 상충", 1);
  assert.ok(blocker(panel).includes(fire.label));
  assert.ok(blocker(panel).includes("정보 상충"));
});

test("UI CASE G: STALE oven access displays recheck required and remains unresolved", async () => {
  const { panel } = await renderFixture(evidenceFixture(oven, "STALE"));
  assertMeters(panel, 83, 80);
  assertCount(panel, "재확인 필요", 1);
  assert.ok(blocker(panel).includes(oven.label));
  assert.ok(blocker(panel).includes("재확인 필요"));
});

test("UI CASE H: UNKNOWN Evidence and absent Evidence retain distinct labels and counts", async () => {
  const evidence = evidenceFixture(exhaust, "UNKNOWN").filter((item) => item.fieldPath !== expansion.fieldPath);
  const { panel } = await renderFixture(evidence);
  assertMeters(panel, 67, 80);
  assertCount(panel, "미확인", 1);
  assertCount(panel, "근거 없음", 1);
  assertCount(panel, "확인됨", 4);
  assert.ok(blocker(panel).includes(exhaust.label));
  assert.ok(!blocker(panel).includes(expansion.label));
});

test("UI CASE I: 100% conveys data verification only, with readonly disclosure and policy detail", async () => {
  const { panel } = await renderFixture(evidenceFixture());
  assertMeters(panel, 100, 100);
  assert.ok(!/성공|안전|추천|조건부|보류|위험|생존/.test(panel));
  assert.ok(panel.includes("최종 계약판정은 별도로 검토합니다."));
  assert.ok(panel.includes(`계산 기준: ${policy.policyVersion}`));
  assert.ok(!/<details[^>]*\sopen(?:[\s=>])/.test(panel));
  assert.ok(!/<(?:input|select|textarea|button)\b/.test(panel));
  assert.ok(!/green|emerald|risk-highlight/.test(panel));
});
