import { AggregateRoot, DomainError } from '@polya/shared-kernel';
import { BLOCK_ALERT_RATIO } from './marketing-policy.js';

export type CampaignKind = 'NEW_VENUES' | 'PROMOTION';
export type CampaignStatus = 'SENDING' | 'DONE' | 'CANCELLED';

/** MK-7: kampaniya statistikasi. Hisoblagichlar store'da atomik `$inc` bilan oshiriladi. */
export interface CampaignStats {
  /** navbatga qo'yildi */
  sent: number;
  /** MK-2 limiti tufayli tashlab yuborildi */
  skipped: number;
  delivered: number;
  blocked: number;
  failed: number;
  clicked: number;
}
export type CampaignCounter = keyof CampaignStats;

export const EMPTY_STATS: CampaignStats = {
  sent: 0,
  skipped: 0,
  delivered: 0,
  blocked: 0,
  failed: 0,
  clicked: 0,
};

export class CampaignClosedError extends DomainError {
  readonly code = 'CAMPAIGN_CLOSED';
}

export interface CampaignProps {
  kind: CampaignKind;
  cityId: string;
  venueIds: string[];
  status: CampaignStatus;
  /** MK-6: auditoriya kursori — oxirgi ishlangan foydalanuvchi */
  cursor: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/**
 * Bitta ommaviy xabar (TZ 4.6.1). Auditoriyaga bo'laklab yuboriladi; har bo'lakdan keyin kursor
 * saqlanadi — jarayon to'xtasa, joyidan davom etadi va hech kimga ikki marta bormaydi.
 */
export class Campaign extends AggregateRoot<string> {
  #p: CampaignProps;

  private constructor(id: string, props: CampaignProps, version: number) {
    super(id, version);
    this.#p = props;
  }

  static start(params: {
    id: string;
    kind: CampaignKind;
    cityId: string;
    venueIds: string[];
    now: Date;
  }): Campaign {
    return new Campaign(
      params.id,
      {
        kind: params.kind,
        cityId: params.cityId,
        venueIds: [...params.venueIds],
        status: 'SENDING',
        cursor: null,
        createdAt: params.now,
        finishedAt: null,
      },
      0,
    );
  }

  static reconstitute(id: string, props: CampaignProps, version: number): Campaign {
    return new Campaign(id, { ...props, venueIds: [...props.venueIds] }, version);
  }

  get kind(): CampaignKind {
    return this.#p.kind;
  }
  get cityId(): string {
    return this.#p.cityId;
  }
  get venueIds(): readonly string[] {
    return this.#p.venueIds;
  }
  get status(): CampaignStatus {
    return this.#p.status;
  }
  get cursor(): string | null {
    return this.#p.cursor;
  }
  get createdAt(): Date {
    return this.#p.createdAt;
  }
  get finishedAt(): Date | null {
    return this.#p.finishedAt;
  }

  advance(cursor: string): void {
    this.assertSending();
    this.#p.cursor = cursor;
  }

  finish(now: Date): void {
    this.assertSending();
    this.#p.status = 'DONE';
    this.#p.finishedAt = now;
  }

  /** EC-M1: stadion bloklandi/arxivlandi — yuborilmaganlar bekor */
  cancel(now: Date): void {
    this.assertSending();
    this.#p.status = 'CANCELLED';
    this.#p.finishedAt = now;
  }

  private assertSending(): void {
    if (this.#p.status !== 'SENDING')
      throw new CampaignClosedError('Campaign is closed', { id: this.id, status: this.#p.status });
  }
}

/** MK-7: yetib borganlar ichida bloklaganlar ulushi */
export function exceedsBlockRatio(stats: CampaignStats): boolean {
  const reached = stats.delivered + stats.blocked;
  return reached > 0 && stats.blocked / reached > BLOCK_ALERT_RATIO;
}
