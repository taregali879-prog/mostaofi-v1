import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../audit/audit.service';
import { DomainEventService } from '../../audit/domain-event.service';
import { TenantActorContext, TenantTransactionService } from '../../database/tenant-transaction.service';
import { CommandMeta, etagForUpdatedAt, MaintenanceCommandService } from '../maintenance-command.service';
import { ContractScopeCreateDto, ContractSiteCreateDto, LifecycleCommandDto, MaintenanceContractCreateDto, SLAPolicyCreateDto } from './maintenance-contracts.dto';

@Injectable()
export class MaintenanceContractsService {
 constructor(private readonly tenant:TenantTransactionService,private readonly commands:MaintenanceCommandService,private readonly audit:AuditService,private readonly domain:DomainEventService){}

 private async contract(ctx:TenantActorContext,id:string){
  const row=await this.tenant.run(ctx,tx=>tx.maintenanceContract.findFirst({where:{id,tenantId:ctx.org}}));
  if(!row) throw new NotFoundException('MAINTENANCE_CONTRACT_NOT_FOUND');
  return row;
 }
 private async bumpContract(tx:Prisma.TransactionClient,ctx:TenantActorContext,id:string,updatedAt:Date){
  const next=new Date();
  const changed=await tx.maintenanceContract.updateMany({where:{id,tenantId:ctx.org,updatedAt},data:{updatedAt:next,updatedBy:ctx.sub}});
  if(changed.count!==1) throw new ConflictException('CONCURRENT_MODIFICATION');
  return tx.maintenanceContract.findFirstOrThrow({where:{id,tenantId:ctx.org}});
 }

 async createSLAPolicy(ctx:TenantActorContext,input:SLAPolicyCreateDto,meta:CommandMeta){
  return this.commands.execute(ctx,{operationScope:'maintenance.sla_policy.create',meta,requestBody:input},async tx=>{
   const duplicate=await tx.sLAPolicy.findFirst({where:{tenantId:ctx.org,name:input.name,version:1}});
   if(duplicate) throw new ConflictException('SLA_POLICY_VERSION_EXISTS');
   const row=await tx.sLAPolicy.create({data:{tenantId:ctx.org,name:input.name,version:1,responseTargetMinutes:input.responseTargetMinutes,arrivalTargetMinutes:input.arrivalTargetMinutes,resolutionTargetMinutes:input.resolutionTargetMinutes,workingHoursPolicy:input.workingHoursPolicy as Prisma.InputJsonObject,timezone:input.timezone,status:'DRAFT',effectiveFrom:new Date(input.effectiveFrom),effectiveTo:input.effectiveTo?new Date(input.effectiveTo):null,createdBy:ctx.sub,updatedBy:ctx.sub}});
   await this.audit.appendWith(tx,{event:'maintenance.sla_policy.created',actorId:ctx.sub,organizationId:ctx.org,entityType:'sla_policy',entityId:row.id,requestId:meta.requestId,metadata:{name:row.name,version:row.version}});
   return {body:row,updatedAt:row.updatedAt};
  });
 }
 async listSLAPolicies(ctx:TenantActorContext,status?:string){return this.tenant.run(ctx,tx=>tx.sLAPolicy.findMany({where:{tenantId:ctx.org,...(status?{status:status as any}:{})},orderBy:[{name:'asc'},{version:'desc'}]}))}
 async getSLAPolicy(ctx:TenantActorContext,id:string){const row=await this.tenant.run(ctx,tx=>tx.sLAPolicy.findFirst({where:{id,tenantId:ctx.org}}));if(!row)throw new NotFoundException('SLA_POLICY_NOT_FOUND');return {body:row,etag:etagForUpdatedAt(row.updatedAt)}}

