import { IsBoolean, IsDateString, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class SLAPolicyCreateDto {
  @IsString() name!: string;
  @IsInt() @Min(0) responseTargetMinutes!: number;
  @IsInt() @Min(0) arrivalTargetMinutes!: number;
  @IsInt() @Min(0) resolutionTargetMinutes!: number;
  @IsObject() workingHoursPolicy!: Record<string,unknown>;
  @IsString() timezone!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
}

export class MaintenanceContractCreateDto {
  @IsUUID() clientId!: string;
  @IsUUID() contractorId!: string;
  @IsString() contractType!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsInt() @Min(0) plannedVisits!: number;
  @IsString() visitFrequencyType!: string;
  @IsInt() @Min(1) visitFrequencyValue!: number;
  @IsNumber() @Min(0) contractValue!: number;
  @IsNumber() @Min(0) vatAmount!: number;
  @IsString() @Length(3,3) currency!: string;
  @IsUUID() slaPolicyId!: string;
}

export class ContractSiteCreateDto {
  @IsUUID() siteId!: string;
}

export class ContractScopeCreateDto {
  @IsString() scopeCategory!: string;
  @IsString() serviceType!: string;
  @IsString() description!: string;
  @IsBoolean() included!: boolean;
  @IsOptional() @IsInt() @Min(0) visitLimit?: number | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class LifecycleCommandDto {
  @IsOptional() @IsString() reasonCode?: string | null;
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsDateString() effectiveAt?: string | null;
  @IsOptional() @IsObject() metadata?: Record<string,unknown> | null;
}
