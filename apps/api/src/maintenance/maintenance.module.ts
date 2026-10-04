import { Module } from '@nestjs/common';
import { MaintenanceCommandService } from './maintenance-command.service';
import { MaintenanceContractsService } from './contracts/maintenance-contracts.service';
import { MaintenanceContractsController } from './contracts/maintenance-contracts.controller';
import { SLAPoliciesController } from './contracts/sla-policies.controller';
import { MaintenanceOperationsController } from './operations/maintenance-operations.controller';
import { MaintenanceOperationsService } from './operations/maintenance-operations.service';

@Module({
  controllers:[SLAPoliciesController,MaintenanceContractsController,MaintenanceOperationsController],
  providers:[MaintenanceCommandService,MaintenanceContractsService,MaintenanceOperationsService],
  exports:[MaintenanceCommandService,MaintenanceContractsService,MaintenanceOperationsService],
})
export class MaintenanceModule {}
