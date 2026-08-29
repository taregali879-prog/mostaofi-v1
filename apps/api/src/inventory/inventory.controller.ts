import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../security/auth.decorators';
import { InventoryService } from './inventory.service';
@Controller()
export class InventoryController {
 constructor(private readonly service:InventoryService){}
 @Roles('ORG_ADMIN','PROJECT_MANAGER') @Post('warehouses') createWarehouse(@CurrentUser() c:any,@Body() b:any){return this.service.createWarehouse(c,b)}
 @Get('warehouses') warehouses(@CurrentUser() c:any){return this.service.warehouses(c)}
 @Get('warehouses/:id/inventory') balance(@CurrentUser() c:any,@Param('id') id:string){return this.service.balance(c,id)}
 @Roles('ORG_ADMIN','PROJECT_MANAGER') @Post('projects/:projectId/materials/allocate') allocate(@CurrentUser() c:any,@Param('projectId') p:string,@Body() b:any){return this.service.allocate(c,p,b)}
 @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER') @Post('projects/:projectId/materials/issue') issue(@CurrentUser() c:any,@Param('projectId') p:string,@Body() b:any){return this.service.issue(c,p,b)}
 @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER') @Post('projects/:projectId/materials/return') returnMaterial(@CurrentUser() c:any,@Param('projectId') p:string,@Body() b:any){return this.service.returnMaterial(c,p,b)}
 @Get('projects/:projectId/materials') projectMaterials(@CurrentUser() c:any,@Param('projectId') p:string){return this.service.projectMaterials(c,p)}
}
