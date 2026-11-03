import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
const previousModuleLoad = Module._load;
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return previousModuleLoad.call(this, request, parent, isMain);
};
after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
  Module._load = previousModuleLoad;
});

const auth = require(path.join(root, "lib/client-portal/auth.server.ts"));
const active = { clientUserId: "client-a", authUserId: "auth-a", providerEmail: "internal@example.invalid", organizationId: "org-a", organizationName: "A", loginIdentifier: "pork33-hq-01", userStatus: "ACTIVE", organizationStatus: "ACTIVE" };
const decoy = { authUserId: "auth-decoy", providerEmail: "decoy@example.invalid" };

function dependencies(identity, passwordResult = { ok: false, authUserId: null }) {
  const calls = { provider: [], failures: 0, successes: 0, checks: 0 };
  return {
    calls,
    value: {
      identities: {
        findByLoginIdentifier: async () => identity,
        getDecoyIdentity: async () => decoy,
      },
      passwords: {
        signInWithPassword: async (input) => {
          calls.provider.push(input.providerEmail);
          return passwordResult;
        },
      },
      rateLimit: {
        assertAllowed: async () => { calls.checks += 1; },
        recordFailure: async () => { calls.failures += 1; },
        recordSuccess: async () => { calls.successes += 1; },
      },
    },
  };
}

test("01 login identifiers normalize to lowercase safe IDs", () => {
  assert.equal(auth.normalizeLoginIdentifier("  PORK33-HQ-01  "), "pork33-hq-01");
  assert.throws(() => auth.normalizeLoginIdentifier("bad identifier"), { code: "INVALID_CREDENTIALS", status: 401 });
});

test("02 missing, disabled, and wrong-password accounts use one generic failure", async () => {
  const scenarios = [null, { ...active, userStatus: "DISABLED" }, active];
  for (const identity of scenarios) {
    const deps = dependencies(identity);
    await assert.rejects(
      () => auth.authenticatePortalUser({ loginIdentifier: "pork33-hq-01", password: "not-logged", rateLimitKey: "opaque-key" }, deps.value),
      (error) => error.code === "INVALID_CREDENTIALS" && error.status === 401 && error.message === auth.PORTAL_AUTH_FAILURE_MESSAGE,
    );
    assert.equal(deps.calls.provider.length, 1);
    assert.equal(deps.calls.provider[0], identity === active ? active.providerEmail : decoy.providerEmail);
    assert.equal(deps.calls.failures, 1);
  }
});

test("03 invalid identifier still follows the decoy provider path", async () => {
  const deps = dependencies(null);
  await assert.rejects(() => auth.authenticatePortalUser({ loginIdentifier: "invalid value", password: "not-logged", rateLimitKey: "opaque-key" }, deps.value), { code: "INVALID_CREDENTIALS" });
  assert.deepEqual(deps.calls.provider, [decoy.providerEmail]);
});

test("04 active identity succeeds only when the provider Auth ID matches", async () => {
  const deps = dependencies(active, { ok: true, authUserId: active.authUserId });
  const result = await auth.authenticatePortalUser({ loginIdentifier: active.loginIdentifier, password: "not-logged", rateLimitKey: "opaque-key" }, deps.value);
  assert.equal(result.clientUserId, active.clientUserId);
  assert.equal(deps.calls.successes, 1);
  assert.equal(deps.calls.failures, 0);
});

test("05 password values are not persisted or logged by the Auth contract", () => {
  const source = fs.readFileSync(path.join(root, "lib/client-portal/auth.server.ts"), "utf8");
  assert.doesNotMatch(source, /console\.|logger\.|writeFile|passwordHash/iu);
  assert.match(source, /PortalRateLimitPort/u);
});
