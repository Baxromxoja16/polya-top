import { RequestMethod } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from '../platform/http/problem-details.filter.js';
import { genReqId, registerRequestIdHeader } from '../platform/http/request-id.js';

export const API_PREFIX = 'api/v1';

export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: true, genReqId, requestIdHeader: false });
}

/** `main.ts` va e2e testlar uchun BIR XIL sozlama — testlar produksiya konfiguratsiyasini tekshiradi. */
export function configureApp(app: NestFastifyApplication): NestFastifyApplication {
  app.useLogger(app.get(Logger));
  registerRequestIdHeader(app.getHttpAdapter().getInstance());
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  return app;
}
