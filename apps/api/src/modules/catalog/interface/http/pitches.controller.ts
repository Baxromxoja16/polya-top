import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { type PitchSlotsDto, type SlotsQuery, slotsQuerySchema } from '@polya/contracts';
import { parseLocalDate } from '@polya/shared-kernel';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import { AvailabilityService } from '../../../scheduling/index.js';
import { CatalogQueries } from '../../application/catalog.queries.js';

/** TZ SP-8: kunlik bo'sh vaqtlar to'ri (botdagi kartochka to'ri bilan bir xil hisob) */
@Controller('pitches')
export class PitchesController {
  constructor(
    private readonly catalog: CatalogQueries,
    private readonly availability: AvailabilityService,
  ) {}

  @Get(':pitchId/slots')
  async slots(
    @Param('pitchId') pitchId: string,
    @Query(new ZodValidationPipe(slotsQuerySchema)) query: SlotsQuery,
  ): Promise<PitchSlotsDto> {
    const ctx = /^[0-9a-f]{24}$/.test(pitchId) ? await this.catalog.pitchContext(pitchId) : null;
    if (!ctx?.venue.isPublic || !ctx.isBookable) {
      throw new NotFoundException({ code: 'PITCH_NOT_FOUND', message: 'Pitch not found' });
    }
    parseLocalDate(query.date); // 2026-02-30 kabi mavjud bo'lmagan sana — 422 INVALID_LOCAL_DATE
    const slots = await this.availability.dayView(pitchId, query.date, ctx.timeZone);
    return {
      pitchId,
      date: query.date,
      timeZone: ctx.timeZone,
      slots: slots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        hour: s.hour,
        status: s.status,
        pendingRequests: s.pendingRequests,
        price: { amount: s.price.amount, currency: 'UZS' },
        discountPercent: s.discountPercent,
      })),
    };
  }
}
