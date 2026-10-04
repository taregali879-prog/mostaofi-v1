import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser, Roles } from '../../security/auth.decorators';
import { CommandMeta } from '../maintenance-command.service';
import { MAINTENANCE_CONTRACT_WRITE_ROLES } from '../maintenance.roles';
import { SLAPolicyCreateDto } from './maintenance-contracts.dto';
import { MaintenanceContractsService } from './maintenance-contracts.service';

const meta=(key?:string,ifMatch?:string,requestId?:string):CommandMeta=>({idempotencyKey:key??'',ifMatch,requestId:requestId??randomUUID()});

@Controller('maintenance/sla-policies')
export class SLAPoliciesController {
 constructor(private readonly service:MaintenanceContractsService){}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Get() list(@CurrentUser() ctx:any,@Query('status') status?:string){return this.service.listSLAPolicies(ctx,status)}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Post() async create(@CurrentUser() ctx:any,@Body() body:SLAPolicyCreateDto,@Headers('idempotency-key') key:string|undefined,@Headers('x-request-id') requestId:string|undefined,@Res({passthrough:true}) res:any){const out=await this.service.createSLAPolicy(ctx,body,meta(key,undefined,requestId));res.setHeader('ETag',out.etag);return out.body}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Get(':slaPolicyId') async get(@CurrentUser() ctx:any,@Param('slaPolicyId') id:string,@Res({passthrough:true}) res:any){const out=await this.service.getSLAPolicy(ctx,id);res.setHeader('ETag',out.etag);return out.body}
}
