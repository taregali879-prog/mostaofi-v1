import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../security/auth.decorators';
import { KpiService } from './kpi.service';
@Controller() export class KpiController {constructor(private readonly service:KpiService){} @Get('projects/:projectId/materials/kpis') kpis(@CurrentUser() c:any,@Param('projectId') p:string){return this.service.materialKpis(c,p)}}
