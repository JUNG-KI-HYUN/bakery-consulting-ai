/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");
const ts = require("typescript");

const originalLoader = require.extensions[".ts"];
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
} = require("../../lib/market-data/clients/seoul-living.ts");
const {
  runSeoulLivingIngestion,
} = require("../../lib/market-data/ingestion/seoul-living-ingestion.ts");
const manifestSchema = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../../data/seoul-market/v1.1-final/13_SOURCE_INGEST/manifests/LIVING_API_SNAPSHOT_MANIFEST_SCHEMA.json",
    ),
    "utf8",
  ),
);

after(() => {
  if (originalLoader) require.extensions[".ts"] = originalLoader;
  else delete require.extensions[".ts"];
});

function fixtureRow(id, overrides = {}) {
  const row = Object.fromEntries(
    SEOUL_LIVING_API_FIELDS.map((field) => [field, "10"]),
  );
  return {
    ...row,
    YMD: "20260906",
    TT: String(id % 2).padStart(2, "0"),
    H_DNG_CD: "11110515",
    CELL_ID: String(10000000000 + id),
    SPOP: "12.5",
    ...overrides,
  };
}

function fixtureFetcher(totalCount, rowsByStart, options = {}) {
  const starts = [];
  let calls = 0;
  const fetchRawPage = async ({ startIndex, endIndex }) => {
    calls += 1;
    starts.push(startIndex);
    if (options.failFirst && calls === 1) {
      throw Object.assign(new Error("fixture transient failure"), {
        kind: "http",
        httpStatus: 500,
      });
    }
    const rows = rowsByStart.get(startIndex) ?? [];
    return {
      service: "Se250MSpopLocalResd",
      start: startIndex,
      end: endIndex,
      totalCount,
      rows,
      rawResponse: JSON.stringify({
        fixture: true,
        service: "Se250MSpopLocalResd",
        startIndex,
        endIndex,
        rows,
      }),
      fetchedAt: "2026-09-11T06:00:00.000Z",
    };
  };
  fetchRawPage.starts = () => starts;
  fetchRawPage.calls = () => calls;
  return fetchRawPage;
}

function createIngestRoot(context) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "frameone-living-ingest-test-"),
  );
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const deterministicDependencies = (fetchRawPage, extra = {}) => ({
  fetchRawPage,
  delay: async () => {},
  random: () => 0,
  now: () => new Date("2026-09-11T06:00:00.000Z"),
  ...extra,
});

test("--full 또는 --max-pages가 없거나 동시에 있으면 수집 전에 거부한다", async (context) => {
  const root = createIngestRoot(context);
  await assert.rejects(
    () => runSeoulLivingIngestion({ ingestRoot: root }),
    /정확히 하나/,
  );
  await assert.rejects(
    () =>
      runSeoulLivingIngestion({ ingestRoot: root, full: true, maxPages: 1 }),
    /정확히 하나/,
  );
});

test("limited mode는 raw/checkpoint/normalized/manifest만 staging에 만들고 current를 쓰지 않는다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(
    4,
    new Map([[1, [fixtureRow(1), fixtureRow(2)]]]),
  );
  const result = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.equal(result.manifest.status, "VALIDATING");
  assert.equal(result.manifest.staging, true);
  assert.equal(result.manifest.fetched_rows, 2);
  assert.equal(result.manifest.normalized_rows, 2);
  assert.equal(result.manifest.quarantine_rows, 0);
  assert.equal(result.currentPointerUpdated, false);
  assert.match(result.manifest.raw_path, /\.staging/);
  assert.equal(
    fs.existsSync(
      path.join(root, "manifests", "SRC-SEOUL-LIVING", "current.json"),
    ),
    false,
  );
  assert.equal(fs.existsSync(result.manifestPath), true);
});

test("full mode는 total count의 마지막 짧은 page까지 수집하고 immutable snapshot만 만든다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(
    3,
    new Map([
      [1, [fixtureRow(1), fixtureRow(2)]],
      [3, [fixtureRow(3)]],
    ]),
  );
  const result = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    full: true,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.deepEqual(fetchRawPage.starts(), [1, 3]);
  assert.equal(result.manifest.status, "READY");
  assert.equal(result.manifest.source_reference_date, "20260906");
  assert.equal(result.manifest.expected_rows, 3);
  assert.equal(result.manifest.fetched_rows, 3);
  assert.equal(result.manifest.normalized_rows, 3);
  assert.equal(result.manifest.page_count, 2);
  assert.equal(result.manifest.unique_cell_count, 3);
  assert.deepEqual(result.manifest.ymd_distribution, { 20260906: 3 });
  assert.deepEqual(result.manifest.tt_distribution, { "00": 1, "01": 2 });
  assert.equal(result.manifest.validation.count_consistent, true);
  assert.equal(result.manifest.validation.single_ymd, true);
  assert.equal(result.manifest.checksums.raw_page_set_sha256.length, 64);
  assert.equal(result.manifest.checksums.normalized_page_set_sha256.length, 64);
  assert.equal(result.manifest.checksums.checkpoint_sha256.length, 64);
  assert.equal(result.manifest.current_pointer_updated, false);
  assert.equal(result.manifest.publish_eligible, false);
  assert.equal(result.manifest.staging, false);
  assert.equal(result.manifest.raw_path.includes(".staging"), false);
  for (const field of manifestSchema.required) {
    assert.equal(
      Object.hasOwn(result.manifest, field),
      true,
      `manifest required field missing: ${field}`,
    );
  }
  assert.equal(
    fs.existsSync(
      path.join(root, "manifests", "SRC-SEOUL-LIVING", "current.json"),
    ),
    false,
  );
});

