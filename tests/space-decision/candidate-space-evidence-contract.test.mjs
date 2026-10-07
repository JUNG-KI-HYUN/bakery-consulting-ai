import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "server-only") return {};
  return previousLoad.call(this, request, parent, isMain);
};
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = (specifier) =>
    originalRequire(
      specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
    );
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};
after(() => {
  Module._load = previousLoad;
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const lib = (relative) => loadModule(path.join(repositoryRoot, relative));
const { CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION } =
  lib("lib/space-decision/types.ts");
const { validateCandidateSpaceEvidenceSnapshot: validate } =
  lib("lib/space-decision/validation.ts");

// Sample/demo only. No real customer, store, address, layout, or equipment data.
const CANDIDATE_STORE_ID = "store_00000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "demo-space-snapshot-001";
const CAPTURED_AT = "2026-10-07T12:00:00+09:00";
const OBSERVED_AT = "2026-10-06T15:00:00+09:00";
const EQUIPMENT_ID = "equipment_00000000-0000-4000-8000-000000000002";

function evidence(overrides = {}) {
  return {
    verificationStatus: "UNKNOWN",
    sourceType: "FIELD_CHECK",
    confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
    sourceRef: { opaqueSourceId: "demo-space-assessment-001" },
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function strongEvidence(overrides = {}) {
  return evidence({
    verificationStatus: "VERIFIED",
    sourceType: "EXPERT_STATEMENT",
    ...overrides,
  });
}

const notAssessed = () => ({ status: "NOT_ASSESSED", evidence: null });
const assessed = (status, itemEvidence = evidence(), summary) => ({
  status,
  evidence: itemEvidence,
  ...(summary ? { summary } : {}),
});

function minimalSnapshot() {
  return {
    schemaVersion: CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    candidateStoreId: CANDIDATE_STORE_ID,
    capturedAt: CAPTURED_AT,
    manufacturingRequirement: "UNKNOWN",
    spaceAssessment: {
      manufacturingSpace: notAssessed(),
      salesSpace: notAssessed(),
      staffFlow: notAssessed(),
      customerFlow: notAssessed(),
      packingPickupSpace: notAssessed(),
      storageSpace: notAssessed(),
    },
    equipmentFitAssessment: notAssessed(),
    assessmentBasis: {
      layoutAssessmentStatus: "NOT_ASSESSED",
      measurementStatus: "NOT_CONFIRMED",
      requiredEquipmentSetStatus: "NOT_DEFINED",
      requiredEquipmentDefinitionIds: [],
    },
    createsRisk: false,
    createsVerdict: false,
    createsScore: false,
  };
}

function withChange(mutate) {
  const value = minimalSnapshot();
  mutate(value);
  return value;
}

function setAssessedBasis(snapshot, { equipment = false, measurement = "CONFIRMED" } = {}) {
  snapshot.assessmentBasis = {
    layoutAssessmentStatus: "ASSESSED",
    measurementStatus: measurement,
    requiredEquipmentSetStatus: equipment ? "DEFINED" : "NOT_DEFINED",
    requiredEquipmentDefinitionIds: equipment ? [EQUIPMENT_ID] : [],
  };
}

function expectValid(value) {
  const result = validate(value);
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.value;
}

function expectInvalid(value, pattern) {
  const result = validate(value);
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_CANDIDATE_SPACE_EVIDENCE");
  if (pattern) assert.match(result.message, pattern);
  return result;
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

test("1. valid minimal snapshot", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.schemaVersion, "candidate-space-evidence-v1");
  assert.equal(value.spaceAssessment.manufacturingSpace.status, "NOT_ASSESSED");
  assert.equal(value.equipmentFitAssessment.status, "NOT_ASSESSED");
});

test("2. schemaVersion must match exactly", () => {
  for (const schemaVersion of [
    "candidate-space-evidence-v2",
    "candidate-space-evidence-v1 ",
    "",
    undefined,
  ]) {
    expectInvalid(withChange((s) => (s.schemaVersion = schemaVersion)), /schemaVersion/);
  }
});

test("3. unknown top-level key is rejected", () => {
  expectInvalid(withChange((s) => (s.extra = true)), /extra/);
});

test("4. unknown nested key is rejected", () => {
  expectInvalid(
    withChange((s) => (s.spaceAssessment.salesSpace.extra = true)),
    /salesSpace\.extra/,
  );
  expectInvalid(
    withChange((s) => (s.assessmentBasis.extra = true)),
    /assessmentBasis\.extra/,
  );
});

test("5. blank snapshotId is rejected", () => {
  for (const snapshotId of ["", "  ", null, undefined]) {
    expectInvalid(withChange((s) => (s.snapshotId = snapshotId)), /snapshotId/);
  }
});

test("6. invalid candidateStoreId is rejected using the existing identity contract", () => {
  for (const candidateStoreId of [
    "demo-candidate",
    "store_not-a-uuid",
    "",
    null,
    undefined,
  ]) {
    expectInvalid(
      withChange((s) => (s.candidateStoreId = candidateStoreId)),
      /candidateStoreId/,
    );
  }
});

test("7. invalid capturedAt is rejected", () => {
  for (const capturedAt of ["not-a-date", "2026-13-45T12:00:00Z", "", null, 1]) {
    expectInvalid(withChange((s) => (s.capturedAt = capturedAt)), /capturedAt/);
  }
});

test("8. capturedAt without timezone is rejected", () => {
  for (const capturedAt of ["2026-10-07", "2026-10-07T12:00:00"]) {
    expectInvalid(withChange((s) => (s.capturedAt = capturedAt)), /capturedAt/);
  }
});

test("9. evidence observedAt is required", () => {
  expectInvalid(
    withChange((s) => {
      const item = evidence();
      delete item.observedAt;
      s.spaceAssessment.salesSpace = assessed("LIMITED", item);
    }),
    /observedAt/,
  );
});

test("10. invalid observedAt is rejected", () => {
  for (const observedAt of ["invalid", "2026-10-06", "2026-10-06T15:00:00", null]) {
    expectInvalid(
      withChange((s) => {
        s.spaceAssessment.salesSpace = assessed("LIMITED", evidence({ observedAt }));
      }),
      /observedAt/,
    );
  }
});

test("11. PLANNABLE with evidence is valid without verification promotion", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.salesSpace = assessed("PLANNABLE");
    }),
  );
  assert.equal(value.spaceAssessment.salesSpace.status, "PLANNABLE");
  assert.equal(value.spaceAssessment.salesSpace.evidence.verificationStatus, "UNKNOWN");
});

