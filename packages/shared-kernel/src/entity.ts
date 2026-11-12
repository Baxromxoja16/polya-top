import type { DomainEvent } from './domain-event.js';

export abstract class Entity<TId extends string> {
  protected constructor(readonly id: TId) {}

  equals(other: Entity<TId> | null | undefined): boolean {
    if (!other) return false;
    if (other === this) return true;
    return other.constructor === this.constructor && other.id === this.id;
  }
}

/**
 * Aggregate root: tranzaksiya va izchillik chegarasi.
 * - Hodisalarni yig'adi, repository saqlagandan keyin `pullEvents()` bilan oladi (Outbox).
 * - `version` — optimistic concurrency uchun (TZ EC-B3, EC-B4).
 */
export abstract class AggregateRoot<TId extends string> extends Entity<TId> {
  #events: DomainEvent[] = [];
  #version: number;

  protected constructor(id: TId, version = 0) {
    super(id);
    this.#version = version;
  }

  /** Bazadan o'qilgandagi versiya. Repository `WHERE version = ?` sharti bilan yozadi. */
  get version(): number {
    return this.#version;
  }

  protected raise(event: DomainEvent): void {
    this.#events.push(event);
  }

  get pendingEvents(): readonly DomainEvent[] {
    return this.#events;
  }

  pullEvents(): DomainEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  /** Faqat repository chaqiradi: muvaffaqiyatli yozilgandan keyin. */
  markPersisted(): void {
    this.#version += 1;
  }
}
