import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) =>
    original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};

const {
  importSbiz365Text,
  toSimpleReportInput,
  validateBatch,
} = require(path.join(root, "lib/sbiz365-import/importer.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

// SAMPLE FIXTURE: 실제 소상공인365 데이터가 아닌 parser contract 검증용 가상 문구다.
const sampleText = `
상권명: 샘플지역A
업종: 정육점
분석범위: 반경 1km
기준시점: 2026년 3분기
주소: 서울특별시 샘플구 샘플로 1
생활인구: SAMPLE_VALUE
요일별: SAMPLE_VALUE
점포수: SAMPLE_VALUE
`;

function parsed(fileName = "01_SAMPLE.pdf", text = sampleText) {
  return importSbiz365Text({
    fileName,
    text,
    importedAt: "2026-10-28T00:00:00.000Z",
    textExtractor: "SAMPLE_FIXTURE",
  });
}

test("extracts only explicitly labeled source text without numeric invention", () => {
  const result = parsed();
  assert.equal(result.extractionStatus, "SUCCESS");
  assert.equal(result.areaName, "샘플지역A");
  assert.equal(result.industry, "정육점");
  assert.equal(result.analysisRadiusMeters, 1_000);
  assert.equal(result.facts.livingPopulation.value, "SAMPLE_VALUE");
  assert.equal(result.facts.livingPopulation.valueKind, "SOURCE_TEXT");
  assert.equal(result.facts.sales, undefined);
  assert.deepEqual(result.unknowns, []);
});

test("keeps missing fields UNKNOWN instead of converting them to zero", () => {
  const result = parsed("02_PARTIAL.pdf", "상권명: 샘플지역B\n업종: 정육점");
  assert.equal(result.extractionStatus, "PARTIAL");
  assert.equal(result.analysisRadiusMeters, null);
  assert.ok(result.unknowns.includes("analysisRadiusMeters"));
  assert.equal(Object.values(result.facts).some((fact) => fact.value === "0"), false);
});

test("rejects a non-butcher industry or radius other than one kilometer", () => {
  const result = parsed(
    "03_INVALID.pdf",
    sampleText.replace("정육점", "제과점").replace("1km", "500m"),
  );
  assert.equal(result.extractionStatus, "VALIDATION_FAILED");
  assert.deepEqual(result.sourceMetadata.errors, [
    "INDUSTRY_MISMATCH:제과점",
    "RADIUS_MISMATCH:500",
  ]);
});

test("maps facts by P page and does not create unsupported P6/P7 claims", async () => {
  const result = parsed();
  const report = await toSimpleReportInput(result, {
    geocode: async () => ({
      latitude: 37.5,
      longitude: 127,
      resolvedAddress: "서울특별시 샘플구 샘플로 1",
    }),
  });
  assert.equal(report.p3.facts[0].key, "livingPopulation");
  assert.equal(report.p4.facts[0].key, "dayOfWeek");
  assert.equal(report.p5.facts[0].key, "storeCount");
  assert.deepEqual(report.p6.claims, []);
  assert.deepEqual(report.p7.summaryClaims, []);
  assert.deepEqual(report.location, { lat: 37.5, lng: 127 });
  assert.equal(report.p2.locationVerification, "REVIEW_REQUIRED");
  assert.ok(report.unknowns.includes("location:AREA_MATCH_REVIEW_REQUIRED"));
});

test("batch validation checks format, industry, radius, period and unique area", () => {
  const batch = Array.from({ length: 9 }, (_, index) =>
    parsed(
      `${String(index + 1).padStart(2, "0")}_SAMPLE.pdf`,
      sampleText.replace("샘플지역A", `샘플지역${index + 1}`),
    ),
  );
  assert.deepEqual(validateBatch(batch), {
    fileCount: 9,
    expectedNineFiles: true,
    sameFormat: true,
    allButchers: true,
    allOneKilometer: true,
    sameReferencePeriod: true,
    uniqueAreaNames: true,
    statuses: Object.fromEntries(batch.map((item) => [item.fileName, "SUCCESS"])),
  });
});

test("parses the actual SBIZ365 next-line labels and preserves page evidence", () => {
  // REPRESENTATIVE FORMAT FIXTURE: 실제 값이 아닌 실제 양식 구조만 축약한 테스트 문구다.
  const result = parsed(
    "REPRESENTATIVE_FORMAT_SAMPLE.pdf",
    [
      "분석날짜 2026년 10월 28일\n대전광역시 서구 도안동\n정육점",
      "",
      "분석지역\n대전광역시 서구 도안동\n분석일자\n2026년 10월 28일\n분석업종\n정육점\n27개 +3.9% 235개 -1.3%\n3,651만원 -2.5% 4,071만원 -0.0%",
    ].join("\f"),
  );
  assert.equal(result.areaName, "대전광역시 서구 도안동");
  assert.equal(result.industry, "정육점");
  assert.equal(result.referencePeriod, "2026년 10월 28일");
  assert.equal(result.analysisRadiusMeters, null);
  assert.equal(result.facts.selectedStoreCount.value, "27개");
  assert.equal(result.facts.selectedStoreCount.evidence.page, 3);
  assert.equal(result.facts.estimatedMonthlyAverageSales.evidence.page, 3);
  assert.ok(result.unknowns.includes("analysisRadiusMeters"));
});
