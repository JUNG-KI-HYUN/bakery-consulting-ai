/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { after, afterEach, beforeEach, test } = require("node:test");
const ts = require("typescript");

const originalLoader = require.extensions[".ts"];
const originalFetch = global.fetch;
const originalApiKey = process.env.SEOUL_OPEN_DATA_API_KEY;
const contractPath = require("node:path").join(
  __dirname,
  "../../data/seoul-market/v1.1-final/13_SOURCE_INGEST/source-contracts/SOURCE_CONTRACTS.json",
);

require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  SEOUL_LIVING_API_FIELDS,
  fetchSeoulLivingObservations,
  fetchSeoulLivingPage,
  validateSeoulLivingApiRows,
} = require("../../lib/market-data/clients/seoul-living.ts");

function apiRow(overrides = {}) {
  const row = Object.fromEntries(
    SEOUL_LIVING_API_FIELDS.map((field) => [field, "10"]),
  );

  return {
    ...row,
    YMD: "20260906",
    TT: "00",
    H_DNG_CD: "11110515",
    CELL_ID: "sample-grid-id",
    SPOP: "12.5",
    ...overrides,
  };
}

function apiResponse(rows, totalCount = rows.length) {
  return JSON.stringify({
    Se250MSpopLocalResd: {
      list_total_count: totalCount,
      RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다" },
      row: rows,
    },
  });
}

beforeEach(() => {
  process.env.SEOUL_OPEN_DATA_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
});

after(() => {
  if (originalLoader) require.extensions[".ts"] = originalLoader;
  else delete require.extensions[".ts"];

  if (originalApiKey === undefined) delete process.env.SEOUL_OPEN_DATA_API_KEY;
  else process.env.SEOUL_OPEN_DATA_API_KEY = originalApiKey;
  global.fetch = originalFetch;
});

test("공식 API schema를 observation으로 변환한다", async () => {
  global.fetch = async () => new Response(apiResponse([apiRow()]));

  const observations = await fetchSeoulLivingObservations({ start: 1, end: 1 });

  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0], {
    sourceId: "SRC-SEOUL-LIVING",
    referencePeriod: "2026-09-06T00:00",
    geographyType: "living_grid",
    geographyId: "sample-grid-id",
    metric: "living_population_total",
    value: 12.5,
    unit: "people",
    dataStatus: "available",
    metadata: {
      rawDate: "20260906",
      rawHour: "00",
      administrativeDongCode: "11110515",
    },
  });
});

test("필수 필드 누락과 예상하지 않은 필드를 schema 오류로 감지한다", () => {
  const missing = apiRow();
  delete missing.CELL_ID;
  assert.throws(() => validateSeoulLivingApiRows([missing]), /누락 필드: CELL_ID/);

  assert.throws(
    () => validateSeoulLivingApiRows([{ ...apiRow(), UNKNOWN_FIELD: "x" }]),
    /예상하지 않은 필드: UNKNOWN_FIELD/,
  );
});

test("잘못된 날짜와 grid ID 누락을 invalid observation으로 보존한다", async () => {
  global.fetch = async () =>
    new Response(apiResponse([apiRow({ YMD: "20260230", CELL_ID: "" })]));

  const [observation] = await fetchSeoulLivingObservations({ start: 1, end: 1 });

  assert.equal(observation.referencePeriod, null);
  assert.equal(observation.geographyId, null);
  assert.equal(observation.value, null);
  assert.equal(observation.dataStatus, "invalid");
});

test("억제값, 비수치, 음수 인구를 0으로 바꾸지 않는다", async () => {
  global.fetch = async () =>
    new Response(
      apiResponse([
        apiRow({ CELL_ID: "suppressed", SPOP: "*" }),
        apiRow({ CELL_ID: "not-number", SPOP: "NaN" }),
        apiRow({ CELL_ID: "negative", SPOP: "-1" }),
        apiRow({ CELL_ID: "zero", SPOP: "0" }),
      ]),
    );

  const observations = await fetchSeoulLivingObservations({ start: 1, end: 4 });

  assert.deepEqual(
    observations.map(({ value, dataStatus }) => ({ value, dataStatus })),
    [
      { value: null, dataStatus: "suppressed" },
      { value: null, dataStatus: "invalid" },
      { value: null, dataStatus: "invalid" },
      { value: 0, dataStatus: "available" },
    ],
  );
});

test("기존 서울 API pagination을 서비스명과 함께 재사용한다", async () => {
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(apiResponse([apiRow()], 253346));
  };

  const page = await fetchSeoulLivingPage({ start: 101, end: 200 });

  assert.equal(page.service, "Se250MSpopLocalResd");
  assert.equal(page.start, 101);
  assert.equal(page.end, 200);
  assert.equal(page.totalCount, 253346);
  assert.match(page.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(requestedUrl, /\/json\/Se250MSpopLocalResd\/101\/200$/);
});

test("Source Contract는 API 필드와 날짜·공간 결합 제한을 분리한다", () => {
  const document = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const contract = document.contracts.find(
    ({ source_id: sourceId }) => sourceId === "SRC-SEOUL-LIVING",
  );

  assert.equal(contract.service_name, "Se250MSpopLocalResd");
  assert.equal(
    contract.source_column_maps_by_version.OPEN_API_Se250MSpopLocalResd.base_date,
    "YMD",
  );
  assert.equal(
    contract.source_column_maps_by_version.OPEN_API_Se250MSpopLocalResd.cell_id,
    "CELL_ID",
  );
  assert.equal(contract.license_status, "CONFIRMED");
  assert.equal(contract.compatibility_requirement.join_allowed, false);
  assert.match(contract.usage_note, /YMD는 data reference date/);
  assert.match(contract.usage_note, /자동 Join을 금지/);
});
