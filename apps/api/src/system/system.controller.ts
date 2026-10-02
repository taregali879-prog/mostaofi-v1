import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../security/auth.decorators';
@Controller('health') export class SystemController {
  constructor(private readonly db:PrismaService){}
  @Public() @Get('live') live(){return {status:'ok'}}
  @Public() @Get('ready') async ready(){await this.db.$queryRaw`SELECT 1`;return {status:'ready',database:'ok'}}
  @Public() @Get('release') release(){const commitSha=process.env.RAILWAY_GIT_COMMIT_SHA;return {source:commitSha?'git':'unknown',commitSha:commitSha??null,branch:process.env.RAILWAY_GIT_BRANCH??null,repo:process.env.RAILWAY_GIT_REPO_NAME??null,owner:process.env.RAILWAY_GIT_REPO_OWNER??null}}
}
