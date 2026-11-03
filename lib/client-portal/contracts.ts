import type { StoreDevelopmentReportType } from "../store-development-report/contracts";

export const CLIENT_ORGANIZATION_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const CLIENT_USER_ROLES = ["VIEWER"] as const;
export const CLIENT_USER_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const CLIENT_PROJECT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const CANDIDATE_SHARE_STATUSES = ["READY_TO_SHARE", "SHARED", "ARCHIVED"] as const;
export const REPORT_SHARE_STATUSES = ["SHARED", "ARCHIVED"] as const;
export const CLIENT_FEEDBACK_TYPES = ["INTERESTED", "REQUEST_REVIEW", "COMMENT"] as const;

export type ClientOrganizationStatus = (typeof CLIENT_ORGANIZATION_STATUSES)[number];
export type ClientUserRole = (typeof CLIENT_USER_ROLES)[number];
export type ClientUserStatus = (typeof CLIENT_USER_STATUSES)[number];
export type ClientProjectStatus = (typeof CLIENT_PROJECT_STATUSES)[number];
export type CandidateShareStatus = (typeof CANDIDATE_SHARE_STATUSES)[number];
export type ReportShareStatus = (typeof REPORT_SHARE_STATUSES)[number];
export type ClientFeedbackType = (typeof CLIENT_FEEDBACK_TYPES)[number];

export interface ClientOrganization {
  readonly id: string;
  readonly name: string;
  readonly status: ClientOrganizationStatus;
  readonly createdAt: string;
}

export interface ClientUser {
  readonly id: string;
  readonly authUserId: string;
  readonly organizationId: string;
  readonly loginIdentifier: string;
  readonly role: ClientUserRole;
  readonly status: ClientUserStatus;
  readonly createdAt: string;
}

export interface ClientProject {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly name: string;
  readonly status: ClientProjectStatus;
  readonly createdAt: string;
}

export interface CandidateShare {
  readonly id: string;
  readonly projectId: string;
  readonly candidateStoreId: string;
  readonly status: CandidateShareStatus;
  readonly sharedAt: string | null;
  readonly sharedByActor: string | null;
  readonly createdAt: string;
}

export interface ReportShare {
  readonly id: string;
  readonly projectId: string;
  readonly generationId: string;
  readonly reportType: StoreDevelopmentReportType;
  readonly fileName: string;
  readonly status: ReportShareStatus;
  readonly sharedAt: string;
}

export interface ClientFeedback {
  readonly id: string;
  readonly candidateShareId: string;
  readonly clientUserId: string;
  readonly type: ClientFeedbackType;
  readonly message: string | null;
  readonly createdAt: string;
}

export interface PortalSessionDto {
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly loginIdentifier: string;
}

export type PortalLeaseConditionDto = {
  readonly area: string;
  readonly deposit: string;
  readonly rent: string;
  readonly maintenance: string;
  readonly premium: string;
};

export type PortalSbiz365Dto = {
  readonly analysisRadiusMeters: number | null;
  readonly analysisDate: string | null;
  readonly householdDisplay: string;
  readonly residentialPopulationDisplay: string;
  readonly competitorDisplay: string;
  readonly limitation: string | null;
};

export type PortalMapDto = {
  readonly available: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly assetUrl: string | null;
};

export type PortalPhotoDto = {
  readonly photoId: string;
  readonly category: string;
  readonly url: string;
  readonly sortOrder: number;
  readonly primary: boolean;
};

/** Customer-safe projection contract. Internal source fields and evidence IDs are intentionally absent. */
export interface PortalCandidateDto {
  readonly candidateStoreId: string;
  readonly displayCode: string;
  readonly address: string;
  readonly region: string;
  readonly apartmentArea: string;
  readonly lease: PortalLeaseConditionDto;
  readonly lifecycleLabel: string;
  readonly approvedSummary: string;
  readonly strengths: readonly string[];
  readonly checks: readonly string[];
  readonly sbiz365: PortalSbiz365Dto | null;
  readonly map: PortalMapDto;
  readonly photos: readonly PortalPhotoDto[];
}
