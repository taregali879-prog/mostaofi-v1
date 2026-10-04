import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser, Roles } from '../../security/auth.decorators';
import { CommandMeta } from '../maintenance-command.service';
import { MAINTENANCE_CONTRACT_WRITE_ROLES, MAINTENANCE_READ_ROLES } from '../maintenance.roles';
import { ContractScopeCreateDto, ContractSiteCreateDto, LifecycleCommandDto, MaintenanceContractCreateDto } from './maintenance-contracts.dto';
import { MaintenanceContractsService } from './maintenance-contracts.service';

const meta=(key?:string,ifMatch?:string,requestId?:string):CommandMeta=>({idempotencyKey:key??'',ifMatch,requestId:requestId??randomUUID()});

@Controller('maintenance/contracts')
export class MaintenanceContractsController {
 constructor(private readonly service:MaintenanceContractsService){}
 @Roles(...MAINTENANCE_READ_ROLES) @Get() list(@CurrentUser() ctx:any,@Query('status') status?:string){return this.service.list(ctx,status)}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Post() async create(@CurrentUser() ctx:any,@Body() body:MaintenanceContractCreateDto,@Headers('idempotency-key') key:string|undefined,@Headers('x-request-id') requestId:string|undefined,@Res({passthrough:true}) res:any){const out=await this.service.create(ctx,body,meta(key,undefined,requestId));res.setHeader('ETag',out.etag);return out.body}
 @Roles(...MAINTENANCE_READ_ROLES) @Get(':contractId') async get(@CurrentUser() ctx:any,@Param('contractId') id:string,@Res({passthrough:true}) res:any){const out=await this.service.get(ctx,id);res.setHeader('ETag',out.etag);return out.body}

 @Roles(...MAINTENANCE_READ_ROLES) @Get(':contractId/sites') listSites(@CurrentUser() ctx:any,@Param('contractId') id:string){return this.service.listSites(ctx,id)}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Post(':contractId/sites') async addSite(@CurrentUser() ctx:any,@Param('contractId') id:string,@Body() body:ContractSiteCreateDto,@Headers('idempotency-key') key:string|undefined,@Headers('if-match') ifMatch:string|undefined,@Headers('x-request-id') requestId:string|undefined,@Res({passthrough:true}) res:any){const out=await this.service.addSite(ctx,id,body,meta(key,ifMatch,requestId));res.setHeader('ETag',out.etag);return out.body}
 @Roles(...MAINTENANCE_READ_ROLES) @Get(':contractId/scopes') listScopes(@CurrentUser() ctx:any,@Param('contractId') id:string){return this.service.listScopes(ctx,id)}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Post(':contractId/scopes') async addScope(@CurrentUser() ctx:any,@Param('contractId') id:string,@Body() body:ContractScopeCreateDto,@Headers('idempotency-key') key:string|undefined,@Headers('if-match') ifMatch:string|undefined,@Headers('x-request-id') requestId:string|undefined,@Res({passthrough:true}) res:any){const out=await this.service.addScope(ctx,id,body,meta(key,ifMatch,requestId));res.setHeader('ETag',out.etag);return out.body}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Post(':contractId/submit') @HttpCode(200) async submit(@CurrentUser() ctx:any,@Param('contractId') id:string,@Body() body:LifecycleCommandDto,@Headers('idempotency-key') key:string|undefined,@Headers('if-match') ifMatch:string|undefined,@Headers('x-request-id') requestId:string|undefined,@Res({passthrough:true}) res:any){const out=await this.service.submit(ctx,id,body,meta(key,ifMatch,requestId));res.setHeader('ETag',out.etag);return out.body}
 @Roles(...MAINTENANCE_CONTRACT_WRITE_ROLES) @Post(':contractId/activate') @HttpCode(200) async activate(@CurrentUser() ctx:any,@Param('contractId') id:string,@Body() body:LifecycleCommandDto,@Headers('idempotency-key') key:string|undefined,@Headers('if-match') ifMatch:string|undefined,@Headers('x-request-id') requestId:string|undefined,@Res({passthrough:true}) res:any){const out=await this.service.activate(ctx,id,body,meta(key,ifMatch,requestId));res.setHeader('ETag',out.etag);return out.body}
}