 async create(ctx:TenantActorContext,input:MaintenanceContractCreateDto,meta:CommandMeta){
  if(new Date(input.endDate)<new Date(input.startDate)) throw new UnprocessableEntityException('INVALID_CONTRACT_DATES');
  return this.commands.execute(ctx,{operationScope:'maintenance.contract.create',meta,requestBody:input},async tx=>{
   const [client,contractor,sla]=await Promise.all([
    tx.client.findFirst({where:{id:input.clientId,tenantId:ctx.org}}),
    tx.contractorProfile.findFirst({where:{id:input.contractorId,organizationId:ctx.org}}),
    tx.sLAPolicy.findFirst({where:{id:input.slaPolicyId,tenantId:ctx.org}}),
   ]);
   if(!client||!contractor||!sla) throw new NotFoundException('MAINTENANCE_REFERENCE_NOT_FOUND');
   const contractNumber=`MC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,8).toUpperCase()}`;
   const row=await tx.maintenanceContract.create({data:{tenantId:ctx.org,contractNumber,clientId:input.clientId,contractorId:input.contractorId,contractType:input.contractType,startDate:new Date(input.startDate),endDate:new Date(input.endDate),plannedVisits:input.plannedVisits,completedVisits:0,visitFrequencyType:input.visitFrequencyType,visitFrequencyValue:input.visitFrequencyValue,contractValue:input.contractValue,vatAmount:input.vatAmount,totalValue:input.contractValue+input.vatAmount,currency:input.currency,slaPolicyId:input.slaPolicyId,status:'DRAFT',createdBy:ctx.sub,updatedBy:ctx.sub}});
   await this.audit.appendWith(tx,{event:'maintenance.contract.created',actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_contract',entityId:row.id,requestId:meta.requestId,metadata:{contractNumber:row.contractNumber}});
   return {body:row,updatedAt:row.updatedAt};
  });
 }

 async list(ctx:TenantActorContext,status?:string){return this.tenant.run(ctx,tx=>tx.maintenanceContract.findMany({where:{tenantId:ctx.org,...(status?{status:status as any}:{})},orderBy:{createdAt:'desc'}}))}
 async get(ctx:TenantActorContext,id:string){const row=await this.contract(ctx,id);return {body:row,etag:etagForUpdatedAt(row.updatedAt)}}

 async addSite(ctx:TenantActorContext,contractId:string,input:ContractSiteCreateDto,meta:CommandMeta){
  const current=await this.contract(ctx,contractId);
  return this.commands.execute(ctx,{operationScope:`maintenance.contract.${contractId}.site.add`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const contract=await tx.maintenanceContract.findFirst({where:{id:contractId,tenantId:ctx.org}});if(!contract)throw new NotFoundException('MAINTENANCE_CONTRACT_NOT_FOUND');
   if(contract.status!=='DRAFT')throw new UnprocessableEntityException('CONTRACT_NOT_MODIFIABLE');
   const site=await tx.site.findFirst({where:{id:input.siteId,tenantId:ctx.org}});if(!site)throw new NotFoundException('SITE_NOT_FOUND');
   const exists=await tx.maintenanceContractSite.findFirst({where:{tenantId:ctx.org,contractId,siteId:input.siteId}});if(exists)throw new ConflictException('CONTRACT_SITE_EXISTS');
   const row=await tx.maintenanceContractSite.create({data:{tenantId:ctx.org,contractId,siteId:input.siteId,isActive:true,createdBy:ctx.sub,updatedBy:ctx.sub}});
   const aggregate=await this.bumpContract(tx,ctx,contractId,current.updatedAt);
   await this.audit.appendWith(tx,{event:'maintenance.contract.site_added',actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_contract_site',entityId:row.id,requestId:meta.requestId,metadata:{contractId,siteId:input.siteId}});
   return {body:row,updatedAt:aggregate.updatedAt};
  });
 }
 async listSites(ctx:TenantActorContext,contractId:string){await this.contract(ctx,contractId);return this.tenant.run(ctx,tx=>tx.maintenanceContractSite.findMany({where:{tenantId:ctx.org,contractId},orderBy:{createdAt:'asc'}}))}

 async addScope(ctx:TenantActorContext,contractId:string,input:ContractScopeCreateDto,meta:CommandMeta){
  const current=await this.contract(ctx,contractId);
  return this.commands.execute(ctx,{operationScope:`maintenance.contract.${contractId}.scope.add`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const contract=await tx.maintenanceContract.findFirst({where:{id:contractId,tenantId:ctx.org}});if(!contract)throw new NotFoundException('MAINTENANCE_CONTRACT_NOT_FOUND');
   if(contract.status!=='DRAFT')throw new UnprocessableEntityException('CONTRACT_NOT_MODIFIABLE');
   const row=await tx.maintenanceContractScope.create({data:{tenantId:ctx.org,contractId,scopeCategory:input.scopeCategory,serviceType:input.serviceType,description:input.description,included:input.included,visitLimit:input.visitLimit??null,notes:input.notes??null,createdBy:ctx.sub,updatedBy:ctx.sub}});
   const aggregate=await this.bumpContract(tx,ctx,contractId,current.updatedAt);
   await this.audit.appendWith(tx,{event:'maintenance.contract.scope_added',actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_contract_scope',entityId:row.id,requestId:meta.requestId,metadata:{contractId,serviceType:input.serviceType}});
   return {body:row,updatedAt:aggregate.updatedAt};
  });
 }
 async listScopes(ctx:TenantActorContext,contractId:string){await this.contract(ctx,contractId);return this.tenant.run(ctx,tx=>tx.maintenanceContractScope.findMany({where:{tenantId:ctx.org,contractId},orderBy:{createdAt:'asc'}}))}

 async submit(ctx:TenantActorContext,contractId:string,input:LifecycleCommandDto,meta:CommandMeta){
  const current=await this.contract(ctx,contractId);
  return this.commands.execute(ctx,{operationScope:`maintenance.contract.${contractId}.submit`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const row=await tx.maintenanceContract.findFirst({where:{id:contractId,tenantId:ctx.org}});if(!row)throw new NotFoundException('MAINTENANCE_CONTRACT_NOT_FOUND');
   if(row.status!=='DRAFT')throw new UnprocessableEntityException('INVALID_CONTRACT_TRANSITION');
   const [sites,scopes]=await Promise.all([tx.maintenanceContractSite.count({where:{tenantId:ctx.org,contractId,isActive:true}}),tx.maintenanceContractScope.count({where:{tenantId:ctx.org,contractId,included:true}})]);
   if(!sites||!scopes)throw new UnprocessableEntityException('CONTRACT_COVERAGE_REQUIRED');
   const next=new Date();const changed=await tx.maintenanceContract.updateMany({where:{id:contractId,tenantId:ctx.org,updatedAt:current.updatedAt,status:'DRAFT'},data:{status:'PENDING_APPROVAL',updatedAt:next,updatedBy:ctx.sub}});if(changed.count!==1)throw new ConflictException('CONCURRENT_MODIFICATION');
   const updated=await tx.maintenanceContract.findFirstOrThrow({where:{id:contractId,tenantId:ctx.org}});
   await this.audit.appendWith(tx,{event:'maintenance.contract.submitted',actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_contract',entityId:contractId,requestId:meta.requestId,metadata:{reasonCode:input.reasonCode??null}});
   return {body:updated,updatedAt:updated.updatedAt};
  });
 }

 async activate(ctx:TenantActorContext,contractId:string,input:LifecycleCommandDto,meta:CommandMeta){
  const current=await this.contract(ctx,contractId);
  return this.commands.execute(ctx,{operationScope:`maintenance.contract.${contractId}.activate`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const row=await tx.maintenanceContract.findFirst({where:{id:contractId,tenantId:ctx.org}});if(!row)throw new NotFoundException('MAINTENANCE_CONTRACT_NOT_FOUND');
   if(row.status!=='PENDING_APPROVAL')throw new UnprocessableEntityException('INVALID_CONTRACT_TRANSITION');
   const effective=input.effectiveAt?new Date(input.effectiveAt):new Date();
   const changed=await tx.maintenanceContract.updateMany({where:{id:contractId,tenantId:ctx.org,updatedAt:current.updatedAt,status:'PENDING_APPROVAL'},data:{status:'ACTIVE',activatedAt:effective,updatedAt:new Date(),updatedBy:ctx.sub}});if(changed.count!==1)throw new ConflictException('CONCURRENT_MODIFICATION');
   const updated=await tx.maintenanceContract.findFirstOrThrow({where:{id:contractId,tenantId:ctx.org}});
   await this.audit.appendWith(tx,{event:'maintenance.contract.activated',actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_contract',entityId:contractId,requestId:meta.requestId,metadata:{effectiveAt:effective.toISOString()}});
   await this.domain.appendWith(tx,{tenantId:ctx.org,eventType:'maintenance.contract.activated',aggregateType:'maintenance_contract',aggregateId:contractId,payload:{status:'ACTIVE',activatedAt:effective.toISOString()}});
   return {body:updated,updatedAt:updated.updatedAt};
  });
 }
}
