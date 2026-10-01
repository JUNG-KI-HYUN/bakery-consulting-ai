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
const { CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION } = lib("lib/lease-decision/types.ts");
const { validateCandidateLeaseEvidenceSnapshot: validate } = lib("lib/lease-decision/validation.ts");

const TYPES_SOURCE = fs.readFileSync(path.join(repositoryRoot, "lib/lease-decision/types.ts"), "utf8");
const VALIDATION_SOURCE = fs.readFileSync(path.join(repositoryRoot, "lib/lease-decision/validation.ts"), "utf8");

// ---- fixtures (sample/demo only; not real store, landlord, customer, or lease data) ----

const DEMO_CANDIDATE_STORE_ID = "demo-candidate-store-001";
const DEMO_SNAPSHOT_ID = "demo-lease-snapshot-001";
const DEMO_CAPTURED_AT = "2026-10-01T05:00:00.000Z";
const DEMO_OBSERVED_AT = "2026-09-20T10:00:00+09:00";

function demoEvidence(overrides = {}) {
  return {
    verificationStatus: "UNKNOWN",
    sourceType: "OWNER_STATEMENT",
    confirmationRequirement: "DOCUMENT_REQUIRED",
    sourceRef: { opaqueSourceId: "demo-interview-ref-001" },
    observedAt: DEMO_OBSERVED_AT,
    ...overrides,
  };
}

const unknownValue = () => ({ status: "UNKNOWN", value: null, evidence: null });
const notConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null });
const consentNotConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null, consentAuthority: "UNKNOWN" });
const directConsent = (status, evidence = demoEvidence()) => ({ status, evidence, consentAuthority: "DIRECT_AUTHORITY" });
const knownValue = (value, evidence = demoEvidence()) => ({ status: "KNOWN", value, evidence });

function minimalSnapshot() {
  return {
    schemaVersion: CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION,
    snapshotId: DEMO_SNAPSHOT_ID,
    candidateStoreId: DEMO_CANDIDATE_STORE_ID,
    capturedAt: DEMO_CAPTURED_AT,
    leaseTerms: {
      depositAmount: unknownValue(),
      monthlyRentAmount: unknownValue(),
      managementFeeAmount: unknownValue(),
      vatTreatment: notConfirmed(),
      premiumAmount: unknownValue(),
      premiumStatus: notConfirmed(),
      leaseTermMonths: unknownValue(),
      rentFreeMonths: unknownValue(),
      constructionPeriodDays: unknownValue(),
      handoverDate: unknownValue(),
    },
    contractConditions: {
      businessUseRestriction: notConfirmed(),
      subleaseRestriction: notConfirmed(),
      managementRegulation: notConfirmed(),
      restorationScope: notConfirmed(),
      repairResponsibility: notConfirmed(),
      permitFailureCondition: notConfirmed(),
      conditionPrecedent: notConfirmed(),
      specialClauseStatus: notConfirmed(),
      writtenConfirmationStatus: notConfirmed(),
      renewalCondition: notConfirmed(),
    },
    landlordConsents: {
      bakeryManufacturingUse: consentNotConfirmed(),
      exhaust: consentNotConfirmed(),
      electricalUpgrade: consentNotConfirmed(),
      signage: consentNotConfirmed(),
      construction: consentNotConfirmed(),
    },
    createsRisk: false,
    createsVerdict: false,
    createsScore: false,
  };
}

function withChange(mutate) {
  const snapshot = minimalSnapshot();
  mutate(snapshot);
  return snapshot;
}

function expectInvalid(snapshot, pattern) {
  const result = validate(snapshot);
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_CANDIDATE_LEASE_EVIDENCE");
  if (pattern) assert.match(result.message, pattern);
  return result;
}

function expectValid(snapshot) {
  const result = validate(snapshot);
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.value;
}

function collectKeys(value, keys = []) {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function importLines(source) {
  return source.split("\n").filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line) || /^\s*}\s*from\b/.test(line));
}

// ---- tests ----

test("1. valid minimal snapshot (all UNKNOWN / NOT_CONFIRMED)", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.schemaVersion, "candidate-lease-evidence-v1");
  assert.equal(value.snapshotId, DEMO_SNAPSHOT_ID);
  assert.equal(value.candidateStoreId, DEMO_CANDIDATE_STORE_ID);
  assert.equal(value.leaseTerms.depositAmount.status, "UNKNOWN");
  assert.equal(value.landlordConsents.exhaust.status, "NOT_CONFIRMED");
});

