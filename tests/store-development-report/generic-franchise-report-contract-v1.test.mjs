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
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText, filename);
after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const contracts = require(path.join(root, "lib/store-development-report/franchise-contracts.ts"));
const validation = require(path.join(root, "lib/store-development-report/franchise-validation.ts"));
const fixture = require(path.join(root, "lib/store-development-report/sanitized-franchise-fixture.ts"));

function clone(value) {
  return structuredClone(value);
}

test("01 valid Candidate Review input", () => {
  const result = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  assert.equal(result.value.productType, "FRANCHISE_CANDIDATE_REVIEW");
  assert.deepEqual(contracts.LEGACY_REPORT_TYPES_BY_FRANCHISE_PRODUCT.FRANCHISE_CANDIDATE_REVIEW, ["FIELD_BRIEFING", "CANDIDATE_SINGLE", "REGION_REPORT"]);
});

test("02 valid Contract Decision input", () => {
  const result = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CONTRACT_DECISION_INPUT_V1);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  assert.equal(result.value.approvedDecisions.length, 1);
  assert.equal(contracts.FRANCHISE_REPORT_ENGINE_RULE_V1.createsFinalDecision, false);
});

test("03 invalid product type is rejected without changing legacy types", () => {
  const input = clone(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  input.productType = "FIELD_BRIEFING";
  const result = validation.validateFranchiseReportInputV1(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /productType/u);
});

test("04 invalid theme is rejected", () => {
  const theme = clone(fixture.SANITIZED_TEST_FRANCHISE_THEME_V1);
  theme.colors.primary = "red";
  theme.footerText = "";
  const result = validation.validateReportThemeV1(theme);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /#RRGGBB|footerText/u);
});

test("05 absolute file path asset is rejected", () => {
  const windowsAbsolute = `${String.fromCharCode(67, 58, 92)}private${String.fromCharCode(92)}brand-logo.png`;
  const posixAbsolute = ["", "private", "brand-logo.png"].join("/");
  const fileUrl = ["file:", "", "", "private", "logo.png"].join("/");
  for (const assetRef of [windowsAbsolute, posixAbsolute, fileUrl, "data:image/png;base64,AAAA"]) {
    const theme = clone(fixture.SANITIZED_TEST_FRANCHISE_THEME_V1);
    theme.logoAssetRef = assetRef;
    const result = validation.validateReportThemeV1(theme);
    assert.equal(result.ok, false, assetRef);
  }
});

test("06 UNKNOWN and explicit zero remain distinct", () => {
  const result = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  assert.equal(result.ok, true);
  const [first, second] = result.value.candidates;
  assert.deepEqual([first.lease.maintenance.availabilityStatus, first.lease.maintenance.value], ["EXPLICIT_ZERO", 0]);
  assert.deepEqual([second.lease.maintenance.availabilityStatus, second.lease.maintenance.value], ["UNKNOWN", null]);
});

test("07 raw and internal fields are not accepted", () => {
  const input = clone(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  input.candidates[0].fieldNoteRaw = "internal draft";
  input.candidates[0].updatedBy = "internal-user";
  input.candidates[0].internalEvidenceIds = ["evidence-private"];
  const result = validation.validateFranchiseReportInputV1(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /fieldNoteRaw|updatedBy|internalEvidenceIds/u);
});

test("08 Candidate IDs are unique and are the primary identity", () => {
  const input = clone(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  input.candidates[1].candidateStoreId = input.candidates[0].candidateStoreId;
  const result = validation.validateFranchiseReportInputV1(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /중복 candidateStoreId/u);
});

test("09 Human Contract Decision validation preserves a human-only authoritative record", () => {
  const result = validation.validateHumanContractDecisionV1(fixture.SANITIZED_HUMAN_CONTRACT_DECISION_V1);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  assert.equal(result.value.decision, "CONDITIONAL_RECOMMEND");
  assert.equal("siteGrade" in result.value, false);
  assert.equal("riskEngineResult" in result.value, false);
});

test("10 Conditional Recommend requires confirmation", () => {
  const decision = clone(fixture.SANITIZED_HUMAN_CONTRACT_DECISION_V1);
  decision.confirmationNeeded = [];
  const result = validation.validateHumanContractDecisionV1(decision);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /CONDITIONAL_RECOMMEND/u);
});

test("11 resolved snapshots require exact version and gaps remain explicit", () => {
  const input = clone(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  input.sourceSnapshotRefs[0].version = null;
  const invalid = validation.validateFranchiseReportInputV1(input);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /RESOLVED.*version/u);

  const contract = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CONTRACT_DECISION_INPUT_V1);
  assert.equal(contract.ok, true);
  const gap = contract.value.sourceSnapshotRefs.find((row) => row.domain === "DECISION" && row.status === "GAP");
  assert.equal(gap.snapshotId, null);
  assert.match(gap.limitation, /No approved synthetic decision/u);
});

test("12 Industry extension validates only a typed payload reference", () => {
  const valid = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  assert.equal(valid.ok, true);
  assert.equal(valid.value.extensionSections[0].payloadRef, "extension_payload_test_generic_retail_v1");

  const input = clone(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  input.extensionSections[0].payloadRef = null;
  const invalid = validation.validateFranchiseReportInputV1(input);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /validated payloadRef/u);
});

test("13 market intelligence keeps ACTUAL and ESTIMATED distinct", () => {
  const result = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  assert.equal(result.ok, true);
  assert.equal(result.value.candidates[0].marketIntelligence[0].valueType, "ACTUAL");
  assert.equal(result.value.candidates[1].marketIntelligence[0].valueType, "ESTIMATED");
});

test("14 provider and redistribution status are preserved and unlicensed values fail closed", () => {
  const result = validation.validateFranchiseReportInputV1(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  assert.equal(result.ok, true);
  assert.deepEqual(
    [result.value.marketIntelligence[0].providerLabel, result.value.marketIntelligence[0].redistributionStatus],
    ["SYNTHETIC FIXTURE PROVIDER", "PUBLIC"],
  );

  const input = clone(fixture.SANITIZED_CANDIDATE_REVIEW_INPUT_V1);
  input.marketIntelligence[0].redistributionStatus = "UNKNOWN";
  const invalid = validation.validateFranchiseReportInputV1(input);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /재배포 권한/u);
});
