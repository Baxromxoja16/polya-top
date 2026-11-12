import { AggregateRoot, type Brand, DomainError } from '@polya/shared-kernel';

export type ReviewId = Brand<string, 'ReviewId'>;
export type ReviewStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';
export type HiddenReason = 'AUTO_FILTER' | 'REPORTS' | 'MODERATOR';

export class InvalidReviewError extends DomainError {
  readonly code = 'INVALID_REVIEW';
}
export class ReviewRuleError extends DomainError {
  readonly code = 'REVIEW_RULE';
}

export interface OwnerReply {
  text: string;
  at: Date;
}

export interface ReviewProps {
  bookingId: string;
  venueId: string;
  pitchId: string;
  authorId: string;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  hiddenReason: HiddenReason | null;
  reporters: string[];
  ownerReply: OwnerReply | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TEXT_MAX = 1000;
export const EDIT_WINDOW_DAYS = 7;
export const REPORTS_TO_HIDE = 3;

// EC-R5: telefon raqam, havola, @username — moderatsiyaga
const CONTACT_OR_LINK = /(https?:\/\/|www\.|t\.me\/|@\w{4,}|\+?\d[\d\s()-]{8,}\d)/i;
// Qisqa, kengaytiriladigan ro'yxat (uz/ru); to'liq lug'at — konfiguratsiyada (7-bosqich)
const PROFANITY = /\b(xuy|хуй|бля|сука|пизд|ахмоқ|axmoq|tupoy|тупой|jalab|жалаб)\w*/i;

export function needsModeration(text: string | null): boolean {
  return text !== null && (CONTACT_OR_LINK.test(text) || PROFANITY.test(text));
}

/**
 * Sharh (TZ 4.5): faqat COMPLETED bandlovdan keyin (RV-1, tekshiruv application qatlamida),
 * bitta bandlov — bitta sharh. Reyting faqat VISIBLE sharhlardan (RV-7).
 */
export class Review extends AggregateRoot<ReviewId> {
  #p: ReviewProps;

  private constructor(id: ReviewId, props: ReviewProps, version: number) {
    super(id, version);
    this.#p = props;
  }

  static create(params: {
    id: ReviewId;
    bookingId: string;
    venueId: string;
    pitchId: string;
    authorId: string;
    rating: number;
    text: string | null;
    now: Date;
  }): Review {
    const text = cleanText(params.text);
    const flagged = needsModeration(text);
    return new Review(
      params.id,
      {
        bookingId: params.bookingId,
        venueId: params.venueId,
        pitchId: params.pitchId,
        authorId: params.authorId,
        rating: validRating(params.rating),
        text,
        status: flagged ? 'HIDDEN' : 'VISIBLE',
        hiddenReason: flagged ? 'AUTO_FILTER' : null,
        reporters: [],
        ownerReply: null,
        createdAt: params.now,
        updatedAt: params.now,
      },
      0,
    );
  }

  static reconstitute(id: ReviewId, props: ReviewProps, version: number): Review {
    return new Review(id, { ...props, reporters: [...props.reporters] }, version);
  }

  get bookingId(): string {
    return this.#p.bookingId;
  }
  get venueId(): string {
    return this.#p.venueId;
  }
  get pitchId(): string {
    return this.#p.pitchId;
  }
  get authorId(): string {
    return this.#p.authorId;
  }
  get rating(): number {
    return this.#p.rating;
  }
  get text(): string | null {
    return this.#p.text;
  }
  get status(): ReviewStatus {
    return this.#p.status;
  }
  get hiddenReason(): HiddenReason | null {
    return this.#p.hiddenReason;
  }
  get reporters(): readonly string[] {
    return this.#p.reporters;
  }
  get ownerReply(): OwnerReply | null {
    return this.#p.ownerReply;
  }
  get createdAt(): Date {
    return this.#p.createdAt;
  }
  get updatedAt(): Date {
    return this.#p.updatedAt;
  }
  get isVisible(): boolean {
    return this.#p.status === 'VISIBLE';
  }