test("2. candidateStoreId is required (trimmed non-empty) and failure shape matches", () => {
  const missing = expectInvalid(withChange((s) => delete s.candidateStoreId), /candidateStoreId/);
  assert.ok(Object.isFrozen(missing));
  assert.ok(Object.isFrozen(missing.errors));
  assert.ok(missing.errors.length >= 1);
  expectInvalid(withChange((s) => (s.candidateStoreId = "   ")), /candidateStoreId/);
  expectInvalid(withChange((s) => (s.candidateStoreId = 42)), /candidateStoreId/);
});

test("3. snapshotId is required (trimmed non-empty, caller-provided)", () => {
  expectInvalid(withChange((s) => delete s.snapshotId), /snapshotId/);
  expectInvalid(withChange((s) => (s.snapshotId = "")), /snapshotId/);
  expectInvalid(withChange((s) => (s.snapshotId = "  ")), /snapshotId/);
  assert.equal(expectValid(minimalSnapshot()).snapshotId, DEMO_SNAPSHOT_ID);
});

test("4. capturedAt must be an ISO 8601 timestamp with timezone", () => {
  for (const capturedAt of ["not-a-date", "2026-10-01", "2026-10-01T05:00:00", "", null, 1727758800000]) {
    expectInvalid(withChange((s) => (s.capturedAt = capturedAt)), /capturedAt/);
  }
  expectInvalid(withChange((s) => (s.capturedAt = "2026-13-45T05:00:00Z")), /capturedAt/);
  assert.equal(
    expectValid(withChange((s) => (s.capturedAt = "2026-10-01T14:00:00+09:00"))).capturedAt,
    "2026-10-01T14:00:00+09:00",
  );
});

test("5. KNOWN amount with evidence is valid; verification is not derived from value or source", () => {
  const value = expectValid(
    withChange((s) => {
      s.leaseTerms.depositAmount = knownValue(30_000_000);
      s.leaseTerms.monthlyRentAmount = knownValue(2_500_000, demoEvidence({ sourceType: "DOCUMENT", sourceRef: { documentId: "demo-proposal-doc-001" } }));
    }),
  );
  assert.equal(value.leaseTerms.depositAmount.value, 30_000_000);
  assert.equal(value.leaseTerms.depositAmount.evidence.sourceType, "OWNER_STATEMENT");
  assert.equal(value.leaseTerms.depositAmount.evidence.verificationStatus, "UNKNOWN");
  assert.equal(value.leaseTerms.monthlyRentAmount.evidence.sourceType, "DOCUMENT");
  assert.equal(value.leaseTerms.monthlyRentAmount.evidence.verificationStatus, "UNKNOWN");
});

test("6. KNOWN amount without evidence is invalid", () => {
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = { status: "KNOWN", value: 1000, evidence: null })), /evidence/);
  expectInvalid(withChange((s) => (s.leaseTerms.monthlyRentAmount = { status: "KNOWN", value: 1000 })), /evidence/);
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = { status: "KNOWN", value: null, evidence: demoEvidence() })), /값이 필요/);
});

test("7. UNKNOWN value must remain null", () => {
  for (const value of [0, 1000, "", false, "unknown"]) {
    expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = { status: "UNKNOWN", value, evidence: null })), /null/);
  }
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = { status: "UNKNOWN", evidence: null })), /null/);
});

test("8. UNKNOWN is not converted to zero / false / NOT_APPLICABLE", () => {
  const value = expectValid(minimalSnapshot());
  for (const key of ["depositAmount", "monthlyRentAmount", "managementFeeAmount", "premiumAmount", "leaseTermMonths", "rentFreeMonths", "constructionPeriodDays", "handoverDate"]) {
    assert.equal(value.leaseTerms[key].status, "UNKNOWN");
    assert.equal(value.leaseTerms[key].value, null);
    assert.notEqual(value.leaseTerms[key].value, 0);
  }
  const withCheckRecord = expectValid(
    withChange((s) => (s.leaseTerms.depositAmount = { status: "UNKNOWN", value: null, evidence: demoEvidence({ confirmationRequirement: "OWNER_CONFIRMATION_REQUIRED" }) })),
  );
  assert.equal(withCheckRecord.leaseTerms.depositAmount.status, "UNKNOWN");
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = { status: "NOT_APPLICABLE", value: null, evidence: null })), /NOT_APPLICABLE/);
});

