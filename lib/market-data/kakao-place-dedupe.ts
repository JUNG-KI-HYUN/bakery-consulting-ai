export interface KakaoPlaceDedupeCandidate {
  kakaoPlaceId: string | null;
  name: string;
  phone: string | null;
  roadAddress: string | null;
  addressName: string | null;
  distanceM?: number | null;
  sourceCategoryId: string;
  sourceCategoryLabel: string;
}

export type DedupedKakaoPlace<T extends KakaoPlaceDedupeCandidate> = T & {
  matchedCategoryIds: string[];
  matchedCategoryLabels: string[];
};

export function normalizeKakaoPlaceName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s.,·ㆍ'"`~!@#$%^&*()_+=:;/?\\|[\]{}<>-]+/g, "");
}

export function normalizeKakaoPhone(value: string | null | undefined) {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized || null;
}

export function normalizeKakaoAddress(value: string | null | undefined) {
  const normalized = value
    ?.normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .replace(/\s*([,.-])\s*/g, "$1");
  return normalized || null;
}

function addressAliases(place: KakaoPlaceDedupeCandidate) {
  return new Set(
    [place.roadAddress, place.addressName]
      .map(normalizeKakaoAddress)
      .filter((value): value is string => Boolean(value)),
  );
}

function hasSameAddress(
  left: KakaoPlaceDedupeCandidate,
  right: KakaoPlaceDedupeCandidate,
) {
  const leftAliases = addressAliases(left);
  if (leftAliases.size === 0) return false;
  return [...addressAliases(right)].some((alias) => leftAliases.has(alias));
}

function isSamePlace(
  left: KakaoPlaceDedupeCandidate,
  right: KakaoPlaceDedupeCandidate,
) {
  if (left.kakaoPlaceId && right.kakaoPlaceId) {
    return left.kakaoPlaceId === right.kakaoPlaceId;
  }
  if (left.kakaoPlaceId || right.kakaoPlaceId || !hasSameAddress(left, right)) {
    return false;
  }

  const leftPhone = normalizeKakaoPhone(left.phone);
  const rightPhone = normalizeKakaoPhone(right.phone);
  if (leftPhone && rightPhone) return leftPhone === rightPhone;

  const leftName = normalizeKakaoPlaceName(left.name);
  const rightName = normalizeKakaoPlaceName(right.name);
  return Boolean(leftName && leftName === rightName);
}

function addressCompleteness(place: KakaoPlaceDedupeCandidate) {
  return addressAliases(place).size + (normalizeKakaoAddress(place.roadAddress) ? 1 : 0);
}

function preferCandidate<T extends KakaoPlaceDedupeCandidate>(left: T, right: T) {
  const comparisons = [
    Number(Boolean(right.kakaoPlaceId)) - Number(Boolean(left.kakaoPlaceId)),
    addressCompleteness(right) - addressCompleteness(left),
    Number(Boolean(normalizeKakaoPhone(right.phone))) - Number(Boolean(normalizeKakaoPhone(left.phone))),
  ];
  for (const comparison of comparisons) {
    if (comparison !== 0) return comparison > 0 ? right : left;
  }

  const leftDistance = left.distanceM;
  const rightDistance = right.distanceM;
  if (typeof rightDistance === "number" && Number.isFinite(rightDistance)) {
    if (typeof leftDistance !== "number" || !Number.isFinite(leftDistance) || rightDistance < leftDistance) {
      return right;
    }
  }
  return left;
}

export function dedupeKakaoPlaces<T extends KakaoPlaceDedupeCandidate>(
  places: readonly T[],
): Array<DedupedKakaoPlace<T>> {
  const groups: Array<{
    representative: T;
    categoryIds: string[];
    categoryLabels: string[];
    firstIndex: number;
  }> = [];

  places.forEach((place, index) => {
    const existing = groups.find((group) => isSamePlace(group.representative, place));
    if (!existing) {
      groups.push({
        representative: place,
        categoryIds: [place.sourceCategoryId],
        categoryLabels: [place.sourceCategoryLabel],
        firstIndex: index,
      });
      return;
    }

    existing.representative = preferCandidate(existing.representative, place);
    if (!existing.categoryIds.includes(place.sourceCategoryId)) {
      existing.categoryIds.push(place.sourceCategoryId);
    }
    if (!existing.categoryLabels.includes(place.sourceCategoryLabel)) {
      existing.categoryLabels.push(place.sourceCategoryLabel);
    }
  });

  return groups
    .sort((left, right) => {
      const leftDistance = left.representative.distanceM;
      const rightDistance = right.representative.distanceM;
      const leftHasDistance = typeof leftDistance === "number" && Number.isFinite(leftDistance);
      const rightHasDistance = typeof rightDistance === "number" && Number.isFinite(rightDistance);
      if (leftHasDistance && rightHasDistance && leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      if (leftHasDistance !== rightHasDistance) return leftHasDistance ? -1 : 1;
      return left.firstIndex - right.firstIndex;
    })
    .map(({ representative, categoryIds, categoryLabels }) => ({
      ...representative,
      matchedCategoryIds: categoryIds,
      matchedCategoryLabels: categoryLabels,
    }));
}