test("12. LIMITED with evidence is valid and remains LIMITED", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.salesSpace = assessed("LIMITED");
    }),
  );
  assert.equal(value.spaceAssessment.salesSpace.status, "LIMITED");
  assert.notEqual(value.spaceAssessment.salesSpace.status, "NOT_FEASIBLE");
});

test("13. NOT_ASSESSED with null evidence is valid", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.spaceAssessment.staffFlow.evidence, null);
});

test("14. NOT_APPLICABLE requires evidence", () => {
  expectInvalid(
    withChange((s) => {
      s.spaceAssessment.storageSpace = {
        status: "NOT_APPLICABLE",
        evidence: null,
      };
    }),
    /NOT_APPLICABLE/,
  );
});

test("15. NOT_FEASIBLE requires evidence", () => {
  expectInvalid(
    withChange((s) => {
      setAssessedBasis(s);
      s.spaceAssessment.salesSpace = {
        status: "NOT_FEASIBLE",
        evidence: null,
      };
    }),
    /NOT_FEASIBLE/,
  );
});

test("16. NOT_FEASIBLE rejects CUSTOMER_INPUT-only evidence", () => {
  for (const sourceType of ["CUSTOMER_INPUT", "TENANT_STATEMENT"]) {
    expectInvalid(
      withChange((s) => {
        setAssessedBasis(s);
        s.spaceAssessment.salesSpace = assessed(
          "NOT_FEASIBLE",
          strongEvidence({ sourceType }),
        );
      }),
      /FIELD_CHECK, DOCUMENT 또는 EXPERT_STATEMENT/,
    );
  }
});

test("17. NOT_FEASIBLE accepts only VERIFIED; UNKNOWN/ESTIMATED/CONFLICTED/STALE are rejected", () => {
  for (const verificationStatus of ["UNKNOWN", "ESTIMATED", "CONFLICTED", "STALE"]) {
    expectInvalid(
      withChange((s) => {
        setAssessedBasis(s);
        s.spaceAssessment.salesSpace = assessed(
          "NOT_FEASIBLE",
          strongEvidence({ verificationStatus }),
        );
      }),
      /VERIFIED/,
    );
  }
});

