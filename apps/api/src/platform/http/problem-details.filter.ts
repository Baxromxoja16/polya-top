import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PROBLEM_JSON_CONTENT_TYPE, type ProblemDetails } from '@polya/contracts';
import { DomainError } from '@polya/shared-kernel';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RequestValidationError } from './zod-validation.pipe.js';

const PROBLEM_TYPE_BASE = 'https://polya.top/problems/';

/** HTTP status → barqaror kod (HttpException o'z kodini bermaganda). */
const STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Barcha xatolarni RFC 9457 Problem Details formatiga keltiradi (TZ 7.7).
 * - DomainError        → 422 + domain kodi
 * - RequestValidation  → 400 + maydonlar bo'yicha xatolar
 * - HttpException      → o'z statusi; javob obyektidagi qo'shimcha maydonlar extension bo'lib qo'shiladi
 * - Boshqa hammasi     → 500, ichki tafsilot tashqariga chiqmaydi
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  readonly #logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const problem = this.toProblem(exception);
    problem.instance = request.url;
    problem.requestId = String(request.id);

    if (problem.status >= 500) {
      this.#logger.error({ err: exception, requestId: problem.requestId }, problem.title);
    }

    void reply
      .status(problem.status)
      .header('content-type', PROBLEM_JSON_CONTENT_TYPE)
      .send(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof RequestValidationError) {
      return {
        ...base(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Request validation failed'),
        errors: exception.issues,
      };
    }

    if (exception instanceof DomainError) {
      // Tafsilotlar extension sifatida; asosiy a'zolarni (status, code, type, title) bosib keta olmaydi
      return {
        ...exception.details,
        ...base(HttpStatus.UNPROCESSABLE_ENTITY, exception.code, exception.message),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let code = STATUS_CODES[status] ?? `HTTP_${status}`;
      if (typeof response === 'object' && response !== null) {
        const {
          message,
          statusCode: _s,
          error: _e,
          code: custom,
          ...extensions
        } = response as Record<string, unknown>;
        // `new UnauthorizedException({ code: 'TOKEN_EXPIRED', message })` — aniqroq barqaror kod
        if (typeof custom === 'string' && /^[A-Z][A-Z0-9_]*$/.test(custom)) code = custom;
        return {
          ...extensions,
          ...base(status, code, exception.message),
          ...(typeof message === 'string' ? { detail: message } : {}),
        };
      }
      return { ...base(status, code, exception.message) };
    }

    return base(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', 'Internal server error');
  }
}

function base(status: number, code: string, title: string): ProblemDetails {
  return {
    type: `${PROBLEM_TYPE_BASE}${code.toLowerCase().replaceAll('_', '-')}`,
    title,
    status,
    code,
  };
}
