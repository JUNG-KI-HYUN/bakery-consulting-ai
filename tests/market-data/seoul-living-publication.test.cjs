/* eslint-disable @typescript-eslint/no-require-imports -- Test loads the TypeScript module without a build step. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

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
  evaluateSeoulLivingPublication,
  publishSeoulLivingCurrent,
} = require("../../lib/market-data/ingestion/seoul-living-publication.ts");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "living-publication-"));
  const ingestRoot = path.join(repositoryRoot, "data", "ingest");
  const manifestPath = path.join(ingestRoot, "manifests", "SRC-SEOUL-LIVING", "snapshots", "snapshot.manifest.json");
  const reconciliationPath = path.join(repositoryRoot, "data", "validation", "reconciliation.json");
  const officialGeometryVerificationPath = path.join(repositoryRoot, "data", "validation", "verification.json");
  const manifest = {
    source_id: "SRC-SEOUL-LIVING",
    snapshot_id: "snapshot",
    source_reference_date: "20260906",
    status: "READY",
    source_snapshot_ready: true,
    staging: false,
    limited_run: false,
    publish_eligible: false,
    current_pointer_updated: false,
    expected_rows: 24,
    fetched_rows: 24,
    normalized_rows: 24,
    quarantine_rows: 0,
    expected_page_count: 1,
    page_count: 1,
    unique_cell_count: 2,
    ymd_distribution: { "20260906": 24 },
    cell_id_quality: { missing: 0, malformed: 0 },
    h_dng_cd_quality: { missing: 0, malformed: 0, unexpected: 0 },
    population_quality: {
      spop: { missing: 0, invalid: 0 },
      age_sex_fields: { missing: 0, invalid: 0 },
    },
    duplicate_candidate_count: 0,
    schema_validation: { missing_fields: [], unexpected_fields: [], drift_row_count: 0 },
    checksums: {
      raw_page_set_sha256: "raw",
      normalized_page_set_sha256: "normalized",
      quarantine_page_set_sha256: null,
      checkpoint_sha256: "checkpoint",
    },
    validation: {
      count_consistent: true,
      pagination_contiguous: true,
      expected_page_count_match: true,
      raw_checksum_match: true,
      normalized_checksum_match: true,
      quarantine_checksum_match: true,
      single_ymd: true,
      tt_valid: true,
      cell_id_complete: true,
      h_dng_cd_valid: true,
      schema_drift: false,
      duplicate_candidate_count: 0,
    },
    raw_path: "raw/snapshot",
    normalized_path: "normalized/snapshot",
    quarantine_path: "quarantine/snapshot",
    checkpoint_path: "raw/snapshot/checkpoint.json",
  };
  for (const relative of [manifest.raw_path, manifest.normalized_path, manifest.quarantine_path]) {
    fs.mkdirSync(path.join(ingestRoot, relative), { recursive: true });
  }
  fs.writeFileSync(path.join(ingestRoot, manifest.checkpoint_path), "{}\n");
  writeJson(manifestPath, manifest);
  writeJson(reconciliationPath, {
    metric: {
      manifest_path: path.relative(repositoryRoot, manifestPath).replaceAll("\\", "/"),
      snapshot_id: "snapshot",
      source_reference_date: "20260906",
      row_count: 24,
      unique_cell_id_count: 2,
    },
    reconciliation: {
      both: { count: 1 },
      metric_only: { count: 1, cell_ids: ["다사47256125"] },
      geometry_only: { count: 2 },
      metric_only_reconfirmed_absent_from_geometry: true,
      equations: { metric: { valid: true }, geometry: { valid: true } },
    },
  });
  writeJson(officialGeometryVerificationPath, {
    result: "READY",
    official_source: { geometry: { unique_cell_id_count: 3 } },
    local_geometry: {
      unique_cell_id_count: 3,
      official_shp_cell_id_set_equal: true,
      official_viewer_cell_id_set_equal: true,
      cell_x_cell_y_gid_mismatch_count: 0,
    },
    metric_only_cell: {
      cell_id: "다사47256125",
      official_shp_present: false,
      official_grid_viewer_present: false,
      local_geometry_present: false,
      metric_history: [
        { source_date: "2026-09-06", row_count: 24, spop_status: "suppressed" },
      ],
    },
    compatibility: {
      status: "READY",
      metric_to_geometry: "READY_WITH_EXPLICIT_MISMATCH_POLICY",
      policies: {
        both: "공간집계 입력 사용 가능",
        metric_only: "공간집계 제외, REVIEW_REQUIRED, geometry 임의 생성 금지",
        geometry_only: "NO_OBSERVATION, population 0 자동입력 금지",
      },
    },
  });
  return {
    repositoryRoot,
    ingestRoot,
    manifestPath,
    reconciliationPath,
    officialGeometryVerificationPath,
    now: () => new Date("2026-09-11T06:00:00.000Z"),
  };
}

test("eligible publication writes a decision and source-only current pointer without changing the manifest", async (t) => {
  const options = fixture();
  t.after(() => fs.rmSync(options.repositoryRoot, { recursive: true, force: true }));
  const before = fs.readFileSync(options.manifestPath, "utf8");
  const existingCurrent = path.join(
    options.ingestRoot,
    "manifests",
    "SRC-SEOUL-LIVING",
    "current.json",
  );
  fs.writeFileSync(existingCurrent, '{"snapshot_id":"previous"}\n');

  const result = await publishSeoulLivingCurrent(options);

  assert.equal(result.artifact.decision, "ELIGIBLE");
  assert.equal(result.artifact.gate_checks.every((gate) => gate.passed), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(result.currentPath, "utf8")), result.pointer);
  assert.equal(result.pointer.publication_scope, "SOURCE_CURRENT_ONLY");
  assert.equal(result.pointer.spatial_aggregation_ready, false);
  assert.match(result.artifact.mismatch_policy.geometry_only, /population=null/);
  assert.match(result.artifact.mismatch_policy.metric_only, /metric 삭제 금지/);
  assert.equal(fs.readFileSync(options.manifestPath, "utf8"), before);
  assert.equal(fs.readdirSync(path.dirname(result.currentPath)).some((name) => name.endsWith(".tmp")), false);
});

test("a blocked gate preserves an existing current pointer", async (t) => {
  const options = fixture();
  t.after(() => fs.rmSync(options.repositoryRoot, { recursive: true, force: true }));
  const currentPath = path.join(options.ingestRoot, "manifests", "SRC-SEOUL-LIVING", "current.json");
  const existing = '{"snapshot_id":"previous"}\n';
  fs.writeFileSync(currentPath, existing);
  const manifest = JSON.parse(fs.readFileSync(options.manifestPath, "utf8"));
  manifest.validation.pagination_contiguous = false;
  writeJson(options.manifestPath, manifest);

  const evaluation = await evaluateSeoulLivingPublication(options);
  assert.equal(evaluation.artifact.decision, "BLOCKED");
  await assert.rejects(() => publishSeoulLivingCurrent(options), /BLOCKED/);
  assert.equal(fs.readFileSync(currentPath, "utf8"), existing);
  assert.equal(fs.existsSync(evaluation.decisionPath), false);
});