test("9. 0 amount is preserved as a KNOWN value", () => {
  const value = expectValid(
    withChange((s) => {
      s.leaseTerms.depositAmount = knownValue(0);
      s.leaseTerms.managementFeeAmount = knownValue(0);
      s.leaseTerms.premiumAmount = knownValue(0);
      s.leaseTerms.premiumStatus = { status: "NO_PREMIUM", evidence: demoEvidence() };
    }),
  );
  for (const key of ["depositAmount", "managementFeeAmount", "premiumAmount"]) {
    assert.equal(value.leaseTerms[key].status, "KNOWN");
    assert.equal(value.leaseTerms[key].value, 0);
  }
});

test("10. negative amount is invalid", () => {
  for (const key of ["depositAmount", "monthlyRentAmount", "managementFeeAmount", "premiumAmount"]) {
    expectInvalid(withChange((s) => (s.leaseTerms[key] = knownValue(-1))), new RegExp(key));
  }
});

test("11. NaN amount is invalid", () => {
  expectInvalid(withChange((s) => (s.leaseTerms.monthlyRentAmount = knownValue(Number.NaN))), /monthlyRentAmount/);
});

test("12. Infinity amount is invalid", () => {
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = knownValue(Number.POSITIVE_INFINITY))), /depositAmount/);
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = knownValue("1000"))), /depositAmount/);
});

test("13. GRANTED consent requires evidence", () => {
  expectInvalid(withChange((s) => (s.landlordConsents.exhaust = { status: "GRANTED", evidence: null })), /GRANTED/);
  expectInvalid(withChange((s) => (s.landlordConsents.signage = { status: "GRANTED" })), /GRANTED/);
  const value = expectValid(withChange((s) => (s.landlordConsents.exhaust = directConsent("GRANTED"))));
  assert.equal(value.landlordConsents.exhaust.status, "GRANTED");
});

test("14. REFUSED consent requires evidence", () => {
  expectInvalid(withChange((s) => (s.landlordConsents.bakeryManufacturingUse = { status: "REFUSED", evidence: null })), /REFUSED/);
  const value = expectValid(
    withChange((s) => (s.landlordConsents.bakeryManufacturingUse = { ...directConsent("REFUSED"), summary: "demo: 임대인 서면 회신 기록" })),
  );
  assert.equal(value.landlordConsents.bakeryManufacturingUse.status, "REFUSED");
});

test("15. NOT_CONFIRMED consent needs no evidence and carries no refusal semantics", () => {
  const value = expectValid(
    withChange((s) => (s.landlordConsents.electricalUpgrade = { ...consentNotConfirmed(), evidence: demoEvidence({ confirmationRequirement: "OWNER_CONFIRMATION_REQUIRED" }) })),
  );
  for (const key of ["bakeryManufacturingUse", "exhaust", "signage", "construction"]) {
    assert.equal(value.landlordConsents[key].status, "NOT_CONFIRMED");
    assert.equal(value.landlordConsents[key].evidence, null);
  }
  assert.equal(value.landlordConsents.electricalUpgrade.status, "NOT_CONFIRMED");
  expectInvalid(withChange((s) => (s.landlordConsents.exhaust = { status: "NO", evidence: null })), /status/);
  expectInvalid(withChange((s) => (s.landlordConsents.exhaust = { status: "UNKNOWN", evidence: null })), /status/);
});

test("16. NOT_CONFIRMED and REFUSED stay distinct; validator never converts between them", () => {
  const value = expectValid(
    withChange((s) => {
      s.landlordConsents.exhaust = directConsent("REFUSED");
      s.landlordConsents.construction = consentNotConfirmed();
    }),
  );
  assert.equal(value.landlordConsents.exhaust.status, "REFUSED");
  assert.equal(value.landlordConsents.construction.status, "NOT_CONFIRMED");
  assert.equal(VALIDATION_SOURCE.includes("landlordConfirmation"), false);
});

