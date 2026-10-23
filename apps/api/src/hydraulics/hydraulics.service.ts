import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HydraulicInput, calculateHydraulics, normalizeHydraulicInput } from './hydraulics.engine';

@Injectable()
export class HydraulicsService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  private async project(org: string, id: string) {
    const project = await this.db.project.findFirst({where:{id,organizationId:org}});
    if (!project) throw new NotFoundException('PROJECT_NOT_FOUND');
    return project;
  }
  private async documentVersion(org: string, projectId: string, id: string, claimedHash?: string) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('INVALID_DOCUMENT_VERSION_ID');
    const version = await this.db.documentVersion.findUnique({where:{id},include:{document:true}});
    if (!version || version.document.organizationId !== org || version.document.projectId !== projectId ||
        !['UPLOADED','APPROVED'].includes(version.document.status) ||
        version.sha256 === '0'.repeat(64) || !/^[a-f0-9]{64}$/i.test(version.sha256)) {
      throw new BadRequestException('SOURCE_DOCUMENT_VERSION_NOT_VERIFIED');
    }
    if (claimedHash && claimedHash.toLowerCase() !== version.sha256.toLowerCase()) {
      throw new BadRequestException('DRAWING_SHA256_MISMATCH');
    }
    return version;
  }
  private buildPayload(data: any) {
    if (!data || typeof data !== 'object') throw new BadRequestException('INVALID_PAYLOAD');
    try {
      const input = normalizeHydraulicInput(data.input as HydraulicInput);
      return { input, result: calculateHydraulics(input) };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'INVALID_HYDRAULIC_INPUT');
    }
  }
  async list(ctx: any, projectId: string) {
    await this.project(ctx.org, projectId);
    return this.db.hydraulicCalculation.findMany({
      where:{organizationId:ctx.org,projectId},
      include:{versions:{select:{id:true,version:true,documentVersionId:true,sourceSha256:true,createdBy:true,createdAt:true},orderBy:{version:'desc'}}},
      orderBy:{createdAt:'desc'},
    });
  }
  async get(ctx: any, id: string) {
    const item = await this.db.hydraulicCalculation.findFirst({
      where:{id,organizationId:ctx.org},
      include:{versions:{orderBy:{version:'desc'}}},
    });
    if (!item) throw new NotFoundException('HYDRAULIC_CALCULATION_NOT_FOUND');
    return item;
  }
  async create(ctx: any, projectId: string, data: any) {
    await this.project(ctx.org, projectId);
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title || title.length > 160) throw new BadRequestException('INVALID_TITLE');
    const doc = await this.documentVersion(ctx.org, projectId, data.documentVersionId, data.sourceSha256);
    const {input,result} = this.buildPayload(data);
    const id = randomUUID(), versionId = randomUUID();
    const saved = await this.db.$transaction(async tx => {
      const item = await tx.hydraulicCalculation.create({
        data:{id,organizationId:ctx.org,projectId,title,currentVersion:1,createdBy:ctx.sub,
          versions:{create:{id:versionId,version:1,documentVersionId:doc.id,sourceSha256:doc.sha256,
            input:input as unknown as Prisma.InputJsonValue,
            result:result as unknown as Prisma.InputJsonValue,createdBy:ctx.sub}}},
        include:{versions:true},
      });
      await this.audit.appendWith(tx,{event:'HYDRAULIC_CALC_CREATED',actorId:ctx.sub,
        organizationId:ctx.org,entityType:'project',entityId:projectId,requestId:'api',
        metadata:{calculationId:id,version:1,documentVersionId:doc.id}});
      return item;
    });
    return saved;
  }
  async newVersion(ctx: any, id: string, data: any) {
    const existing = await this.db.hydraulicCalculation.findFirst({where:{id,organizationId:ctx.org}});
    if (!existing) throw new NotFoundException('HYDRAULIC_CALCULATION_NOT_FOUND');
    const doc = await this.documentVersion(ctx.org, existing.projectId,data?.documentVersionId,data?.sourceSha256);
    const {input,result} = this.buildPayload(data);
    return this.db.$transaction(async tx => {
      const update = await tx.hydraulicCalculation.updateMany({
        where:{id,organizationId:ctx.org,currentVersion:existing.currentVersion},
        data:{currentVersion:{increment:1}},
      });
      if (update.count !== 1) throw new ConflictException('VERSION_CONFLICT_RELOAD');
      const version = existing.currentVersion + 1;
      const created = await tx.hydraulicCalculationVersion.create({
        data:{id:randomUUID(),calculationId:id,version,documentVersionId:doc.id,sourceSha256:doc.sha256,
          input:input as unknown as Prisma.InputJsonValue,
          result:result as unknown as Prisma.InputJsonValue,createdBy:ctx.sub},
      });
      await this.audit.appendWith(tx,{event:'HYDRAULIC_CALC_VERSION_CREATED',actorId:ctx.sub,
        organizationId:ctx.org,entityType:'project',entityId:existing.projectId,requestId:'api',
        metadata:{calculationId:id,version,documentVersionId:doc.id}});
      return created;
    });
  }
}
