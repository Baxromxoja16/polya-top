import { Injectable } from '@nestjs/common';
import { Clock, ConcurrencyConflictError, err, ok, type Result } from '@polya/shared-kernel';
import { GrantRoleUseCase } from '../../identity/index.js';
import { FeatureGate } from '../../subscription/index.js';
import { VenueRepository } from '../domain/repositories.js';
import type { Venue, VenueId } from '../domain/venue.js';
import { type Actor, assertCanManage, NotFoundError } from './actor.js';

/** Bir martalik taklif kodi (48 soat) — port; Redis adapteri infrastructure'da */
export abstract class StaffInviteStore {
  abstract create(venueId: string): Promise<string>;
  /** Kodni atomik "ishlatib" stadion ID'sini qaytaradi (ikkinchi marta — null) */
  abstract consume(token: string): Promise<string | null>;
}

export type InviteError = 'LIMIT_REACHED';
export type AcceptError = 'INVALID_INVITE' | 'IS_OWNER' | 'ALREADY_STAFF' | 'LIMIT_REACHED';

/**
 * TZ 3: Owner xodim taklif qiladi (havola), xodim qabul qiladi, Owner olib tashlaydi (EC-D3).
 * Limit — tarif bo'yicha (4.9: FREE 1 ta). EC-M5: PREMIUM tugasa mavjudlar o'chirilmaydi, yangisi qo'shilmaydi.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly venues: VenueRepository,
    private readonly invites: StaffInviteStore,
    private readonly features: FeatureGate,
    private readonly grantRole: GrantRoleUseCase,
    private readonly clock: Clock,
  ) {}

  async staffOf(actor: Actor, venueId: VenueId): Promise<{ venue: Venue; limit: number }> {
    const venue = await this.load(actor, venueId);
    return { venue, limit: await this.features.limit(venue.id, 'STAFF') };
  }

  async invite(actor: Actor, venueId: VenueId): Promise<Result<string, InviteError>> {
    const { venue, limit } = await this.staffOf(actor, venueId);
    if (venue.staffIds.length >= limit) return err('LIMIT_REACHED');
    return ok(await this.invites.create(venue.id));
  }

  async accept(token: string, userId: string): Promise<Result<Venue, AcceptError>> {
    const venueId = await this.invites.consume(token);
    if (!venueId) return err('INVALID_INVITE');
    // Bir vaqtda boshqa xodim qo'shilsa (versiya ziddiyati) — yangi holat bilan limitni qayta tekshiramiz
    for (let attempt = 1; ; attempt++) {
      const venue = await this.venues.findById(venueId as VenueId);
      if (!venue) return err('INVALID_INVITE');
      if (venue.ownerId === userId) return err('IS_OWNER');
      if (venue.staffIds.includes(userId)) return err('ALREADY_STAFF');
      try {
        venue.addStaff(userId, await this.features.limit(venue.id, 'STAFF'), this.clock.now());
      } catch {
        return err('LIMIT_REACHED');
      }
      try {
        await this.venues.save(venue);
      } catch (error) {
        if (error instanceof ConcurrencyConflictError && attempt < 5) continue;
        throw error;
      }
      await this.grantRole.execute(userId, 'STAFF');
      return ok(venue);
    }
  }

  async remove(actor: Actor, venueId: VenueId, staffUserId: string): Promise<boolean> {
    const venue = await this.load(actor, venueId);
    if (!venue.removeStaff(staffUserId, this.clock.now())) return false;
    await this.venues.save(venue);
    return true;
  }

  /** Xodimlarni faqat egasi (yoki Admin) boshqaradi — xodim boshqa xodim qo'sha olmaydi */
  private async load(actor: Actor, venueId: VenueId): Promise<Venue> {
    const venue = await this.venues.findById(venueId);
    if (!venue) throw new NotFoundError('Venue not found', { venueId });
    assertCanManage(actor, venue.ownerId);
    return venue;
  }
}
