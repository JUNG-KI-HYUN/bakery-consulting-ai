import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const {
  economicVersionHref,
  economicVersionIdentity,
  parseEconomicVersionSelection,
  resolveEconomicWorkspaceVersion,
} = require(path.join(root, "lib/economic-feasibility/version-selection.ts"));

after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

function version({ generatedAt, revision, valid, ticket }) {
  return {
    generatedAt,
    binding: {
      analysisRunId: "run-a",
      officialBenchmarkIdentity: null,
      rentalConfirmationId: null,
      assumptionRevision: revision,
    },
    result: {
      inputs: { expectedTicket: ticket },
      validation: { errors: valid ? [] : ["invalid fixture"], warnings: [] },
      metadata: { engineVersion: "economic-feasibility-v1", generatedAt },
    },
  };
}

const validOld = version({ generatedAt: "2026-10-08T00:00:00.000Z", revision: 17, valid: true, ticket: 11_000 });
const validLatest = version({ generatedAt: "2026-10-09T00:00:00.000Z", revision: 18, valid: true, ticket: 12_000 });
const invalidLatest = version({ generatedAt: "2026-10-10T00:00:00.000Z", revision: 0, valid: false, ticket: 0 });

test("latest VALID version keeps the existing default behavior", () => {
  const resolved = resolveEconomicWorkspaceVersion([validOld, validLatest], null);
  assert.equal(resolved.selected.generatedAt, validLatest.generatedAt);
  assert.equal(resolved.selectionRequired, false);
  assert.equal(resolved.explicit, false);
});

test("latest INVALID requires selection and never falls back to an older VALID version", () => {
  const resolved = resolveEconomicWorkspaceVersion([validOld, invalidLatest], null);
  assert.equal(resolved.selected, null);
  assert.equal(resolved.selectionRequired, true);
});

test("explicit VALID selection uses the full exact identity", () => {
  const identity = economicVersionIdentity(validOld);
  const resolved = resolveEconomicWorkspaceVersion([validOld, invalidLatest], identity);
  assert.equal(resolved.selected.generatedAt, validOld.generatedAt);
  assert.equal(resolved.selected.result.inputs.expectedTicket, 11_000);
  assert.equal(resolved.explicit, true);
  assert.equal(resolveEconomicWorkspaceVersion([validOld], { ...identity, assumptionRevision: 18 }).selected, null);
  assert.equal(resolveEconomicWorkspaceVersion([validOld], { ...identity, engineVersion: "other" }).selected, null);
});

test("explicit INVALID selection is rejected", () => {
  const resolved = resolveEconomicWorkspaceVersion([validOld, invalidLatest], economicVersionIdentity(invalidLatest));
  assert.equal(resolved.selected, null);
  assert.equal(resolved.selectionRequired, true);
});

test("URL selection round-trips full identity and preserves unrelated context", () => {
  const href = economicVersionHref("/markets/economic-feasibility", { caseId: "case-a", radius: "500" }, economicVersionIdentity(validOld));
  const url = new URL(href, "http://localhost");
  const query = Object.fromEntries(url.searchParams.entries());
  assert.deepEqual(parseEconomicVersionSelection(query), economicVersionIdentity(validOld));
  assert.equal(query.caseId, "case-a");
  assert.equal(query.radius, "500");
  const cleared = economicVersionHref(url.pathname, query, null);
  assert.equal(cleared, "/markets/economic-feasibility?caseId=case-a&radius=500");
});