test("mixed YMD와 잘못된 TT/CELL_ID/H_DNG_CD는 제거하지 않고 REVIEW_REQUIRED로 남긴다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(
    2,
    new Map([
      [
        1,
        [
          fixtureRow(1),
          fixtureRow(2, {
            YMD: "20260905",
            TT: "24",
            CELL_ID: "",
            H_DNG_CD: "invalid",
          }),
        ],
      ],
    ]),
  );
  const result = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    full: true,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.equal(result.manifest.status, "REVIEW_REQUIRED");
  assert.equal(result.manifest.source_reference_date, null);
  assert.equal(result.manifest.validation.single_ymd, false);
  assert.equal(result.manifest.validation.tt_valid, false);
  assert.equal(result.manifest.cell_id_quality.missing, 1);
  assert.equal(result.manifest.h_dng_cd_quality.malformed, 1);
  assert.equal(result.manifest.normalized_rows, 2);
  assert.equal(result.manifest.staging, true);
});

test("suppressed/missing/invalid 인구와 duplicate candidate를 실제 값과 구분한다", async (context) => {
  const root = createIngestRoot(context);
  const duplicate = fixtureRow(1, { SPOP: "*" });
  const fetchRawPage = fixtureFetcher(
    4,
    new Map([
      [
        1,
        [
          fixtureRow(1),
          duplicate,
          fixtureRow(3, { SPOP: "" }),
          fixtureRow(4, { SPOP: "-1", M00: "NaN" }),
        ],
      ],
    ]),
  );
  const result = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 4,
    full: true,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.deepEqual(result.manifest.population_quality.spop, {
    available: 1,
    suppressed: 1,
    missing: 1,
    invalid: 1,
  });
  assert.equal(result.manifest.population_quality.age_sex_fields.invalid, 1);
  assert.equal(result.manifest.duplicate_candidate_count, 1);
  assert.equal(result.manifest.status, "REVIEW_REQUIRED");
});

test("schema drift row는 quarantine하고 fetched = normalized + quarantine를 유지한다", async (context) => {
  const root = createIngestRoot(context);
  const drift = fixtureRow(2, { UNKNOWN_FIELD: "fixture" });
  delete drift.CELL_ID;
  const fetchRawPage = fixtureFetcher(
    2,
    new Map([[1, [fixtureRow(1), drift]]]),
  );
  const result = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    full: true,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.equal(result.manifest.status, "REVIEW_REQUIRED");
  assert.equal(result.manifest.fetched_rows, 2);
  assert.equal(result.manifest.normalized_rows, 1);
  assert.equal(result.manifest.quarantine_rows, 1);
  assert.equal(result.manifest.validation.count_consistent, true);
  assert.deepEqual(result.manifest.schema_validation.missing_fields, ["CELL_ID"]);
  assert.deepEqual(result.manifest.schema_validation.unexpected_fields, [
    "UNKNOWN_FIELD",
  ]);
  assert.equal(result.manifest.schema_validation.drift_row_count, 1);
});

test("resume은 완료 page checksum을 검증하고 다음 page부터 이어간다", async (context) => {
  const root = createIngestRoot(context);
  const rows = new Map([
    [1, [fixtureRow(1), fixtureRow(2)]],
    [3, [fixtureRow(3), fixtureRow(4)]],
  ]);
  const first = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(fixtureFetcher(4, rows)),
  });
  const resumeFetcher = fixtureFetcher(4, rows);
  const resumed = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    maxPages: 2,
    resumeSnapshotId: first.manifest.snapshot_id,
    dependencies: deterministicDependencies(resumeFetcher, {
      now: () => new Date("2026-09-11T06:01:00.000Z"),
    }),
  });

  assert.deepEqual(resumeFetcher.starts(), [3]);
  assert.equal(resumed.manifest.fetched_rows, 4);
  assert.equal(resumed.manifest.page_count, 2);
  assert.equal(resumed.manifest.status, "VALIDATING");
  assert.equal(resumed.manifest.duration_ms, 60_000);
});

test("resume은 변경된 raw page checksum을 신뢰하지 않는다", async (context) => {
  const root = createIngestRoot(context);
  const rows = new Map([[1, [fixtureRow(1), fixtureRow(2)]]]);
  const first = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(fixtureFetcher(2, rows)),
  });
  const rawPage = path.join(
    root,
    first.manifest.raw_path,
    "pages",
    "000001-000002.json",
  );
  fs.appendFileSync(rawPage, "corruption");

  await assert.rejects(
    () =>
      runSeoulLivingIngestion({
        ingestRoot: root,
        pageSize: 2,
        maxPages: 1,
        resumeSnapshotId: first.manifest.snapshot_id,
        dependencies: deterministicDependencies(fixtureFetcher(2, rows)),
      }),
    /checksum/,
  );
});

test("transient HTTP 실패는 최대 시도 범위에서 재시도한다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(
    1,
    new Map([[1, [fixtureRow(1)]]]),
    { failFirst: true },
  );
  const result = await runSeoulLivingIngestion({
    ingestRoot: root,
    pageSize: 1,
    maxPages: 1,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.equal(fetchRawPage.calls(), 2);
  assert.equal(result.manifest.fetched_rows, 1);
});
