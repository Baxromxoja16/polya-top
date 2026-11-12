import { AggregateRoot, type Brand, DomainError, type TimeRange } from '@polya/shared-kernel';

export type BlockId = Brand<string, 'BlockId'>;

export class InvalidBlockError extends DomainError {
  readonly code = 'INVALID_BLOCK';
}

export interface BlockProps {
  pitchId: string;
  venueId: string;
  range: TimeRange;
  reason: string | null;
  createdBy: string;
  createdAt: Date;
  /** Blok olib tashlangan (slotlar bo'shatilgan) */
  removedAt: Date | null;
}

/**
 * TZ BK-8: Owner vaqtni yopadi (ta'mir, o'z ehtiyoji). Bandlov emas, lekin slot-lock'larni egallaydi
 * (ADR-0002) — shuning uchun bandlov va blok hech qachon to'qnashmaydi.
 */
export class Block extends AggregateRoot<BlockId> {
  #p: BlockProps;

  private constructor(id: BlockId, props: BlockProps, version: number) {
    super(id, version);
    this.#p = props;
  }

  static create(
    params: Omit<BlockProps, 'createdAt' | 'removedAt'> & { id: BlockId; now: Date },
  ): Block {
    if (params.range.start.getTime() <= params.now.getTime() - 3_600_000) {
      throw new InvalidBlockError('Cannot block the past');
    }
    return new Block(
      params.id,
      {
        pitchId: params.pitchId,
        venueId: params.venueId,
        range: params.range,
        reason: params.reason?.trim().slice(0, 200) || null,
        createdBy: params.createdBy,
        createdAt: params.now,
        removedAt: null,
      },
      0,
    );
  }

  static reconstitute(id: BlockId, props: BlockProps, version: number): Block {
    return new Block(id, { ...props }, version);
  }

  get pitchId(): string {
    return this.#p.pitchId;
  }
  get venueId(): string {
    return this.#p.venueId;
  }
  get range(): TimeRange {
    return this.#p.range;
  }
  get reason(): string | null {
    return this.#p.reason;
  }
  get createdBy(): string {
    return this.#p.createdBy;
  }
  get createdAt(): Date {
    return this.#p.createdAt;
  }
  get removedAt(): Date | null {
    return this.#p.removedAt;
  }
  get isActive(): boolean {
    return this.#p.removedAt === null;
  }

  remove(now: Date): void {
    if (this.#p.removedAt) throw new InvalidBlockError('Block is already removed');
    this.#p.removedAt = now;
  }
}
