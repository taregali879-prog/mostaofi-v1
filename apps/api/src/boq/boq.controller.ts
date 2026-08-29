import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BoqService } from './boq.service';
import { CurrentUser, Roles } from '../security/auth.decorators';
@Controller() export class BoqController {
 constructor(private readonly service:BoqService){}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','ORG_ADMIN') @Post('projects/:projectId/boqs') create(@CurrentUser() c:any,@Param('projectId') p:string,@Body() b:any){return this.service.create(c,p,b)}
 @Get('projects/:projectId/boqs') list(@CurrentUser() c:any,@Param('projectId') p:string){return this.service.list(c,p)}
 @Get('boqs/:id') get(@CurrentUser() c:any,@Param('id') id:string){return this.service.get(c,id)}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','ORG_ADMIN') @Post('boqs/:id/versions') newVersion(@CurrentUser() c:any,@Param('id') id:string,@Body() b:any){return this.service.newVersion(c,id,b)}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','ORG_ADMIN') @Post('boqs/:id/versions/:version/items') addItem(@CurrentUser() c:any,@Param('id') id:string,@Param('version') v:string,@Body() b:any){return this.service.addItem(c,id,+v,b)}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','ORG_ADMIN') @Post('boqs/:id/versions/:version/submit') submit(@CurrentUser() c:any,@Param('id') id:string,@Param('version') v:string){return this.service.submit(c,id,+v)}
 @Roles('ORG_ADMIN') @Post('boqs/:id/versions/:version/approve') approve(@CurrentUser() c:any,@Param('id') id:string,@Param('version') v:string){return this.service.approve(c,id,+v)}
 @Roles('ORG_ADMIN') @Post('boqs/:id/versions/:version/reject') reject(@CurrentUser() c:any,@Param('id') id:string,@Param('version') v:string,@Body() b:any){return this.service.reject(c,id,+v,b)}
}
