import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const contractsPath = path.join(root, "lib/client-portal/contracts.ts");
const contracts = require(contractsPath);
const source = fs.readFileSync(contractsPath, "utf8");

function interfaceBody(name) {
  const match = source.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`, "u"));
  assert.ok(match, `${name} interface가 필요합니다.`);
  return match[1];
}

test("01 Portal V1 status sets remain minimal and lifecycle-independent", () => {
  assert.deepEqual(contracts.CLIENT_USER_ROLES, ["VIEWER"]);
  assert.deepEqual(contracts.CANDIDATE_SHARE_STATUSES, ["READY_TO_SHARE", "SHARED", "ARCHIVED"]);
  assert.deepEqual(contracts.REPORT_SHARE_STATUSES, ["SHARED", "ARCHIVED"]);
  assert.deepEqual(contracts.CLIENT_FEEDBACK_TYPES, ["INTERESTED", "REQUEST_REVIEW", "COMMENT"]);
  assert.doesNotMatch(interfaceBody("CandidateShare"), /lifecycle/iu);
});

test("02 Session DTO excludes provider identity and tokens", () => {
  const body = interfaceBody("PortalSessionDto");
  assert.match(body, /userId/u);
  assert.match(body, /organizationId/u);
  assert.match(body, /organizationName/u);
  assert.match(body, /loginIdentifier/u);
  assert.doesNotMatch(body, /authUserId|accessToken|refreshToken|providerEmail/iu);
});

test("03 Customer Candidate DTO excludes internal source and diagnostic fields", () => {
  const body = interfaceBody("PortalCandidateDto");
  assert.match(body, /displayCode/u);
  assert.match(body, /approvedSummary/u);
  assert.match(body, /sbiz365/u);
  assert.match(body, /photos/u);
  assert.doesNotMatch(body, /fieldNoteRaw|reviewReason|updatedBy|evidenceRef|sourceFileName|filesystem|diagnostic/iu);
});

test("04 PORK33 pilot seed template contains no password or real Auth UUID", () => {
  const fixture = fs.readFileSync(path.join(root, "supabase/tests/fixtures/pork33-pilot-seed.template.json"), "utf8");
  assert.doesNotMatch(fixture, /password/iu);
  assert.match(fixture, /<PROVISIONED_AUTH_USER_UUID>/u);
  assert.match(fixture, /CREATE_ONLY_AFTER_CASE_AND_CANDIDATE_VALIDATION/u);
});
