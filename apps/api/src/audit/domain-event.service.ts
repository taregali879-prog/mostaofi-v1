import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export type DomainEventInput = {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonObject;
  correlationId?: string;
  causationId?: string;
};

@Injectable()
export class DomainEventService {
  async appendWith(tx: Prisma.TransactionClient, input: DomainEventInput): Promise<void> {
    await tx.domainEvent.create({data:{
      tenantId: input.tenantId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payloadJson: input.payload,
      correlationId: input.correlationId ?? randomUUID(),
      causationId: input.causationId ?? null,
      createdBy: null,
      updatedBy: null,
    }});
  }
}
