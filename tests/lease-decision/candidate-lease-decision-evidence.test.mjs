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
const {
  CANDIDATE_LEASE_DECISION_EVIDENCE_SCHEMA_VERSION,
  buildCandidateLeaseDecisionEvidence: build,
} = lib("lib/lease-decision/decision-evidence-adapter.ts");

const ADAPTER_SOURCE = fs
  .readFileSync(path.join(repositoryRoot, "lib/lease-decision/decision-evidence-adapter.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// ---- fixtures (sample/demo only; not real store, landlord, customer, or lease data) ----

const DEMO_CANDIDATE_STORE_ID = "demo-candidate-store-001";
const DEMO_SNAPSHOT_ID = "demo-lease-snapshot-001";
const DEMO_CAPTURED_AT = "2026-10-01T05:00:00.000Z";
const DEMO_OBSERVED_AT = "2026-09-20T10:00:00+09:00";
const DEMO_SUMMARY_MARKER = "demo-summary-marker-7f3a";
const TOTAL_ITEMS = 25;

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
const withEvidence = (status, extra = {}) => ({ status, evidence: demoEvidence(), ...extra });

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

function richSnapshot() {
  return withChange((s) => {
    s.leaseTerms.depositAmount = knownValue(30_000_000);
    s.leaseTerms.monthlyRentAmount = knownValue(2_500_000, demoEvidence({ sourceType: "DOCUMENT", verificationStatus: "VERIFIED", confirmationRequirement: "NONE" }));
    s.leaseTerms.managementFeeAmount = knownValue(0);
    s.leaseTerms.premiumAmount = knownValue(50_000_000, demoEvidence({ sourceType: "TENANT_STATEMENT" }));
    s.leaseTerms.premiumStatus = withEvidence("PREMIUM_PRESENT");
    s.leaseTerms.leaseTermMonths = knownValue(60);
    s.contractConditions.businessUseRestriction = withEvidence("RESTRICTION_PRESENT", { summary: DEMO_SUMMARY_MARKER });
    s.contractConditions.permitFailureCondition = withEvidence("NOT_INCLUDED", { summary: DEMO_SUMMARY_MARKER });
    s.contractConditions.restorationScope = withEvidence("INCLUDED", { summary: DEMO_SUMMARY_MARKER });
    s.landlordConsents.exhaust = { ...directConsent("REFUSED"), summary: DEMO_SUMMARY_MARKER };
    s.landlordConsents.bakeryManufacturingUse = directConsent("GRANTED", demoEvidence({ sourceType: "OWNER_STATEMENT", confirmationRequirement: "DOCUMENT_REQUIRED" }));
    s.landlordConsents.signage = { status: "NOT_APPLICABLE", evidence: demoEvidence({ sourceType: "FIELD_CHECK" }), consentAuthority: "UNKNOWN" };
    s.landlordConsents.electricalUpgrade = {
      status: "NOT_CONFIRMED",
      evidence: demoEvidence({ sourceType: "TENANT_STATEMENT", confirmationRequirement: "OWNER_CONFIRMATION_REQUIRED" }),
      consentAuthority: "RELAYED",
    };
  });
}

function expectOk(snapshot) {
  const result = build({ snapshot });
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.value;
}

function allItems(value) {
  return [...value.observedFacts, ...value.observedConstraints, ...value.missingInformation, ...value.expertReviewItems];
}

function findItem(value, key) {
  const matches = allItems(value).filter((entry) => entry.id.endsWith(`|LEASE|${key}`));
  assert.equal(matches.length, 1, `exactly one item for ${key}`);
  return matches[0];
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
  return source.split("\n").filter((line) => /\bfrom\s+["']/.test(line) || /^\s*import\b/.test(line));
}

// ---- tests ----

test("1. valid snapshot → adapter success", () => {
  const value = expectOk(minimalSnapshot());
  assert.equal(value.schemaVersion, "candidate-lease-decision-evidence-v1");
  assert.equal(value.schemaVersion, CANDIDATE_LEASE_DECISION_EVIDENCE_SCHEMA_VERSION);
  assert.equal(allItems(value).length, TOTAL_ITEMS);
  assert.equal(value.missingInformation.length, TOTAL_ITEMS);
  assert.equal(value.observedFacts.length, 0);
});

test("2. invalid snapshot → failure without partial evidence", () => {
  const invalid = build({ snapshot: withChange((s) => (s.leaseTerms.monthlyRentAmount = knownValue(-1))) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "INVALID_CANDIDATE_LEASE_DECISION_EVIDENCE");
  assert.match(invalid.message, /monthlyRentAmount/);
  assert.equal("value" in invalid, false);
  assert.ok(Object.isFrozen(invalid));
  assert.ok(Object.isFrozen(invalid.errors));
  for (const input of [null, undefined, "x", [], {}, { snapshot: null }]) {
    const result = build(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, "INVALID_CANDIDATE_LEASE_DECISION_EVIDENCE");
  }
  const extraKey = build({ snapshot: minimalSnapshot(), rentalMarketResult: {} });
  assert.equal(extraKey.ok, false);
  assert.match(extraKey.message, /rentalMarketResult/);
  const piiId = build({ snapshot: withChange((s) => (s.snapshotId = "demo.owner@example.invalid")) });
  assert.equal(piiId.ok, false);
  assert.match(piiId.message, /snapshotId/);
});

test("3. candidateStoreId preserved", () => {
  assert.equal(expectOk(minimalSnapshot()).candidateStoreId, DEMO_CANDIDATE_STORE_ID);
});

test("4. snapshotId preserved", () => {
  assert.equal(expectOk(minimalSnapshot()).snapshotId, DEMO_SNAPSHOT_ID);
});

test("5. capturedAt preserved", () => {
  assert.equal(expectOk(minimalSnapshot()).capturedAt, DEMO_CAPTURED_AT);
});

test("6. KNOWN monthly rent → OBSERVED_FACT CORE (OBSERVATION)", () => {
  const value = expectOk(richSnapshot());
  const entry = findItem(value, "candidate-term-monthly-rent");
  assert.equal(entry.id, "LEASE|OBSERVED_FACT|LEASE|candidate-term-monthly-rent");
  assert.equal(entry.bucket, "OBSERVED_FACT");
  assert.equal(entry.importance, "CORE");
  assert.equal(entry.sourceDomain, "LEASE");
  assert.equal(entry.category, "LEASE");
  assert.equal(entry.nature, "OBSERVATION");
  assert.ok(value.observedFacts.includes(entry));
});

test("7. UNKNOWN monthly rent → MISSING_INFORMATION CORE", () => {
  const entry = findItem(expectOk(minimalSnapshot()), "candidate-term-monthly-rent");
  assert.equal(entry.id, "LEASE|MISSING_INFORMATION|LEASE|candidate-term-monthly-rent");
  assert.equal(entry.importance, "CORE");
  assert.equal(entry.nature, "OBSERVATION");
  assert.notEqual(entry.nature, "REFERENCE_SUMMARY");
});

test("8. KNOWN 0 managementFee → OBSERVED_FACT with 0 preserved", () => {
  const value = expectOk(richSnapshot());
  const entry = findItem(value, "candidate-term-management-fee");
  assert.equal(entry.bucket, "OBSERVED_FACT");
  assert.equal(entry.importance, "SUPPORTING");
  assert.equal(value.typedState.leaseTerms.managementFeeAmount.status, "KNOWN");
  assert.equal(value.typedState.leaseTerms.managementFeeAmount.value, 0);
});

test("9. businessUseRestriction RESTRICTION_PRESENT → OBSERVED_CONSTRAINT CORE", () => {
  const value = expectOk(richSnapshot());
  const entry = findItem(value, "candidate-condition-business-use-restriction");
  assert.equal(entry.bucket, "OBSERVED_CONSTRAINT");
  assert.equal(entry.importance, "CORE");
  assert.ok(value.observedConstraints.includes(entry));
});

test("10. NO_RESTRICTION_STATED → OBSERVED_FACT", () => {
  const value = expectOk(withChange((s) => (s.contractConditions.businessUseRestriction = withEvidence("NO_RESTRICTION_STATED"))));
  const entry = findItem(value, "candidate-condition-business-use-restriction");
  assert.equal(entry.bucket, "OBSERVED_FACT");
  assert.equal(value.typedState.contractConditions.businessUseRestriction.status, "NO_RESTRICTION_STATED");
});

test("11. restriction NOT_CONFIRMED → MISSING_INFORMATION", () => {
  const value = expectOk(minimalSnapshot());
  assert.equal(findItem(value, "candidate-condition-business-use-restriction").bucket, "MISSING_INFORMATION");
  assert.equal(findItem(value, "candidate-condition-business-use-restriction").importance, "CORE");
  assert.equal(findItem(value, "candidate-condition-sublease-restriction").importance, "SUPPORTING");
  assert.equal(findItem(value, "candidate-condition-management-regulation").importance, "SUPPORTING");
  assert.equal(value.observedConstraints.length, 0);
});

test("12. permitFailureCondition INCLUDED → OBSERVED_FACT", () => {
  const value = expectOk(withChange((s) => (s.contractConditions.permitFailureCondition = withEvidence("INCLUDED"))));
  assert.equal(findItem(value, "candidate-condition-permit-failure").bucket, "OBSERVED_FACT");
});

test("13. permitFailureCondition NOT_INCLUDED → OBSERVED_FACT, not a constraint", () => {
  const value = expectOk(withChange((s) => (s.contractConditions.permitFailureCondition = withEvidence("NOT_INCLUDED"))));
  const entry = findItem(value, "candidate-condition-permit-failure");
  assert.equal(entry.bucket, "OBSERVED_FACT");
  assert.equal(value.observedConstraints.length, 0);
});

test("14. permitFailureCondition NOT_CONFIRMED → MISSING_INFORMATION CORE", () => {
  const entry = findItem(expectOk(minimalSnapshot()), "candidate-condition-permit-failure");
  assert.equal(entry.bucket, "MISSING_INFORMATION");
  assert.equal(entry.importance, "CORE");
});

test("15. renewalCondition mapping (SUPPORTING)", () => {
  const expected = { INCLUDED: "OBSERVED_FACT", NOT_INCLUDED: "OBSERVED_FACT", NOT_APPLICABLE: "OBSERVED_FACT", NOT_CONFIRMED: "MISSING_INFORMATION" };
  for (const [status, bucket] of Object.entries(expected)) {
    const value = expectOk(
      withChange((s) => (s.contractConditions.renewalCondition = status === "NOT_CONFIRMED" ? notConfirmed() : withEvidence(status))),
    );
    const entry = findItem(value, "candidate-condition-renewal");
    assert.equal(entry.bucket, bucket, status);
    assert.equal(entry.importance, "SUPPORTING");
    assert.equal(value.typedState.contractConditions.renewalCondition.status, status);
  }
});

test("16. consent GRANTED → OBSERVED_FACT", () => {
  const entry = findItem(expectOk(richSnapshot()), "candidate-consent-bakery-manufacturing-use");
  assert.equal(entry.bucket, "OBSERVED_FACT");
  assert.equal(entry.importance, "CORE");
});

test("17. consent REFUSED → OBSERVED_CONSTRAINT", () => {
  const value = expectOk(richSnapshot());
  const entry = findItem(value, "candidate-consent-exhaust");
  assert.equal(entry.bucket, "OBSERVED_CONSTRAINT");
  assert.equal(entry.importance, "CORE");
  assert.ok(value.observedConstraints.includes(entry));
});

test("18. consent NOT_CONFIRMED → MISSING_INFORMATION", () => {
  const value = expectOk(minimalSnapshot());
  for (const key of ["bakery-manufacturing-use", "exhaust", "electrical-upgrade", "construction"]) {
    const entry = findItem(value, `candidate-consent-${key}`);
    assert.equal(entry.bucket, "MISSING_INFORMATION");
    assert.equal(entry.importance, "CORE");
  }
  assert.equal(findItem(value, "candidate-consent-signage").importance, "SUPPORTING");
  const relayed = findItem(expectOk(richSnapshot()), "candidate-consent-electrical-upgrade");
  assert.equal(relayed.bucket, "MISSING_INFORMATION");
});

test("19. consent NOT_APPLICABLE → OBSERVED_FACT", () => {
  const entry = findItem(expectOk(richSnapshot()), "candidate-consent-signage");
  assert.equal(entry.bucket, "OBSERVED_FACT");
  assert.equal(entry.importance, "SUPPORTING");
});

test("20. REFUSED does not create Risk", () => {
  const value = expectOk(richSnapshot());
  const entry = findItem(value, "candidate-consent-exhaust");
  assert.equal(value.createsRisk, false);
  assert.equal(value.expertReviewItems.length, 0);
  for (const key of ["riskClass", "severity", "hardBlocker", "findingId", "ruleId"]) {
    assert.equal(key in entry, false, key);
    assert.equal(collectKeys(value).includes(key), false, key);
  }
  assert.doesNotMatch(entry.description, /HARD_BLOCKER|BLOCKER|RISK/i);
});

test("21. premium present → OBSERVED_FACT", () => {
  const value = expectOk(richSnapshot());
  assert.equal(findItem(value, "candidate-term-premium-status").bucket, "OBSERVED_FACT");
  assert.equal(findItem(value, "candidate-term-premium-amount").bucket, "OBSERVED_FACT");
  assert.equal(value.typedState.leaseTerms.premiumStatus.status, "PREMIUM_PRESENT");
  assert.equal(value.typedState.leaseTerms.premiumAmount.value, 50_000_000);
  const noPremium = expectOk(withChange((s) => (s.leaseTerms.premiumStatus = withEvidence("NO_PREMIUM"))));
  assert.equal(findItem(noPremium, "candidate-term-premium-status").bucket, "OBSERVED_FACT");
});

test("22. premium not confirmed → MISSING_INFORMATION", () => {
  const entry = findItem(expectOk(minimalSnapshot()), "candidate-term-premium-status");
  assert.equal(entry.bucket, "MISSING_INFORMATION");
  assert.equal(entry.importance, "SUPPORTING");
});

test("23. verificationStatus preserved without upgrade", () => {
  const value = expectOk(richSnapshot());
  const owner = findItem(value, "candidate-consent-bakery-manufacturing-use");
  assert.equal(owner.verificationStatus, "UNKNOWN");
  assert.equal(value.typedState.landlordConsents.bakeryManufacturingUse.evidence.verificationStatus, "UNKNOWN");
  assert.equal(findItem(value, "candidate-term-monthly-rent").verificationStatus, "VERIFIED");
  assert.equal("verificationStatus" in findItem(expectOk(minimalSnapshot()), "candidate-term-monthly-rent"), false);
});

test("24. sourceType preserved", () => {
  const value = expectOk(richSnapshot());
  assert.equal(findItem(value, "candidate-term-monthly-rent").sourceType, "DOCUMENT");
  assert.equal(findItem(value, "candidate-term-premium-amount").sourceType, "TENANT_STATEMENT");
  assert.equal(value.typedState.leaseTerms.premiumAmount.evidence.sourceType, "TENANT_STATEMENT");
});

test("25. confirmationRequirement preserved", () => {
  const value = expectOk(richSnapshot());
  assert.equal(findItem(value, "candidate-term-monthly-rent").confirmationRequirement, "NONE");
  assert.equal(findItem(value, "candidate-consent-electrical-upgrade").confirmationRequirement, "OWNER_CONFIRMATION_REQUIRED");
  assert.equal(value.typedState.landlordConsents.electricalUpgrade.evidence.confirmationRequirement, "OWNER_CONFIRMATION_REQUIRED");
});

test("26. observedAt preserved in typedState (not in item or description)", () => {
  const value = expectOk(richSnapshot());
  assert.equal(value.typedState.leaseTerms.monthlyRentAmount.evidence.observedAt, DEMO_OBSERVED_AT);
  assert.equal(value.typedState.landlordConsents.exhaust.evidence.observedAt, DEMO_OBSERVED_AT);
  assert.equal(value.typedState.leaseTerms.depositAmount.evidence.observedAt, DEMO_OBSERVED_AT);
  assert.equal(expectOk(minimalSnapshot()).typedState.leaseTerms.depositAmount.evidence, null);
  for (const entry of allItems(value)) {
    assert.equal("observedAt" in entry, false);
    assert.equal(entry.description.includes(DEMO_OBSERVED_AT), false);
  }
});

test("27. consentAuthority preserved in typedState (not in description)", () => {
  const value = expectOk(richSnapshot());
  assert.equal(value.typedState.landlordConsents.exhaust.consentAuthority, "DIRECT_AUTHORITY");
  assert.equal(value.typedState.landlordConsents.electricalUpgrade.consentAuthority, "RELAYED");
  assert.equal(value.typedState.landlordConsents.signage.consentAuthority, "UNKNOWN");
  for (const entry of allItems(value)) {
    assert.doesNotMatch(entry.description, /DIRECT_AUTHORITY|DOCUMENTED_AUTHORITY|RELAYED|CUSTOMER_REPORTED|authority/);
  }
});

test("28. snapshot summary text is not copied anywhere in the output", () => {
  const value = expectOk(richSnapshot());
  assert.equal(JSON.stringify(value).includes(DEMO_SUMMARY_MARKER), false);
  assert.equal(collectKeys(value.typedState).includes("summary"), false);
});

test("29. typedState carries status/value so descriptions need no parsing", () => {
  const value = expectOk(richSnapshot());
  const { leaseTerms, contractConditions, landlordConsents } = value.typedState;
  assert.equal(Object.keys(leaseTerms).length, 10);
  assert.equal(Object.keys(contractConditions).length, 10);
  assert.equal(Object.keys(landlordConsents).length, 5);
  for (const entry of [...Object.values(leaseTerms), ...Object.values(contractConditions), ...Object.values(landlordConsents)]) {
    assert.equal(typeof entry.status, "string");
  }
  assert.equal(leaseTerms.monthlyRentAmount.value, 2_500_000);
  for (const entry of allItems(value)) {
    assert.equal(/2500000|2,500,000|30000000|50000000/.test(entry.description), false);
  }
  assert.equal(findItem(value, "candidate-term-monthly-rent").description, "candidate lease monthlyRentAmount = KNOWN");
  assert.equal(findItem(value, "candidate-condition-business-use-restriction").description, "candidate businessUseRestriction = RESTRICTION_PRESENT");
  assert.equal(findItem(value, "candidate-consent-exhaust").description, "candidate landlord exhaust consent = REFUSED");
});

test("30. no RentalMarket / research dependency", () => {
  for (const line of importLines(ADAPTER_SOURCE)) {
    assert.doesNotMatch(line, /research|rental-market|lease-adapter|RentalMarketResult|LeaseResearchRecord/);
  }
  assert.doesNotMatch(ADAPTER_SOURCE, /RentalMarketResult|LeaseResearchRecord|referenceNumericSummaries|median/);
  const keys = collectKeys(expectOk(richSnapshot()));
  for (const key of ["referenceNumericSummaries", "referenceLimitations", "median", "sampleCount", "sampleSufficiency"]) {
    assert.equal(keys.includes(key), false, key);
  }
  for (const entry of allItems(expectOk(richSnapshot()))) assert.notEqual(entry.nature, "REFERENCE_SUMMARY");
});

test("31. no Economic dependency", () => {
  for (const line of importLines(ADAPTER_SOURCE)) assert.doesNotMatch(line, /economic/i);
  assert.doesNotMatch(ADAPTER_SOURCE, /plannedRent|baseRentCeiling|referenceRentPlanning/);
});

test("32. expertReviewItems always empty", () => {
  const value = expectOk(
    withChange((s) => {
      for (const key of Object.keys(s.contractConditions)) {
        s.contractConditions[key] = withEvidence(key.endsWith("Restriction") || key === "managementRegulation" ? "RESTRICTION_PRESENT" : "INCLUDED", { summary: "demo" });
      }
    }),
  );
  assert.deepEqual(value.expertReviewItems, []);
  assert.equal(expectOk(minimalSnapshot()).expertReviewItems.length, 0);
});

test("33. createsRisk === false", () => {
  assert.equal(expectOk(richSnapshot()).createsRisk, false);
});

test("34. createsVerdict === false", () => {
  assert.equal(expectOk(richSnapshot()).createsVerdict, false);
});

test("35. createsScore === false", () => {
  assert.equal(expectOk(richSnapshot()).createsScore, false);
});

test("36. no riskScore / verdict / recommendation fields", () => {
  const keys = collectKeys(expectOk(richSnapshot())).map((key) => key.toLowerCase());
  for (const forbidden of ["riskscore", "score", "verdict", "recommendation", "finalstatus", "grade", "approved", "contractallowed", "risk", "safe", "legalvalidity"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
  const text = JSON.stringify(expectOk(richSnapshot()));
  assert.doesNotMatch(text, /추천|보류|위험|계약 가능|계약 불가/);
});

test("37. deterministic ids and order", () => {
  const first = expectOk(richSnapshot());
  const second = expectOk(richSnapshot());
  assert.deepEqual(first, second);
  const ids = allItems(first).map((entry) => entry.id);
  assert.equal(ids.length, TOTAL_ITEMS);
  assert.equal(new Set(ids).size, TOTAL_ITEMS);
  for (const id of ids) assert.match(id, /^LEASE\|(OBSERVED_FACT|OBSERVED_CONSTRAINT|MISSING_INFORMATION)\|LEASE\|candidate-(term|condition|consent)-[a-z-]+$/);
  for (const list of [first.observedFacts, first.observedConstraints, first.missingInformation]) {
    for (let index = 1; index < list.length; index += 1) {
      const previous = list[index - 1];
      const current = list[index];
      if (previous.importance === current.importance) assert.ok(previous.id.localeCompare(current.id) < 0);
      else assert.equal(previous.importance, "CORE");
    }
  }
});

test("38. input snapshot is neither mutated nor frozen", () => {
  const snapshot = richSnapshot();
  const before = JSON.stringify(snapshot);
  expectOk(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(Object.isFrozen(snapshot), false);
  assert.equal(Object.isFrozen(snapshot.landlordConsents.exhaust), false);
  assert.equal(Object.isFrozen(snapshot.landlordConsents.exhaust.evidence), false);
});

test("39. output is frozen (arrays, items, typedState)", () => {
  const value = expectOk(richSnapshot());
  for (const node of [
    value,
    value.observedFacts,
    value.observedConstraints,
    value.missingInformation,
    value.expertReviewItems,
    value.observedFacts[0],
    value.observedFacts[0].sourceRef,
    value.typedState,
    value.typedState.leaseTerms,
    value.typedState.leaseTerms.monthlyRentAmount,
    value.typedState.leaseTerms.monthlyRentAmount.evidence,
    value.typedState.contractConditions.businessUseRestriction,
    value.typedState.landlordConsents.exhaust,
    value.typedState.landlordConsents.exhaust.evidence,
  ]) {
    assert.ok(Object.isFrozen(node));
  }
  assert.throws(() => {
    value.typedState.landlordConsents.exhaust.status = "GRANTED";
  }, TypeError);
});

test("40. output is JSON serializable without loss", () => {
  const value = expectOk(richSnapshot());
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
});

test("41. sourceRef carries only stage / field path / snapshot opaque key", () => {
  const value = expectOk(richSnapshot());
  const entry = findItem(value, "candidate-consent-exhaust");
  assert.deepEqual({ ...entry.sourceRef }, {
    stageId: "candidate-lease",
    fieldKey: "landlordConsents.exhaust",
    opaqueKey: DEMO_SNAPSHOT_ID,
  });
  for (const item of allItems(value)) {
    assert.deepEqual(Object.keys(item.sourceRef).sort(), ["fieldKey", "opaqueKey", "stageId"]);
    assert.equal(JSON.stringify(item.sourceRef).includes("demo-interview-ref-001"), false);
  }
});