test("17. NO_RESTRICTION_STATED requires evidence and does not mean permitted", () => {
  expectInvalid(withChange((s) => (s.contractConditions.businessUseRestriction = { status: "NO_RESTRICTION_STATED", evidence: null })), /NO_RESTRICTION_STATED/);
  const value = expectValid(
    withChange((s) => (s.contractConditions.businessUseRestriction = { status: "NO_RESTRICTION_STATED", evidence: demoEvidence({ sourceType: "DOCUMENT", sourceRef: { documentId: "demo-draft-lease-001" } }) })),
  );
  const entry = value.contractConditions.businessUseRestriction;
  assert.equal(entry.status, "NO_RESTRICTION_STATED");
  assert.deepEqual(Object.keys(entry).sort(), ["evidence", "status"]);
  for (const key of ["legallyAllowed", "permitted", "permitApproved"]) {
    expectInvalid(
      withChange((s) => (s.contractConditions.businessUseRestriction = { status: "NO_RESTRICTION_STATED", evidence: demoEvidence(), [key]: true })),
      new RegExp(key),
    );
  }
  expectInvalid(withChange((s) => (s.contractConditions.businessUseRestriction = { status: "YES", evidence: demoEvidence() })), /status/);
});

test("18. NOT_INCLUDED requires evidence; NOT_CONFIRMED does not; they stay distinct", () => {
  expectInvalid(withChange((s) => (s.contractConditions.permitFailureCondition = { status: "NOT_INCLUDED", evidence: null })), /NOT_INCLUDED/);
  const value = expectValid(
    withChange((s) => {
      s.contractConditions.permitFailureCondition = { status: "NOT_INCLUDED", evidence: demoEvidence({ sourceType: "DOCUMENT", sourceRef: { documentId: "demo-draft-lease-001" } }) };
      s.contractConditions.conditionPrecedent = notConfirmed();
      s.contractConditions.restorationScope = { status: "INCLUDED", evidence: demoEvidence(), summary: "demo: 원상복구 조항 기재 확인" };
    }),
  );
  assert.equal(value.contractConditions.permitFailureCondition.status, "NOT_INCLUDED");
  assert.equal(value.contractConditions.conditionPrecedent.status, "NOT_CONFIRMED");
  assert.equal(value.contractConditions.restorationScope.summary, "demo: 원상복구 조항 기재 확인");
  expectInvalid(withChange((s) => (s.contractConditions.restorationScope = { status: "INCLUDED", evidence: demoEvidence(), summary: "  " })), /summary/);
});

test("19. premium amount/status preserved without adequacy judgment; contradictions rejected", () => {
  const value = expectValid(
    withChange((s) => {
      s.leaseTerms.premiumAmount = knownValue(50_000_000, demoEvidence({ sourceType: "TENANT_STATEMENT" }));
      s.leaseTerms.premiumStatus = { status: "PREMIUM_PRESENT", evidence: demoEvidence({ sourceType: "TENANT_STATEMENT" }) };
    }),
  );
  assert.equal(value.leaseTerms.premiumAmount.value, 50_000_000);
  assert.equal(value.leaseTerms.premiumStatus.status, "PREMIUM_PRESENT");
  assert.deepEqual(Object.keys(value.leaseTerms.premiumStatus).sort(), ["evidence", "status"]);

  const amountUnknown = expectValid(withChange((s) => (s.leaseTerms.premiumStatus = { status: "PREMIUM_PRESENT", evidence: demoEvidence() })));
  assert.equal(amountUnknown.leaseTerms.premiumAmount.status, "UNKNOWN");

  expectInvalid(withChange((s) => (s.leaseTerms.premiumStatus = { status: "PREMIUM_PRESENT", evidence: null })), /PREMIUM_PRESENT/);
  expectInvalid(
    withChange((s) => {
      s.leaseTerms.premiumAmount = knownValue(10_000_000);
      s.leaseTerms.premiumStatus = { status: "NO_PREMIUM", evidence: demoEvidence() };
    }),
    /NO_PREMIUM/,
  );
  expectInvalid(
    withChange((s) => {
      s.leaseTerms.premiumAmount = knownValue(0);
      s.leaseTerms.premiumStatus = { status: "PREMIUM_PRESENT", evidence: demoEvidence() };
    }),
    /PREMIUM_PRESENT/,
  );
  for (const key of ["premiumAdequacy", "premiumFair", "recoverable"]) {
    expectInvalid(withChange((s) => (s.leaseTerms[key] = true)), new RegExp(key));
  }
});

