import {
  FRANCHISE_REPORT_INPUT_SCHEMA_VERSION,
  HUMAN_CONTRACT_DECISION_SCHEMA_VERSION,
  REPORT_THEME_SCHEMA_VERSION,
  type CandidateReportProjectionV1,
  type FranchiseReportInputV1,
  type HumanContractDecisionPresentationV1,
  type HumanContractDecisionV1,
  type ReportPresentationValueV1,
  type ReportSourceSnapshotReferenceV1,
  type ReportThemeV1,
} from "./franchise-contracts";

export const SYNTHETIC_CANDIDATE_A_ID = "store_00000000-0000-4000-8000-000000000001" as const;
export const SYNTHETIC_CANDIDATE_B_ID = "store_00000000-0000-4000-8000-000000000002" as const;
export const SYNTHETIC_HUMAN_DECISION_ID = "human_decision_00000000-0000-4000-8000-000000000001" as const;

const value = (
  availabilityStatus: ReportPresentationValueV1["availabilityStatus"],
  rawValue: ReportPresentationValueV1["value"],
  displayValue: string,
  unit: string | null,
): ReportPresentationValueV1 => Object.freeze({ availabilityStatus, value: rawValue, displayValue, unit });

export const SANITIZED_TEST_FRANCHISE_THEME_V1: ReportThemeV1 = Object.freeze({
  schemaVersion: REPORT_THEME_SCHEMA_VERSION,
  themeId: "TEST_FRANCHISE_THEME",
  version: "1",
  brandDisplayName: "TEST FRANCHISE",
  reportDisplayName: "Synthetic Franchise Candidate Report",
  logoAssetRef: "ASSET:TEST_FRANCHISE:LOGO",
  referenceStoreImageRef: "ASSET:TEST_FRANCHISE:REFERENCE_STORE",
  coverImageAssetRef: "ASSET:TEST_FRANCHISE:COVER",
  colors: Object.freeze({
    primary: "#173C33",
    accent: "#F4C273",
    ink: "#171B19",
    muted: "#66716D",
    surface: "#F1F3EF",
    border: "#D5D9D7",
  }),
  footerText: "FRAMEONE synthetic contract fixture · not customer data",
});

export const SANITIZED_HUMAN_CONTRACT_DECISION_V1: HumanContractDecisionV1 = Object.freeze({
  schemaVersion: HUMAN_CONTRACT_DECISION_SCHEMA_VERSION,
  decisionId: SYNTHETIC_HUMAN_DECISION_ID,
  candidateStoreId: SYNTHETIC_CANDIDATE_A_ID,
  decision: "CONDITIONAL_RECOMMEND",
  reasons: Object.freeze(["Synthetic visibility criterion is confirmed in the fixture."]),
  confirmationNeeded: Object.freeze(["Synthetic lease document confirmation is required."]),
  nextActions: Object.freeze(["Review the synthetic lease document before contract approval."]),
  criteriaEvaluationSetId: "criteria_eval_set_test_001",
  riskSnapshotRef: "risk_snapshot_test_001",
  decidedAt: "2026-01-02T09:00:00.000Z",
  decidedBy: "staff_actor_test_001",
  approvedAt: "2026-01-02T10:00:00.000Z",
});

const approvedDecision: HumanContractDecisionPresentationV1 = Object.freeze({
  decisionId: SANITIZED_HUMAN_CONTRACT_DECISION_V1.decisionId,
  candidateStoreId: SANITIZED_HUMAN_CONTRACT_DECISION_V1.candidateStoreId,
  decision: SANITIZED_HUMAN_CONTRACT_DECISION_V1.decision,
  reasons: SANITIZED_HUMAN_CONTRACT_DECISION_V1.reasons,
  confirmationNeeded: SANITIZED_HUMAN_CONTRACT_DECISION_V1.confirmationNeeded,
  nextActions: SANITIZED_HUMAN_CONTRACT_DECISION_V1.nextActions,
  decidedAt: SANITIZED_HUMAN_CONTRACT_DECISION_V1.decidedAt,
  approvedAt: SANITIZED_HUMAN_CONTRACT_DECISION_V1.approvedAt as string,
});

const commonCriteriaRef = Object.freeze({ id: "test-generic-retail-criteria", version: "1" });

