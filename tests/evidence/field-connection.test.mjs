import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoaders = new Map([".ts", ".tsx"].map((extension) => [extension, loadModule.extensions[extension]]));
for (const extension of previousLoaders.keys()) {
  loadModule.extensions[extension] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) => originalRequire(
      specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
    );
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

const { getEvidenceForField } = loadModule(path.join(repositoryRoot, "lib/evidence/field.ts"));
const { FacilityCheckForm } = loadModule(path.join(repositoryRoot, "components/diagnosis/FacilityCheckForm.tsx"));
const { FacilityEvidenceField, FacilityEvidenceReview } = loadModule(path.join(repositoryRoot, "components/diagnosis/FacilityEvidence.tsx"));
const { sampleConsultation } = loadModule(path.join(repositoryRoot, "lib/diagnosis/sample-data.ts"));
const valueFixture = Object.freeze({ ...sampleConsultation.facilityCheck, electricCapacity: "50 kW (fixture)" });
const evidenceFixture = Object.freeze({
  id: "fixture-electricity",
  fieldPath: "facilityCheck.electricCapacity",
  sourceType: "FIELD_CHECK",
  verificationStatus: "VERIFIED",
  valueType: "actual",
  assertedValue: 30,
  unit: "kW",
  checkedBy: "fixture-reviewer",
});
const renderForm = (evidence, onChange = () => {}) => renderToStaticMarkup(
  createElement(FacilityCheckForm, { value: valueFixture, evidence, onChange }),
);
const renderReview = (evidence) => renderToStaticMarkup(
  createElement(FacilityEvidenceReview, { value: valueFixture, evidence }),
);
const renderField = (fieldKey, evidence) => renderToStaticMarkup(
  createElement(FacilityEvidenceField, { fieldKey, evidence }, createElement("span", null, "fixture-current-field")),
);

test("CASE A: legacy evidence-free records keep all existing controls and add no Evidence UI", () => {
  assert.equal(sampleConsultation.consultation.sampleData, true);
  assert.equal(Object.hasOwn(sampleConsultation, "evidence"), false);
  const html = renderForm(undefined);
  assert.equal(html, renderForm([]));
  assert.equal((html.match(/<input\b/g) ?? []).length, 6);
  assert.equal((html.match(/<select\b/g) ?? []).length, 10);
  assert.ok(html.includes('value="50 kW (fixture)"'));
  assert.ok(!html.includes("기록된 근거"));
  assert.ok(!html.includes('aria-label="검증상태:'));
  assert.equal(renderReview(undefined), "");
  assert.equal(renderReview([]), "");
});

test("CASE B: electricity evidence appears beside its existing field and in the staff review", () => {
  const evidence = [evidenceFixture];
  for (const html of [renderForm(evidence), renderReview(evidence)]) {
    assert.ok(html.includes('aria-label="전기 용량 기록된 근거"'));
    assert.ok(html.includes("기록된 근거 1건"));
    assert.ok(html.includes("전기 용량 · 근거 1"));
    assert.ok(html.includes("fixture-reviewer"));
    assert.equal((html.match(/<details\b/g) ?? []).length, 1);
  }
  assert.ok(renderReview(evidence).includes("현재 입력값: 50 kW (fixture)"));
});

test("CASE C: matching is exact, with no alias, prefix, whitespace or missing-path inference", () => {
  const evidence = [
    evidenceFixture,
    { ...evidenceFixture, id: "fixture-exhaust", fieldPath: "facilityCheck.exhaustPossible" },
    { ...evidenceFixture, id: "fixture-alias", fieldPath: "facility.electricCapacity" },
    { ...evidenceFixture, id: "fixture-prefix", fieldPath: "facilityCheck.electricCapacity.extra" },
    { ...evidenceFixture, id: "fixture-space", fieldPath: " facilityCheck.electricCapacity " },
    { ...evidenceFixture, id: "fixture-missing", fieldPath: undefined },
  ];
  const found = getEvidenceForField(evidence, "facilityCheck.electricCapacity");
  assert.deepEqual(found, [evidenceFixture]);
  assert.strictEqual(found[0], evidenceFixture);
  assert.deepEqual(getEvidenceForField(undefined, "facilityCheck.electricCapacity"), []);
  assert.deepEqual(getEvidenceForField(evidence, ""), []);
  assert.equal(renderField("electricCapacity", evidence.slice(1)), "<span>fixture-current-field</span>");
  assert.ok(!renderForm(evidence.slice(2)).includes("기록된 근거"));
});