test("20. PII-like source references are rejected", () => {
  const withRef = (sourceRef) =>
    withChange((s) => (s.landlordConsents.exhaust = directConsent("GRANTED", demoEvidence({ sourceRef }))));
  expectInvalid(withRef({ opaqueSourceId: "demo.landlord@example.invalid" }), /개인정보/);
  expectInvalid(withRef({ ownerName: "demo" }), /ownerName/);
  expectInvalid(withRef({ phone: "demo" }), /phone/);
  expectInvalid(withRef({ address: "demo" }), /address/);
  expectInvalid(withRef({}), /최소 하나/);
  expectInvalid(withRef({ documentId: "  " }), /documentId/);
  expectValid(withRef({ documentId: "demo-doc-001", stageId: "lease-intake", fieldKey: "exhaust" }));
});

test("21. undefined and forbidden keys are rejected at every level", () => {
  expectInvalid(withChange((s) => (s.extra = 1)), /snapshot\.extra/);
  expectInvalid(withChange((s) => (s.leaseTerms.renewalOption = notConfirmed())), /renewalOption/);
  expectInvalid(withChange((s) => (s.contractConditions.extra = notConfirmed())), /extra/);
  expectInvalid(withChange((s) => (s.landlordConsents.waterDrainageWork = notConfirmed())), /waterDrainageWork/);
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = { ...unknownValue(), note: "x" })), /note/);
  expectInvalid(withChange((s) => (s.leaseTerms.vatTreatment = { ...notConfirmed(), summary: "x" })), /summary/);
  expectInvalid(
    withChange((s) => (s.landlordConsents.exhaust = directConsent("GRANTED", { ...demoEvidence(), checkedBy: "demo" }))),
    /checkedBy/,
  );
  for (const key of ["risk", "riskScore", "verdict", "recommendation", "contractAllowed", "approved", "safe", "score", "riskClass", "hardBlocker", "legalValidity", "enforceable"]) {
    expectInvalid(withChange((s) => (s[key] = true)), /risk\/verdict\/score/);
    expectInvalid(withChange((s) => (s.landlordConsents.exhaust = { ...consentNotConfirmed(), [key]: true })), /risk\/verdict\/score/);
  }
});

test("22. input object is neither mutated nor frozen", () => {
  const input = withChange((s) => (s.landlordConsents.exhaust = directConsent("GRANTED")));
  const before = JSON.stringify(input);
  const result = validate(input);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.landlordConsents.exhaust.evidence), false);
  assert.notEqual(result.value, input);
  assert.notEqual(result.value.landlordConsents, input.landlordConsents);
});

test("23. output is deeply frozen", () => {
  const value = expectValid(withChange((s) => (s.landlordConsents.exhaust = directConsent("GRANTED"))));
  for (const node of [
    value,
    value.leaseTerms,
    value.contractConditions,
    value.landlordConsents,
    value.leaseTerms.depositAmount,
    value.landlordConsents.exhaust,
    value.landlordConsents.exhaust.evidence,
    value.landlordConsents.exhaust.evidence.sourceRef,
  ]) {
    assert.ok(Object.isFrozen(node));
  }
  assert.throws(() => {
    "use strict";
    value.landlordConsents.exhaust.status = "REFUSED";
  }, TypeError);
});

