import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";
import { createSanitizedSbizSnapshotMap } from "./pork33-test-support.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => specifier === "server-only"
    ? {}
    : original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
after(() => { if (previousLoader) require.extensions[".ts"] = previousLoader; else delete require.extensions[".ts"]; });

const pagePath = path.join(root, "app/tools/pork33-candidate-shortlist/briefing-preview/page.tsx");
const snapshotLoaderPath = path.join(root, "lib/pork33-candidate-shortlist/decision-snapshots.server.ts");
const pageSource = fs.readFileSync(pagePath, "utf8");
const snapshotSource = fs.readFileSync(snapshotLoaderPath, "utf8");
const repository = require(path.join(root, "lib/pork33-candidate-shortlist/repository.server.ts"));
const snapshots = require(snapshotLoaderPath);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p33-snapshot-portability-"));

after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test("01 briefing preview defers current filesystem state reads until request time", () => {
  assert.match(pageSource, /import \{ connection \} from "next\/server"/u);
  assert.match(pageSource, /await connection\(\);/u);
  assert.ok(pageSource.indexOf("await connection();") < pageSource.indexOf("loadCurrentPork33State()"));
  assert.doesNotMatch(pageSource, /force-dynamic/u);
});

test("02 briefing preview reuses completed SBIZ365 snapshots instead of source PDF extraction", () => {
  assert.match(pageSource, /loadPork33DecisionServerInputs/u);
  assert.doesNotMatch(pageSource, /loadPork33BriefingServerInputs/u);
  assert.match(snapshotSource, /SBIZ365_SNAPSHOTS\.json/u);
  assert.doesNotMatch(snapshotSource, /extractPdfPageText|importSbiz365Text|pork33-sbiz365-source/u);
});

test("03 latest snapshot discovery is bounded to the known briefing output root", () => {
  assert.match(snapshotSource, /"output", "pork33-briefing"/u);
  assert.match(snapshotSource, /readdir\(root, \{ withFileTypes: true \}\)/u);
  assert.doesNotMatch(snapshotSource, /recursive\s*:\s*true/u);
});

test("04 snapshot loader resolves the exact current Candidate set without source mutation", async () => {
  const state = await repository.loadCurrentPork33State();
  const before = structuredClone(state);
  const snapshotPath = path.join(tempRoot, "SBIZ365_SNAPSHOTS.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(Object.values(createSanitizedSbizSnapshotMap(state))), "utf8");
  const inputs = await snapshots.loadLatestPork33Sbiz365Snapshots(
    state,
    path.join(tempRoot, "missing-output"),
    snapshotPath,
  );
  const expectedIds = state.candidates.map((candidate) => candidate.identity.displayCode).sort();
  assert.deepEqual(Object.keys(inputs.byCandidateId).sort(), expectedIds);
  assert.equal(expectedIds.length, 27);
  assert.ok(["sanitized-fixture-v1", "local-private-snapshot"].includes(inputs.batchId));
  assert.deepEqual(state, before);
});
