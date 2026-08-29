import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../security/auth.decorators';
import { DeliveryService } from './delivery.service';
@Controller()
export class DeliveryController {
 constructor(private readonly service:DeliveryService){}
 @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER') @Post('purchase-orders/:poId/deliveries') create(@CurrentUser() c:any,@Param('poId') poId:string,@Body() b:any){return this.service.create(c,poId,b)}
 @Get('deliveries/:id') get(@CurrentUser() c:any,@Param('id') id:string){return this.service.get(c,id)}
 @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER') @Post('deliveries/:id/arrive') arrive(@CurrentUser() c:any,@Param('id') id:string){return this.service.arrive(c,id)}
 @Roles('ORG_ADMIN','PROJECT_MANAGER','ENGINEER') @Post('deliveries/:id/inspect') inspect(@CurrentUser() c:any,@Param('id') id:string,@Body() b:any){return this.service.inspect(c,id,b)}
 @Roles('ORG_ADMIN','PROJECT_MANAGER') @Post('deliveries/:id/receive') receive(@CurrentUser() c:any,@Param('id') id:string,@Body() b:any){return this.service.receive(c,id,b.warehouseId)}
}