test("24. output is JSON serializable without loss", () => {
  const value = expectValid(
    withChange((s) => {
      s.leaseTerms.depositAmount = knownValue(0);
      s.leaseTerms.handoverDate = knownValue("2026-11-15");
      s.landlordConsents.signage = { status: "NOT_APPLICABLE", evidence: demoEvidence({ sourceType: "FIELD_CHECK" }), consentAuthority: "UNKNOWN" };
    }),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});

test("25. createsRisk is false and cannot be true", () => {
  assert.equal(expectValid(minimalSnapshot()).createsRisk, false);
  expectInvalid(withChange((s) => (s.createsRisk = true)), /createsRisk/);
  expectInvalid(withChange((s) => delete s.createsRisk), /createsRisk/);
});

test("26. createsVerdict is false and cannot be true", () => {
  assert.equal(expectValid(minimalSnapshot()).createsVerdict, false);
  expectInvalid(withChange((s) => (s.createsVerdict = true)), /createsVerdict/);
});

test("27. createsScore is false and cannot be true", () => {
  assert.equal(expectValid(minimalSnapshot()).createsScore, false);
  expectInvalid(withChange((s) => (s.createsScore = true)), /createsScore/);
});

test("28. output contains no score / recommendation / verdict / risk keys", () => {
  const value = expectValid(
    withChange((s) => {
      s.landlordConsents.exhaust = directConsent("REFUSED");
      s.contractConditions.businessUseRestriction = { status: "RESTRICTION_PRESENT", evidence: demoEvidence(), summary: "demo" };
    }),
  );
  const keys = collectKeys(value).map((key) => key.toLowerCase());
  for (const forbidden of ["score", "riskscore", "recommendation", "verdict", "finalstatus", "grade", "approved", "contractallowed", "risk", "riskclass", "severity", "safe"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
});

test("29. no RentalMarketResult / research dependency", () => {
  for (const line of [...importLines(TYPES_SOURCE), ...importLines(VALIDATION_SOURCE)]) {
    assert.doesNotMatch(line, /research|rental-market|RentalMarketResult|LeaseResearchRecord|lease-adapter/);
  }
  assert.doesNotMatch(VALIDATION_SOURCE, /RentalMarketResult|referenceNumericSummaries|sampleSufficiency/);
  const keys = collectKeys(expectValid(minimalSnapshot()));
  for (const key of ["sampleCount", "sampleSufficiency", "median", "referenceNumericSummaries", "selectedRecordIds"]) {
    assert.equal(keys.includes(key), false, key);
  }
});

test("30. no Economic plannedRent dependency", () => {
  for (const line of [...importLines(TYPES_SOURCE), ...importLines(VALIDATION_SOURCE)]) {
    assert.doesNotMatch(line, /economic/i);
  }
  assert.doesNotMatch(TYPES_SOURCE, /plannedRent|baseRentCeiling|referenceRentPlanning/);
  assert.doesNotMatch(VALIDATION_SOURCE, /plannedRent|baseRentCeiling|referenceRentPlanning/);
});

test("31. term / date / VAT fields: KNOWN shape and status evidence validated", () => {
  const value = expectValid(
    withChange((s) => {
      s.leaseTerms.leaseTermMonths = knownValue(60);
      s.leaseTerms.rentFreeMonths = knownValue(0);
      s.leaseTerms.constructionPeriodDays = knownValue(30);
      s.leaseTerms.handoverDate = knownValue("2026-12-01");
      s.leaseTerms.vatTreatment = { status: "EXCLUDED", evidence: demoEvidence() };
    }),
  );
  assert.equal(value.leaseTerms.rentFreeMonths.value, 0);
  assert.equal(value.leaseTerms.vatTreatment.status, "EXCLUDED");
  expectInvalid(withChange((s) => (s.leaseTerms.leaseTermMonths = knownValue(0))), /leaseTermMonths/);
  expectInvalid(withChange((s) => (s.leaseTerms.leaseTermMonths = knownValue(12.5))), /leaseTermMonths/);
  expectInvalid(withChange((s) => (s.leaseTerms.constructionPeriodDays = knownValue(1.5))), /constructionPeriodDays/);
  expectInvalid(withChange((s) => (s.leaseTerms.handoverDate = knownValue("2026-02-30"))), /handoverDate/);
  expectInvalid(withChange((s) => (s.leaseTerms.handoverDate = knownValue("2026/12/01"))), /handoverDate/);
  expectInvalid(withChange((s) => (s.leaseTerms.vatTreatment = { status: "INCLUDED", evidence: null })), /INCLUDED/);
  expectInvalid(withChange((s) => (s.leaseTerms.vatTreatment = { status: "VAT_FREE", evidence: demoEvidence() })), /status/);
});

test("32. evidence enums must be existing shared values", () => {
  const withEvidence = (overrides) =>
    withChange((s) => (s.leaseTerms.depositAmount = knownValue(1000, demoEvidence(overrides))));
  expectInvalid(withEvidence({ sourceType: "LANDLORD_STATEMENT" }), /sourceType/);
  expectInvalid(withEvidence({ verificationStatus: "CONFIRMED" }), /verificationStatus/);
  expectInvalid(withEvidence({ confirmationRequirement: "LANDLORD_REQUIRED" }), /confirmationRequirement/);
  expectValid(withEvidence({ verificationStatus: "VERIFIED", sourceType: "DOCUMENT", confirmationRequirement: "NONE" }));
});

const consentWith = (status, consentAuthority, evidenceOverrides = {}) =>
  withChange((s) => (s.landlordConsents.exhaust = { status, evidence: demoEvidence(evidenceOverrides), consentAuthority }));

test("33. GRANTED with customer-input provenance is invalid", () => {
  expectInvalid(consentWith("GRANTED", "CUSTOMER_REPORTED", { sourceType: "CUSTOMER_INPUT" }), /NOT_CONFIRMED로 둡니다/);
  expectInvalid(consentWith("GRANTED", "DIRECT_AUTHORITY", { sourceType: "CUSTOMER_INPUT" }), /sourceType=OWNER_STATEMENT/);
  expectInvalid(consentWith("GRANTED", "DOCUMENTED_AUTHORITY", { sourceType: "CUSTOMER_INPUT" }), /sourceType=DOCUMENT/);
});

test("34. REFUSED with customer-input provenance is invalid", () => {
  expectInvalid(consentWith("REFUSED", "CUSTOMER_REPORTED", { sourceType: "CUSTOMER_INPUT" }), /NOT_CONFIRMED로 둡니다/);
  expectInvalid(consentWith("REFUSED", "DIRECT_AUTHORITY", { sourceType: "CUSTOMER_INPUT" }), /sourceType=OWNER_STATEMENT/);
});

test("35. GRANTED with direct or documented authority evidence is valid", () => {
  const direct = expectValid(consentWith("GRANTED", "DIRECT_AUTHORITY", { sourceType: "OWNER_STATEMENT" }));
  assert.equal(direct.landlordConsents.exhaust.status, "GRANTED");
  assert.equal(direct.landlordConsents.exhaust.consentAuthority, "DIRECT_AUTHORITY");
  assert.equal(direct.landlordConsents.exhaust.evidence.verificationStatus, "UNKNOWN");
  const documented = expectValid(
    consentWith("GRANTED", "DOCUMENTED_AUTHORITY", { sourceType: "DOCUMENT", sourceRef: { documentId: "demo-consent-letter-001" } }),
  );
  assert.equal(documented.landlordConsents.exhaust.consentAuthority, "DOCUMENTED_AUTHORITY");
  assert.equal(documented.landlordConsents.exhaust.evidence.sourceType, "DOCUMENT");
});

test("36. REFUSED with direct or documented authority evidence is valid", () => {
  const direct = expectValid(consentWith("REFUSED", "DIRECT_AUTHORITY", { sourceType: "OWNER_STATEMENT" }));
  assert.equal(direct.landlordConsents.exhaust.status, "REFUSED");
  const documented = expectValid(consentWith("REFUSED", "DOCUMENTED_AUTHORITY", { sourceType: "DOCUMENT" }));
  assert.equal(documented.landlordConsents.exhaust.status, "REFUSED");
});

test("37. RELAYED / UNKNOWN authority cannot establish GRANTED or REFUSED", () => {
  for (const status of ["GRANTED", "REFUSED"]) {
    for (const authority of ["RELAYED", "UNKNOWN", "CUSTOMER_REPORTED"]) {
      for (const sourceType of ["OWNER_STATEMENT", "DOCUMENT", "TENANT_STATEMENT"]) {
        expectInvalid(consentWith(status, authority, { sourceType }), /DIRECT_AUTHORITY 또는 DOCUMENTED_AUTHORITY/);
      }
    }
  }
  expectInvalid(consentWith("GRANTED", "BROKER", { sourceType: "OWNER_STATEMENT" }), /consentAuthority/);
  expectInvalid(withChange((s) => (s.landlordConsents.exhaust = { status: "GRANTED", evidence: demoEvidence() })), /consentAuthority/);
});

test("38. NOT_CONFIRMED may carry customer or relayed evidence and is not converted", () => {
  const customer = expectValid(consentWith("NOT_CONFIRMED", "CUSTOMER_REPORTED", { sourceType: "CUSTOMER_INPUT" }));
  assert.equal(customer.landlordConsents.exhaust.status, "NOT_CONFIRMED");
  assert.equal(customer.landlordConsents.exhaust.consentAuthority, "CUSTOMER_REPORTED");
  const relayed = expectValid(
    consentWith("NOT_CONFIRMED", "RELAYED", { sourceType: "TENANT_STATEMENT", confirmationRequirement: "OWNER_CONFIRMATION_REQUIRED" }),
  );
  assert.equal(relayed.landlordConsents.exhaust.status, "NOT_CONFIRMED");
  assert.equal(relayed.landlordConsents.exhaust.consentAuthority, "RELAYED");
  assert.equal(relayed.landlordConsents.exhaust.evidence.confirmationRequirement, "OWNER_CONFIRMATION_REQUIRED");
  expectInvalid(
    withChange((s) => (s.landlordConsents.exhaust = { status: "NOT_CONFIRMED", evidence: null, consentAuthority: "DIRECT_AUTHORITY" })),
    /evidence가 필요/,
  );
});

test("39. evidence without observedAt is invalid", () => {
  const evidence = demoEvidence();
  delete evidence.observedAt;
  expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = knownValue(1000, evidence))), /observedAt/);
  expectInvalid(withChange((s) => (s.landlordConsents.exhaust = directConsent("GRANTED", evidence))), /observedAt/);
});

