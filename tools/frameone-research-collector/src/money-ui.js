import { SEMANTIC_STATUS } from "./lease-parser.js";

export function parseMoneyInput(value) {
  const compact = String(value ?? "").replace(/,/g, "").trim();
  if (!compact) return null;
  if (!/^\d+$/.test(compact)) return null;
  const amount = Number(compact);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function formatMoneyInput(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = typeof value === "number" ? value : parseMoneyInput(value);
  if (!Number.isSafeInteger(amount) || amount < 0) return "";
  return amount.toLocaleString("en-US");
}

export function formatKoreanMoney(value, semanticStatus = SEMANTIC_STATUS.KNOWN) {
  if (semanticStatus === SEMANTIC_STATUS.NEGOTIABLE) return "협의";
  if (semanticStatus === SEMANTIC_STATUS.NO_PREMIUM) return "0원 · 무권리";
  if (semanticStatus === SEMANTIC_STATUS.NONE) return "0원 · 없음";
  if (value === null || value === undefined || !Number.isSafeInteger(value) || value < 0) return "";
  if (value >= 100_000_000) {
    const eok = Math.floor(value / 100_000_000);
    const remainder = value % 100_000_000;
    return remainder === 0
      ? `${eok.toLocaleString("ko-KR")}억원`
      : `${eok.toLocaleString("ko-KR")}억 ${(remainder / 10_000).toLocaleString("ko-KR")}만원`;
  }
  if (value % 10_000 === 0) return `${(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
}
