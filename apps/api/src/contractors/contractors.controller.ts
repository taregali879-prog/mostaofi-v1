import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ContractorsService } from './contractors.service';
import { CurrentUser, Roles } from '../security/auth.decorators';
@Controller('contractor-profile') export class ContractorsController{
 constructor(private service:ContractorsService){}
 @Get() get(@CurrentUser() c:any){return this.service.get(c)}
 @Roles('CONTRACTOR_ADMIN','ORG_ADMIN') @Patch() update(@CurrentUser() c:any,@Body() b:any){return this.service.update(c,b)}
 @Roles('CONTRACTOR_ADMIN','ORG_ADMIN') @Post('submit') submit(@CurrentUser() c:any){return this.service.submit(c)}
}
