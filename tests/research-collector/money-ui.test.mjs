import assert from "node:assert/strict";
import { test } from "node:test";
import { SEMANTIC_STATUS } from "../../tools/frameone-research-collector/src/lease-parser.js";
import {
  formatKoreanMoney,
  formatMoneyInput,
  parseMoneyInput,
} from "../../tools/frameone-research-collector/src/money-ui.js";

test("금액 input은 천단위 comma로 표시한다", () => {
  assert.equal(formatMoneyInput(20_000_000), "20,000,000");
  assert.equal(formatMoneyInput(100_000_000), "100,000,000");
  assert.equal(formatMoneyInput(6_000_000), "6,000,000");
  assert.equal(formatMoneyInput(100_000), "100,000");
});

test("comma가 포함된 수정 입력은 numeric 값으로 정규화한다", () => {
  assert.equal(parseMoneyInput("50,000,000"), 50_000_000);
  assert.equal(parseMoneyInput("-1,000"), null);
  assert.equal(parseMoneyInput("협의"), null);
});

test("억/만원 보조 표시는 단순하고 결정적이다", () => {
  assert.equal(formatKoreanMoney(100_000_000), "1억원");
  assert.equal(formatKoreanMoney(50_000_000), "5,000만원");
  assert.equal(formatKoreanMoney(6_000_000), "600만원");
  assert.equal(formatKoreanMoney(100_000), "10만원");
});

test("협의는 0원으로 표시하지 않고 무권리는 의미를 유지한다", () => {
  assert.equal(formatKoreanMoney(null, SEMANTIC_STATUS.NEGOTIABLE), "협의");
  assert.equal(formatKoreanMoney(0, SEMANTIC_STATUS.NO_PREMIUM), "0원 · 무권리");
  assert.equal(formatKoreanMoney(0, SEMANTIC_STATUS.NONE), "0원 · 없음");
});
