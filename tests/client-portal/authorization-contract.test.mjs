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

const authorization = require(path.join(root, "lib/client-portal/authorization.server.ts"));
const session = { userId: "user-a", organizationId: "org-a", organizationName: "A", loginIdentifier: "org-a-user" };
const project = { id: "project-a", organizationId: "org-a", caseId: "case-a", name: "A", status: "ACTIVE", createdAt: "2026-11-04T00:00:00.000Z" };
const candidateShare = { id: "share-a", projectId: "project-a", candidateStoreId: "candidate-a", status: "SHARED", sharedAt: "2026-11-04T00:00:00.000Z", sharedByActor: "frameone", createdAt: "2026-11-04T00:00:00.000Z" };
const reportShare = { id: "report-a", projectId: "project-a", generationId: "generation-a", reportType: "FIELD_BRIEFING", fileName: "a.pdf", status: "SHARED", sharedAt: "2026-11-04T00:00:00.000Z" };

function repository(overrides = {}) {
  return {
    findActiveProject: async (organizationId, projectId) => organizationId === "org-a" && projectId === "project-a" ? project : null,
    findSharedCandidate: async (projectId, candidateStoreId) => projectId === "project-a" && candidateStoreId === "candidate-a" ? candidateShare : null,
    findSharedReport: async (organizationId, reportShareId) => organizationId === "org-a" && reportShareId === "report-a" ? reportShare : null,
    findApprovedPhoto: async (_projectId, candidateStoreId, photoId) => candidateStoreId === "candidate-a" && photoId === "photo-a" ? { photoId, caseId: "case-a", candidateStoreId, assetRef: "asset-a", contentType: "image/jpeg" } : null,
    ...overrides,
  };
}

test("01 same-organization active Project and SHARED Candidate are allowed", async () => {
  assert.equal((await authorization.requireProjectAccess(session, "project-a", repository())).id, "project-a");
  assert.equal((await authorization.requireCandidateShare(session, "project-a", "candidate-a", repository())).id, "share-a");
});

test("02 foreign Project and unshared Candidate return the same not-found boundary", async () => {
  await assert.rejects(() => authorization.requireProjectAccess({ ...session, organizationId: "org-b" }, "project-a", repository()), { name: "PortalResourceNotFoundError", status: 404 });
  await assert.rejects(() => authorization.requireCandidateShare(session, "project-a", "candidate-b", repository()), { name: "PortalResourceNotFoundError", status: 404 });
});

test("03 ARCHIVED Candidate and Report are denied", async () => {
  const archivedCandidate = repository({ findSharedCandidate: async () => ({ ...candidateShare, status: "ARCHIVED" }) });
  const archivedReport = repository({ findSharedReport: async () => ({ ...reportShare, status: "ARCHIVED" }) });
  await assert.rejects(() => authorization.requireCandidateShare(session, "project-a", "candidate-a", archivedCandidate), { status: 404 });
  await assert.rejects(() => authorization.requireReportShare(session, "report-a", archivedReport), { status: 404 });
});

test("04 approved Photo requires the SHARED Candidate boundary first", async () => {
  const photo = await authorization.requireApprovedPhoto(session, { projectId: "project-a", candidateStoreId: "candidate-a", photoId: "photo-a" }, repository());
  assert.equal(photo.photoId, "photo-a");
  await assert.rejects(() => authorization.requireApprovedPhoto(session, { projectId: "project-a", candidateStoreId: "candidate-b", photoId: "photo-a" }, repository()), { status: 404 });
});

test("05 Candidate and Report validation ports fail closed", async () => {
  await authorization.validateCandidateForCase({ candidateExists: async ({ caseId, candidateStoreId }) => caseId === "case-a" && candidateStoreId === "candidate-a" }, "case-a", "candidate-a");
  await assert.rejects(() => authorization.validateCandidateForCase({ candidateExists: async () => false }, "case-a", "candidate-x"), { status: 404 });

  const expected = { caseId: "case-a", generationId: "generation-a", reportType: "FIELD_BRIEFING", fileName: "a.pdf" };
  await authorization.validateReportForCase({ findGenerationManifest: async () => expected }, expected);
  await assert.rejects(() => authorization.validateReportForCase({ findGenerationManifest: async () => ({ ...expected, fileName: "foreign.pdf" }) }, expected), { status: 404 });
});
