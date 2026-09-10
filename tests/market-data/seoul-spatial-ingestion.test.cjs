/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");
const ts = require("typescript");

const sourceContractsPath = path.join(
  __dirname,
  "../../data/seoul-market/v1.1-final/13_SOURCE_INGEST/source-contracts/SOURCE_CONTRACTS.json",
);

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
  calculateExpectedPageCount,
  checksum,
  districtFileKey,
  pageFilename,
  runSeoulSpatialIngestion,
  serializeNdjsonRecord,
} = require("../../lib/market-data/ingestion/seoul-spatial-ingestion.ts");

after(() => {
  if (originalLoader) require.extensions[".ts"] = originalLoader;
  else delete require.extensions[".ts"];
});

function fixtureRow(id, districtCode = "11110", overrides = {}) {
  return {
    NODE_TYPE: "fixture-node",
    NODE_WKT: `POINT (${id} ${id})`,
    NODE_ID: `N-${id}`,
    NODE_TYPE_CD: "N",
    LNKG_WKT: id % 2 === 0 ? "" : `LINESTRING (${id} ${id}, ${id + 1} ${id + 1})`,
    LNKG_ID: `L-${id}`,
    LNKG_TYPE_CD: "L",
    BGNG_LNKG_ID: null,
    END_LNKG_ID: null,
    LNKG_LEN: "1.5",
    SGG_CD: districtCode,
    SGG_NM: districtCode === "11110" ? "fixture-district" : "unknown-fixture",
    EMD_CD: "11110101",
    EMD_NM: "fixture-dong",
    ...overrides,
  };
}

function fixtureFetcher(totalCount, rowsByStart, options = {}) {
  let calls = 0;
  const fetchRawPage = async ({ dataset, startIndex, endIndex }) => {
    calls += 1;
    if (options.failFirst && calls === 1) {
      throw Object.assign(new Error("fixture transient failure"), { kind: "http", httpStatus: 500 });
    }
    const service = dataset === "pedestrian" ? "TbTraficWlkNet" : "tbTraficCrsng";
    const rows = rowsByStart.get(startIndex) ?? [];
    return {
      service,
      start: startIndex,
      end: endIndex,
      totalCount,
      rows,
      rawResponse: JSON.stringify({ fixture: true, service, startIndex, endIndex, rows }),
      source: "Seoul Open Data Plaza",
      sourceBasis: "2020 기준",
      fetchedAt: "2026-09-10T00:00:00.000Z",
    };
  };
  fetchRawPage.calls = () => calls;
  return fetchRawPage;
}

