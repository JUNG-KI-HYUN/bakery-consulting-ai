import "server-only";

export const PORTAL_LOGIN_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/u;
export const PORTAL_AUTH_FAILURE_MESSAGE = "아이디 또는 비밀번호를 확인해 주세요." as const;

export type PortalAuthIdentity = {
  readonly clientUserId: string;
  readonly authUserId: string;
  readonly providerEmail: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly loginIdentifier: string;
  readonly userStatus: "ACTIVE" | "DISABLED";
  readonly organizationStatus: "ACTIVE" | "INACTIVE";
};

export interface PortalAuthIdentityPort {
  findByLoginIdentifier(loginIdentifier: string): Promise<PortalAuthIdentity | null>;
  getDecoyIdentity(): Promise<Pick<PortalAuthIdentity, "authUserId" | "providerEmail">>;
}

export interface PortalPasswordAuthenticationPort {
  signInWithPassword(input: {
    readonly providerEmail: string;
    readonly password: string;
  }): Promise<{ readonly ok: boolean; readonly authUserId: string | null }>;
}

/** Distributed/platform-backed implementation is required before the login UI is enabled. */
export interface PortalRateLimitPort {
  assertAllowed(rateLimitKey: string): Promise<void>;
  recordFailure(rateLimitKey: string): Promise<void>;
  recordSuccess(rateLimitKey: string): Promise<void>;
}

export class PortalAuthenticationError extends Error {
  constructor(
    readonly code: "INVALID_CREDENTIALS" | "RATE_LIMITED" | "AUTH_UNAVAILABLE",
    readonly status: 401 | 429 | 503,
    message = PORTAL_AUTH_FAILURE_MESSAGE,
  ) {
    super(message);
    this.name = "PortalAuthenticationError";
  }
}

export function normalizeLoginIdentifier(value: string): string {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (!PORTAL_LOGIN_IDENTIFIER_PATTERN.test(normalized)) {
    throw new PortalAuthenticationError("INVALID_CREDENTIALS", 401);
  }
  return normalized;
}

export async function lookupPortalAuthIdentity(
  loginIdentifier: string,
  port: PortalAuthIdentityPort,
): Promise<PortalAuthIdentity | null> {
  return port.findByLoginIdentifier(normalizeLoginIdentifier(loginIdentifier));
}

export async function authenticatePortalUser(
  input: {
    readonly loginIdentifier: string;
    readonly password: string;
    /** Opaque HMAC/IP-derived key. The raw identifier must not be used as a log key. */
    readonly rateLimitKey: string;
  },
  dependencies: {
    readonly identities: PortalAuthIdentityPort;
    readonly passwords: PortalPasswordAuthenticationPort;
    readonly rateLimit: PortalRateLimitPort;
  },
): Promise<PortalAuthIdentity> {
  await dependencies.rateLimit.assertAllowed(input.rateLimitKey);

  let normalized: string | null = null;
  try {
    normalized = normalizeLoginIdentifier(input.loginIdentifier);
  } catch {
    // Continue with the decoy provider path to reduce account-enumeration timing differences.
  }

  const identity = normalized
    ? await dependencies.identities.findByLoginIdentifier(normalized)
    : null;
  const activeIdentity = identity?.userStatus === "ACTIVE" && identity.organizationStatus === "ACTIVE"
    ? identity
    : null;
  const providerIdentity = activeIdentity ?? await dependencies.identities.getDecoyIdentity();
  const result = await dependencies.passwords.signInWithPassword({
    providerEmail: providerIdentity.providerEmail,
    password: input.password,
  });

  if (!activeIdentity || !result.ok || result.authUserId !== activeIdentity.authUserId) {
    await dependencies.rateLimit.recordFailure(input.rateLimitKey);
    throw new PortalAuthenticationError("INVALID_CREDENTIALS", 401);
  }

  await dependencies.rateLimit.recordSuccess(input.rateLimitKey);
  return activeIdentity;
}
