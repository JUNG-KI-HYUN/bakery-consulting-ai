import type {
  FreshnessStatus,
  LeaseResearchRecord,
  NumericSummary,
  RentalMarketFilters,
  RentalMarketResult,
  ResearchSourceType,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  // 짝수 표본은 가운데 두 값의 산술평균을 사용해 결정적으로 계산한다.
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarize(values: Array<number | null>): NumericSummary {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    sampleCount: usable.length,
    median: median(usable),
    min: usable.length ? Math.min(...usable) : null,
    max: usable.length ? Math.max(...usable) : null,
  };
}

export function freshnessAt(collectedAt: string, referenceDate: string): FreshnessStatus {
  const collected = Date.parse(collectedAt);
  const reference = Date.parse(referenceDate);
  if (!Number.isFinite(collected) || !Number.isFinite(reference)) throw new TypeError("Invalid freshness date.");
  const ageDays = Math.max(0, Math.floor((reference - collected) / DAY_MS));
  if (ageDays <= 30) return "CURRENT_30D";
  if (ageDays <= 90) return "RECENT_90D";
  if (ageDays <= 180) return "AGED_180D";
  return "STALE";
}

function referenceTimestamp(referenceDate: string) {
  const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
    ? `${referenceDate}T23:59:59.999Z`
    : referenceDate);
  if (!Number.isFinite(timestamp)) throw new TypeError("referenceDate must be a valid date.");
  return timestamp;
}

function explicitSameListingIds(record: LeaseResearchRecord) {
  return record.history
    .filter((event) => event.type === "DUPLICATE_REVIEWED" && event.decision === "SAME_LISTING" && typeof event.relatedRecordId === "string")
    .map((event) => event.relatedRecordId as string);
}

function buildGroups(records: LeaseResearchRecord[]) {
  const ids = new Set(records.map((record) => record.recordId));
  const parent = new Map(records.map((record) => [record.recordId, record.recordId]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      const root = leftRoot < rightRoot ? leftRoot : rightRoot;
      parent.set(leftRoot, root);
      parent.set(rightRoot, root);
    }
  };
  for (const record of records) {
    for (const relatedId of explicitSameListingIds(record)) {
      if (ids.has(relatedId)) union(record.recordId, relatedId);
    }
  }
  const grouped = new Map<string, LeaseResearchRecord[]>();
  for (const record of records) {
    const root = find(record.recordId);
    grouped.set(root, [...(grouped.get(root) ?? []), record]);
  }
  return [...grouped.values()].map((group) => group.sort((left, right) =>
    Date.parse(left.source.collectedAt) - Date.parse(right.source.collectedAt)
    || left.recordId.localeCompare(right.recordId)));
}

function amountChange(field: string, previousValue: number | string | null, currentValue: number | string | null) {
  const numeric = typeof previousValue === "number" && typeof currentValue === "number";
  return {
    field,
    previousValue,
    currentValue,
    changeAmount: numeric ? (currentValue as number) - (previousValue as number) : null,
    changeRate: numeric && previousValue !== 0
      ? (((currentValue as number) - (previousValue as number)) / (previousValue as number)) * 100
      : null,
  };
}

function priceHistory(groups: LeaseResearchRecord[][]): RentalMarketResult["priceHistory"] {
  return groups.flatMap((group) => group.slice(1).map((current, index) => {
    const previous = group[index];
    const definitions: Array<[string, number | string | null, number | string | null]> = [
      ["depositAmount", previous.lease.depositAmount, current.lease.depositAmount],
      ["rentAmount", previous.lease.rentAmount, current.lease.rentAmount],
      ["managementFeeAmount", previous.lease.managementFeeAmount, current.lease.managementFeeAmount],
      ["premiumAmount", previous.lease.premiumAmount, current.lease.premiumAmount],
      ["premiumStatus", previous.lease.premiumStatus, current.lease.premiumStatus],
    ];
    return {
      propertyGroupRecordIds: group.map((record) => record.recordId),
      previousRecordId: previous.recordId,
      currentRecordId: current.recordId,
      previousCollectedAt: previous.source.collectedAt,
      currentCollectedAt: current.source.collectedAt,
      changes: definitions
        .filter(([, previousValue, currentValue]) => previousValue !== currentValue)
        .map(([field, previousValue, currentValue]) => amountChange(field, previousValue, currentValue)),
    };
  }).filter((entry) => entry.changes.length > 0));
}