test("18. manufacturingSpace supports the full assessment status contract", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.manufacturingSpace = assessed("LIMITED");
    }),
  );
  assert.equal(value.spaceAssessment.manufacturingSpace.status, "LIMITED");
});

test("19. salesSpace supports explicit NOT_FEASIBLE with strong prerequisites", () => {
  const value = expectValid(
    withChange((s) => {
      setAssessedBasis(s, { measurement: "PARTIAL" });
      s.spaceAssessment.salesSpace = assessed("NOT_FEASIBLE", strongEvidence());
    }),
  );
  assert.equal(value.spaceAssessment.salesSpace.status, "NOT_FEASIBLE");
});

test("20. staffFlow uses the same typed status without creating Risk", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.staffFlow = assessed("LIMITED");
    }),
  );
  assert.equal(value.spaceAssessment.staffFlow.status, "LIMITED");
  assert.equal(value.createsRisk, false);
});

test("21. customerFlow uses the same typed status", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.customerFlow = assessed("PLANNABLE");
    }),
  );
  assert.equal(value.spaceAssessment.customerFlow.status, "PLANNABLE");
});

test("22. packingPickupSpace uses the same typed status", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.packingPickupSpace = assessed("LIMITED");
    }),
  );
  assert.equal(value.spaceAssessment.packingPickupSpace.status, "LIMITED");
});

test("23. storageSpace uses the same typed status", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.storageSpace = assessed("NOT_APPLICABLE");
    }),
  );
  assert.equal(value.spaceAssessment.storageSpace.status, "NOT_APPLICABLE");
});

test("24. equipment FIT and CONSTRAINED require a defined equipment set", () => {
  for (const status of ["FIT", "CONSTRAINED"]) {
    expectInvalid(
      withChange((s) => {
        setAssessedBasis(s);
        s.equipmentFitAssessment = assessed(status);
      }),
      /requiredEquipmentSetStatus=DEFINED/,
    );
  }
});

test("25. equipment NOT_FIT requires a defined equipment set", () => {
  expectInvalid(
    withChange((s) => {
      setAssessedBasis(s);
      s.equipmentFitAssessment = assessed("NOT_FIT", strongEvidence());
    }),
    /requiredEquipmentSetStatus=DEFINED/,
  );
});

test("26. equipment NOT_ASSESSED allows an undefined set", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.assessmentBasis.requiredEquipmentSetStatus, "NOT_DEFINED");
  assert.deepEqual(value.assessmentBasis.requiredEquipmentDefinitionIds, []);
});

test("27. equipment NOT_FIT requires an assessed layout", () => {
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis = {
        layoutAssessmentStatus: "NOT_ASSESSED",
        measurementStatus: "CONFIRMED",
        requiredEquipmentSetStatus: "DEFINED",
        requiredEquipmentDefinitionIds: [EQUIPMENT_ID],
      };
      s.equipmentFitAssessment = assessed("NOT_FIT", strongEvidence());
    }),
    /layoutAssessmentStatus=ASSESSED/,
  );
});

test("28. equipment NOT_FIT requires confirmed or partial measurement basis", () => {
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis = {
        layoutAssessmentStatus: "ASSESSED",
        measurementStatus: "NOT_CONFIRMED",
        requiredEquipmentSetStatus: "DEFINED",
        requiredEquipmentDefinitionIds: [EQUIPMENT_ID],
      };
      s.equipmentFitAssessment = assessed("NOT_FIT", strongEvidence());
    }),
    /measurement basis/,
  );
});

test("29. space NOT_FEASIBLE requires an assessed layout", () => {
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis.measurementStatus = "CONFIRMED";
      s.spaceAssessment.customerFlow = assessed("NOT_FEASIBLE", strongEvidence());
    }),
    /layoutAssessmentStatus=ASSESSED/,
  );
});

test("30. space NOT_FEASIBLE requires confirmed or partial measurement basis", () => {
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis.layoutAssessmentStatus = "ASSESSED";
      s.spaceAssessment.customerFlow = assessed("NOT_FEASIBLE", strongEvidence());
    }),
    /measurement basis/,
  );
});

