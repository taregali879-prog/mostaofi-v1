import { BadRequestException } from '@nestjs/common';

export function quantity(value: unknown, errorCode: string, allowZero = false): number {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value))) {
    throw new BadRequestException(errorCode);
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER ||
      (allowZero ? result < 0 : result <= 0)) throw new BadRequestException(errorCode);
  return result;
}
