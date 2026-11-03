import "server-only";
import type {
  CandidateShare,
  ClientProject,
  PortalSessionDto,
  ReportShare,
} from "./contracts";
import type { StoreDevelopmentReportType } from "../store-development-report/contracts";

export type ApprovedPhotoAccess = {
  readonly photoId: string;
  readonly caseId: string;
  readonly candidateStoreId: string;
  readonly assetRef: string;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
};

export interface PortalAuthorizationRepository {
  findActiveProject(organizationId: string, projectId: string): Promise<ClientProject | null>;
  findSharedCandidate(projectId: string, candidateStoreId: string): Promise<CandidateShare | null>;
  findSharedReport(organizationId: string, reportShareId: string): Promise<ReportShare | null>;
  findApprovedPhoto(projectId: string, candidateStoreId: string, photoId: string): Promise<ApprovedPhotoAccess | null>;
}

export interface CandidateReferenceValidationPort {
  candidateExists(input: { readonly caseId: string; readonly candidateStoreId: string }): Promise<boolean>;
}

export type ReportManifestReference = {
  readonly caseId: string;
  readonly generationId: string;
  readonly reportType: StoreDevelopmentReportType;
  readonly fileName: string;
};

export interface ReportReferenceValidationPort {
  findGenerationManifest(generationId: string): Promise<ReportManifestReference | null>;
}

export class PortalResourceNotFoundError extends Error {
  readonly status = 404 as const;

  constructor() {
    super("요청한 Portal 자료를 찾을 수 없습니다.");
    this.name = "PortalResourceNotFoundError";
  }
}

export async function requireProjectAccess(
  session: PortalSessionDto,
  projectId: string,
  repository: PortalAuthorizationRepository,
): Promise<ClientProject> {
  const project = await repository.findActiveProject(session.organizationId, projectId);
  if (!project || project.organizationId !== session.organizationId || project.status !== "ACTIVE") {
    throw new PortalResourceNotFoundError();
  }
  return project;
}

export async function requireCandidateShare(
  session: PortalSessionDto,
  projectId: string,
  candidateStoreId: string,
  repository: PortalAuthorizationRepository,
): Promise<CandidateShare> {
  await requireProjectAccess(session, projectId, repository);
  const share = await repository.findSharedCandidate(projectId, candidateStoreId);
  if (!share || share.projectId !== projectId || share.candidateStoreId !== candidateStoreId || share.status !== "SHARED") {
    throw new PortalResourceNotFoundError();
  }
  return share;
}

export async function requireReportShare(
  session: PortalSessionDto,
  reportShareId: string,
  repository: PortalAuthorizationRepository,
): Promise<ReportShare> {
  const share = await repository.findSharedReport(session.organizationId, reportShareId);
  if (!share || share.status !== "SHARED") throw new PortalResourceNotFoundError();
  await requireProjectAccess(session, share.projectId, repository);
  return share;
}

export async function requireApprovedPhoto(
  session: PortalSessionDto,
  input: { readonly projectId: string; readonly candidateStoreId: string; readonly photoId: string },
  repository: PortalAuthorizationRepository,
): Promise<ApprovedPhotoAccess> {
  await requireCandidateShare(session, input.projectId, input.candidateStoreId, repository);
  const photo = await repository.findApprovedPhoto(input.projectId, input.candidateStoreId, input.photoId);
  if (!photo || photo.candidateStoreId !== input.candidateStoreId) throw new PortalResourceNotFoundError();
  return photo;
}

export async function validateCandidateForCase(
  port: CandidateReferenceValidationPort,
  caseId: string,
  candidateStoreId: string,
): Promise<void> {
  if (!await port.candidateExists({ caseId, candidateStoreId })) throw new PortalResourceNotFoundError();
}

export async function validateReportForCase(
  port: ReportReferenceValidationPort,
  expected: ReportManifestReference,
): Promise<void> {
  const manifest = await port.findGenerationManifest(expected.generationId);
  if (!manifest
    || manifest.caseId !== expected.caseId
    || manifest.generationId !== expected.generationId
    || manifest.reportType !== expected.reportType
    || manifest.fileName !== expected.fileName) {
    throw new PortalResourceNotFoundError();
  }
}
