import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CurrentUser, Roles } from '../security/auth.decorators';
@Controller() export class DocumentsController{
 constructor(private service:DocumentsService){}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','FIELD_USER') @Post('projects/:projectId/documents/upload-intent') intent(@CurrentUser() c:any,@Param('projectId') p:string,@Body() b:any){return this.service.createUploadIntent(c,p,b)}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','FIELD_USER') @Post('documents/:id/complete') complete(@CurrentUser() c:any,@Param('id') id:string,@Body() b:any){return this.service.complete(c,id,b)}
 @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','FIELD_USER') @Post('documents/:id/versions') version(@CurrentUser() c:any,@Param('id') id:string,@Body() b:any){return this.service.addVersionIntent(c,id,b)}
 @Get('projects/:projectId/documents') list(@CurrentUser() c:any,@Param('projectId') p:string){return this.service.list(c,p)}
 @Get('documents/:id') get(@CurrentUser() c:any,@Param('id') id:string){return this.service.get(c,id)}
}