test("40. invalid observedAt is invalid", () => {
  for (const observedAt of ["not-a-date", "", null, 1727758800000, "2026-13-45T10:00:00Z"]) {
    expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = knownValue(1000, demoEvidence({ observedAt })))), /observedAt/);
  }
});

test("41. observedAt without timezone is invalid", () => {
  for (const observedAt of ["2026-09-20T10:00:00", "2026-09-20"]) {
    expectInvalid(withChange((s) => (s.leaseTerms.depositAmount = knownValue(1000, demoEvidence({ observedAt })))), /observedAt/);
  }
});

test("42. observedAt may differ from capturedAt", () => {
  const value = expectValid(
    withChange((s) => {
      s.capturedAt = "2026-10-01T09:00:00+09:00";
      s.leaseTerms.monthlyRentAmount = knownValue(2_000_000, demoEvidence({ sourceType: "DOCUMENT", observedAt: "2026-09-20T15:30:00+09:00" }));
    }),
  );
  assert.equal(value.capturedAt, "2026-10-01T09:00:00+09:00");
  assert.equal(value.leaseTerms.monthlyRentAmount.evidence.observedAt, "2026-09-20T15:30:00+09:00");
  assert.equal(value.leaseTerms.monthlyRentAmount.evidence.verificationStatus, "UNKNOWN");
});

