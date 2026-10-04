import { Module } from '@nestjs/common';
import { MaintenanceCommandService } from './maintenance-command.service';
import { MaintenanceContractsService } from './contracts/maintenance-contracts.service';
import { MaintenanceContractsController } from './contracts/maintenance-contracts.controller';
import { SLAPoliciesController } from './contracts/sla-policies.controller';
import { MaintenanceOperationsController } from './operations/maintenance-operations.controller';
import { MaintenanceOperationsService } from './operations/maintenance-operations.service';
import { MaintenanceInspectionsController } from './inspections/maintenance-inspections.controller';
import { MaintenanceInspectionsService } from './inspections/maintenance-inspections.service';

@Module({
  controllers:[SLAPoliciesController,MaintenanceContractsController,MaintenanceOperationsController,MaintenanceInspectionsController],
  providers:[MaintenanceCommandService,MaintenanceContractsService,MaintenanceOperationsService,MaintenanceInspectionsService],
  exports:[MaintenanceCommandService,MaintenanceContractsService,MaintenanceOperationsService,MaintenanceInspectionsService],
})
export class MaintenanceModule {}
