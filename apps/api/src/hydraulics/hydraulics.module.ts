import { Module } from '@nestjs/common';
import { HydraulicsController } from './hydraulics.controller';
import { HydraulicsService } from './hydraulics.service';
@Module({ controllers:[HydraulicsController], providers:[HydraulicsService] })
export class HydraulicsModule {}
