import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './auth.decorators';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY,[ctx.getHandler(),ctx.getClass()]) ?? [];
    if (!required.length) return true;
    const roles: string[] = ctx.switchToHttp().getRequest().user?.roles ?? [];
    if (!required.some(r => roles.includes(r))) throw new ForbiddenException('INSUFFICIENT_ROLE');
    return true;
  }
}
