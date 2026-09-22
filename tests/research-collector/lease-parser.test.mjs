import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  FIELD_STATUS,
  SEMANTIC_STATUS,
  SOURCE_ADAPTER,
  TRANSACTION_TYPE,
  collectLeaseTerms,
  parseArea,
  parseKoreanMoney,
  toExportRecord,
} from "../../tools/frameone-research-collector/src/lease-parser.js";

const collect = (text) => collectLeaseTerms({
  text,
  sourceUrl: "https://example.test/sample-listing",
  pageTitle: "sample fixture",
  collectedAt: "2026-09-18T00:00:00.000Z",
});

test("1. 단위 없는 보증금 5,000 / 월 450은 후보 환산하되 자동확정하지 않는다", () => {
  const result = collect("보증금 5,000 / 월 450");
  assert.equal(result.fields.deposit.value, 50_000_000);
  assert.equal(result.fields.rent.value, 4_500_000);
  assert.equal(result.fields.deposit.status, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.fields.rent.status, FIELD_STATUS.REVIEW_REQUIRED);
});

test("2-4. 억·억+천·천 단위를 안전하게 계산한다", () => {
  assert.equal(parseKoreanMoney("보증금 1억").amount, 100_000_000);
  assert.equal(parseKoreanMoney("보증금 1억 5천만원").amount, 150_000_000);
  assert.equal(parseKoreanMoney("보증금 3천만원").amount, 30_000_000);
  assert.equal(parseKoreanMoney("1억5000").amount, 150_000_000);
  const collected = collect("보증금 1억 5천만원");
  assert.equal(collected.fields.deposit.raw, "1억 5천만원");
});

test("5-6. 관리비 금액과 협의를 구분한다", () => {
  const known = parseKoreanMoney("관리비 30만원", { semantic: "management" });
  const negotiable = parseKoreanMoney("관리비 협의", { semantic: "management" });
  assert.equal(known.amount, 300_000);
  assert.equal(known.semanticStatus, SEMANTIC_STATUS.KNOWN);
  assert.equal(negotiable.amount, null);
  assert.equal(negotiable.semanticStatus, SEMANTIC_STATUS.NEGOTIABLE);
});

test("7-9. 권리금 금액·협의·무권리를 서로 다른 의미로 보존한다", () => {
  const known = parseKoreanMoney("권리금 3,000만원", { semantic: "premium" });
  const negotiable = parseKoreanMoney("권리금 협의", { semantic: "premium" });
  const none = parseKoreanMoney("무권리", { semantic: "premium" });
  assert.equal(known.amount, 30_000_000);
  assert.equal(negotiable.amount, null);
  assert.equal(negotiable.semanticStatus, SEMANTIC_STATUS.NEGOTIABLE);
  assert.equal(none.amount, 0);
  assert.equal(none.semanticStatus, SEMANTIC_STATUS.NO_PREMIUM);
});

test("10-11. VAT 별도와 포함을 구분한다", () => {
  assert.equal(collect("월세 450만원 VAT 별도").fields.vat.semanticStatus, SEMANTIC_STATUS.SEPARATE);
  assert.equal(collect("임대료 부가세 포함").fields.vat.semanticStatus, SEMANTIC_STATUS.INCLUDED);
});

test("12-13. ㎡와 평을 양방향 환산한다", () => {
  assert.deepEqual(parseArea("52.8㎡"), { m2: 52.8, pyeong: 15.97, status: FIELD_STATUS.AUTO_CONFIRMED, issues: [] });
  assert.deepEqual(parseArea("15.9평"), { m2: 52.56, pyeong: 15.9, status: FIELD_STATUS.AUTO_CONFIRMED, issues: [] });
});

test("14. 전용/계약면적 동시 표기를 각각 추출한다", () => {
  const result = collect("전용 52.8㎡ / 계약 70㎡");
  assert.equal(result.fields.exclusiveArea.m2, 52.8);
  assert.equal(result.fields.contractArea.m2, 70);
  const mixed = collect("전용/계약 52.8㎡ / 70㎡");
  assert.equal(mixed.fields.exclusiveArea.m2, 52.8);
  assert.equal(mixed.fields.contractArea.m2, 70);
});