  canEditAt(now: Date): boolean {
    return (
      this.#p.status !== 'DELETED' &&
      now.getTime() - this.#p.createdAt.getTime() <= EDIT_WINDOW_DAYS * 86_400_000
    );
  }

  /** RV-4: 7 kun ichida */
  edit(by: string, change: { rating?: number; text?: string | null }, now: Date): void {
    this.assertAuthor(by);
    if (!this.canEditAt(now)) throw new ReviewRuleError('Edit window has passed');
    if (change.rating !== undefined) this.#p.rating = validRating(change.rating);
    if (change.text !== undefined) {
      this.#p.text = cleanText(change.text);
      // EC-R5: tahrirda ham filtr; moderator yashirgan sharhni muallif o'zi ochib yubora olmaydi
      if (needsModeration(this.#p.text)) this.hide('AUTO_FILTER');
      else if (this.#p.hiddenReason === 'AUTO_FILTER') this.show();
    }
    this.#p.updatedAt = now;
  }

  /** RV-4: o'chirish istalgan vaqtda (soft delete) */
  delete(by: string, now: Date): void {
    this.assertAuthor(by);
    this.#p.status = 'DELETED';
    this.#p.updatedAt = now;
  }

  /** RV-5: Owner bitta javob yozadi */
  reply(text: string, now: Date): void {
    if (this.#p.ownerReply) throw new ReviewRuleError('Owner has already replied');
    const value = cleanText(text);
    if (!value) throw new InvalidReviewError('Reply text is required');
    this.#p.ownerReply = { text: value, at: now };
    this.#p.updatedAt = now;
  }

  /** RV-6: shikoyat; 3 ta turli foydalanuvchidan — moderatsiyagacha yashiriladi. @returns yangi shikoyatmi */
  report(by: string, now: Date): boolean {
    if (by === this.#p.authorId || this.#p.reporters.includes(by)) return false;
    this.#p.reporters = [...this.#p.reporters, by];
    if (this.#p.reporters.length >= REPORTS_TO_HIDE && this.#p.status === 'VISIBLE')
      this.hide('REPORTS');
    this.#p.updatedAt = now;
    return true;
  }

  /** TZ AD-3: moderator qarori */
  moderate(decision: 'SHOW' | 'HIDE' | 'DELETE', now: Date): void {
    if (decision === 'SHOW') {
      this.show();
      this.#p.reporters = [];
    } else if (decision === 'HIDE') this.hide('MODERATOR');
    else this.#p.status = 'DELETED';
    this.#p.updatedAt = now;
  }

  private hide(reason: HiddenReason): void {
    if (this.#p.status === 'DELETED') return;
    this.#p.status = 'HIDDEN';
    this.#p.hiddenReason = reason;
  }

  private show(): void {
    if (this.#p.status === 'DELETED') return;
    this.#p.status = 'VISIBLE';
    this.#p.hiddenReason = null;
  }

  private assertAuthor(by: string): void {
    if (by !== this.#p.authorId) throw new ReviewRuleError('Only the author can change the review');
  }
}

function validRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new InvalidReviewError('Rating must be an integer 1..5', { rating });
  }
  return rating;
}

function cleanText(text: string | null | undefined): string | null {
  const value = text?.trim().replace(/\s+/g, ' ') ?? '';
  if (!value) return null;
  if ([...value].length > TEXT_MAX)
    throw new InvalidReviewError('Review text is too long', { max: TEXT_MAX });
  return value;
}

export abstract class ReviewStore {
  abstract findById(id: ReviewId): Promise<Review | null>;
  abstract findByBooking(bookingId: string): Promise<Review | null>;
  abstract listVisibleByVenue(venueId: string, limit: number, offset?: number): Promise<Review[]>;
  abstract listHidden(limit: number): Promise<Review[]>;
  /** RV-7: faqat VISIBLE */
  abstract ratingOf(venueId: string): Promise<{ avg: number; count: number }>;
  /** Yangi sharh: `bookingId` unique — ikkinchi sharh `DuplicateReviewError` */
  abstract save(review: Review): Promise<void>;
}

export class DuplicateReviewError extends DomainError {
  readonly code = 'DUPLICATE_REVIEW';
}
