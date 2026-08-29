export type ContractorStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'TRIAL' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export type Role =
  | 'SUPER_ADMIN' | 'ORG_ADMIN' | 'CONTRACTOR_ADMIN' | 'PROJECT_MANAGER'
  | 'ENGINEER' | 'SALES' | 'PROCUREMENT' | 'ACCOUNTANT' | 'FIELD_USER' | 'VIEWER';

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  roles: Role[];
}

export interface ContractorProfileDto {
  id: string;
  organizationId: string;
  legalName: string;
  commercialRegistrationNo: string;
  city?: string;
  phone?: string;
  status: ContractorStatus;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
}

export interface CreateProjectRequest {
  name: string;
  clientName: string;
  city: string;
  scope: string;
  estimatedValue?: number;
  expectedStartDate?: string;
}

export interface ProjectDto extends CreateProjectRequest {
  id: string;
  organizationId: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDto {
  id: string;
  projectId: string;
  organizationId: string;
  type: string;
  title: string;
  currentVersion: number;
  status: 'DRAFT' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
}

export interface AuditEventDto {
  id: string;
  event: string;
  actorId: string | null;
  organizationId: string;
  entityType: string;
  entityId: string;
  requestId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}
