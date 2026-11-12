import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';

/**
 * Strukturali JSON log (pino). So'rov ID'si Fastify darajasida yaratiladi (request-id.ts),
 * bu yerda faqat qayta ishlatiladi — log yozuvi va `x-request-id` javob header'i bir xil.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            transport: isDev
              ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
              : undefined,
            genReqId: (req) => req.id ?? randomUUID(),
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            // `autoLogging.ignore` ishlatilmaydi: nestjs-pino 5.3 pino-http'ni bir xil options obyekti
            // bilan ikki marta chaqiradi, birinchi chaqiruv `autoLogging`ni o'chirib yuboradi.
            customLogLevel: (req, res, err) => {
              if (req.url?.startsWith('/health') && res.statusCode < 500) return 'silent';
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
