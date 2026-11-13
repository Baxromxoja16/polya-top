import { Injectable } from '@nestjs/common';
import { Clock, err, ok, type Result } from '@polya/shared-kernel';
import { type Booking, BookingQueries, BookingService } from '../../booking/index.js';
import {
  type Actor,
  CatalogQueries,
  type VenueId,
  VenueManagementService,
} from '../../catalog/index.js';
import {
  type BlockUserError,
  GrantRoleUseCase,
  IdentityQueries,
  SetUserBlockedUseCase,
  type UserContactView,
} from '../../identity/index.js';

const FAR_FUTURE_MS = 400 * 86_400_000;

/**
 * TZ AD-2, EC-B10, EC-B11: bloklash bir nechta kontekstga tegadi — shu yerda muvofiqlashtiriladi
 * (Identity/Catalog → holat, Booking → kelajakdagi bandlovlarni bekor qilish).
 * Admin konteksti boshqalarga bog'liq, ular Admin'ga bog'liq emas.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly users: SetUserBlockedUseCase,
    private readonly venues: VenueManagementService,
    private readonly catalog: CatalogQueries,
    private readonly bookings: BookingService,
    private readonly bookingQueries: BookingQueries,
    private readonly clock: Clock,
    private readonly identity: IdentityQueries,
    private readonly grantRole: GrantRoleUseCase,
  ) {}

  /** EC-T10: Owner akkaunti yo'qolgan — egalik boshqa akkauntga (OWNER roli bilan) */
  async transferVenue(
    admin: Actor,
    slug: string,
    newOwnerRef: string,
  ): Promise<
    Result<
      { venueName: string; previousOwnerId: string; newOwner: UserContactView },
      'VENUE_NOT_FOUND' | 'USER_NOT_FOUND' | 'NO_CHANGE'
    >
  > {
    const card = await this.catalog.venueCard(slug);
    if (!card) return err('VENUE_NOT_FOUND');
    const newOwner = await this.identity.findByRef(newOwnerRef);
    if (!newOwner) return err('USER_NOT_FOUND');
    const moved = await this.venues.transferOwnership(admin, card.venue.id as VenueId, newOwner.id);
    if (!moved) return err('NO_CHANGE');
    await this.grantRole.execute(newOwner.id, 'OWNER');
    return ok({ venueName: moved.venue.name, previousOwnerId: moved.previousOwnerId, newOwner });
  }

  /** EC-B11: bandlovlar avtomatik bekor qilinadi */
  async blockUser(ref: string, reason: string): Promise<Result<Booking[], BlockUserError>> {
    const r = await this.users.execute({ ref, blocked: true });
    if (!r.ok) return r;
    return ok(await this.bookings.cancelForBlockedPlayer(r.value.userId, reason));
  }

  async unblockUser(ref: string): Promise<Result<void, BlockUserError>> {
    const r = await this.users.execute({ ref, blocked: false });
    return r.ok ? ok(undefined) : r;
  }

  /** EC-B10: Admin tasdiqlashidan oldin — nechta bandlovga ta'sir qiladi */
  async venueImpact(
    slug: string,
  ): Promise<{ venueId: string; name: string; future: number } | null> {
    const card = await this.catalog.venueCard(slug);
    if (!card) return null;
    const now = this.clock.now();
    const future = await this.bookingQueries.venueSchedule(
      [card.venue.id],
      now,
      new Date(now.getTime() + FAR_FUTURE_MS),
    );
    return {
      venueId: card.venue.id,
      name: card.venue.name,
      future: future.filter(
        (b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.range.start > now,
      ).length,
    };
  }

  async blockVenue(
    admin: Actor,
    venueId: string,
    reason: string,
  ): Promise<Result<{ name: string; cancelled: Booking[] }, 'ALREADY_HANDLED'>> {
    try {
      const venue = await this.venues.setBlocked(admin, venueId as VenueId, true);
      const cancelled = await this.bookings.cancelForBlockedVenue(venueId, reason);
      return ok({ name: venue.name, cancelled });
    } catch {
      return err('ALREADY_HANDLED');
    }
  }

  async unblockVenue(
    admin: Actor,
    slug: string,
  ): Promise<Result<string, 'NOT_FOUND' | 'ALREADY_HANDLED'>> {
    const card = await this.catalog.venueCard(slug);
    if (!card) return err('NOT_FOUND');
    try {
      return ok((await this.venues.setBlocked(admin, card.venue.id as VenueId, false)).name);
    } catch {
      return err('ALREADY_HANDLED');
    }
  }
}
