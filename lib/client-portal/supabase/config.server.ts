import "server-only";

export class PortalSupabaseConfigurationError extends Error {
  constructor(readonly variableName: string) {
    super(`Client Portal Supabase 환경변수 ${variableName} 설정이 필요합니다.`);
    this.name = "PortalSupabaseConfigurationError";
  }
}

export function requiredPortalEnvironment(variableName: string): string {
  const value = process.env[variableName]?.trim();
  if (!value) throw new PortalSupabaseConfigurationError(variableName);
  return value;
}
