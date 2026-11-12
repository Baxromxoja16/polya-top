import { AggregateRoot, type Brand, DomainError } from '@polya/shared-kernel';
import type { UserId } from './user.js';

export type OwnerApplicationId = Brand<string, 'OwnerApplicationId'>;
export type OwnerApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export class InvalidApplicationNoteError extends DomainError {
  readonly code = 'INVALID_APPLICATION_NOTE';
}
export class ApplicationAlreadyReviewedError extends DomainError {
  readonly code = 'APPLICATION_ALREADY_REVIEWED';
}

export interface OwnerApplicationProps {
  userId: UserId;
  /** Ariza beruvchining izohi: stadion nomi, manzili (admin qaror qabul qilishi uchun). */
  note: string;
  status: OwnerApplicationStatus;
  reviewedBy: UserId | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
}

const NOTE_MIN = 5;
const NOTE_MAX = 500;

/**
 * Stadion egasi bo'lish arizasi (TZ VC-1, Q6): avval Owner tasdiqlanadi, keyin stadion qo'shadi.
 * Bitta foydalanuvchida bir vaqtda faqat bitta PENDING ariza (unique partial index).
 */
export class OwnerApplication extends AggregateRoot<OwnerApplicationId> {
  #props: OwnerApplicationProps;

  private constructor(id: OwnerApplicationId, props: OwnerApplicationProps, version: number) {
    super(id, version);
    this.#props = props;
  }

  static submit(params: {
    id: OwnerApplicationId;
    userId: UserId;
    note: string;
    now: Date;
  }): OwnerApplication {
    const note = params.note.trim();
    if ([...note].length < NOTE_MIN || [...note].length > NOTE_MAX) {
      throw new InvalidApplicationNoteError('Note length is out of range', {
        min: NOTE_MIN,
        max: NOTE_MAX,
      });
    }
    return new OwnerApplication(
      params.id,
      {
        userId: params.userId,
        note,
        status: 'PENDING',
        reviewedBy: null,
        reviewedAt: null,
        rejectReason: null,
        createdAt: params.now,
      },
      0,
    );
  }

  static reconstitute(
    id: OwnerApplicationId,
    props: OwnerApplicationProps,
    version: number,
  ): OwnerApplication {
    return new OwnerApplication(id, { ...props }, version);
  }

  get userId(): UserId {
    return this.#props.userId;
  }
  get note(): string {
    return this.#props.note;
  }
  get status(): OwnerApplicationStatus {
    return this.#props.status;
  }
  get reviewedBy(): UserId | null {
    return this.#props.reviewedBy;
  }
  get reviewedAt(): Date | null {
    return this.#props.reviewedAt;
  }
  get rejectReason(): string | null {
    return this.#props.rejectReason;
  }
  get createdAt(): Date {
    return this.#props.createdAt;
  }

  approve(reviewer: UserId, now: Date): void {
    this.review(reviewer, now);
    this.#props.status = 'APPROVED';
  }

  reject(reviewer: UserId, reason: string | null, now: Date): void {
    this.review(reviewer, now);
    this.#props.status = 'REJECTED';
    this.#props.rejectReason = reason?.trim().slice(0, NOTE_MAX) || null;
  }

  private review(reviewer: UserId, now: Date): void {
    if (this.#props.status !== 'PENDING') {
      throw new ApplicationAlreadyReviewedError('Application is already reviewed', {
        status: this.#props.status,
      });
    }
    this.#props.reviewedBy = reviewer;
    this.#props.reviewedAt = now;
  }
}

export abstract class OwnerApplicationRepository {
  abstract findById(id: OwnerApplicationId): Promise<OwnerApplication | null>;
  abstract findPendingByUser(userId: UserId): Promise<OwnerApplication | null>;
  abstract save(application: OwnerApplication): Promise<void>;
}

export class PendingApplicationExistsError extends DomainError {
  readonly code = 'PENDING_APPLICATION_EXISTS';
}
