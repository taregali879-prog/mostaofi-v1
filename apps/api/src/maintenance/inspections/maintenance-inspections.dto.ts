import { IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class InspectionTemplateCreateDto { @IsString() name!:string; @IsString() serviceType!:string; }
export class InspectionTemplateVersionCreateDto { @IsOptional() @IsDateString() effectiveFrom?:string|null; }
export class InspectionSectionCreateDto { @IsString() title!:string; @IsInt() @Min(0) displayOrder!:number; }
export class InspectionItemCreateDto {
 @IsString() code!:string; @IsString() question!:string;
 @IsIn(['PASS_FAIL','YES_NO','NUMBER','TEXT','READING','PHOTO','VIDEO','MULTI_SELECT','SIGNATURE']) answerType!:string;
 @IsBoolean() required!:boolean; @IsBoolean() requiresEvidenceOnFail!:boolean; @IsInt() @Min(0) displayOrder!:number;
}
export class InspectionCreateDto { @IsUUID() templateVersionId!:string; @IsUUID() performedBy!:string; }
export class InspectionAnswerUpsertDto {
 @IsOptional() @IsBoolean() answerBoolean?:boolean|null;
 @IsOptional() @IsNumberString() answerNumber?:string|null;
 @IsOptional() @IsString() answerText?:string|null;
 @IsOptional() @IsObject() answerJson?:Record<string,unknown>|null;
 @IsIn(['PASS','FAIL','RECORDED','NOT_APPLICABLE']) result!:string;
 @IsDateString() recordedAt!:string;
}
export class FindingCreateDto {
 @IsOptional() @IsUUID() inspectionItemId?:string|null; @IsOptional() @IsUUID() assetId?:string|null; @IsOptional() @IsUUID() findingClassificationId?:string|null;
 @IsIn(['OBSERVATION','FAULT','VIOLATION','RECOMMENDATION']) findingType!:string; @IsString() category!:string; @IsString() title!:string; @IsString() description!:string;
 @IsIn(['LOW','MEDIUM','HIGH','CRITICAL']) severity!:string; @IsString() riskLevel!:string;
}
export class FindingPatchDto {
 @IsOptional() @IsString() category?:string; @IsOptional() @IsString() title?:string; @IsOptional() @IsString() description?:string;
 @IsOptional() @IsIn(['LOW','MEDIUM','HIGH','CRITICAL']) severity?:string; @IsOptional() @IsString() riskLevel?:string;
}