function matchesFilters(record: LeaseResearchRecord, filters: RentalMarketFilters, referenceDate: string) {
  if (filters.floor !== undefined && record.property.floor !== filters.floor) return false;
  const area = record.property.exclusiveAreaPyeong;
  if (filters.exclusiveAreaMinPyeong !== undefined && (area === null || area < filters.exclusiveAreaMinPyeong)) return false;
  if (filters.exclusiveAreaMaxPyeong !== undefined && (area === null || area > filters.exclusiveAreaMaxPyeong)) return false;
  if (filters.freshness?.length && !filters.freshness.includes(freshnessAt(record.source.collectedAt, referenceDate))) return false;
  if (filters.sourceTypes?.length && !filters.sourceTypes.includes(record.source.sourceType)) return false;
  return true;
}

export function analyzeRentalMarket(
  records: LeaseResearchRecord[],
  options: { referenceDate: string; filters?: RentalMarketFilters },
): RentalMarketResult {
  const reference = referenceTimestamp(options.referenceDate);
  const filters = structuredClone(options.filters ?? {});
  const confirmed = records.filter((record) =>
    record.quality.verificationStatus === "CONFIRMED"
    && Date.parse(record.source.collectedAt) <= reference);
  const groups = buildGroups(confirmed);
  // 사람이 SAME_LISTING으로 연결한 snapshot만 그룹화하고, 각 그룹의 최신 확정 snapshot 하나만 표본으로 쓴다.
  const latestSnapshots = groups.map((group) => group[group.length - 1]);
  const samples = latestSnapshots.filter((record) => matchesFilters(record, filters, options.referenceDate));
  const sourceComposition: Partial<Record<ResearchSourceType, number>> = {};
  for (const record of samples) {
    sourceComposition[record.source.sourceType] = (sourceComposition[record.source.sourceType] ?? 0) + 1;
  }
  const rentPerExclusivePyeong = samples.map((record) => {
    const area = record.property.exclusiveAreaPyeong;
    // 계약면적이나 관리비를 대체·합산하지 않고, 유효한 전용평수와 월세가 모두 있을 때만 계산한다.
    return typeof record.lease.rentAmount === "number" && typeof area === "number" && area > 0
      ? record.lease.rentAmount / area
      : null;
  });
  return {
    schemaVersion: "frameone.rental-market-analysis.v1",
    filters,
    sampleCount: samples.length,
    sampleSufficiency: samples.length < 3 ? "INSUFFICIENT_REFERENCE_ONLY" : "REFERENCE_ONLY",
    selectedRecordIds: samples.map((record) => record.recordId),
    sourceComposition,
    referenceDate: options.referenceDate,
    deposit: summarize(samples.map((record) => record.lease.depositAmount)),
    rent: summarize(samples.map((record) => record.lease.rentAmount)),
    managementFee: summarize(samples.map((record) => record.lease.managementFeeAmount)),
    rentPerExclusivePyeong: summarize(rentPerExclusivePyeong),
    priceHistory: priceHistory(groups),
    limitations: [
      "FRAMEONE이 확인한 조사표본의 참고용 통계이며 모집단 전체의 시장가격이 아닙니다.",
      "ONLINE_LISTING은 광고가격이며 실제 계약가격과 다를 수 있습니다.",
      "실제 계약 전 중개확인과 계약조건 확인이 필요합니다.",
    ],
  };
}