function createIngestRoot(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-spatial-ingest-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const deterministicDependencies = (fetchRawPage, extra = {}) => ({
  fetchRawPage,
  delay: async () => {},
  random: () => 0,
  now: () => new Date("2026-09-10T00:00:00.000Z"),
  ...extra,
});

test("pedestrian/crosswalk 공식 source metadata gate를 통과하되 geometry Join은 차단한다", () => {
  const contracts = JSON.parse(fs.readFileSync(sourceContractsPath, "utf8")).contracts;
  const expectedBySourceId = {
    "SRC-SEOUL-PEDESTRIAN-NETWORK": {
      dataset_name: "서울시 자치구별 도보 네트워크 공간정보",
      service_name: "TbTraficWlkNet",
      source_reference: "https://data.seoul.go.kr/dataList/OA-21208/S/1/datasetView.do",
    },
    "SRC-SEOUL-CROSSWALK": {
      dataset_name: "서울시 대로변 횡단보도 위치정보",
      service_name: "tbTraficCrsng",
      source_reference: "https://data.seoul.go.kr/dataList/OA-21209/S/1/datasetView.do",
    },
  };

  for (const [sourceId, sourceSpecific] of Object.entries(expectedBySourceId)) {
    const contract = contracts.find((candidate) => candidate.source_id === sourceId);
    assert.ok(contract, `${sourceId} contract missing`);
    assert.deepEqual(
      {
        dataset_name: contract.dataset_name,
        service_name: contract.service_name,
        source_reference: contract.source_reference,
        institution: contract.institution,
        source_system: contract.source_system,
        source_date: contract.source_date,
        coordinate_system: contract.coordinate_system,
        license_status: contract.license_status,
        license_name: contract.license_name,
        attribution_required: contract.attribution_required,
        commercial_use_allowed: contract.commercial_use_allowed,
        modification_allowed: contract.modification_allowed,
        third_party_copyright: contract.third_party_copyright,
      },
      {
        ...sourceSpecific,
        institution: "서울특별시",
        source_system: "교통운영 및 정보서비스시스템",
        source_date: "2020 기준",
        coordinate_system: "WGS84",
        license_status: "CONFIRMED",
        license_name: "공공누리 제1유형",
        attribution_required: true,
        commercial_use_allowed: true,
        modification_allowed: true,
        third_party_copyright: "없음",
      },
    );
    assert.equal(contract.status, "READY");
    assert.equal(contract.compatibility_requirement.status, "PASS");
    assert.equal(contract.compatibility_requirement.join_allowed, false);
    assert.match(contract.usage_note, /2020 기준/);
    assert.match(contract.usage_note, /사람 검수/);
  }
});

test("Seoul Spatial ingestion 순수 helper", () => {
  assert.equal(calculateExpectedPageCount(491082, 1000), 492);
  assert.equal(calculateExpectedPageCount(31080, 1000), 32);
  assert.throws(() => calculateExpectedPageCount(1, 1001), /1~1000/);
  assert.equal(pageFilename(1, 1000), "000001-001000.json");
  assert.equal(districtFileKey("11110"), "11110");
  assert.equal(districtFileKey("1111000000"), "1111000000");
  assert.equal(districtFileKey("invalid"), "UNKNOWN");
  assert.equal(districtFileKey(null), "UNKNOWN");
  assert.equal(serializeNdjsonRecord({ fixture: true }), "{\"fixture\":true}\n");
  assert.equal(checksum("fixture").length, 64);
});

test("limited run은 raw/checkpoint/district NDJSON/manifest를 만들고 current를 publish하지 않는다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(3, new Map([
    [1, [fixtureRow(1), fixtureRow(2, null)]],
  ]));
  const result = await runSeoulSpatialIngestion({
    dataset: "pedestrian",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(fetchRawPage),
  });

  assert.equal(result.manifest.status, "VALIDATING");
  assert.equal(result.manifest.limited_run, true);
  assert.equal(result.manifest.publish_eligible, false);
  assert.equal(result.manifest.expected_page_count, 2);
  assert.equal(result.manifest.fetched_page_count, 1);
  assert.equal(result.manifest.fetched_row_count, 2);
  assert.equal(result.manifest.stored_count, 2);
  assert.equal(result.manifest.validation.link_wkt_missing_count, 1);
  assert.equal(result.currentPointerUpdated, false);
  const sourceId = result.manifest.source_id;
  const snapshotId = result.manifest.snapshot_id;
  const rawPage = path.join(root, "raw", sourceId, ".staging", snapshotId, "pages", "000001-000002.json");
  const checkpoint = path.join(root, "raw", sourceId, ".staging", snapshotId, "checkpoint.json");
  const knownDistrict = path.join(root, "normalized", sourceId, ".staging", snapshotId, "districts", "11110.ndjson");
  const unknownDistrict = path.join(root, "normalized", sourceId, ".staging", snapshotId, "districts", "UNKNOWN.ndjson");
  const current = path.join(root, "manifests", sourceId, "current.json");
  assert.equal(fs.existsSync(rawPage), true);
  assert.equal(fs.existsSync(checkpoint), true);
  assert.equal(fs.readFileSync(knownDistrict, "utf8").trim().split("\n").length, 1);
  assert.equal(fs.readFileSync(unknownDistrict, "utf8").trim().split("\n").length, 1);
  assert.equal(fs.existsSync(current), false);
  const checkpointData = JSON.parse(fs.readFileSync(checkpoint, "utf8"));
  assert.equal(checkpointData.completed_pages[0].raw_sha256, checksum(fs.readFileSync(rawPage)));
});

test("resume은 checksum을 검증하고 다음 미완료 page부터 이어간다", async (context) => {
  const root = createIngestRoot(context);
  const rows = new Map([
    [1, [fixtureRow(1), fixtureRow(2)]],
    [3, [fixtureRow(3), fixtureRow(4)]],
  ]);
  const firstFetcher = fixtureFetcher(4, rows);
  const first = await runSeoulSpatialIngestion({
    dataset: "crosswalk",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(firstFetcher),
  });
  const resumedStarts = [];
  const resumeFetcher = async (request) => {
    resumedStarts.push(request.startIndex);
    return fixtureFetcher(4, rows)(request);
  };
  const resumed = await runSeoulSpatialIngestion({
    dataset: "crosswalk",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 2,
    resumeSnapshotId: first.manifest.snapshot_id,
    dependencies: deterministicDependencies(resumeFetcher),
  });
  assert.deepEqual(resumedStarts, [3]);
  assert.equal(resumed.manifest.fetched_page_count, 2);
  assert.equal(resumed.manifest.fetched_row_count, 4);
  assert.equal(resumed.manifest.status, "VALIDATING");
});

test("resume은 변경된 raw page checksum을 완료 page로 신뢰하지 않는다", async (context) => {
  const root = createIngestRoot(context);
  const rows = new Map([[1, [fixtureRow(1), fixtureRow(2)]]]);
  const first = await runSeoulSpatialIngestion({
    dataset: "pedestrian",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(fixtureFetcher(2, rows)),
  });
  const rawPage = path.join(
    root,
    "raw",
    first.manifest.source_id,
    ".staging",
    first.manifest.snapshot_id,
    "pages",
    "000001-000002.json",
  );
  fs.appendFileSync(rawPage, "corruption");
  await assert.rejects(() => runSeoulSpatialIngestion({
    dataset: "pedestrian",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    resumeSnapshotId: first.manifest.snapshot_id,
    dependencies: deterministicDependencies(fixtureFetcher(2, rows)),
  }), /checksum/);
});