function candidate(
  candidateStoreId: string,
  displayCode: string,
  options: { readonly explicitZero: boolean; readonly photo: boolean; readonly approvedDecisionRef?: string },
): CandidateReportProjectionV1 {
  return Object.freeze({
    candidateStoreId,
    displayCode,
    address: `${displayCode} SYNTHETIC TEST ADDRESS`,
    region: "SYNTHETIC TEST REGION",
    lifecycleLabel: "검토 유지",
    siteGrade: "UNKNOWN",
    ...(options.approvedDecisionRef ? { approvedDecisionRef: options.approvedDecisionRef } : {}),
    lease: Object.freeze({
      area: value("AVAILABLE", 10, "10 synthetic-unit", "synthetic-unit"),
      deposit: value("AVAILABLE", 1000, "1,000 synthetic-currency", "synthetic-currency"),
      rent: value("AVAILABLE", 100, "100 synthetic-currency", "synthetic-currency/month"),
      maintenance: options.explicitZero
        ? value("EXPLICIT_ZERO", 0, "0 synthetic-currency", "synthetic-currency/month")
        : value("UNKNOWN", null, "확인 필요", "synthetic-currency/month"),
      goodwillOrFacilityFee: value("UNAVAILABLE", null, "자료 없음", "synthetic-currency"),
      contractConditions: Object.freeze(["Synthetic condition only; no legal conclusion."]),
    }),
    demandAndBackground: Object.freeze([
      Object.freeze({
        factKey: "RESIDENTIAL_BACKGROUND",
        label: "Synthetic residential background",
        value: value("AVAILABLE", 1200, "1,200 synthetic households", "households"),
      }),
    ]),
    criteriaPresentation: Object.freeze({
      criteriaProfileRef: commonCriteriaRef,
      evaluationSetId: `criteria_eval_set_${displayCode.toLowerCase().replaceAll("-", "_")}`,
      evaluations: Object.freeze([
        Object.freeze({
          criterionKey: "AREA_SIZE",
          label: "Synthetic area criterion",
          result: "MATCH" as const,
          observed: value("AVAILABLE", 10, "10 synthetic-unit", "synthetic-unit"),
          rationale: "Synthetic fixture rationale.",
        }),
      ]),
    }),
    riskPresentation: Object.freeze({
      hardRiskGateStatus: "REVIEW_REQUIRED" as const,
      summary: "Synthetic risk review is required; no automated verdict is created.",
      items: Object.freeze([
        Object.freeze({
          title: "Synthetic document confirmation",
          severity: "MEDIUM" as const,
          statusLabel: "확인 필요",
          confirmationNeeded: "Review the synthetic source document.",
        }),
      ]),
    }),
    confirmationNeeded: Object.freeze(["Synthetic source document confirmation."]),
    nextActions: Object.freeze(["Complete synthetic staff review."]),
    map: Object.freeze({
      available: true,
      assetRef: `ASSET:${displayCode}:MAP`,
      sourceLabel: "Synthetic customer-provided map",
      caption: "Synthetic location map",
    }),
    photos: options.photo ? Object.freeze([
      Object.freeze({
        photoId: `photo_${displayCode.toLowerCase().replaceAll("-", "_")}_001`,
        category: "EXTERIOR" as const,
        assetRef: `ASSET:${displayCode}:PHOTO:001`,
        caption: "Synthetic exterior photo",
        sortOrder: 0,
        primary: true,
      }),
    ]) : Object.freeze([]),
    marketIntelligence: Object.freeze([
      Object.freeze({
        metricSemantic: options.explicitZero ? "COMPETITOR_COUNT" : "HOUSEHOLD_ESTIMATE",
        value: options.explicitZero
          ? value("EXPLICIT_ZERO", 0, "0 synthetic locations", "locations")
          : value("AVAILABLE", 1200, "1,200 synthetic households", "households"),
        valueType: options.explicitZero ? "ACTUAL" as const : "ESTIMATED" as const,
        providerLabel: "SYNTHETIC FIXTURE PROVIDER",
        scopeLabel: "Synthetic analysis scope",
        referencePeriod: "2026-Q1",
        verificationStatus: options.explicitZero ? "VERIFIED" as const : "ESTIMATED" as const,
        limitation: "Synthetic values are test-only and not real market data.",
        redistributionStatus: "PUBLIC" as const,
      }),
    ]),
    sources: Object.freeze([
      Object.freeze({
        providerLabel: "SYNTHETIC FIXTURE PROVIDER",
        sourceTypeLabel: "Synthetic document",
        scopeLabel: "Synthetic candidate only",
        referencePeriod: "2026-Q1",
        verificationStatus: "VERIFIED" as const,
        redistributionStatus: "PUBLIC" as const,
        limitation: "No customer or production data is included.",
      }),
    ]),
  });
}

const reviewCandidates = Object.freeze([
  candidate(SYNTHETIC_CANDIDATE_A_ID, "TEST-CAND-001", { explicitZero: true, photo: true }),
  candidate(SYNTHETIC_CANDIDATE_B_ID, "TEST-CAND-002", { explicitZero: false, photo: false }),
]);

