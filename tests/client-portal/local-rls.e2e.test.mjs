import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.CLIENT_PORTAL_LOCAL_RLS_E2E === "1";
const requiredEnvironment = [
  "LOCAL_SUPABASE_URL",
  "LOCAL_SUPABASE_ANON_KEY",
  "LOCAL_SUPABASE_SECRET_KEY",
  "LOCAL_SUPABASE_JWT_SECRET",
];

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} is required for the Local Supabase RLS test`);
  return value;
}

function signLocalJwt({ anonKey, jwtSecret, subject, email }) {
  const now = Math.floor(Date.now() / 1000);
  const anonPayload = JSON.parse(Buffer.from(anonKey.split(".")[1], "base64url").toString("utf8"));
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    aud: "authenticated",
    email,
    exp: now + 300,
    iat: now,
    iss: anonPayload.iss,
    role: "authenticated",
    sub: subject,
  })).toString("base64url");
  const body = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", jwtSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

test("Local authenticated clients see only their own active Project", { skip: !enabled }, async () => {
  for (const name of requiredEnvironment) requiredEnvironmentValue(name);

  const url = requiredEnvironmentValue("LOCAL_SUPABASE_URL");
  const anonKey = requiredEnvironmentValue("LOCAL_SUPABASE_ANON_KEY");
  const secretKey = requiredEnvironmentValue("LOCAL_SUPABASE_SECRET_KEY");
  const jwtSecret = requiredEnvironmentValue("LOCAL_SUPABASE_JWT_SECRET");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const emailA = `portal-local-a-${suffix}@example.invalid`;
  const emailB = `portal-local-b-${suffix}@example.invalid`;
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const created = { authUsers: [], organizations: [], portalUsers: [], projects: [] };
  try {
    const [authAResult, authBResult] = await Promise.all([
      admin.auth.admin.createUser({ email: emailA, email_confirm: true }),
      admin.auth.admin.createUser({ email: emailB, email_confirm: true }),
    ]);
    assert.ifError(authAResult.error);
    assert.ifError(authBResult.error);
    const authA = authAResult.data.user;
    const authB = authBResult.data.user;
    assert.ok(authA?.id);
    assert.ok(authB?.id);
    created.authUsers.push(authA.id, authB.id);

    const { data: organizations, error: organizationError } = await admin
      .from("client_organizations")
      .insert([
        { name: `LOCAL_E2E_ORG_A_${suffix}`, status: "ACTIVE" },
        { name: `LOCAL_E2E_ORG_B_${suffix}`, status: "ACTIVE" },
      ])
      .select("id,name")
      .order("name");
    assert.ifError(organizationError);
    assert.equal(organizations.length, 2);
    const organizationA = organizations[0];
    const organizationB = organizations[1];
    created.organizations.push(organizationA.id, organizationB.id);

    const { data: portalUsers, error: portalUserError } = await admin
      .from("client_users")
      .insert([
        { auth_user_id: authA.id, organization_id: organizationA.id, login_identifier: `local-a-${suffix}` },
        { auth_user_id: authB.id, organization_id: organizationB.id, login_identifier: `local-b-${suffix}` },
      ])
      .select("id");
    assert.ifError(portalUserError);
    created.portalUsers.push(...portalUsers.map(({ id }) => id));

    const { data: projects, error: projectError } = await admin
      .from("client_projects")
      .insert([
        { organization_id: organizationA.id, case_id: `LOCAL_CASE_A_${suffix}`, name: "LOCAL_E2E_PROJECT_A" },
        { organization_id: organizationB.id, case_id: `LOCAL_CASE_B_${suffix}`, name: "LOCAL_E2E_PROJECT_B" },
      ])
      .select("id,name")
      .order("name");
    assert.ifError(projectError);
    assert.equal(projects.length, 2);
    created.projects.push(...projects.map(({ id }) => id));

    const clientFor = (authUser, email) => createClient(url, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${signLocalJwt({ anonKey, jwtSecret, subject: authUser.id, email })}` } },
    });
    const clientA = clientFor(authA, emailA);
    const clientB = clientFor(authB, emailB);

    const [projectAResult, projectBResult] = await Promise.all([
      clientA.from("client_projects").select("id,name").order("name"),
      clientB.from("client_projects").select("id,name").order("name"),
    ]);
    assert.ifError(projectAResult.error);
    assert.ifError(projectBResult.error);
    assert.deepEqual(projectAResult.data.map(({ name }) => name), ["LOCAL_E2E_PROJECT_A"]);
    assert.deepEqual(projectBResult.data.map(({ name }) => name), ["LOCAL_E2E_PROJECT_B"]);
  } finally {
    if (created.projects.length) await admin.from("client_projects").delete().in("id", created.projects);
    if (created.portalUsers.length) await admin.from("client_users").delete().in("id", created.portalUsers);
    if (created.organizations.length) await admin.from("client_organizations").delete().in("id", created.organizations);
    await Promise.all(created.authUsers.map((id) => admin.auth.admin.deleteUser(id)));
  }
});