test("transient HTTP 실패는 제한 내에서 재시도한다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(1, new Map([[1, [fixtureRow(1)]]]), { failFirst: true });
  const result = await runSeoulSpatialIngestion({
    dataset: "pedestrian",
    ingestRoot: root,
    pageSize: 1,
    maxPages: 1,
    dependencies: deterministicDependencies(fetchRawPage),
  });
  assert.equal(fetchRawPage.calls(), 2);
  assert.equal(result.manifest.stored_count, 1);
});

test("parser 실패 row는 quarantine하고 snapshot을 publish하지 않는다", async (context) => {
  const root = createIngestRoot(context);
  const fetchRawPage = fixtureFetcher(2, new Map([[1, [fixtureRow(1), fixtureRow(2, "11110", { FORCE_PARSE_FAILURE: true })]]]));
  await assert.rejects(() => runSeoulSpatialIngestion({
    dataset: "pedestrian",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(fetchRawPage, {
      parseRow: (row) => {
        if (row.FORCE_PARSE_FAILURE) throw new Error("fixture parser failure");
        return {
          nodeWkt: row.NODE_WKT,
          nodeId: row.NODE_ID,
          linkWkt: row.LNKG_WKT,
          linkId: row.LNKG_ID,
          districtCode: row.SGG_CD,
          districtName: row.SGG_NM,
        };
      },
    }),
  }), /PARSING_FAILURE/);
  const sourceRoot = path.join(root, "manifests", "SRC-SEOUL-PEDESTRIAN-NETWORK");
  const manifestName = fs.readdirSync(sourceRoot).find((name) => name.endsWith(".manifest.json"));
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, manifestName), "utf8"));
  assert.equal(manifest.status, "FAILED");
  assert.equal(manifest.quarantined_count, 1);
  assert.equal(manifest.validation.parsing_failure_count, 1);
  assert.equal(fs.existsSync(path.join(sourceRoot, "current.json")), false);
  const quarantine = path.join(
    root,
    "quarantine",
    manifest.source_id,
    ".staging",
    manifest.snapshot_id,
    "parse-failures.ndjson",
  );
  assert.equal(fs.existsSync(quarantine), true);
  assert.equal(fs.readFileSync(quarantine, "utf8").trim().split("\n").length, 1);
});

test("count validation 실패와 limited run은 기존 current pointer를 바꾸지 않는다", async (context) => {
  const root = createIngestRoot(context);
  const sourceRoot = path.join(root, "manifests", "SRC-SEOUL-CROSSWALK");
  fs.mkdirSync(sourceRoot, { recursive: true });
  const current = path.join(sourceRoot, "current.json");
  fs.writeFileSync(current, "{\"snapshot_id\":\"existing\"}\n");
  const before = fs.readFileSync(current, "utf8");
  const shortPageFetcher = fixtureFetcher(3, new Map([[1, [fixtureRow(1)]]]));
  await assert.rejects(() => runSeoulSpatialIngestion({
    dataset: "crosswalk",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(shortPageFetcher),
  }), /row count/);
  assert.equal(fs.readFileSync(current, "utf8"), before);

  const validFetcher = fixtureFetcher(3, new Map([[1, [fixtureRow(1), fixtureRow(2)]]]));
  const limited = await runSeoulSpatialIngestion({
    dataset: "crosswalk",
    ingestRoot: root,
    pageSize: 2,
    maxPages: 1,
    dependencies: deterministicDependencies(validFetcher),
  });
  assert.equal(limited.currentPointerUpdated, false);
  assert.equal(fs.readFileSync(current, "utf8"), before);
});

test("완전한 fixture snapshot만 immutable 경로와 current pointer로 publish한다", async (context) => {
  const root = createIngestRoot(context);
  const sourceRoot = path.join(root, "manifests", "SRC-SEOUL-PEDESTRIAN-NETWORK");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "current.json"), "{\"snapshot_id\":\"previous\"}\n");
  const fetchRawPage = fixtureFetcher(2, new Map([[1, [fixtureRow(1), fixtureRow(2)]]]));
  const result = await runSeoulSpatialIngestion({
    dataset: "pedestrian",
    ingestRoot: root,
    pageSize: 2,
    full: true,
    dependencies: deterministicDependencies(fetchRawPage),
  });
  assert.equal(result.manifest.status, "READY");
  assert.equal(result.manifest.validation.ready, true);
  assert.equal(result.currentPointerUpdated, true);
  assert.equal(result.manifest.limited_run, false);
  assert.equal(result.manifest.publish_eligible, true);
  assert.equal(result.manifest.raw_path.includes(".staging"), false);
  assert.equal(result.manifest.normalized_path.includes(".staging"), false);
  const current = JSON.parse(fs.readFileSync(path.join(root, "manifests", result.manifest.source_id, "current.json"), "utf8"));
  assert.equal(current.snapshot_id, result.manifest.snapshot_id);
});