function snapshotReferences(contractDecision: boolean): readonly ReportSourceSnapshotReferenceV1[] {
  const references: ReportSourceSnapshotReferenceV1[] = [];
  for (const row of reviewCandidates) {
    for (const domain of ["CANDIDATE", "CRITERIA", "EVIDENCE", "MARKET"] as const) {
      references.push(Object.freeze({
        candidateStoreId: row.candidateStoreId,
        domain,
        status: "RESOLVED",
        snapshotId: `${domain.toLowerCase()}_snapshot_${row.displayCode.toLowerCase().replaceAll("-", "_")}`,
        version: "1",
        limitation: null,
      }));
    }
    if (row.photos.length > 0) references.push(Object.freeze({
      candidateStoreId: row.candidateStoreId,
      domain: "PHOTO",
      status: "RESOLVED",
      snapshotId: `photo_snapshot_${row.displayCode.toLowerCase().replaceAll("-", "_")}`,
      version: "1",
      limitation: null,
    }));
    if (contractDecision) {
      references.push(Object.freeze({
        candidateStoreId: row.candidateStoreId,
        domain: "RISK",
        status: "RESOLVED",
        snapshotId: `risk_snapshot_${row.displayCode.toLowerCase().replaceAll("-", "_")}`,
        version: "1",
        limitation: null,
      }));
      references.push(row.candidateStoreId === SYNTHETIC_CANDIDATE_A_ID
        ? Object.freeze({
          candidateStoreId: row.candidateStoreId,
          domain: "DECISION",
          status: "RESOLVED",
          snapshotId: "decision_snapshot_test_cand_001",
          version: "1",
          limitation: null,
        })
        : Object.freeze({
          candidateStoreId: row.candidateStoreId,
          domain: "DECISION",
          status: "GAP",
          snapshotId: null,
          version: null,
          limitation: "No approved synthetic decision exists for this candidate.",
        }));
    }
  }
  return Object.freeze(references);
}

const commonInput = {
  schemaVersion: FRANCHISE_REPORT_INPUT_SCHEMA_VERSION,
  project: Object.freeze({ projectId: "TEST_FRANCHISE_PROJECT", caseId: "case_test_franchise_v1", label: "Synthetic Franchise Project" }),
  scope: Object.freeze({ scopeType: "ALL" as const }),
  presetRef: Object.freeze({ id: "TEST_FRANCHISE_REPORT_PRESET", version: "1" }),
  brand: Object.freeze({
    brandProfileRef: Object.freeze({ id: "TEST_FRANCHISE", version: "1" }),
    industryProfileRef: Object.freeze({ id: "GENERIC_RETAIL", version: "1" }),
    displayName: "TEST FRANCHISE",
  }),
  theme: SANITIZED_TEST_FRANCHISE_THEME_V1,
  criteriaPresentation: Object.freeze({
    criteriaProfileRef: commonCriteriaRef,
    title: "Synthetic Brand Site Criteria",
    criteria: Object.freeze([
      Object.freeze({ criterionKey: "AREA_SIZE", label: "Synthetic area criterion", targetDisplay: "10 synthetic-unit" }),
    ]),
  }),
  comparisonPages: Object.freeze([
    Object.freeze({
      comparisonId: "TEST_COMPARISON_001",
      title: "Synthetic Candidate Comparison",
      candidates: Object.freeze(reviewCandidates.map((row) => Object.freeze({
        candidateStoreId: row.candidateStoreId,
        dimensions: Object.freeze([
          Object.freeze({
            dimensionId: "AREA_SIZE",
            label: "Synthetic area",
            displayValue: "10 synthetic-unit",
            evaluation: "MATCH" as const,
            evidenceStatus: "VERIFIED" as const,
          }),
        ]),
      }))),
    }),
  ]),
  marketIntelligence: Object.freeze([
    Object.freeze({
      metricSemantic: "REGION_DEMAND_ESTIMATE",
      value: value("AVAILABLE", 2400, "2,400 synthetic households", "households"),
      valueType: "ESTIMATED" as const,
      providerLabel: "SYNTHETIC FIXTURE PROVIDER",
      scopeLabel: "Synthetic project scope",
      referencePeriod: "2026-Q1",
      verificationStatus: "ESTIMATED" as const,
      limitation: "Synthetic estimate for contract tests only.",
      redistributionStatus: "PUBLIC" as const,
    }),
  ]),
  extensionSections: Object.freeze([
    Object.freeze({
      sectionId: "TEST_GENERIC_RETAIL_CONTEXT",
      industryProfileId: "GENERIC_RETAIL",
      title: "Synthetic Generic Retail Context",
      status: "READY" as const,
      payloadRef: "extension_payload_test_generic_retail_v1",
      limitation: null,
    }),
  ]),
  generatedAt: "2026-01-03T00:00:00.000Z",
} as const;

export const SANITIZED_CANDIDATE_REVIEW_INPUT_V1: FranchiseReportInputV1 = Object.freeze({
  ...commonInput,
  productType: "FRANCHISE_CANDIDATE_REVIEW",
  candidates: reviewCandidates,
  approvedDecisions: Object.freeze([]),
  sourceSnapshotRefs: snapshotReferences(false),
});

const decisionCandidates = Object.freeze([
  candidate(SYNTHETIC_CANDIDATE_A_ID, "TEST-CAND-001", {
    explicitZero: true,
    photo: true,
    approvedDecisionRef: SYNTHETIC_HUMAN_DECISION_ID,
  }),
  reviewCandidates[1],
]);

export const SANITIZED_CONTRACT_DECISION_INPUT_V1: FranchiseReportInputV1 = Object.freeze({
  ...commonInput,
  productType: "FRANCHISE_CONTRACT_DECISION",
  candidates: decisionCandidates,
  approvedDecisions: Object.freeze([approvedDecision]),
  sourceSnapshotRefs: snapshotReferences(true),
});
