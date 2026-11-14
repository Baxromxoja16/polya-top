import { Controller, Get, Header } from '@nestjs/common';
import { buildOpenApiDocument } from '@polya/contracts';
import { API_PREFIX } from '../../../bootstrap/configure-app.js';

/** API versiyasi: yo'l bilan bir xil (`/api/v1`) — buzuvchi o'zgarish yangi prefiks bilan chiqadi */
export const API_VERSION = '1.0.0';

/**
 * TZ 7.7: OpenAPI 3.1 — `@polya/contracts` dagi route reyestri va Zod sxemalaridan quriladi.
 * React tomoni shu hujjatdan (yoki to'g'ridan-to'g'ri contracts paketidan) foydalanadi.
 */
@Controller()
export class OpenApiController {
  #doc: Record<string, unknown> | undefined;

  @Get('openapi.json')
  @Header('cache-control', 'public, max-age=300')
  document(): Record<string, unknown> {
    this.#doc ??= buildOpenApiDocument({ serverUrl: `/${API_PREFIX}`, version: API_VERSION });
    return this.#doc;
  }
}
