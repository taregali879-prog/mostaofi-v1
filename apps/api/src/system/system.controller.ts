import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../security/auth.decorators';
@Controller('health') export class SystemController {
  constructor(private readonly db:PrismaService){}
  @Public() @Get('live') live(){return {status:'ok'}}
  @Public() @Get('ready') async ready(){await this.db.$queryRaw`SELECT 1`;return {status:'ready',database:'ok'}}
}