test("CASE D: multiple matching records retain source order and are not deduplicated or auto-selected", () => {
  const first = Object.freeze({ ...evidenceFixture, sourceType: "OWNER_STATEMENT", verificationStatus: "UNKNOWN", assertedValue: 50, description: "fixture-first-statement" });
  const second = Object.freeze({ ...evidenceFixture, description: "fixture-second-observation" });
  // Even repeated IDs must not silently discard an entry in this display step.
  const evidence = Object.freeze([first, second]);
  assert.deepEqual(getEvidenceForField(evidence, evidenceFixture.fieldPath), [first, second]);
  for (const html of [renderForm(evidence), renderReview(evidence)]) {
    assert.ok(html.includes("기록된 근거 2건"));
    assert.equal((html.match(/<details\b/g) ?? []).length, 2);
    assert.ok(html.indexOf(first.description) < html.indexOf(second.description));
    assert.ok(!html.includes('aria-label="검증상태: 정보 상충"'));
  }
});

test("CASE E: an UNKNOWN owner statement keeps independent source and verification badges", () => {
  const html = renderForm([{ ...evidenceFixture, sourceType: "OWNER_STATEMENT", verificationStatus: "UNKNOWN", valueType: undefined }]);
  assert.ok(html.includes('aria-label="출처: 임대인 진술"'));
  assert.ok(html.includes('aria-label="검증상태: 미확인"'));
  assert.ok(!html.includes('aria-label="검증상태: 확인됨"'));
  assert.ok(!html.includes('aria-label="값의 성격: 실제값"'));
});

test("CASE F: PUBLIC_DATA + VERIFIED + estimated retain three separate meanings", () => {
  const html = renderForm([{ ...evidenceFixture, sourceType: "PUBLIC_DATA", valueType: "estimated" }]);
  assert.ok(html.includes('aria-label="출처: 공공데이터"'));
  assert.ok(html.includes('aria-label="검증상태: 확인됨"'));
  assert.ok(html.includes('aria-label="값의 성격: 추정값"'));
  assert.ok(!html.includes('aria-label="값의 성격: 실제값"'));
});

test("CASE G: a different past snapshot never rewrites the current field, Evidence or verification state", () => {
  const evidence = Object.freeze([evidenceFixture]);
  const before = JSON.stringify({ value: valueFixture, evidence });
  let changes = 0;
  const html = renderForm(evidence, () => { changes += 1; });
  assert.ok(html.includes('value="50 kW (fixture)"'));
  assert.ok(html.includes("30 kW"));
  const review = renderReview(evidence);
  assert.ok(review.includes("현재 입력값: 50 kW (fixture)"));
  assert.ok(review.includes("30 kW"));
  assert.equal(changes, 0);
  assert.equal(JSON.stringify({ value: valueFixture, evidence }), before);
  assert.ok(!html.includes('aria-label="검증상태: 정보 상충"'));
});

test("CASE H: unsupported or evidence-free fields keep their original UI without invented UNKNOWN records", () => {
  const unsupported = ["ceilingHeight", "mixerMovePossible", "drawingConfirmed"].map((key) => ({ ...evidenceFixture, fieldPath: `facilityCheck.${key}` }));
  assert.equal(renderForm(unsupported), renderForm(undefined));
  assert.equal(renderReview(unsupported), "");
  assert.equal(renderField("ceilingHeight", [evidenceFixture]), "<span>fixture-current-field</span>");
  const html = renderForm([evidenceFixture]);
  assert.ok(!html.includes('aria-label="급배수 가능 여부 기록된 근거"'));
  assert.equal((html.match(/<details\b/g) ?? []).length, 1);
});

test("the six supported paths use existing type fields and readonly review adds no editor controls", () => {
  const keys = ["electricCapacity", "electricExpansionPossible", "exhaustPossible", "plumbingPossible", "fireSafetyChecked", "ovenMovePossible"];
  const evidence = keys.map((key) => {
    assert.ok(Object.hasOwn(valueFixture, key));
    return { ...evidenceFixture, id: `fixture-${key}`, fieldPath: `facilityCheck.${key}` };
  });
  const html = renderForm(evidence);
  const review = renderReview(evidence);
  assert.equal((html.match(/<details\b/g) ?? []).length, 6);
  assert.equal((review.match(/<details\b/g) ?? []).length, 6);
  assert.ok(!/<(?:input|select|textarea|button)\b/.test(review));
  const labels = html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) ?? [];
  assert.ok(labels.every((label) => !label.includes("<details") && !label.includes("<summary")));
});
