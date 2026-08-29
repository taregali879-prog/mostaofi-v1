import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CurrentUser, Roles } from '../security/auth.decorators';
@Controller('projects') export class ProjectsController{
 constructor(private service:ProjectsService){}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ORG_ADMIN') @Post() create(@CurrentUser() c:any,@Body() b:any){return this.service.create(c,b)}
 @Get() list(@CurrentUser() c:any){return this.service.list(c)}
 @Get(':id') get(@CurrentUser() c:any,@Param('id') id:string){return this.service.get(c,id)}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ORG_ADMIN') @Patch(':id') update(@CurrentUser() c:any,@Param('id') id:string,@Body() b:any){return this.service.update(c,id,b)}
 @Get(':id/activity') activity(@CurrentUser() c:any,@Param('id') id:string){return this.service.activity(c,id)}
}
