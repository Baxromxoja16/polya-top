import { AggregateRoot, type Brand, DomainError } from '@polya/shared-kernel';

export type PitchId = Brand<string, 'PitchId'>;

export const PITCH_FORMATS = ['5x5', '6x6', '7x7', '8x8', '11x11'] as const;
export type PitchFormat = (typeof PITCH_FORMATS)[number];

export const SURFACES = ['ARTIFICIAL', 'NATURAL', 'PARQUET', 'RUBBER'] as const;
export type Surface = (typeof SURFACES)[number];

/** ACTIVE — bandlanadi; MAINTENANCE — vaqtincha yo'q (EC-B9); ARCHIVED — yangi bandlov qabul qilmaydi. */
export type PitchStatus = 'ACTIVE' | 'MAINTENANCE' | 'ARCHIVED';

export class InvalidPitchError extends DomainError {
  readonly code = 'INVALID_PITCH';
}

export interface PitchProps {
  venueId: string;
  name: string;
  format: PitchFormat | null;
  surface: Surface | null;
  indoor: boolean | null;
  lighting: boolean | null;
  /** "40x20" */
  size: string | null;
  status: PitchStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Bandlanadigan aniq maydon (TZ VC-3). Stadion yaratilganda "1-maydon" avtomatik (VC-2a). */
export class Pitch extends AggregateRoot<PitchId> {
  #p: PitchProps;

  private constructor(id: PitchId, props: PitchProps, version: number) {
    super(id, version);
    this.#p = props;
  }

  static create(params: { id: PitchId; venueId: string; name: string; now: Date }): Pitch {
    return new Pitch(
      params.id,
      {
        venueId: params.venueId,
        name: validName(params.name),
        format: null,
        surface: null,
        indoor: null,
        lighting: null,
        size: null,
        status: 'ACTIVE',
        createdAt: params.now,
        updatedAt: params.now,
      },
      0,
    );
  }

  static reconstitute(id: PitchId, props: PitchProps, version: number): Pitch {
    return new Pitch(id, { ...props }, version);
  }

  get venueId(): string {
    return this.#p.venueId;
  }
  get name(): string {
    return this.#p.name;
  }
  get format(): PitchFormat | null {
    return this.#p.format;
  }
  get surface(): Surface | null {
    return this.#p.surface;
  }
  get indoor(): boolean | null {
    return this.#p.indoor;
  }
  get lighting(): boolean | null {
    return this.#p.lighting;
  }
  get size(): string | null {
    return this.#p.size;
  }
  get status(): PitchStatus {
    return this.#p.status;
  }
  get createdAt(): Date {
    return this.#p.createdAt;
  }
  get updatedAt(): Date {
    return this.#p.updatedAt;
  }

  /** TZ VC-2c: "maydon tafsilotlari" — format va qoplama kiritilgan. */
  get hasDetails(): boolean {
    return this.#p.format !== null && this.#p.surface !== null;
  }

  get isBookable(): boolean {
    return this.#p.status === 'ACTIVE';
  }

  rename(name: string, now: Date): void {
    this.#p.name = validName(name);
    this.touch(now);
  }

  setFormat(format: PitchFormat, now: Date): void {
    this.#p.format = format;
    this.touch(now);
  }

  setSurface(surface: Surface, now: Date): void {
    this.#p.surface = surface;
    this.touch(now);
  }

  setIndoor(indoor: boolean, now: Date): void {
    this.#p.indoor = indoor;
    this.touch(now);
  }

  setLighting(lighting: boolean, now: Date): void {
    this.#p.lighting = lighting;
    this.touch(now);
  }

  setSize(size: string | null, now: Date): void {
    const value = size?.trim().toLowerCase().replace(/[×х*]/g, 'x').replace(/\s+/g, '') || null;
    if (value && !/^\d{1,3}x\d{1,3}$/.test(value)) {
      throw new InvalidPitchError('Size must look like 40x20', { size });
    }
    this.#p.size = value;
    this.touch(now);
  }

  setStatus(status: PitchStatus, now: Date): void {
    this.#p.status = status;
    this.touch(now);
  }

  private touch(now: Date): void {
    this.#p.updatedAt = now;
  }
}

function validName(name: string): string {
  const value = name.trim().replace(/\s+/g, ' ');
  if ([...value].length < 1 || [...value].length > 40) {
    throw new InvalidPitchError('Pitch name must be 1..40 characters');
  }
  return value;
}
