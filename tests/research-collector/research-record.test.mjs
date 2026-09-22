import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { SEMANTIC_STATUS, collectLeaseTerms, toExportRecord } from "../../tools/frameone-research-collector/src/lease-parser.js";
import {
  AREA_TOLERANCE_M2,
  DUPLICATE_STATUS,
  FRESHNESS_STATUS,
  SOURCE_TYPE,
  VERIFICATION_STATUS,
  calculateFreshness,
  detectLeaseChanges,
  detectSourceConflicts,
  findDuplicateCandidate,
  fromCollectorExport,
  isEligibleForRentalMarketAnalysis,
  withVerificationStatus,
} from "../../tools/frameone-research-collector/src/research-record.js";

const baseRecord = (overrides = {}) => ({
  property: {
    address: "서울특별시 강남구 테헤란로 1",
    floor: "1",
    exclusiveAreaM2: 50,
    contractAreaM2: 60,
    ...overrides.property,
  },
  lease: {
    depositAmount: 50_000_000,
    rentAmount: 5_000_000,
    managementFeeAmount: 100_000,
    premiumAmount: null,
    premiumStatus: SEMANTIC_STATUS.NEGOTIABLE,
    ...overrides.lease,
  },
  quality: { verificationStatus: VERIFICATION_STATUS.COLLECTED, ...overrides.quality },
  history: overrides.history ?? [],
});

test("verification 상태 네 종류를 보존하고 CONFIRMED만 분석에 사용한다", () => {
  for (const status of Object.values(VERIFICATION_STATUS)) {
    const record = baseRecord({ quality: { verificationStatus: status } });
    assert.equal(isEligibleForRentalMarketAnalysis(record), status === VERIFICATION_STATUS.CONFIRMED);
  }
  const changed = withVerificationStatus(baseRecord(), VERIFICATION_STATUS.EXCLUDED, "2026-09-22T00:00:00.000Z");
  assert.equal(changed.quality.verificationStatus, VERIFICATION_STATUS.EXCLUDED);
  assert.equal(changed.history[0].previousValue, VERIFICATION_STATUS.COLLECTED);
});

test("freshness 경계값 30/31/90/91/180/181일을 결정적으로 구분한다", () => {
  const asOf = "2026-09-22T00:00:00.000Z";
  const atAge = (days) => new Date(Date.parse(asOf) - days * 86_400_000).toISOString();
  assert.equal(calculateFreshness(atAge(30), asOf), FRESHNESS_STATUS.CURRENT_30D);
  assert.equal(calculateFreshness(atAge(31), asOf), FRESHNESS_STATUS.RECENT_90D);
  assert.equal(calculateFreshness(atAge(90), asOf), FRESHNESS_STATUS.RECENT_90D);
  assert.equal(calculateFreshness(atAge(91), asOf), FRESHNESS_STATUS.AGED_180D);
  assert.equal(calculateFreshness(atAge(180), asOf), FRESHNESS_STATUS.AGED_180D);
  assert.equal(calculateFreshness(atAge(181), asOf), FRESHNESS_STATUS.STALE);
});

test("상세 주소·층·면적·가격이 같으면 likely duplicate와 근거를 반환한다", () => {
  const result = findDuplicateCandidate(baseRecord(), baseRecord());
  assert.equal(result.status, DUPLICATE_STATUS.LIKELY_DUPLICATE);
  assert.ok(result.reasons.includes("same normalized address"));
  assert.ok(result.reasons.includes("same rent"));
});

test("작은 면적 반올림 차이는 tolerance 안에서 중복 근거가 된다", () => {
  assert.equal(AREA_TOLERANCE_M2, 0.5);
  const result = findDuplicateCandidate(baseRecord(), baseRecord({
    property: { exclusiveAreaM2: 50.4, contractAreaM2: 60.5 },
  }));
  assert.equal(result.status, DUPLICATE_STATUS.LIKELY_DUPLICATE);
  assert.ok(result.reasons.includes("exclusive area within tolerance"));
});

test("같은 주소라도 층이 다르면 중복 후보가 아니다", () => {
  const result = findDuplicateCandidate(baseRecord(), baseRecord({ property: { floor: "2" } }));
  assert.equal(result.status, DUPLICATE_STATUS.NO_MATCH);
  assert.ok(result.differences.includes("different floor"));
});

test("동 단위 주소는 모든 조건이 같아도 possible duplicate를 넘지 않는다", () => {
  const record = baseRecord({ property: { address: "서울특별시 강남구 역삼동" } });
  assert.equal(findDuplicateCandidate(record, record).status, DUPLICATE_STATUS.POSSIBLE_DUPLICATE);
});

test("월세가 다르면 likely가 아닌 possible duplicate로 남긴다", () => {
  const result = findDuplicateCandidate(baseRecord(), baseRecord({ lease: { rentAmount: 4_500_000 } }));
  assert.equal(result.status, DUPLICATE_STATUS.POSSIBLE_DUPLICATE);
  assert.ok(result.differences.includes("rentAmount differs"));
});

test("전혀 다른 주소는 중복 후보가 아니다", () => {
  const result = findDuplicateCandidate(baseRecord(), baseRecord({ property: { address: "부산광역시 해운대구 센텀로 99" } }));
  assert.equal(result.status, DUPLICATE_STATUS.NO_MATCH);
});

