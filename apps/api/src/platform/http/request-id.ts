import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_INCOMING_LENGTH = 128;
const SAFE_ID = /^[\w.:-]+$/;

/**
 * Correlation ID Fastify darajasida yaratiladi — middleware'dan oldin, 404 da ham.
 * Kelgan `x-request-id` faqat qisqa va xavfsiz belgilardan iborat bo'lsa qayta ishlatiladi
 * (log injection'dan himoya).
 * ID raw request'ga ham yoziladi: pino-http uni `req.id` dan oladi, log va javob bir xil ID'da bo'ladi.
 */
export function genReqId(raw: IncomingMessage): string {
  const incoming = raw.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && incoming.length <= MAX_INCOMING_LENGTH && SAFE_ID.test(incoming)
      ? incoming
      : randomUUID();
  (raw as IncomingMessage & { id?: string }).id = id;
  return id;
}

export function registerRequestIdHeader(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });
}
