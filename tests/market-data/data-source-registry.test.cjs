/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, test } = require("node:test");
const ts = require("typescript");

const registryPath = path.join(
  __dirname,
  "../../data/seoul-market/v1.1-final/13_SOURCE_INGEST/DATA_SOURCE_REGISTRY.json",
);
const originalLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  getAllDataSources,
  getDataSourceById,
  validateDataSourceRegistry,
} = require("../../lib/market-data/data-source-registry.ts");

after(() => {
  if (originalLoader) require.extensions[".ts"] = originalLoader;
  else delete require.extensions[".ts"];
});

function registryFixture() {
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function invalidField(field, value, sourceIndex = 0) {
  const fixture = registryFixture();
  fixture.sources[sourceIndex][field] = value;
  return fixture;
}

test("Registry 정상 로드와 서울 전체 범위를 검증한다", () => {
  const registry = validateDataSourceRegistry(registryFixture());
  assert.equal(registry.schemaVersion, "1.0.0");
  assert.equal(registry.scope, "SEOUL_ALL_25_DISTRICTS");
  assert.equal(getAllDataSources().length, 20);
});

test("모든 canonical sourceId와 alias는 unique하다", () => {
  const sources = getAllDataSources();
  const allIds = sources.flatMap((source) => [source.sourceId, ...source.aliases]);
  assert.equal(new Set(allIds).size, allIds.length);

  const duplicate = registryFixture();
  duplicate.sources[1].sourceId = duplicate.sources[0].sourceId;
  assert.throws(() => validateDataSourceRegistry(duplicate), /중복 sourceId/);
});

test("getDataSourceById는 canonical ID와 기존 alias를 조회한다", () => {
  assert.equal(getDataSourceById("SRC-SEOUL-SALES")?.category, "SALES");
  assert.equal(getDataSourceById("SRC-SEOUL-OA-15560")?.sourceId, "SRC-SEOUL-AREA");
  assert.equal(getDataSourceById("SRC-NOT-REGISTERED"), undefined);
});

test("ingestionMode validation은 미지원 값을 거부한다", () => {
  assert.throws(
    () => validateDataSourceRegistry(invalidField("ingestionMode", "FULL_DAILY")),
    /ingestionMode 값이 허용 enum이 아닙니다/,
  );
});

test("connectionStatus validation은 Runtime Health 혼입을 거부한다", () => {
  assert.throws(
    () => validateDataSourceRegistry(invalidField("connectionStatus", "HEALTHY")),
    /connectionStatus 값이 허용 enum이 아닙니다/,
  );
});

test("manualPolicy validation은 정해진 세 정책만 허용한다", () => {
  assert.throws(
    () => validateDataSourceRegistry(invalidField("manualPolicy", "MANUAL_ALWAYS")),
    /manualPolicy 값이 허용 enum이 아닙니다/,
  );
});

test("source refresh와 FRAMEONE check frequency를 각각 검증한다", () => {
  assert.throws(
    () => validateDataSourceRegistry(invalidField("sourceRefreshFrequency", "HOURLY")),
    /sourceRefreshFrequency 값이 허용 enum이 아닙니다/,
  );
  assert.throws(
    () => validateDataSourceRegistry(invalidField("frameoneCheckFrequency", "YEARLY")),
    /frameoneCheckFrequency 값이 허용 enum이 아닙니다/,
  );
});

test("authEnv에는 승인된 환경변수 이름만 허용하고 실제 Secret 형태를 거부한다", () => {
  assert.throws(
    () => validateDataSourceRegistry(invalidField("authEnv", ["actual-secret-value-1234567890"])),
    /authEnv 값이 허용 enum이 아닙니다/,
  );
});

test("contractRef는 기존 Source Contract ID와 연결되어야 한다", () => {
  assert.throws(
    () => validateDataSourceRegistry(invalidField("contractRef", "SRC-NOT-CONTRACTED")),
    /기존 Source Contract와 연결되지 않습니다/,
  );
  assert.equal(getDataSourceById("SRC-SEOUL-CROSSWALK")?.contractRef, "SRC-SEOUL-CROSSWALK");
});

test("NOT_CONNECTED Source도 정적 Registry에서 안전하게 로드한다", () => {
  const source = getDataSourceById("SRC-LOCALDATA");
  assert.equal(source?.connectionStatus, "NOT_CONNECTED");
  assert.equal(source?.priority, "P0");
});

test("On-demand Source는 snapshot field 없이 valid하다", () => {
  const source = getDataSourceById("SRC-KAKAO-LOCAL-MAP");
  assert.equal(source?.ingestionMode, "ON_DEMAND");
  assert.equal(Object.hasOwn(source, "currentSnapshot"), false);
});

test("SGIS는 복수 auth env 이름을 유지한다", () => {
  assert.deepEqual(getDataSourceById("SRC-SGIS")?.authEnv, [
    "SGIS_CONSUMER_KEY",
    "SGIS_CONSUMER_SECRET",
  ]);
});
