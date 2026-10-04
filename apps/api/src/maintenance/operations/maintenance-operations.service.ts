import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../audit/audit.service';
import { DomainEventService } from '../../audit/domain-event.service';
import { TenantActorContext, TenantTransactionService } from '../../database/tenant-transaction.service';
import { CommandMeta, etagForUpdatedAt, MaintenanceCommandService } from '../maintenance-command.service';
import { LifecycleCommandDto } from '../contracts/maintenance-contracts.dto';
import { MaintenanceVisitCreateDto, TechnicianCreateDto, WorkOrderAssignmentCreateDto, WorkOrderCreateDto } from './maintenance-operations.dto';

@Injectable()
export class MaintenanceOperationsService {
 constructor(private readonly tenant:TenantTransactionService,private readonly commands:MaintenanceCommandService,private readonly audit:AuditService,private readonly domain:DomainEventService){}

 private async contract(ctx:TenantActorContext,id:string){const row=await this.tenant.run(ctx,tx=>tx.maintenanceContract.findFirst({where:{id,tenantId:ctx.org}}));if(!row)throw new NotFoundException('MAINTENANCE_CONTRACT_NOT_FOUND');return row}
 private async visit(ctx:TenantActorContext,id:string){const row=await this.tenant.run(ctx,tx=>tx.maintenanceVisit.findFirst({where:{id,tenantId:ctx.org}}));if(!row)throw new NotFoundException('MAINTENANCE_VISIT_NOT_FOUND');return row}
 private async workOrder(ctx:TenantActorContext,id:string){const row=await this.tenant.run(ctx,tx=>tx.workOrder.findFirst({where:{id,tenantId:ctx.org}}));if(!row)throw new NotFoundException('WORK_ORDER_NOT_FOUND');return row}
 private async bumpContract(tx:Prisma.TransactionClient,ctx:TenantActorContext,id:string,updatedAt:Date){const next=new Date();const changed=await tx.maintenanceContract.updateMany({where:{id,tenantId:ctx.org,updatedAt},data:{updatedAt:next,updatedBy:ctx.sub}});if(changed.count!==1)throw new ConflictException('CONCURRENT_MODIFICATION');return tx.maintenanceContract.findFirstOrThrow({where:{id,tenantId:ctx.org}})}
 private async bumpVisit(tx:Prisma.TransactionClient,ctx:TenantActorContext,id:string,updatedAt:Date){const next=new Date();const changed=await tx.maintenanceVisit.updateMany({where:{id,tenantId:ctx.org,updatedAt},data:{updatedAt:next,updatedBy:ctx.sub}});if(changed.count!==1)throw new ConflictException('CONCURRENT_MODIFICATION');return tx.maintenanceVisit.findFirstOrThrow({where:{id,tenantId:ctx.org}})}
 async createTechnician(ctx:TenantActorContext,input:TechnicianCreateDto,meta:CommandMeta){
  return this.commands.execute(ctx,{operationScope:'maintenance.technician.create',meta,requestBody:input},async tx=>{
   const contractor=await tx.contractorProfile.findFirst({where:{id:input.contractorId,organizationId:ctx.org}});if(!contractor)throw new NotFoundException('CONTRACTOR_NOT_FOUND');
   if(input.userId){const membership=await tx.membership.findFirst({where:{userId:input.userId,organizationId:ctx.org}});if(!membership)throw new NotFoundException('USER_NOT_FOUND')}
   const duplicate=await tx.technician.findFirst({where:{tenantId:ctx.org,employeeCode:input.employeeCode}});if(duplicate)throw new ConflictException('TECHNICIAN_EMPLOYEE_CODE_EXISTS');
   const row=await tx.technician.create({data:{tenantId:ctx.org,contractorId:input.contractorId,userId:input.userId??null,employeeCode:input.employeeCode,displayName:input.displayName,mobile:input.mobile,status:'ACTIVE',createdBy:ctx.sub,updatedBy:ctx.sub}});
   await this.audit.appendWith(tx,{event:'maintenance.technician.created',actorId:ctx.sub,organizationId:ctx.org,entityType:'technician',entityId:row.id,requestId:meta.requestId,metadata:{contractorId:row.contractorId}});
   return {body:row,updatedAt:row.updatedAt};
  });
 }
 async listTechnicians(ctx:TenantActorContext){return this.tenant.run(ctx,tx=>tx.technician.findMany({where:{tenantId:ctx.org},orderBy:{createdAt:'desc'}}))}
 async getTechnician(ctx:TenantActorContext,id:string){const row=await this.tenant.run(ctx,tx=>tx.technician.findFirst({where:{id,tenantId:ctx.org}}));if(!row)throw new NotFoundException('TECHNICIAN_NOT_FOUND');return {body:row,etag:etagForUpdatedAt(row.updatedAt)}}

