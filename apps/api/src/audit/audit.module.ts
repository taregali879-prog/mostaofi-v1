import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { DomainEventService } from './domain-event.service';

@Global()
@Module({ providers: [AuditService,DomainEventService], exports: [AuditService,DomainEventService] })
export class AuditModule {}
