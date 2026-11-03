import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sql = fs.readFileSync(path.join(root, "supabase/migrations/20261104000000_client_portal_phase1.sql"), "utf8");
const sqlTest = fs.readFileSync(path.join(root, "supabase/tests/client_portal_phase1_rls.sql"), "utf8");

test("01 every Portal table enables RLS", () => {
  for (const table of ["client_organizations", "client_users", "client_projects", "candidate_shares", "report_shares", "client_feedback"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
  }
});

test("02 private context helpers are hardened security definers", () => {
  for (const helper of ["current_client_user_id", "current_client_organization_id"]) {
    const block = sql.match(new RegExp(`create or replace function private\\.${helper}\\(\\)([\\s\\S]*?)\\$\\$;`, "u"))?.[1] ?? "";
    assert.match(block, /security definer/u);
    assert.match(block, /set search_path = ''/u);
    assert.match(sql, new RegExp(`revoke all on function private\\.${helper}\\(\\) from public`, "u"));
  }
});

test("03 customer policies expose only active/self/SHARED records", () => {
  assert.match(sql, /client_project_select_active[\s\S]*status = 'ACTIVE'/u);
  assert.match(sql, /candidate_share_select_shared[\s\S]*status = 'SHARED'/u);
  assert.match(sql, /report_share_select_shared[\s\S]*status = 'SHARED'/u);
  assert.match(sql, /feedback_insert_self[\s\S]*client_user_id = \(select private\.current_client_user_id\(\)\)/u);
});

test("04 no customer UPDATE or DELETE grant/policy exists", () => {
  const policyOperations = [...sql.matchAll(/create policy [\s\S]*?\n(?:on|for) [\s\S]*?for (select|insert|update|delete|all)/giu)].map((match) => match[1].toUpperCase());
  assert.ok(policyOperations.every((operation) => operation === "SELECT" || operation === "INSERT"));
  assert.doesNotMatch(sql, /grant (?:update|delete|all)[^;]* to authenticated/iu);
});

test("05 SQL verification fixture checks anon, helpers, policies, and write denial", () => {
  assert.match(sqlTest, /grantee = 'anon'/u);
  assert.match(sqlTest, /procedure\.prosecdef/u);
  assert.match(sqlTest, /candidate_share_select_shared/u);
  assert.match(sqlTest, /feedback_insert_self/u);
  assert.match(sqlTest, /cmd in \('UPDATE', 'DELETE', 'ALL'\)/u);
});

test("06 admin client remains server-only and uses only the secret environment variable", () => {
  const admin = fs.readFileSync(path.join(root, "lib/client-portal/supabase/admin.server.ts"), "utf8");
  assert.match(admin, /^import "server-only";/u);
  assert.match(admin, /SUPABASE_SECRET_KEY/u);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SECRET|service[_-]?role/iu);
});
