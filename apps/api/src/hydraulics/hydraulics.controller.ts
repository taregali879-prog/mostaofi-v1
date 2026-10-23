import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../security/auth.decorators';
import { HydraulicsService } from './hydraulics.service';
@Controller()
export class HydraulicsController {
  constructor(private readonly service: HydraulicsService) {}
  @Get('projects/:projectId/hydraulics')
  list(@CurrentUser() user:any, @Param('projectId') projectId:string) {
    return this.service.list(user,projectId);
  }
  @Get('hydraulics/:id')
  get(@CurrentUser() user:any, @Param('id') id:string) {
    return this.service.get(user,id);
  }
  @Roles('ENGINEER','PROJECT_MANAGER','CONTRACTOR_ADMIN','ORG_ADMIN')
  @Post('projects/:projectId/hydraulics')
  create(@CurrentUser() user:any, @Param('projectId') projectId:string, @Body() data:any) {
    return this.service.create(user,projectId,data);
  }
  @Roles('ENGINEER','PROJECT_MANAGER','CONTRACTOR_ADMIN','ORG_ADMIN')
  @Post('hydraulics/:id/versions')
  newVersion(@CurrentUser() user:any, @Param('id') id:string, @Body() data:any) {
    return this.service.newVersion(user,id,data);
  }
}
