import { describe, expect, it } from 'vitest';
import { createDomainEvent } from './domain-event.js';
import { AggregateRoot } from './entity.js';

class Sample extends AggregateRoot<string> {
  static create(id: string): Sample {
    const s = new Sample(id);
    s.raise(
      createDomainEvent({
        type: 'SampleCreated',
        aggregateId: id,
        occurredAt: new Date(0),
        payload: {},
      }),
    );
    return s;
  }
}

class Other extends AggregateRoot<string> {
  constructor(id: string) {
    super(id);
  }
}

describe('AggregateRoot', () => {
  it('collects and drains domain events', () => {
    const s = Sample.create('a');
    expect(s.pendingEvents).toHaveLength(1);
    const events = s.pullEvents();
    expect(events[0]?.type).toBe('SampleCreated');
    expect(events[0]?.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.pullEvents()).toEqual([]);
  });

  it('tracks version for optimistic concurrency', () => {
    const s = Sample.create('a');
    expect(s.version).toBe(0);
    s.markPersisted();
    expect(s.version).toBe(1);
  });

  it('compares identity by type and id', () => {
    expect(Sample.create('a').equals(Sample.create('a'))).toBe(true);
    expect(Sample.create('a').equals(Sample.create('b'))).toBe(false);
    expect(Sample.create('a').equals(new Other('a'))).toBe(false);
    expect(Sample.create('a').equals(undefined)).toBe(false);
  });
});
