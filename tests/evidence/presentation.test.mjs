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

const presentation = loadModule(path.join(repositoryRoot, "lib/evidence/presentation.ts"));
const { EvidenceViewer } = loadModule(path.join(repositoryRoot, "components/evidence/EvidenceViewer.tsx"));
const { EvidenceValueTypeBadge } = loadModule(path.join(repositoryRoot, "components/evidence/EvidenceBadges.tsx"));
const minimalFixture = Object.freeze({
  id: "fixture-private-evidence-id",
  sourceType: "OWNER_STATEMENT",
  verificationStatus: "UNKNOWN",
});
const render = (evidence, props = {}) => renderToStaticMarkup(createElement(EvidenceViewer, { evidence, ...props }));

test("verification and source labels cover the contract independently", () => {
  for (const [status, label] of Object.entries({ VERIFIED: "확인됨", ESTIMATED: "추정", UNKNOWN: "미확인", CONFLICTED: "정보 상충", STALE: "재확인 필요" })) {
    assert.equal(presentation.getVerificationLabel(status), label);
  }
  for (const [source, label] of Object.entries({ DOCUMENT: "문서", FIELD_CHECK: "현장 확인", PHOTO: "사진", OWNER_STATEMENT: "임대인 진술", TENANT_STATEMENT: "임차인 진술", EXPERT_STATEMENT: "전문가 확인/진술", PUBLIC_DATA: "공공데이터", SYSTEM_CALCULATION: "시스템 계산", CUSTOMER_INPUT: "고객 입력" })) {
    assert.equal(presentation.getEvidenceSourceLabel(source), label);
  }
  assert.equal(presentation.getEvidenceValueTypeLabel("actual"), "실제값");
  assert.equal(presentation.getEvidenceValueTypeLabel("estimated"), "추정값");
  assert.equal(presentation.getEvidenceValueTypeLabel(undefined), undefined);
  assert.equal(renderToStaticMarkup(createElement(EvidenceValueTypeBadge)), "");
});

test("verified public estimates render all three meanings without implying an actual value", () => {
  const html = render({ ...minimalFixture, sourceType: "PUBLIC_DATA", verificationStatus: "VERIFIED", valueType: "estimated", assertedValue: 30 });
  assert.ok(html.includes('aria-label="검증상태: 확인됨"'));
  assert.ok(html.includes('aria-label="값의 성격: 추정값"'));
  assert.ok(html.includes('aria-label="출처: 공공데이터"'));
  assert.ok(!html.includes("실제값"));
});

test("a minimal owner statement remains UNKNOWN, with no inferred value, date or status", () => {
  const html = render(minimalFixture);
  assert.ok(html.includes('aria-label="검증상태: 미확인"'));
  assert.ok(html.includes('aria-label="출처: 임대인 진술"'));
  assert.ok(html.includes("값 미기록"));
  assert.ok(html.includes("날짜 미기록"));
  assert.ok(!html.includes("확인됨"));
  assert.ok(!html.includes("실제값"));
  assert.ok(!html.includes("추정값"));
  assert.ok(html.includes("<details"));
  assert.ok(html.includes("<summary"));
  assert.ok(!/<details[^>]*\sopen(?:[\s=>])/.test(html));
});

test("customer markup omits internal references, reviewer, raw notes, limitations and structured values", () => {
  const evidence = {
    ...minimalFixture,
    fieldPath: "fixture-private-field-path",
    checkedBy: "fixture-private-reviewer",
    sourceRef: "fixture-private-source-ref",
    sourceUrl: "https://example.invalid/fixture-private-url",
    description: "fixture-private-description",
    limitation: "fixture-private-limitation",
    assertedValue: { nested: ["fixture-private-object-value"] },
    checkedAt: "2026-09-03T00:00:00Z",
    effectiveAt: "2026-09-01",
    observedAt: "2026-08-31T00:00:00Z",
    expiresAt: "2026-09-30",
    createdAt: "2026-09-03T01:00:00Z",
  };
  const original = JSON.stringify(evidence);
  for (const props of [{}, { audience: "customer" }]) {
    const html = render(evidence, { ...props, customerLimitation: "고객 전달용 fixture 제한사항" });
    assert.ok(!html.includes("fixture-private"));
    assert.ok(!html.includes("<a "));
    assert.ok(!html.includes("<pre"));
    assert.ok(html.includes("고객 전달용 fixture 제한사항"));
    assert.ok(html.includes("2026.09.03 00:00:00 (UTC)"));
    assert.ok(html.includes("자료 기준일"));
  }
  const staffHtml = render(evidence, { audience: "staff" });
  for (const value of [evidence.id, evidence.fieldPath, evidence.checkedBy, evidence.sourceRef, evidence.sourceUrl, evidence.description, evidence.limitation]) {
    assert.ok(staffHtml.includes(value));
  }
  for (const label of ["관찰·측정일", "확인일", "자료 기준일", "만료·재확인일", "근거 기록일"]) {
    assert.ok(staffHtml.includes(label));
  }
  assert.ok(staffHtml.includes("<pre"));
  assert.ok(staffHtml.includes("fixture-private-object-value"));
  assert.ok(!staffHtml.includes("[object Object]"));
  assert.equal(JSON.stringify(evidence), original);
});

