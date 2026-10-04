import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class TechnicianCreateDto {
  @IsUUID() contractorId!: string;
  @IsOptional() @IsUUID() userId?: string | null;
  @IsString() employeeCode!: string;
  @IsString() displayName!: string;
  @IsString() mobile!: string;
}

export class MaintenanceVisitCreateDto {
  @IsUUID() siteId!: string;
  @IsOptional() @IsUUID() previousVisitId?: string | null;
  @IsIn(['PLANNED_MAINTENANCE','CORRECTIVE_REVISIT','CALL_OUT','FOLLOW_UP']) visitKind!: string;
  @IsDateString() scheduledStart!: string;
  @IsDateString() scheduledEnd!: string;
}

export class WorkOrderCreateDto {
  @IsString() serviceType!: string;
  @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority!: string;
  @IsDateString() scheduledStart!: string;
  @IsOptional() @IsDateString() slaDeadline?: string | null;
}

export class WorkOrderAssignmentCreateDto {
  @IsUUID() technicianId!: string;
  @IsIn(['LEAD_TECHNICIAN','ASSISTANT','SPECIALIST','INSPECTOR']) role!: string;
}
