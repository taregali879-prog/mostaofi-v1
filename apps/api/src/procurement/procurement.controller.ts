import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { CurrentUser, Roles } from '../security/auth.decorators';
@Controller()
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','ORG_ADMIN')
  @Post('projects/:projectId/material-requirements')
  createRequirement(@CurrentUser() c:any,@Param('projectId') projectId:string,@Body() body:any){return this.service.createRequirement(c,projectId,body)}

  @Get('projects/:projectId/material-requirements')
  listRequirements(@CurrentUser() c:any,@Param('projectId') projectId:string){return this.service.listRequirements(c,projectId)}

  @Roles('CONTRACTOR_ADMIN','PROJECT_MANAGER','ENGINEER','ORG_ADMIN')
  @Post('material-requirements/:id/submit')
  submitRequirement(@CurrentUser() c:any,@Param('id') id:string){return this.service.submitRequirement(c,id)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER')
  @Post('material-requirements/:id/approve')
  approveRequirement(@CurrentUser() c:any,@Param('id') id:string){return this.service.approveRequirement(c,id)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER')
  @Post('material-requirements/:id/rfqs')
  createRfq(@CurrentUser() c:any,@Param('id') id:string,@Body() body:any){return this.service.createRfq(c,id,body)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER')
  @Post('rfqs/:id/issue')
  issueRfq(@CurrentUser() c:any,@Param('id') id:string){return this.service.issueRfq(c,id)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER')
  @Post('suppliers')
  createSupplier(@CurrentUser() c:any,@Body() body:any){return this.service.createSupplier(c,body)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER')
  @Post('rfqs/:id/quotes')
  createQuote(@CurrentUser() c:any,@Param('id') id:string,@Body() body:any){return this.service.createQuote(c,id,body)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER')
  @Post('supplier-quotes/:id/submit')
  submitQuote(@CurrentUser() c:any,@Param('id') id:string){return this.service.submitQuote(c,id)}

  @Get('rfqs/:id/comparison')
  comparison(@CurrentUser() c:any,@Param('id') id:string){return this.service.comparison(c,id)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER')
  @Post('rfqs/:id/award')
  award(@CurrentUser() c:any,@Param('id') id:string,@Body() body:any){return this.service.award(c,id,body.quoteId)}

  @Roles('ORG_ADMIN','PROJECT_MANAGER')
  @Post('rfqs/:id/purchase-orders')
  createPurchaseOrder(@CurrentUser() c:any,@Param('id') id:string,@Body() body:any){return this.service.createPurchaseOrder(c,id,body)}

  @Roles('ORG_ADMIN')
  @Post('purchase-orders/:id/approve')
  approvePo(@CurrentUser() c:any,@Param('id') id:string){return this.service.approvePurchaseOrder(c,id)}

  @Get('projects/:projectId/purchase-orders')
  listPos(@CurrentUser() c:any,@Param('projectId') projectId:string){return this.service.listPurchaseOrders(c,projectId)}
}