test("31. manufacturingRequirement supports exactly REQUIRED/NOT_REQUIRED/UNKNOWN", () => {
  for (const requirement of ["REQUIRED", "UNKNOWN"]) {
    const value = expectValid(
      withChange((s) => {
        s.manufacturingRequirement = requirement;
      }),
    );
    assert.equal(value.manufacturingRequirement, requirement);
  }
  for (const requirement of ["OPTIONAL", "YES", "", null]) {
    expectInvalid(
      withChange((s) => (s.manufacturingRequirement = requirement)),
      /manufacturingRequirement/,
    );
  }
});

test("32. manufacturing NOT_REQUIRED requires NOT_APPLICABLE with evidence", () => {
  const value = expectValid(
    withChange((s) => {
      s.manufacturingRequirement = "NOT_REQUIRED";
      s.spaceAssessment.manufacturingSpace = assessed("NOT_APPLICABLE");
    }),
  );
  assert.equal(value.spaceAssessment.manufacturingSpace.status, "NOT_APPLICABLE");
  expectInvalid(
    withChange((s) => {
      s.manufacturingRequirement = "NOT_REQUIRED";
    }),
    /NOT_APPLICABLE/,
  );
  expectInvalid(
    withChange((s) => {
      s.manufacturingRequirement = "REQUIRED";
      s.spaceAssessment.manufacturingSpace = assessed("NOT_APPLICABLE");
    }),
    /REQUIRED/,
  );
});

test("33. raw Geometry warnings cannot be copied or auto-converted", () => {
  expectInvalid(
    withChange((s) => {
      s.geometryWarnings = [{ code: "OVERLAP" }];
    }),
    /geometryWarnings/,
  );
  assert.equal(collectKeys(expectValid(minimalSnapshot())).has("geometryWarnings"), false);
});

test("34. Technical and Delivery fields are outside this contract", () => {
  for (const key of ["electrical", "water", "drainage", "exhaust", "delivery"]) {
    expectInvalid(withChange((s) => (s[key] = "AVAILABLE")), new RegExp(key));
  }
});

test("35. contract creates no Risk", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.createsRisk, false);
  assert.equal(collectKeys(value).has("riskClass"), false);
  expectInvalid(withChange((s) => (s.hardBlocker = false)), /hardBlocker/);
});

test("36. contract creates no Verdict", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.createsVerdict, false);
  assert.equal(collectKeys(value).has("verdict"), false);
  expectInvalid(withChange((s) => (s.verdict = "UNKNOWN")), /verdict/);
});

test("37. contract creates no Score", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.createsScore, false);
  assert.equal(collectKeys(value).has("riskScore"), false);
  expectInvalid(withChange((s) => (s.riskScore = 0)), /riskScore/);
});

test("38. validation is deterministic", () => {
  assert.deepEqual(validate(minimalSnapshot()), validate(minimalSnapshot()));
});

test("39. caller input is not mutated or frozen", () => {
  const input = withChange((s) => {
    s.spaceAssessment.salesSpace = assessed("LIMITED", evidence(), "demo constraint");
  });
  const before = JSON.stringify(input);
  expectValid(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.spaceAssessment), false);
  assert.equal(Object.isFrozen(input.spaceAssessment.salesSpace.evidence), false);
});

test("40. successful output is deeply frozen", () => {
  const value = expectValid(
    withChange((s) => {
      setAssessedBasis(s, { equipment: true });
      s.equipmentFitAssessment = assessed("FIT");
    }),
  );
  for (const item of [
    value,
    value.spaceAssessment,
    value.spaceAssessment.manufacturingSpace,
    value.equipmentFitAssessment,
    value.equipmentFitAssessment.evidence,
    value.equipmentFitAssessment.evidence.sourceRef,
    value.assessmentBasis,
    value.assessmentBasis.requiredEquipmentDefinitionIds,
  ]) {
    assert.equal(Object.isFrozen(item), true);
  }
});

test("41. validated output is JSON serializable without loss", () => {
  const value = expectValid(minimalSnapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});

test("42. UNKNOWN evidence or NOT_ASSESSED status never becomes NOT_FEASIBLE", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.salesSpace = assessed("LIMITED", evidence({
        verificationStatus: "UNKNOWN",
      }));
    }),
  );
  assert.equal(value.spaceAssessment.manufacturingSpace.status, "NOT_ASSESSED");
  assert.equal(value.spaceAssessment.salesSpace.status, "LIMITED");
});

