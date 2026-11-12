import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType, z } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export class RequestValidationError extends Error {
  override readonly name = 'RequestValidationError';

  constructor(readonly issues: ValidationIssue[]) {
    super('Request validation failed');
  }
}

/**
 * Zod sxemasi bilan kiruvchi ma'lumotni tekshiradi va TIPLANGAN natija qaytaradi.
 * `nestjs-zod` NestJS 12'ni hali qo'llamagani uchun o'zimizniki (ADR-0003).
 *
 *   @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingDto
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new RequestValidationError(
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
          code: issue.code,
        })),
      );
    }
    return result.data;
  }
}