 async createVisit(ctx:TenantActorContext,contractId:string,input:MaintenanceVisitCreateDto,meta:CommandMeta){
  const current=await this.contract(ctx,contractId);if(current.status!=='ACTIVE')throw new UnprocessableEntityException('CONTRACT_NOT_ACTIVE');
  const start=new Date(input.scheduledStart),end=new Date(input.scheduledEnd);if(end<=start)throw new UnprocessableEntityException('INVALID_VISIT_SCHEDULE');
  return this.commands.execute(ctx,{operationScope:`maintenance.contract.${contractId}.visit.create`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const siteLink=await tx.maintenanceContractSite.findFirst({where:{tenantId:ctx.org,contractId,siteId:input.siteId,isActive:true}});if(!siteLink)throw new NotFoundException('CONTRACT_SITE_NOT_FOUND');
   if(input.previousVisitId){const previous=await tx.maintenanceVisit.findFirst({where:{id:input.previousVisitId,tenantId:ctx.org,contractId,siteId:input.siteId}});if(!previous)throw new NotFoundException('PREVIOUS_VISIT_NOT_FOUND')}
   const last=await tx.maintenanceVisit.findFirst({where:{tenantId:ctx.org,contractId},orderBy:{visitSequence:'desc'}});const visitSequence=(last?.visitSequence??0)+1;
   const row=await tx.maintenanceVisit.create({data:{tenantId:ctx.org,contractId,siteId:input.siteId,previousVisitId:input.previousVisitId??null,visitSequence,visitKind:input.visitKind as any,scheduledStart:start,scheduledEnd:end,status:'PLANNED',createdBy:ctx.sub,updatedBy:ctx.sub}});
   const aggregate=await this.bumpContract(tx,ctx,contractId,current.updatedAt);
   await this.audit.appendWith(tx,{event:'maintenance.visit.created',actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_visit',entityId:row.id,requestId:meta.requestId,metadata:{contractId,siteId:row.siteId,visitSequence}});
   await this.domain.appendWith(tx,{tenantId:ctx.org,eventType:'maintenance.visit.scheduled',aggregateType:'maintenance_visit',aggregateId:row.id,payload:{contractId,siteId:row.siteId,visitSequence,status:row.status}});
   return {body:row,updatedAt:aggregate.updatedAt};
  });
 }
 async listVisits(ctx:TenantActorContext,contractId:string){await this.contract(ctx,contractId);return this.tenant.run(ctx,tx=>tx.maintenanceVisit.findMany({where:{tenantId:ctx.org,contractId},orderBy:{visitSequence:'asc'}}))}
 async getVisit(ctx:TenantActorContext,id:string){const row=await this.visit(ctx,id);return {body:row,etag:etagForUpdatedAt(row.updatedAt)}}
 private async transitionVisit(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta,expected:string,nextStatus:string,auditEvent:string,timeField?:string,domainEvent?:string){
  const current=await this.visit(ctx,id);
  return this.commands.execute(ctx,{operationScope:`maintenance.visit.${id}.${nextStatus.toLowerCase()}`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const effective=input.effectiveAt?new Date(input.effectiveAt):new Date();const data:any={status:nextStatus,updatedAt:new Date(),updatedBy:ctx.sub};if(timeField)data[timeField]=effective;
   const changed=await tx.maintenanceVisit.updateMany({where:{id,tenantId:ctx.org,updatedAt:current.updatedAt,status:expected as any},data});if(changed.count!==1){const exists=await tx.maintenanceVisit.findFirst({where:{id,tenantId:ctx.org}});if(!exists)throw new NotFoundException('MAINTENANCE_VISIT_NOT_FOUND');if(exists.updatedAt.getTime()!==current.updatedAt.getTime())throw new ConflictException('CONCURRENT_MODIFICATION');throw new UnprocessableEntityException('INVALID_VISIT_TRANSITION')}
   const row=await tx.maintenanceVisit.findFirstOrThrow({where:{id,tenantId:ctx.org}});
   await this.audit.appendWith(tx,{event:auditEvent,actorId:ctx.sub,organizationId:ctx.org,entityType:'maintenance_visit',entityId:id,requestId:meta.requestId,metadata:{from:expected,to:nextStatus}});
   if(domainEvent)await this.domain.appendWith(tx,{tenantId:ctx.org,eventType:domainEvent,aggregateType:'maintenance_visit',aggregateId:id,payload:{status:nextStatus}});
   if(nextStatus==='COMPLETED')await tx.maintenanceContract.updateMany({where:{id:row.contractId,tenantId:ctx.org},data:{completedVisits:{increment:1},updatedAt:new Date(),updatedBy:ctx.sub}});
   return {body:row,updatedAt:row.updatedAt};
  });
 }
 scheduleVisit(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionVisit(ctx,id,input,meta,'PLANNED','SCHEDULED','maintenance.visit.scheduled',undefined,'maintenance.visit.scheduled')}
 confirmVisit(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionVisit(ctx,id,input,meta,'SCHEDULED','CONFIRMED','maintenance.visit.confirmed','confirmedAt')}
 arriveVisit(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionVisit(ctx,id,input,meta,'CONFIRMED','ARRIVED','maintenance.visit.arrived','actualArrivalAt')}
 startVisit(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionVisit(ctx,id,input,meta,'ARRIVED','IN_PROGRESS','maintenance.visit.started','actualStartAt')}
 completeVisit(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionVisit(ctx,id,input,meta,'IN_PROGRESS','COMPLETED','maintenance.visit.completed','actualEndAt')}

 async createWorkOrder(ctx:TenantActorContext,visitId:string,input:WorkOrderCreateDto,meta:CommandMeta){
  const current=await this.visit(ctx,visitId);if(['COMPLETED','CANCELLED','NO_SHOW'].includes(current.status))throw new UnprocessableEntityException('VISIT_NOT_WORKABLE');
  return this.commands.execute(ctx,{operationScope:`maintenance.visit.${visitId}.work_order.create`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const visit=await tx.maintenanceVisit.findFirst({where:{id:visitId,tenantId:ctx.org}});if(!visit)throw new NotFoundException('MAINTENANCE_VISIT_NOT_FOUND');
   const contract=await tx.maintenanceContract.findFirst({where:{id:visit.contractId,tenantId:ctx.org,status:'ACTIVE'}});if(!contract)throw new UnprocessableEntityException('CONTRACT_NOT_ACTIVE');
   const row=await tx.workOrder.create({data:{tenantId:ctx.org,workOrderNumber:`WO-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,8).toUpperCase()}`,contractId:visit.contractId,visitId:visit.id,siteId:visit.siteId,contractorId:contract.contractorId,serviceType:input.serviceType,priority:input.priority as any,scheduledStart:new Date(input.scheduledStart),slaDeadline:input.slaDeadline?new Date(input.slaDeadline):null,status:'DRAFT',createdBy:ctx.sub,updatedBy:ctx.sub}});
   const aggregate=await this.bumpVisit(tx,ctx,visitId,current.updatedAt);
   await this.audit.appendWith(tx,{event:'maintenance.workorder.created',actorId:ctx.sub,organizationId:ctx.org,entityType:'work_order',entityId:row.id,requestId:meta.requestId,metadata:{visitId,contractId:visit.contractId}});
   await this.domain.appendWith(tx,{tenantId:ctx.org,eventType:'maintenance.workorder.created',aggregateType:'work_order',aggregateId:row.id,payload:{visitId,contractId:visit.contractId,status:row.status}});
   return {body:row,updatedAt:aggregate.updatedAt};
  });
 }
 async listWorkOrders(ctx:TenantActorContext){return this.tenant.run(ctx,tx=>tx.workOrder.findMany({where:{tenantId:ctx.org},orderBy:{createdAt:'desc'}}))}
 async listVisitWorkOrders(ctx:TenantActorContext,visitId:string){await this.visit(ctx,visitId);return this.tenant.run(ctx,tx=>tx.workOrder.findMany({where:{tenantId:ctx.org,visitId},orderBy:{createdAt:'desc'}}))}
 async getWorkOrder(ctx:TenantActorContext,id:string){const row=await this.workOrder(ctx,id);return {body:row,etag:etagForUpdatedAt(row.updatedAt)}}
 async assignWorkOrder(ctx:TenantActorContext,workOrderId:string,input:WorkOrderAssignmentCreateDto,meta:CommandMeta){
  const current=await this.workOrder(ctx,workOrderId);
  return this.commands.execute(ctx,{operationScope:`maintenance.work_order.${workOrderId}.assignment.create`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const tech=await tx.technician.findFirst({where:{id:input.technicianId,tenantId:ctx.org,status:'ACTIVE'}});if(!tech)throw new NotFoundException('TECHNICIAN_NOT_FOUND');
   const wo=await tx.workOrder.findFirst({where:{id:workOrderId,tenantId:ctx.org}});if(!wo)throw new NotFoundException('WORK_ORDER_NOT_FOUND');if(tech.contractorId!==wo.contractorId)throw new NotFoundException('TECHNICIAN_NOT_FOUND');
   if(wo.status!=='DRAFT'&&wo.status!=='PENDING_ASSIGNMENT')throw new UnprocessableEntityException('INVALID_WORK_ORDER_TRANSITION');
   if(wo.status==='DRAFT'){const first=await tx.workOrder.updateMany({where:{id:workOrderId,tenantId:ctx.org,updatedAt:current.updatedAt,status:'DRAFT'},data:{status:'PENDING_ASSIGNMENT',updatedAt:new Date(),updatedBy:ctx.sub}});if(first.count!==1)throw new ConflictException('CONCURRENT_MODIFICATION')}
   const duplicate=await tx.workOrderAssignment.findFirst({where:{tenantId:ctx.org,workOrderId,technicianId:input.technicianId,role:input.role as any}});if(duplicate)throw new ConflictException('WORK_ORDER_ASSIGNMENT_EXISTS');
   const row=await tx.workOrderAssignment.create({data:{tenantId:ctx.org,workOrderId,technicianId:input.technicianId,role:input.role as any,assignedAt:new Date(),status:'ASSIGNED',assignedBy:ctx.sub,createdBy:ctx.sub,updatedBy:ctx.sub}});
   await tx.workOrder.updateMany({where:{id:workOrderId,tenantId:ctx.org,status:'PENDING_ASSIGNMENT'},data:{status:'ASSIGNED',updatedAt:new Date(),updatedBy:ctx.sub}});
   const aggregate=await tx.workOrder.findFirstOrThrow({where:{id:workOrderId,tenantId:ctx.org}});
   await this.audit.appendWith(tx,{event:'maintenance.workorder.assigned',actorId:ctx.sub,organizationId:ctx.org,entityType:'work_order',entityId:workOrderId,requestId:meta.requestId,metadata:{assignmentId:row.id,technicianId:row.technicianId,role:row.role}});
   await this.domain.appendWith(tx,{tenantId:ctx.org,eventType:'maintenance.workorder.assigned',aggregateType:'work_order',aggregateId:workOrderId,payload:{assignmentId:row.id,technicianId:row.technicianId,status:aggregate.status}});
   return {body:row,updatedAt:aggregate.updatedAt};
  });
 }
 async listAssignments(ctx:TenantActorContext,workOrderId:string){await this.workOrder(ctx,workOrderId);return this.tenant.run(ctx,tx=>tx.workOrderAssignment.findMany({where:{tenantId:ctx.org,workOrderId},orderBy:{assignedAt:'asc'}}))}

 async acceptAssignment(ctx:TenantActorContext,workOrderId:string,assignmentId:string,input:LifecycleCommandDto,meta:CommandMeta){
  const current=await this.workOrder(ctx,workOrderId);
  return this.commands.execute(ctx,{operationScope:`maintenance.work_order.${workOrderId}.assignment.${assignmentId}.accept`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const assignment=await tx.workOrderAssignment.findFirst({where:{id:assignmentId,tenantId:ctx.org,workOrderId,status:'ASSIGNED'}});if(!assignment)throw new NotFoundException('WORK_ORDER_ASSIGNMENT_NOT_FOUND');
   const changed=await tx.workOrder.updateMany({where:{id:workOrderId,tenantId:ctx.org,updatedAt:current.updatedAt,status:'ASSIGNED'},data:{status:'ACCEPTED',updatedAt:new Date(),updatedBy:ctx.sub}});if(changed.count!==1)throw new UnprocessableEntityException('INVALID_WORK_ORDER_TRANSITION');
   await tx.workOrderAssignment.update({where:{id:assignmentId},data:{status:'ACCEPTED',acceptedAt:input.effectiveAt?new Date(input.effectiveAt):new Date(),updatedBy:ctx.sub}});
   const wo=await tx.workOrder.findFirstOrThrow({where:{id:workOrderId,tenantId:ctx.org}});
   await this.audit.appendWith(tx,{event:'maintenance.workorder.assignment_accepted',actorId:ctx.sub,organizationId:ctx.org,entityType:'work_order',entityId:workOrderId,requestId:meta.requestId,metadata:{assignmentId}});
   return {body:wo,updatedAt:wo.updatedAt};
  });
 }
 private async transitionWorkOrder(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta,expected:string,nextStatus:string,auditEvent:string,timeField?:string,domainEvent?:string){
  const current=await this.workOrder(ctx,id);
  return this.commands.execute(ctx,{operationScope:`maintenance.work_order.${id}.${nextStatus.toLowerCase()}`,meta,requestBody:input,currentUpdatedAt:current.updatedAt},async tx=>{
   const effective=input.effectiveAt?new Date(input.effectiveAt):new Date();const data:any={status:nextStatus,updatedAt:new Date(),updatedBy:ctx.sub};if(timeField)data[timeField]=effective;
   const changed=await tx.workOrder.updateMany({where:{id,tenantId:ctx.org,updatedAt:current.updatedAt,status:expected as any},data});if(changed.count!==1){const exists=await tx.workOrder.findFirst({where:{id,tenantId:ctx.org}});if(!exists)throw new NotFoundException('WORK_ORDER_NOT_FOUND');if(exists.updatedAt.getTime()!==current.updatedAt.getTime())throw new ConflictException('CONCURRENT_MODIFICATION');throw new UnprocessableEntityException('INVALID_WORK_ORDER_TRANSITION')}
   const row=await tx.workOrder.findFirstOrThrow({where:{id,tenantId:ctx.org}});
   await this.audit.appendWith(tx,{event:auditEvent,actorId:ctx.sub,organizationId:ctx.org,entityType:'work_order',entityId:id,requestId:meta.requestId,metadata:{from:expected,to:nextStatus}});
   if(domainEvent)await this.domain.appendWith(tx,{tenantId:ctx.org,eventType:domainEvent,aggregateType:'work_order',aggregateId:id,payload:{status:nextStatus}});
   return {body:row,updatedAt:row.updatedAt};
  });
 }
 arriveWorkOrder(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionWorkOrder(ctx,id,input,meta,'ACCEPTED','ARRIVED','maintenance.workorder.arrived')}
 startWorkOrder(ctx:TenantActorContext,id:string,input:LifecycleCommandDto,meta:CommandMeta){return this.transitionWorkOrder(ctx,id,input,meta,'ARRIVED','IN_PROGRESS','maintenance.workorder.started','actualStartAt','maintenance.workorder.started')}
}
