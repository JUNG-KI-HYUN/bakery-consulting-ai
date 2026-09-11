import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type JsonObject = Record<string, unknown>;

export type LivingPublicationDecision = "ELIGIBLE" | "CONDITIONAL" | "BLOCKED";

export interface LivingPublicationGateCheck {
  id: string;
  passed: boolean;
  category: "SOURCE" | "COMPATIBILITY" | "POLICY";
  evidence: string;
}

export interface LivingPublicationDecisionArtifact {
  schema_version: "1.0.0";
  artifact_kind: "LIVING_POPULATION_CURRENT_PUBLICATION_DECISION";
  source_id: string;
  snapshot_id: string;
  reference_ymd: string;
  decision: LivingPublicationDecision;
  evaluated_at: string;
  publication_scope: "SOURCE_CURRENT_ONLY";
  spatial_aggregation_ready: false;
  manifest: string;
  reconciliation: string;
  official_geometry_verification: string;
  historical_manifest_preserved: true;
  gate_checks: LivingPublicationGateCheck[];
  mismatch_policy: {
    both: string;
    metric_only: string;
    geometry_only: string;
  };
  limitations: string[];
}

export interface LivingCurrentPointer {
  schema_version: "1.0.0";
  source_id: string;
  snapshot_id: string;
  reference_ymd: string;
  manifest: string;
  publication_decision: string;
  published_at: string;
  publication_scope: "SOURCE_CURRENT_ONLY";
  spatial_aggregation_ready: false;
}

export interface LivingPublicationOptions {
  repositoryRoot: string;
  ingestRoot: string;
  manifestPath: string;
  reconciliationPath: string;
  officialGeometryVerificationPath: string;
  now?: () => Date;
}

export interface LivingPublicationEvaluation {
  artifact: LivingPublicationDecisionArtifact;
  decisionPath: string;
  currentPath: string;
}

