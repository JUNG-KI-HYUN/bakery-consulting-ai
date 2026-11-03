import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const migrationPath = path.join(root, "supabase/migrations/20261104000000_client_portal_phase1.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const expectedTables = [
  "client_organizations",
  "client_users",
  "client_projects",
  "candidate_shares",
  "report_shares",
  "client_feedback",
];

test("01 migration creates only the six approved Portal tables", () => {
  const created = [...sql.matchAll(/create table public\.([a-z_]+)/gu)].map((match) => match[1]);
  assert.deepEqual(created, expectedTables);
});

test("02 Auth identity references auth.users without password or duplicate provider email", () => {
  assert.match(sql, /auth_user_id uuid not null unique references auth\.users\(id\)/u);
  assert.match(sql, /role text not null default 'VIEWER'/u);
  assert.doesNotMatch(sql, /password|provider_email|auth_email/iu);
});

test("03 Project, Candidate, Report, and Feedback uniqueness is explicit", () => {
  assert.match(sql, /unique \(organization_id, case_id\)/u);
  assert.match(sql, /unique \(project_id, candidate_store_id\)/u);
  assert.match(sql, /unique \(project_id, generation_id, file_name\)/u);
  assert.match(sql, /client_feedback_interested_once_idx[\s\S]*where type = 'INTERESTED'/u);
});

test("04 report shares store manifest lookup keys but no file path", () => {
  const reportTable = sql.match(/create table public\.report_shares \(([\s\S]*?)\n\);/u)?.[1] ?? "";
  assert.match(reportTable, /generation_id/u);
  assert.match(reportTable, /file_name/u);
  assert.match(reportTable, /report_type/u);
  assert.doesNotMatch(reportTable, /file_path|absolute_path|storage_path/iu);
});

test("05 migration is a file only and contains no seed or connection command", () => {
  assert.doesNotMatch(sql, /insert into|supabase db|psql|postgres(?:ql)?:\/\//iu);
});
