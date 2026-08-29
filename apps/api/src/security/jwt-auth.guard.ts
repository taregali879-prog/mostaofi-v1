import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from './auth.decorators';
import { verifyJwt } from './jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY,[ctx.getHandler(),ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const value = String(req.headers.authorization ?? '');
    if (!value.startsWith('Bearer ')) throw new UnauthorizedException('MISSING_BEARER_TOKEN');
    try {
      req.user = verifyJwt(value.slice(7), process.env.JWT_ACCESS_SECRET ?? 'dev-only-change-me', 'access');
      return true;
    } catch { throw new UnauthorizedException('INVALID_ACCESS_TOKEN'); }
  }
}
