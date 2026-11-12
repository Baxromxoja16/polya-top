import { Injectable } from '@nestjs/common';
import { Clock, DomainError, err, IdGenerator, ok, type Result } from '@polya/shared-kernel';
import { BookingQueries } from '../../booking/index.js';
import { CatalogQueries, type PitchContext, VenueRatingUpdater } from '../../catalog/index.js';
import { DuplicateReviewError, Review, type ReviewId, ReviewStore } from '../domain/review.js';

export interface ReviewActor {
  userId: string;
  roles: readonly string[];
}

export type CreateReviewError = 'NOT_ELIGIBLE' | 'OWN_VENUE' | 'ALREADY_REVIEWED';
export type ChangeError = 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_ALLOWED';

const isModerator = (a: ReviewActor) => a.roles.includes('ADMIN') || a.roles.includes('MODERATOR');

/** TZ 4.5: sharhlar. Reyting har o'zgarishda qayta hisoblanadi (RV-7, EC-R6). */
@Injectable()
export class ReviewService {
  constructor(
    private readonly store: ReviewStore,
    private readonly bookings: BookingQueries,
    private readonly catalog: CatalogQueries,
    private readonly rating: VenueRatingUpdater,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /** RV-1: faqat o'zining COMPLETED bandlovi (NO_SHOW emas — EC-R3); EC-R1: o'z stadioniga emas */
  async eligibility(
    actor: ReviewActor,
    bookingId: string,
  ): Promise<Result<PitchContext, CreateReviewError>> {
    const booking = await this.bookings.byId(bookingId);
    if (!booking || booking.playerId !== actor.userId || booking.status !== 'COMPLETED')
      return err('NOT_ELIGIBLE');
    const context = await this.catalog.pitchContext(booking.pitchId);
    if (!context) return err('NOT_ELIGIBLE');
    if (context.venue.ownerId === actor.userId) return err('OWN_VENUE');
    if (await this.store.findByBooking(bookingId)) return err('ALREADY_REVIEWED');
    return ok(context);
  }

  async create(
    actor: ReviewActor,
    input: { bookingId: string; rating: number; text?: string | null },
  ): Promise<Result<{ review: Review; context: PitchContext }, CreateReviewError>> {
    const eligible = await this.eligibility(actor, input.bookingId);
    if (!eligible.ok) return eligible;
    const context = eligible.value;
    const review = Review.create({
      id: this.ids.next() as ReviewId,
      bookingId: input.bookingId,
      venueId: context.venue.id,
      pitchId: context.pitchId,
      authorId: actor.userId,
      rating: input.rating,
      text: input.text ?? null,
      now: this.clock.now(),
    });
    try {
      await this.store.save(review);
    } catch (error) {
      if (error instanceof DuplicateReviewError) return err('ALREADY_REVIEWED');
      throw error;
    }
    await this.refreshRating(review.venueId);
    return ok({ review, context });
  }

  async edit(
    actor: ReviewActor,
    reviewId: string,
    change: { rating?: number; text?: string | null },
  ): Promise<Result<Review, ChangeError>> {
    return this.change(
      reviewId,
      (r, now) => r.edit(actor.userId, change, now),
      (r) => r.authorId === actor.userId,
    );
  }

  async remove(actor: ReviewActor, reviewId: string): Promise<Result<Review, ChangeError>> {
    return this.change(
      reviewId,
      (r, now) => r.delete(actor.userId, now),
      (r) => r.authorId === actor.userId,
    );
  }

  /** RV-5: faqat shu stadion egasi */
  async reply(
    actor: ReviewActor,
    reviewId: string,
    text: string,
  ): Promise<Result<Review, ChangeError>> {
    const review = await this.store.findById(reviewId as ReviewId);
    if (!review) return err('NOT_FOUND');
    const context = await this.catalog.pitchContext(review.pitchId);
    if (context?.venue.ownerId !== actor.userId) return err('FORBIDDEN');
    return this.change(
      reviewId,
      (r, now) => r.reply(text, now),
      () => true,
    );
  }

  /** RV-6 */
  async report(actor: ReviewActor, reviewId: string): Promise<Result<Review, ChangeError>> {
    return this.change(
      reviewId,
      (r, now) => void r.report(actor.userId, now),
      () => true,
    );
  }

  /** TZ AD-3 */
  async moderate(
    actor: ReviewActor,
    reviewId: string,
    decision: 'SHOW' | 'HIDE' | 'DELETE',
  ): Promise<Result<Review, ChangeError>> {
    if (!isModerator(actor)) return err('FORBIDDEN');
    return this.change(
      reviewId,
      (r, now) => r.moderate(decision, now),
      () => true,
    );
  }

  listForVenue(venueId: string, limit: number, offset = 0): Promise<Review[]> {
    return this.store.listVisibleByVenue(venueId, limit, offset);
  }

  listForModeration(limit = 20): Promise<Review[]> {
    return this.store.listHidden(limit);
  }

  byId(id: string): Promise<Review | null> {
    return this.store.findById(id as ReviewId);
  }

  byBooking(bookingId: string): Promise<Review | null> {
    return this.store.findByBooking(bookingId);
  }

  private async change(
    reviewId: string,
    apply: (r: Review, now: Date) => void,
    allowed: (r: Review) => boolean,
  ): Promise<Result<Review, ChangeError>> {
    const review = await this.store.findById(reviewId as ReviewId);
    if (!review) return err('NOT_FOUND');
    if (!allowed(review)) return err('FORBIDDEN');
    try {
      apply(review, this.clock.now());
    } catch (error) {
      if (error instanceof DomainError) return err('NOT_ALLOWED');
      throw error;
    }
    await this.store.save(review);
    await this.refreshRating(review.venueId);
    return ok(review);
  }

  private async refreshRating(venueId: string): Promise<void> {
    const { avg, count } = await this.store.ratingOf(venueId);
    await this.rating.update(venueId, avg, count);
  }
}
