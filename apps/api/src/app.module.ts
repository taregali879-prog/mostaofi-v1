import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { ContractorsModule } from './contractors/contractors.module';
import { ProjectsModule } from './projects/projects.module';
import { DocumentsModule } from './documents/documents.module';
import { AuditModule } from './audit/audit.module';
import { BoqModule } from './boq/boq.module';
import { ProcurementModule } from './procurement/procurement.module';
import { DeliveryModule } from './delivery/delivery.module';
import { InventoryModule } from './inventory/inventory.module';
import { KpiModule } from './kpi/kpi.module';
import { SystemModule } from './system/system.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { HydraulicsModule } from './hydraulics/hydraulics.module';
import { JwtAuthGuard } from './security/jwt-auth.guard';
import { RolesGuard } from './security/roles.guard';
@Module({
 imports:[DatabaseModule,StorageModule,AuditModule,AuthModule,ContractorsModule,ProjectsModule,DocumentsModule,BoqModule,ProcurementModule,DeliveryModule,InventoryModule,KpiModule,SystemModule,MaintenanceModule,HydraulicsModule],
 providers:[{provide:APP_GUARD,useClass:JwtAuthGuard},{provide:APP_GUARD,useClass:RolesGuard}],
}) export class AppModule{}