test("43. renewalCondition INCLUDED with evidence is valid", () => {
  const value = expectValid(
    withChange((s) => (s.contractConditions.renewalCondition = { status: "INCLUDED", evidence: demoEvidence({ sourceType: "DOCUMENT" }), summary: "demo: 갱신 관련 문구 기재" })),
  );
  assert.equal(value.contractConditions.renewalCondition.status, "INCLUDED");
  expectInvalid(withChange((s) => (s.contractConditions.renewalCondition = { status: "INCLUDED", evidence: null })), /INCLUDED/);
});

test("44. renewalCondition NOT_INCLUDED with evidence is valid", () => {
  const value = expectValid(
    withChange((s) => (s.contractConditions.renewalCondition = { status: "NOT_INCLUDED", evidence: demoEvidence({ sourceType: "DOCUMENT" }) })),
  );
  assert.equal(value.contractConditions.renewalCondition.status, "NOT_INCLUDED");
  expectInvalid(withChange((s) => (s.contractConditions.renewalCondition = { status: "NOT_INCLUDED", evidence: null })), /NOT_INCLUDED/);
});

test("45. renewalCondition NOT_CONFIRMED is valid and remains required", () => {
  const value = expectValid(minimalSnapshot());
  assert.equal(value.contractConditions.renewalCondition.status, "NOT_CONFIRMED");
  assert.equal(value.contractConditions.renewalCondition.evidence, null);
  expectInvalid(withChange((s) => delete s.contractConditions.renewalCondition), /renewalCondition/);
});

test("46. renewalCondition rejects legal-renewal fields", () => {
  for (const key of ["legallyRenewable", "renewalRight", "renewalRightAvailable", "statutoryRenewal", "renewalGuaranteed"]) {
    expectInvalid(
      withChange((s) => (s.contractConditions.renewalCondition = { status: "INCLUDED", evidence: demoEvidence(), [key]: true })),
      /risk\/verdict\/score\/법적판단/,
    );
    expectInvalid(withChange((s) => (s.contractConditions[key] = true)), /risk\/verdict\/score\/법적판단/);
  }
  for (const key of ["legalValidity", "enforceable"]) {
    expectInvalid(
      withChange((s) => (s.contractConditions.renewalCondition = { status: "INCLUDED", evidence: demoEvidence(), [key]: true })),
      /risk\/verdict\/score\/법적판단/,
    );
  }
  const keys = collectKeys(expectValid(minimalSnapshot())).map((key) => key.toLowerCase());
  for (const forbidden of ["legallyrenewable", "renewalright", "statutoryrenewal", "renewalguaranteed"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
});
