import type {
  BasicLocationCustomerDisplayPolicy,
  BasicLocationResult,
} from "./results";

export const BASIC_LOCATION_AUDIENCES = ["STAFF", "CUSTOMER"] as const;

export type BasicLocationAudience = (typeof BASIC_LOCATION_AUDIENCES)[number];

export interface DisplayableBasicLocationResult {
  result: BasicLocationResult;
  requiresNote: boolean;
}

export class BasicLocationDisplayPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasicLocationDisplayPolicyError";
  }
}

const DISPLAY_MATRIX: Readonly<
  Record<BasicLocationAudience, Readonly<Record<BasicLocationCustomerDisplayPolicy, boolean>>>
> = Object.freeze({
  STAFF: Object.freeze({
    CUSTOMER_READY: true,
    CUSTOMER_WITH_NOTE: true,
    INTERNAL_ONLY: true,
    HIDDEN: false,
  }),
  CUSTOMER: Object.freeze({
    CUSTOMER_READY: true,
    CUSTOMER_WITH_NOTE: true,
    INTERNAL_ONLY: false,
    HIDDEN: false,
  }),
});

function requireAudience(value: unknown): asserts value is BasicLocationAudience {
  if (value !== "STAFF" && value !== "CUSTOMER") {
    throw new BasicLocationDisplayPolicyError("audience는 STAFF 또는 CUSTOMER여야 합니다.");
  }
}

export function applyBasicLocationDisplayPolicy(
  results: readonly BasicLocationResult[],
  audience: BasicLocationAudience,
): readonly DisplayableBasicLocationResult[] {
  requireAudience(audience);

  const displayed: DisplayableBasicLocationResult[] = [];
  for (const result of results) {
    const shouldDisplay = DISPLAY_MATRIX[audience][result.customerDisplayPolicy];
    if (typeof shouldDisplay !== "boolean") {
      throw new BasicLocationDisplayPolicyError(
        `지원하지 않는 customerDisplayPolicy입니다: ${String(result.customerDisplayPolicy)}`,
      );
    }
    if (!shouldDisplay) continue;

    const requiresNote = audience === "CUSTOMER" &&
      result.customerDisplayPolicy === "CUSTOMER_WITH_NOTE";
    if (requiresNote && result.limitations.length === 0) {
      throw new BasicLocationDisplayPolicyError(
        `CUSTOMER_WITH_NOTE Result에는 고객용 limitation이 필요합니다: ${result.resultId}`,
      );
    }

    displayed.push(Object.freeze({ result, requiresNote }));
  }

  return Object.freeze(displayed);
}
