import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}
  async append(input: {event:string; actorId:string|null; organizationId:string; entityType:string; entityId:string; requestId:string; metadata?:Prisma.InputJsonObject}) {
    return this.db.auditEvent.create({data:{id:randomUUID(), event:input.event, actorId:input.actorId, organizationId:input.organizationId, entityType:input.entityType, entityId:input.entityId, requestId:input.requestId, metadata:input.metadata ?? {}}});
  }
  async forEntity(org:string,type:string,id:string){return this.db.auditEvent.findMany({where:{organizationId:org,entityType:type,entityId:id},orderBy:{occurredAt:'asc'}})}
}
