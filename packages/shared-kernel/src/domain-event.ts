import { randomUUID } from 'node:crypto';

/**
 * Domain event. Kontekstlar bir-biri bilan shu orqali bog'lanadi (TZ 7.1).
 * Outbox'ga aynan shu shakl yoziladi, shuning uchun payload JSON'ga seriyalanadigan bo'lishi kerak.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly eventId: string;
  readonly type: TType;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export function createDomainEvent<TType extends string, TPayload>(params: {
  type: TType;
  aggregateId: string;
  occurredAt: Date;
  payload: TPayload;
}): DomainEvent<TType, TPayload> {
  return Object.freeze({ eventId: randomUUID(), ...params });
}