function object(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value as JsonObject;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function portableRelative(from: string, target: string): string {
  return path.relative(from, target).replaceAll("\\", "/");
}

async function readJson(filePath: string): Promise<JsonObject> {
  return object(JSON.parse(await fs.readFile(filePath, "utf8")), filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function includesAll(value: unknown, required: string[]): boolean {
  const text = string(value);
  return required.every((part) => text.includes(part));
}

function addCheck(
  checks: LivingPublicationGateCheck[],
  id: string,
  passed: boolean,
  category: LivingPublicationGateCheck["category"],
  evidence: string,
): void {
  checks.push({ id, passed, category, evidence });
}

export async function evaluateSeoulLivingPublication(
  options: LivingPublicationOptions,
): Promise<LivingPublicationEvaluation> {
  const [manifest, reconciliation, verification] = await Promise.all([
    readJson(options.manifestPath),
    readJson(options.reconciliationPath),
    readJson(options.officialGeometryVerificationPath),
  ]);

  const sourceId = string(manifest.source_id);
  const snapshotId = string(manifest.snapshot_id);
  const referenceYmd = string(manifest.source_reference_date);
  const validation = object(manifest.validation, "manifest.validation");
  const schema = object(manifest.schema_validation, "manifest.schema_validation");
  const checksums = object(manifest.checksums, "manifest.checksums");
  const cellQuality = object(manifest.cell_id_quality, "manifest.cell_id_quality");
  const dongQuality = object(manifest.h_dng_cd_quality, "manifest.h_dng_cd_quality");
  const populationQuality = object(manifest.population_quality, "manifest.population_quality");
  const spopQuality = object(populationQuality.spop, "manifest.population_quality.spop");
  const ageSexQuality = object(
    populationQuality.age_sex_fields,
    "manifest.population_quality.age_sex_fields",
  );
  const ymdDistribution = object(manifest.ymd_distribution, "manifest.ymd_distribution");
  const reconMetric = object(reconciliation.metric, "reconciliation.metric");
  const recon = object(reconciliation.reconciliation, "reconciliation.reconciliation");
  const both = object(recon.both, "reconciliation.reconciliation.both");
  const metricOnly = object(recon.metric_only, "reconciliation.reconciliation.metric_only");
  const geometryOnly = object(recon.geometry_only, "reconciliation.reconciliation.geometry_only");
  const equations = object(recon.equations, "reconciliation.reconciliation.equations");
  const metricEquation = object(equations.metric, "reconciliation.reconciliation.equations.metric");
  const geometryEquation = object(
    equations.geometry,
    "reconciliation.reconciliation.equations.geometry",
  );
  const compatibility = object(verification.compatibility, "verification.compatibility");
  const policies = object(compatibility.policies, "verification.compatibility.policies");
  const localGeometry = object(verification.local_geometry, "verification.local_geometry");
  const officialSource = object(verification.official_source, "verification.official_source");
  const officialGeometry = object(officialSource.geometry, "verification.official_source.geometry");
  const verifiedMetricOnly = object(verification.metric_only_cell, "verification.metric_only_cell");
  const checks: LivingPublicationGateCheck[] = [];

  addCheck(
    checks,
    "manifest_ready",
    manifest.status === "READY" && boolean(manifest.source_snapshot_ready) && !boolean(manifest.staging) && !boolean(manifest.limited_run),
    "SOURCE",
    `status=${string(manifest.status)}, source_snapshot_ready=${String(manifest.source_snapshot_ready)}, staging=${String(manifest.staging)}, limited_run=${String(manifest.limited_run)}`,
  );

  const ymdKeys = Object.keys(ymdDistribution);
  addCheck(
    checks,
    "single_reference_ymd",
    /^\d{8}$/.test(referenceYmd) &&
      boolean(validation.single_ymd) &&
      ymdKeys.length === 1 &&
      ymdKeys[0] === referenceYmd &&
      number(ymdDistribution[referenceYmd]) === number(manifest.fetched_rows),
    "SOURCE",
    `reference_ymd=${referenceYmd}, distribution_keys=${ymdKeys.join(",")}`,
  );

  addCheck(
    checks,
    "pagination_complete",
    boolean(validation.pagination_contiguous) &&
      boolean(validation.expected_page_count_match) &&
      number(manifest.page_count) === number(manifest.expected_page_count),
    "SOURCE",
    `page_count=${String(manifest.page_count)}, expected_page_count=${String(manifest.expected_page_count)}`,
  );

  const fetchedRows = number(manifest.fetched_rows);
  const normalizedRows = number(manifest.normalized_rows);
  const quarantineRows = number(manifest.quarantine_rows);
  addCheck(
    checks,
    "row_counts_consistent",
    boolean(validation.count_consistent) &&
      number(manifest.expected_rows) === fetchedRows &&
      normalizedRows + quarantineRows === fetchedRows,
    "SOURCE",
    `expected=${String(manifest.expected_rows)}, fetched=${String(manifest.fetched_rows)}, normalized=${String(manifest.normalized_rows)}, quarantine=${String(manifest.quarantine_rows)}`,
  );

  addCheck(
    checks,
    "schema_drift_absent",
    validation.schema_drift === false &&
      array(schema.missing_fields).length === 0 &&
      array(schema.unexpected_fields).length === 0 &&
      number(schema.drift_row_count) === 0,
    "SOURCE",
    `missing_fields=${array(schema.missing_fields).length}, unexpected_fields=${array(schema.unexpected_fields).length}, drift_rows=${String(schema.drift_row_count)}`,
  );

  addCheck(
    checks,
    "candidate_key_unique",
    number(manifest.duplicate_candidate_count) === 0 &&
      number(validation.duplicate_candidate_count) === 0,
    "SOURCE",
    `duplicate_candidate_count=${String(manifest.duplicate_candidate_count)}`,
  );

  addCheck(
    checks,
    "required_fields_valid",
    number(cellQuality.missing) === 0 &&
      number(cellQuality.malformed) === 0 &&
      number(dongQuality.missing) === 0 &&
      number(dongQuality.malformed) === 0 &&
      number(dongQuality.unexpected) === 0 &&
      number(spopQuality.missing) === 0 &&
      number(spopQuality.invalid) === 0 &&
      number(ageSexQuality.missing) === 0 &&
      number(ageSexQuality.invalid) === 0 &&
      boolean(validation.tt_valid) &&
      boolean(validation.cell_id_complete) &&
      boolean(validation.h_dng_cd_valid),
    "SOURCE",
    "CELL_ID/H_DNG_CD/TT/population required-field validation must all pass; suppressed population remains valid missingness semantics.",
  );

  const quarantineChecksumValid =
    boolean(validation.quarantine_checksum_match) &&
    (quarantineRows === 0
      ? checksums.quarantine_page_set_sha256 === null
      : string(checksums.quarantine_page_set_sha256).length > 0);
  addCheck(
    checks,
    "checksums_pass",
    string(checksums.raw_page_set_sha256).length > 0 &&
      string(checksums.normalized_page_set_sha256).length > 0 &&
      string(checksums.checkpoint_sha256).length > 0 &&
      boolean(validation.raw_checksum_match) &&
      boolean(validation.normalized_checksum_match) &&
      quarantineChecksumValid,
    "SOURCE",
    `raw=${String(validation.raw_checksum_match)}, normalized=${String(validation.normalized_checksum_match)}, quarantine=${String(validation.quarantine_checksum_match)}`,
  );

  const referencedPaths = [
    string(manifest.raw_path),
    string(manifest.normalized_path),
    string(manifest.quarantine_path),
    string(manifest.checkpoint_path),
  ];
  const referencedPathResults = await Promise.all(
    referencedPaths.map((entry) =>
      entry && !path.isAbsolute(entry)
        ? pathExists(path.join(options.ingestRoot, entry))
        : Promise.resolve(false),
    ),
  );
  addCheck(
    checks,
    "snapshot_artifacts_present",
    referencedPaths.every(Boolean) && referencedPathResults.every(Boolean),
    "SOURCE",
    referencedPaths.map((entry, index) => `${entry}:${referencedPathResults[index]}`).join(", "),
  );

  const expectedManifestReference = portableRelative(options.repositoryRoot, options.manifestPath);
  const metricUnique = number(manifest.unique_cell_count);
  addCheck(
    checks,
    "reconciliation_consistent",
    string(reconMetric.manifest_path) === expectedManifestReference &&
      string(reconMetric.snapshot_id) === snapshotId &&
      string(reconMetric.source_reference_date) === referenceYmd &&
      number(reconMetric.row_count) === fetchedRows &&
      number(reconMetric.unique_cell_id_count) === metricUnique &&
      number(both.count) + number(metricOnly.count) === metricUnique &&
      number(both.count) + number(geometryOnly.count) === number(localGeometry.unique_cell_id_count) &&
      boolean(metricEquation.valid) &&
      boolean(geometryEquation.valid) &&
      boolean(recon.metric_only_reconfirmed_absent_from_geometry),
    "COMPATIBILITY",
    `metric=${String(reconMetric.unique_cell_id_count)}, both=${String(both.count)}, metric_only=${String(metricOnly.count)}, geometry_only=${String(geometryOnly.count)}`,
  );

  addCheck(
    checks,
    "official_geometry_ready",
    verification.result === "READY" &&
      compatibility.status === "READY" &&
      compatibility.metric_to_geometry === "READY_WITH_EXPLICIT_MISMATCH_POLICY" &&
      boolean(localGeometry.official_shp_cell_id_set_equal) &&
      boolean(localGeometry.official_viewer_cell_id_set_equal) &&
      number(localGeometry.unique_cell_id_count) === number(officialGeometry.unique_cell_id_count) &&
      number(localGeometry.cell_x_cell_y_gid_mismatch_count) === 0,
    "COMPATIBILITY",
    `verification=${string(verification.result)}, compatibility=${string(compatibility.status)}, official/local=${String(officialGeometry.unique_cell_id_count)}/${String(localGeometry.unique_cell_id_count)}`,
  );

  const metricOnlyIds = array(metricOnly.cell_ids).filter(
    (value): value is string => typeof value === "string",
  );
  addCheck(
    checks,
    "metric_only_exception_verified",
    metricOnlyIds.length === 1 &&
      metricOnlyIds[0] === string(verifiedMetricOnly.cell_id) &&
      verifiedMetricOnly.official_shp_present === false &&
      verifiedMetricOnly.official_grid_viewer_present === false &&
      verifiedMetricOnly.local_geometry_present === false &&
      array(verifiedMetricOnly.metric_history).some((entry) => {
        const history = object(entry, "verification.metric_only_cell.metric_history[]");
        return (
          string(history.source_date).replaceAll("-", "") === referenceYmd &&
          number(history.row_count) === 24 &&
          history.spop_status === "suppressed"
        );
      }),
    "COMPATIBILITY",
    `metric_only=${metricOnlyIds.join(",")}, verified=${string(verifiedMetricOnly.cell_id)}`,
  );

  const bothPolicy = string(policies.both);
  const metricOnlyPolicy = string(policies.metric_only);
  const geometryOnlyPolicy = string(policies.geometry_only);
  const publicationPolicies = {
    both:
      "metric과 geometry 연결 가능; 향후 공간집계 입력 후보이며 이번 source current 게시만으로 집계 완료를 의미하지 않음",
    metric_only:
      "Source Snapshot 원문과 suppressed 상태 보존; 공간집계 제외; REVIEW_REQUIRED; geometry 임의 생성 금지; metric 삭제 금지",
    geometry_only:
      "NO_OBSERVATION으로 보존; population=null; population 0 자동입력 금지; Source Snapshot 오류로 간주하지 않음",
  };
  addCheck(
    checks,
    "mismatch_policy_explicit",
    includesAll(bothPolicy, ["공간집계 입력 사용 가능"]) &&
      includesAll(metricOnlyPolicy, ["공간집계 제외", "REVIEW_REQUIRED", "geometry 임의 생성 금지"]) &&
      includesAll(geometryOnlyPolicy, ["population 0 자동입력 금지"]) &&
      (geometryOnlyPolicy.includes("NO_OBSERVATION") || geometryOnlyPolicy.includes("MISSING_METRIC")),
    "POLICY",
    "BOTH, METRIC_ONLY, GEOMETRY_ONLY policies are explicit and retain missing/suppressed semantics.",
  );

  const sourceFailed = checks.some((check) => check.category === "SOURCE" && !check.passed);
  const compatibilityFailed = checks.some(
    (check) => check.category === "COMPATIBILITY" && !check.passed,
  );
  const policyFailed = checks.some((check) => check.category === "POLICY" && !check.passed);
  const decision: LivingPublicationDecision = sourceFailed || compatibilityFailed
    ? "BLOCKED"
    : policyFailed
      ? "CONDITIONAL"
      : "ELIGIBLE";
  const evaluatedAt = (options.now ?? (() => new Date()))().toISOString();
  const decisionPath = path.join(
    options.ingestRoot,
    "manifests",
    sourceId,
    "publication-decisions",
    `${snapshotId}.publication-decision.json`,
  );
  const currentPath = path.join(options.ingestRoot, "manifests", sourceId, "current.json");

  return {
    artifact: {
      schema_version: "1.0.0",
      artifact_kind: "LIVING_POPULATION_CURRENT_PUBLICATION_DECISION",
      source_id: sourceId,
      snapshot_id: snapshotId,
      reference_ymd: referenceYmd,
      decision,
      evaluated_at: evaluatedAt,
      publication_scope: "SOURCE_CURRENT_ONLY",
      spatial_aggregation_ready: false,
      manifest: portableRelative(options.ingestRoot, options.manifestPath),
      reconciliation: portableRelative(options.ingestRoot, options.reconciliationPath),
      official_geometry_verification: portableRelative(
        options.ingestRoot,
        options.officialGeometryVerificationPath,
      ),
      historical_manifest_preserved: true,
      gate_checks: checks,
      mismatch_policy: publicationPolicies,
      limitations: [
        "This decision authorizes only the source current pointer.",
        "It does not authorize Market/Submarket spatial aggregation or change missing values to zero.",
        "The immutable ingestion manifest remains unchanged; its ingestion-time publish flags are historical evidence.",
      ],
    },
    decisionPath,
    currentPath,
  };
}

export async function publishSeoulLivingCurrent(
  options: LivingPublicationOptions,
): Promise<LivingPublicationEvaluation & { pointer: LivingCurrentPointer }> {
  const evaluation = await evaluateSeoulLivingPublication(options);
  if (evaluation.artifact.decision !== "ELIGIBLE") {
    throw new Error(
      `Living current publication is ${evaluation.artifact.decision}; current pointer was not changed`,
    );
  }

  const serializedDecision = `${JSON.stringify(evaluation.artifact, null, 2)}\n`;
  await atomicWrite(evaluation.decisionPath, serializedDecision);

  const pointer: LivingCurrentPointer = {
    schema_version: "1.0.0",
    source_id: evaluation.artifact.source_id,
    snapshot_id: evaluation.artifact.snapshot_id,
    reference_ymd: evaluation.artifact.reference_ymd,
    manifest: evaluation.artifact.manifest,
    publication_decision: portableRelative(options.ingestRoot, evaluation.decisionPath),
    published_at: evaluation.artifact.evaluated_at,
    publication_scope: "SOURCE_CURRENT_ONLY",
    spatial_aggregation_ready: false,
  };
  await atomicWrite(evaluation.currentPath, `${JSON.stringify(pointer, null, 2)}\n`);
  return { ...evaluation, pointer };
}