test("월 450만원 표기를 월세로 추출한다", () => {
  const result = collect("월 450만원");
  assert.equal(result.fields.rent.value, 4_500_000);
  assert.equal(result.fields.rent.status, FIELD_STATUS.AUTO_CONFIRMED);
});

test("15. 애매한 숫자는 AUTO_CONFIRMED가 아니다", () => {
  const result = parseKoreanMoney("450");
  assert.equal(result.amount, 4_500_000);
  assert.equal(result.status, FIELD_STATUS.REVIEW_REQUIRED);
});

test("16. 값 누락은 전체 수집 실패 대신 MISSING으로 남는다", () => {
  const result = collect("공개 매물 설명만 있습니다.");
  assert.equal(result.fields.deposit.status, FIELD_STATUS.MISSING);
  assert.equal(result.fields.address.status, FIELD_STATUS.MISSING);
  assert.ok(result.validationWarnings.some((warning) => warning.field === "address"));
});

test("17. 잘못된 형식과 음수는 자동확정하지 않는다", () => {
  assert.equal(parseKoreanMoney("보증금 abc").status, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(parseKoreanMoney("월세 -450만원").amount, null);
  assert.equal(parseArea("-52.8㎡").status, FIELD_STATUS.REVIEW_REQUIRED);
});

test("전용면적이 계약면적보다 크면 두 필드를 검토 상태로 내린다", () => {
  const result = collect("전용 70㎡\n계약 52.8㎡");
  assert.equal(result.fields.exclusiveArea.status, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.fields.contractArea.status, FIELD_STATUS.REVIEW_REQUIRED);
});

test("재검증은 해소된 전용/계약면적 경고를 남기지 않는다", async () => {
  const { validateLeaseCollection } = await import("../../tools/frameone-research-collector/src/lease-parser.js");
  const result = collect("전용 70㎡\n계약 52.8㎡");
  result.fields.contractArea.m2 = 80;
  validateLeaseCollection(result);
  assert.equal(result.validationWarnings.some((warning) => /전용면적/.test(warning.message)), false);
  assert.equal(result.fields.exclusiveArea.issues.some((issue) => /전용면적/.test(issue)), false);
  assert.equal(result.fields.contractArea.issues.some((issue) => /전용면적/.test(issue)), false);
});

test("Raw, Normalized, 상태, evidence를 분리한 export record를 만든다", () => {
  const record = toExportRecord(collect("주소: 서울특별시 성동구 sample로 1\n보증금 5,000만원 / 월세 450만원"));
  assert.equal(record.depositRaw, "5,000만원");
  assert.equal(record.depositAmount, 50_000_000);
  assert.equal(record.fieldStatus.deposit, FIELD_STATUS.AUTO_CONFIRMED);
  assert.match(record.evidence.deposit, /보증금/);
});

test("월세 A/B 거래표시는 A를 보증금, B를 월세 후보로 해석한다", () => {
  const result = collect("월세 2억/2,000");
  assert.equal(result.transactionType, TRANSACTION_TYPE.MONTHLY_RENT);
  assert.equal(result.fields.deposit.value, 200_000_000);
  assert.equal(result.fields.rent.value, 20_000_000);
  assert.equal(result.fields.rent.status, FIELD_STATUS.REVIEW_REQUIRED);
});

test("명시적인 보증금/월세 문장이 거래표시보다 우선한다", () => {
  const result = collect("월세 2억/2,000\n상세 설명\n보증금 2억 / 월세 2000만");
  assert.equal(result.fields.deposit.value, 200_000_000);
  assert.equal(result.fields.rent.value, 20_000_000);
  assert.equal(result.fields.rent.status, FIELD_STATUS.AUTO_CONFIRMED);
  assert.match(result.fields.rent.evidenceText, /보증금 2억/);
});

test("계약/전용과 전용/계약 라벨 순서를 보존한다", () => {
  const contractFirst = collect("계약/전용면적 829.38㎡/633.6㎡");
  assert.equal(contractFirst.fields.contractArea.m2, 829.38);
  assert.equal(contractFirst.fields.exclusiveArea.m2, 633.6);

  const exclusiveFirst = collect("전용/계약 633.6㎡/829.38㎡");
  assert.equal(exclusiveFirst.fields.exclusiveArea.m2, 633.6);
  assert.equal(exclusiveFirst.fields.contractArea.m2, 829.38);
});

test("라벨 없는 두 면적은 전용/계약으로 자동확정하지 않는다", () => {
  const result = collect("829.38㎡ / 633.6㎡");
  assert.equal(result.fields.contractArea.status, FIELD_STATUS.MISSING);
  assert.equal(result.fields.exclusiveArea.status, FIELD_STATUS.MISSING);
});

test("중개보수 VAT는 임대료 VAT가 아니며 직접 임대 문맥만 사용한다", () => {
  const brokerage = collect("중개보수 최대 1,980만원(VAT 별도)");
  assert.equal(brokerage.fields.vat.semanticStatus, SEMANTIC_STATUS.UNKNOWN);
  assert.equal(brokerage.fields.vat.status, FIELD_STATUS.MISSING);

  const rent = collect("월세 450만원 VAT 별도");
  assert.equal(rent.fields.vat.semanticStatus, SEMANTIC_STATUS.SEPARATE);
  assert.equal(rent.fields.vat.status, FIELD_STATUS.AUTO_CONFIRMED);
});

test("자유 설명의 무권리는 확인 필요이고 구조화된 권리금 없음은 자동확인이다", () => {
  const freeText = collect("상세 설명: 2~5층 풀 인테리어 오피스(무권리)");
  assert.equal(freeText.fields.premium.semanticStatus, SEMANTIC_STATUS.NO_PREMIUM);
  assert.equal(freeText.fields.premium.status, FIELD_STATUS.REVIEW_REQUIRED);

  const structured = collect("권리금 없음");
  assert.equal(structured.fields.premium.semanticStatus, SEMANTIC_STATUS.NO_PREMIUM);
  assert.equal(structured.fields.premium.status, FIELD_STATUS.AUTO_CONFIRMED);
});

test("중개사무소 주소는 매물 주소 후보로 사용하지 않는다", () => {
  const result = collect("중개사\n대표 공인중개사\n위치\n서울특별시 송파구 중대로10길 37-8 sample 중개사무소");
  assert.equal(result.fields.address.status, FIELD_STATUS.MISSING);
  assert.equal(result.fields.address.value, null);
});

test("라벨 바로 다음 줄의 입주가능일을 추출한다", () => {
  const result = collect("입주가능일\n즉시입주 협의가능");
  assert.equal(result.fields.moveIn.raw, "즉시입주 협의가능");
  assert.equal(result.fields.moveIn.status, FIELD_STATUS.AUTO_CONFIRMED);
});

test("실제 네이버페이 부동산 visible-text 회귀 fixture를 안전하게 추출한다", () => {
  const text = fs.readFileSync(new URL("./fixtures/naver-pay-real-estate-visible-text.txt", import.meta.url), "utf8");
  const result = collectLeaseTerms({
    text,
    sourceUrl: "https://fin.land.naver.com/articles/sample-fixture",
    pageTitle: "sample fixture",
    collectedAt: "2026-09-18T00:00:00.000Z",
  });
  const record = toExportRecord(result);

  assert.equal(result.sourceAdapter, SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE);
  assert.equal(record.transactionType, TRANSACTION_TYPE.MONTHLY_RENT);
  assert.equal(record.depositAmount, 200_000_000);
  assert.equal(record.rentAmount, 20_000_000);
  assert.equal(record.managementFeeAmount, 2_000_000);
  assert.equal(record.contractAreaM2, 829.38);
  assert.equal(record.contractAreaPyeong, 250.89);
  assert.equal(record.exclusiveAreaM2, 633.6);
  assert.equal(record.exclusiveAreaPyeong, 191.66);
  assert.equal(record.floor, "5");
  assert.equal(record.addressRaw, "서울시 송파구 가락동");
  assert.equal(record.fieldStatus.address, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(record.vatStatus, SEMANTIC_STATUS.UNKNOWN);
  assert.equal(record.premiumStatus, SEMANTIC_STATUS.NO_PREMIUM);
  assert.equal(record.fieldStatus.premium, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(record.moveInRaw, "즉시입주 협의가능");
  assert.equal(record.fieldStatus.parking, FIELD_STATUS.REVIEW_REQUIRED);
  assert.match(record.parkingRaw, /11대/);
  assert.match(record.parkingRaw, /12대/);
  assert.doesNotMatch(record.addressRaw, /중대로10길/);
});

test("두 번째 네이버 fixture는 현재 상세매물 scope로 다른 매물 텍스트를 차단한다", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/naver-pay-real-estate-visible-text-2.json", import.meta.url), "utf8"));
  const result = collectLeaseTerms({
    text: fixture.fullText,
    scopeText: fixture.scopeText,
    sourceUrl: fixture.sourceUrl,
    pageTitle: fixture.pageTitle,
    collectedAt: "2026-09-18T00:00:00.000Z",
  });
  const record = toExportRecord(result);

  assert.equal(record.sourceAdapter, SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE);
  assert.equal(record.sourceScope, "CURRENT_LISTING_SEMANTIC_PANEL");
  assert.equal(record.depositAmount, 100_000_000);
  assert.equal(record.rentAmount, 6_000_000);
  assert.equal(record.managementFeeAmount, 100_000);
  assert.equal(record.contractAreaM2, 121);
  assert.equal(record.exclusiveAreaM2, 116);
  assert.equal(record.floor, "1");
  assert.equal(record.addressRaw, "서울시 성동구 성수동2가");
  assert.equal(record.fieldStatus.address, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(record.premiumStatus, SEMANTIC_STATUS.UNKNOWN);
  assert.equal(record.fieldStatus.premium, FIELD_STATUS.MISSING);
  assert.equal(record.vatStatus, SEMANTIC_STATUS.UNKNOWN);
  assert.equal(record.fieldStatus.vat, FIELD_STATUS.MISSING);
  assert.equal(record.moveInRaw, "즉시입주 협의가능");
  assert.equal(record.fieldStatus.moveIn, FIELD_STATUS.AUTO_CONFIRMED);
  assert.doesNotMatch(record.moveInRaw, /주차O/);
  assert.match(record.parkingRaw, /주차가능여부 불가능/);
  assert.match(record.parkingRaw, /총주차대수 0대/);
  assert.match(record.parkingRaw, /주차장 총 0대/);
  assert.equal(record.fieldStatus.parking, FIELD_STATUS.AUTO_CONFIRMED);
  assert.doesNotMatch(record.evidence.deposit, /400\/400/);
  assert.doesNotMatch(record.evidence.rent, /400\/400/);
});

test("입주가능일 라벨이 없으면 다른 매물 문장의 주차O를 입주값으로 사용하지 않는다", () => {
  const result = collect("가온공인중개사사무소 중소형사무실 월세400/400\n룸2 즉시입주 주차O");
  assert.equal(result.fields.moveIn.raw, "즉시입주");
  assert.equal(result.fields.moveIn.status, FIELD_STATUS.REVIEW_REQUIRED);
  assert.notEqual(result.fields.moveIn.raw, "주차O");
});

test("URL의 매물번호와 다른 semantic scope는 거부하고 전체 페이지의 현재 라벨을 사용한다", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/naver-pay-real-estate-visible-text-2.json", import.meta.url), "utf8"));
  const wrongScope = "월세 400/400\n매물번호\n9999999999\n소재지\n서울시 다른구 다른동\n계약/전용면적\n40㎡/30㎡\n해당층/총층\n2/3층\n입주가능일\n주차O";
  const result = collectLeaseTerms({
    text: fixture.fullText,
    scopeText: wrongScope,
    sourceUrl: fixture.sourceUrl,
    pageTitle: fixture.pageTitle,
  });
  assert.equal(result.sourceScope, "FULL_VISIBLE_PAGE");
  assert.equal(result.fields.deposit.value, 100_000_000);
  assert.equal(result.fields.rent.value, 6_000_000);
  assert.equal(result.fields.moveIn.raw, "즉시입주 협의가능");
});

test("세 번째 네이버 fixture는 보증금 교차검증으로 header 월세를 자동확인한다", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/naver-pay-real-estate-visible-text-3.json", import.meta.url), "utf8"));
  const result = collectLeaseTerms({
    text: fixture.fullText,
    scopeText: fixture.scopeText,
    sourceUrl: fixture.sourceUrl,
    pageTitle: fixture.pageTitle,
    collectedAt: "2026-09-18T00:00:00.000Z",
  });
  const record = toExportRecord(result);

  assert.equal(record.sourceAdapter, SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE);
  assert.equal(record.sourceScope, "CURRENT_LISTING_SEMANTIC_PANEL");
  assert.equal(record.depositAmount, 20_000_000);
  assert.equal(record.fieldStatus.deposit, FIELD_STATUS.AUTO_CONFIRMED);
  assert.equal(record.rentRaw, "100");
  assert.equal(record.rentAmount, 1_000_000);
  assert.equal(record.fieldStatus.rent, FIELD_STATUS.AUTO_CONFIRMED);
  assert.equal(record.managementFeeAmount, 100_000);
  assert.equal(record.fieldStatus.managementFee, FIELD_STATUS.AUTO_CONFIRMED);
  assert.equal(record.contractAreaM2, 101);
  assert.equal(record.exclusiveAreaM2, 101);
  assert.equal(record.floor, "3");
  assert.equal(record.addressRaw, "서울시 송파구 오금동");
  assert.equal(record.fieldStatus.address, FIELD_STATUS.REVIEW_REQUIRED);
  assert.equal(record.premiumAmount, 0);
  assert.equal(record.premiumStatus, SEMANTIC_STATUS.NO_PREMIUM);
  assert.equal(record.fieldStatus.premium, FIELD_STATUS.AUTO_CONFIRMED);
  assert.equal(record.vatStatus, SEMANTIC_STATUS.UNKNOWN);
  assert.equal(record.fieldStatus.vat, FIELD_STATUS.MISSING);
  assert.equal(record.moveInRaw, "즉시입주 협의가능");
  assert.equal(record.fieldStatus.moveIn, FIELD_STATUS.AUTO_CONFIRMED);
  assert.match(record.parkingRaw, /주차가능여부 가능/);
  assert.match(record.parkingRaw, /총주차대수 8대/);
  assert.match(record.parkingRaw, /주차장 총 8대/);
  assert.match(record.parkingRaw, /옥내자주식 4대/);
  assert.match(record.parkingRaw, /옥외자주식 4대/);
  assert.equal(record.fieldStatus.parking, FIELD_STATUS.AUTO_CONFIRMED);
  for (const evidence of Object.values(record.evidence).filter(Boolean)) {
    assert.doesNotMatch(evidence, /다른 중개사|3,000\/200/);
  }
});

test("월세 A/B 승격은 네이버 현재 scope와 일치하는 명시적 보증금이 모두 필요하다", () => {
  const generic = collect("월세 2,000/100\n보증금 2,000만원");
  assert.equal(generic.fields.rent.status, FIELD_STATUS.REVIEW_REQUIRED);

  const naverMismatch = collectLeaseTerms({
    text: "월세 2,000/100\n매물번호\n123\n소재지\n서울시 송파구 오금동\n계약/전용면적\n101㎡/101㎡\n해당층/총층\n3/6층\n월관리비\n10만원\n보증금 3,000만원",
    scopeText: "월세 2,000/100\n매물번호\n123\n소재지\n서울시 송파구 오금동\n계약/전용면적\n101㎡/101㎡\n해당층/총층\n3/6층\n월관리비\n10만원\n보증금 3,000만원",
    sourceUrl: "https://fin.land.naver.com/articles/123",
  });
  assert.equal(naverMismatch.fields.rent.status, FIELD_STATUS.REVIEW_REQUIRED);
});