test("월세 500→450만원은 금액 -50만원, 비율 -10%로 기록한다", () => {
  const changes = detectLeaseChanges(baseRecord(), baseRecord({ lease: { rentAmount: 4_500_000 } }));
  const rent = changes.find((change) => change.field === "rentAmount");
  assert.equal(rent.changeAmount, -500_000);
  assert.equal(rent.changeRate, -10);
});

test("보증금·관리비 변경과 권리금 협의→금액 있음의 의미를 분리한다", () => {
  const changes = detectLeaseChanges(baseRecord(), baseRecord({
    lease: {
      depositAmount: 40_000_000,
      managementFeeAmount: 150_000,
      premiumAmount: 20_000_000,
      premiumStatus: SEMANTIC_STATUS.KNOWN,
    },
  }));
  assert.ok(changes.some((change) => change.field === "depositAmount"));
  assert.ok(changes.some((change) => change.field === "managementFeeAmount"));
  assert.ok(changes.some((change) => change.field === "premiumAmount" && change.previousValue === null));
  assert.ok(changes.some((change) => change.field === "premiumStatus" && change.previousValue === SEMANTIC_STATUS.NEGOTIABLE));
});

test("무권리와 협의를 같은 값으로 처리하지 않는다", () => {
  const previous = baseRecord({ lease: { premiumAmount: 0, premiumStatus: SEMANTIC_STATUS.NO_PREMIUM } });
  const current = baseRecord({ lease: { premiumAmount: null, premiumStatus: SEMANTIC_STATUS.NEGOTIABLE } });
  const changes = detectLeaseChanges(previous, current);
  assert.ok(changes.some((change) => change.field === "premiumAmount" && change.changeAmount === null));
  assert.ok(changes.some((change) => change.field === "premiumStatus"));
});

test("동일매물 다중 출처의 월세 mismatch만 conflict warning으로 반환한다", () => {
  const mismatch = detectSourceConflicts([baseRecord(), baseRecord({ lease: { rentAmount: 4_500_000 } })]);
  assert.deepEqual(mismatch.map((warning) => warning.code), ["RENT_CONFLICT"]);
  assert.deepEqual(detectSourceConflicts([baseRecord(), baseRecord()]), []);
});

test("Collector export를 온라인 매물 Research Record로 변환하며 legacy export를 바꾸지 않는다", () => {
  const collection = collectLeaseTerms({
    text: "소재지 서울특별시 강남구 테헤란로 1\n해당층 1층\n전용 50㎡\n계약 60㎡\n보증금 5,000만원 / 월세 500만원",
    sourceUrl: "https://example.test/listing/1",
    pageTitle: "sample fixture",
    collectedAt: "2026-09-20T00:00:00.000Z",
  });
  const before = toExportRecord(collection);
  const record = fromCollectorExport(collection, { asOf: "2026-09-22T00:00:00.000Z" });
  const after = toExportRecord(collection);
  assert.deepEqual(after, before);
  assert.equal(record.source.sourceType, SOURCE_TYPE.ONLINE_LISTING);
  assert.equal(record.lease.rentAmount, 5_000_000);
  assert.equal(record.quality.freshnessStatus, FRESHNESS_STATUS.CURRENT_30D);
  assert.ok(record.evidence.raw.deposit);
  assert.deepEqual(record.history, []);
});

test("Research Record는 관리비 0원의 NONE 의미를 금액과 함께 보존한다", () => {
  const collection = collectLeaseTerms({
    text: "소재지 서울특별시 강남구 테헤란로 1\n월관리비\n0원",
    sourceUrl: "https://example.test/listing/management-none",
    pageTitle: "sample fixture",
    collectedAt: "2026-09-20T00:00:00.000Z",
  });
  const record = fromCollectorExport(collection, { asOf: "2026-09-22T00:00:00.000Z" });
  assert.equal(record.lease.managementFeeAmount, 0);
  assert.equal(record.lease.managementFeeStatus, SEMANTIC_STATUS.NONE);
});

test("기존 세 네이버 fixture의 핵심 Collector 결과를 V1.2 adapter에서도 유지한다", () => {
  const firstText = fs.readFileSync(new URL("./fixtures/naver-pay-real-estate-visible-text.txt", import.meta.url), "utf8");
  const fixtures = [
    { text: firstText, sourceUrl: "https://fin.land.naver.com/articles/sample-fixture", pageTitle: "sample", expectedRent: 20_000_000 },
    ...[2, 3].map((number) => {
      const fixture = JSON.parse(fs.readFileSync(new URL(`./fixtures/naver-pay-real-estate-visible-text-${number}.json`, import.meta.url), "utf8"));
      return { text: fixture.fullText, scopeText: fixture.scopeText, sourceUrl: fixture.sourceUrl, pageTitle: fixture.pageTitle, expectedRent: number === 2 ? 6_000_000 : 1_000_000 };
    }),
  ];
  for (const fixture of fixtures) {
    const collection = collectLeaseTerms({ ...fixture, collectedAt: "2026-09-18T00:00:00.000Z" });
    const legacy = toExportRecord(collection);
    const research = fromCollectorExport(collection, { asOf: "2026-09-22T00:00:00.000Z" });
    assert.equal(legacy.rentAmount, fixture.expectedRent);
    assert.equal(research.lease.rentAmount, fixture.expectedRent);
    assert.equal(research.source.sourceType, SOURCE_TYPE.ONLINE_LISTING);
  }
});
