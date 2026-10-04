import { Module } from '@nestjs/common';
import { MaintenanceCommandService } from './maintenance-command.service';
import { MaintenanceContractsService } from './contracts/maintenance-contracts.service';
import { MaintenanceContractsController } from './contracts/maintenance-contracts.controller';
import { SLAPoliciesController } from './contracts/sla-policies.controller';

@Module({
  controllers:[SLAPoliciesController,MaintenanceContractsController],
  providers:[MaintenanceCommandService,MaintenanceContractsService],
  exports:[MaintenanceCommandService,MaintenanceContractsService],
})
export class MaintenanceModule {}
