import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type TenantActorContext = { org: string; sub: string };

@Injectable()
export class TenantTransactionService {
  constructor(private readonly db: PrismaService) {}

  async run<T>(ctx: TenantActorContext, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${ctx.org}, true)`;
      await tx.$queryRaw`SELECT set_config('app.actor_user_id', ${ctx.sub}, true)`;
      return work(tx);
    });
  }
}