test("scalar formatting preserves zero, false, null, empty and missing values distinctly", () => {
  const cases = [[0, "0"], [false, "거짓 (false)"], [true, "참 (true)"], [null, "값 없음 (null)"], [undefined, "값 미기록"], ["", "빈 문자열"], [0.123456789, "0.123456789"]];
  for (const [value, expected] of cases) {
    assert.equal(presentation.formatEvidenceValue(value), expected);
    assert.ok(render({ ...minimalFixture, assertedValue: value }).includes(expected));
  }
  assert.equal(presentation.formatEvidenceValue(NaN), "수치 확인 필요");
});

test("nested JSON renders safely for staff, and HTML-like evidence remains escaped text", () => {
  const value = { fixture: [0, false, null, { label: "<script>fixture-only</script>" }] };
  assert.deepEqual(JSON.parse(presentation.formatEvidenceValue(value)), value);
  const html = render({ ...minimalFixture, assertedValue: value, description: "<img src=x onerror=fixture>" }, { audience: "staff" });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  const array = ["fixture", null, false, 0];
  assert.deepEqual(JSON.parse(presentation.formatEvidenceValue(array)), array);
});

test("timestamp formatting preserves source timezone and handles absent or invalid dates", () => {
  const cases = [
    ["2026-09-03T23:30:00.123-07:00", "2026.09.03 23:30:00.123 (UTC-07:00)"],
    ["2026-09-03T09:00:00+09:00", "2026.09.03 09:00:00 (UTC+09:00)"],
    ["2026-09-03T00:00:00Z", "2026.09.03 00:00:00 (UTC)"],
    ["2026-09-03T09:00", "2026.09.03 09:00 (시간대 미지정)"],
    ["2024-02-29", "2024.02.29"],
    [undefined, "날짜 미기록"],
    ["", "날짜 미기록"],
    ["fixture-invalid-date", "날짜 확인 필요"],
    ["2026-02-29", "날짜 확인 필요"],
    ["2026-02-30T00:00:00Z", "날짜 확인 필요"],
    ["2026-09-03T25:00:00Z", "날짜 확인 필요"],
    ["2026-09-03T00:00:00+99:00", "날짜 확인 필요"],
  ];
  for (const [value, expected] of cases) assert.equal(presentation.formatEvidenceTimestamp(value), expected);
  const html = render({ ...minimalFixture, checkedAt: "fixture-invalid-date" });
  assert.ok(html.includes("날짜 확인 필요"));
  assert.ok(html.includes("미확인"));
});

test("source links are clickable only for HTTP(S) and only in staff markup", () => {
  for (const value of [undefined, "javascript:alert('fixture')", "data:text/html,fixture", "file:///fixture", "/fixture-relative"]) {
    assert.equal(presentation.getEvidenceSourceHref(value), undefined);
    assert.ok(!render({ ...minimalFixture, sourceUrl: value }, { audience: "staff" }).includes("<a "));
  }
  const url = "https://example.invalid/fixture-document";
  assert.equal(presentation.getEvidenceSourceHref(url), url);
  const html = render({ ...minimalFixture, sourceUrl: url }, { audience: "staff" });
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(!render({ ...minimalFixture, sourceUrl: url }).includes(url));
});
