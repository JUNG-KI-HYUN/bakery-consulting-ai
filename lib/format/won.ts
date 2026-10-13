export function parseWonInput(value: unknown): number | undefined {
  const compact = String(value ?? "").replace(/,/g, "").replace(/원/g, "").replace(/\s/g, "");
  if (!compact || !/^\d+$/.test(compact)) return undefined;
  const amount = Number(compact);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export function formatWonInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const amount = typeof value === "number" ? value : parseWonInput(value);
  if (amount === undefined || !Number.isSafeInteger(amount) || amount < 0) return "";
  return amount.toLocaleString("ko-KR");
}

export function formatWon(value: number | null | undefined, emptyLabel = "확인 필요"): string {
  if (value === null || value === undefined || !Number.isSafeInteger(value) || value < 0) return emptyLabel;
  return `${value.toLocaleString("ko-KR")}원`;
}
