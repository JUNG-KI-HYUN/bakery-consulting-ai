import "server-only";
import type { PortalSessionDto } from "./contracts";

export interface PortalSessionPort {
  getVerifiedAuthUserId(): Promise<string | null>;
  findActiveSession(authUserId: string): Promise<PortalSessionDto | null>;
}

export class PortalSessionRequiredError extends Error {
  readonly status = 401 as const;

  constructor() {
    super("로그인이 필요합니다.");
    this.name = "PortalSessionRequiredError";
  }
}

export async function requirePortalSession(port: PortalSessionPort): Promise<PortalSessionDto> {
  const authUserId = await port.getVerifiedAuthUserId();
  if (!authUserId) throw new PortalSessionRequiredError();
  const session = await port.findActiveSession(authUserId);
  if (!session) throw new PortalSessionRequiredError();
  return session;
}