test("43. LIMITED and NOT_FEASIBLE remain distinct", () => {
  const limited = expectValid(
    withChange((s) => {
      s.spaceAssessment.salesSpace = assessed("LIMITED");
    }),
  );
  const notFeasible = expectValid(
    withChange((s) => {
      setAssessedBasis(s);
      s.spaceAssessment.salesSpace = assessed("NOT_FEASIBLE", strongEvidence());
    }),
  );
  assert.notEqual(
    limited.spaceAssessment.salesSpace.status,
    notFeasible.spaceAssessment.salesSpace.status,
  );
});

test("44. PLANNABLE is not final feasibility, approval, or construction permission", () => {
  const value = expectValid(
    withChange((s) => {
      s.spaceAssessment.salesSpace = assessed("PLANNABLE");
    }),
  );
  const keys = collectKeys(value);
  for (const key of [
    "finalFeasibility",
    "approved",
    "constructionAllowed",
    "contractAllowed",
  ]) {
    assert.equal(keys.has(key), false, key);
  }
});

test("45. sourceRef reuses the existing PII defense", () => {
  expectInvalid(
    withChange((s) => {
      s.spaceAssessment.salesSpace = assessed(
        "LIMITED",
        evidence({ sourceRef: { opaqueSourceId: "owner@example.com" } }),
      );
    }),
    /개인정보/,
  );
});

test("46. evidence enums use only existing shared values", () => {
  for (const [key, invalid] of [
    ["verificationStatus", "CONFIRMED"],
    ["sourceType", "GEOMETRY"],
    ["confirmationRequirement", "MANAGER_APPROVAL"],
  ]) {
    expectInvalid(
      withChange((s) => {
        s.spaceAssessment.salesSpace = assessed(
          "LIMITED",
          evidence({ [key]: invalid }),
        );
      }),
      new RegExp(key),
    );
  }
});

test("47. required equipment set IDs are valid, unique, and consistent with status", () => {
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis.requiredEquipmentSetStatus = "DEFINED";
    }),
    /definition ID/,
  );
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis.requiredEquipmentDefinitionIds = [EQUIPMENT_ID];
    }),
    /NOT_DEFINED/,
  );
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis = {
        ...s.assessmentBasis,
        requiredEquipmentSetStatus: "DEFINED",
        requiredEquipmentDefinitionIds: ["equipment-invalid"],
      };
    }),
    /올바르지 않습니다/,
  );
  expectInvalid(
    withChange((s) => {
      s.assessmentBasis = {
        ...s.assessmentBasis,
        requiredEquipmentSetStatus: "DEFINED",
        requiredEquipmentDefinitionIds: [EQUIPMENT_ID, EQUIPMENT_ID],
      };
    }),
    /중복/,
  );
});

test("48. FIT and NOT_FIT are valid only with their explicit prerequisites", () => {
  const fit = expectValid(
    withChange((s) => {
      setAssessedBasis(s, { equipment: true });
      s.equipmentFitAssessment = assessed("FIT");
    }),
  );
  assert.equal(fit.equipmentFitAssessment.status, "FIT");

  const notFit = expectValid(
    withChange((s) => {
      setAssessedBasis(s, { equipment: true, measurement: "PARTIAL" });
      s.equipmentFitAssessment = assessed("NOT_FIT", strongEvidence());
    }),
  );
  assert.equal(notFit.equipmentFitAssessment.status, "NOT_FIT");
});

test("49. UNKNOWN manufacturing requirement preserves a strong assessment without making a decision", () => {
  const value = expectValid(
    withChange((s) => {
      setAssessedBasis(s);
      s.manufacturingRequirement = "UNKNOWN";
      s.spaceAssessment.manufacturingSpace = assessed(
        "NOT_FEASIBLE",
        strongEvidence(),
      );
    }),
  );
  assert.equal(value.manufacturingRequirement, "UNKNOWN");
  assert.equal(value.spaceAssessment.manufacturingSpace.status, "NOT_FEASIBLE");
  assert.equal(value.createsRisk, false);
});

test("50. contract code does not generate IDs or timestamps and imports no adapter/Risk modules", () => {
  const source = [
    fs.readFileSync(path.join(repositoryRoot, "lib/space-decision/types.ts"), "utf8"),
    fs.readFileSync(path.join(repositoryRoot, "lib/space-decision/validation.ts"), "utf8"),
  ].join("\n");
  for (const forbidden of [
    "Date.now(",
    "new Date(",
    "Math.random(",
    "randomUUID(",
    "decision-evidence/candidate-bundle",
    "risk-v2",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("FIELD mapping"), true);
});
