import { Module } from '@nestjs/common';
import { BoqController } from './boq.controller';
import { BoqService } from './boq.service';
@Module({ controllers:[BoqController], providers:[BoqService] })
export class BoqModule {}
