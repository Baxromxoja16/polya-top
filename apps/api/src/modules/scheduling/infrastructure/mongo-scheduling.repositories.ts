import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type LocalDate, Money } from '@polya/shared-kernel';
import { type Model, Schema, Types } from 'mongoose';
import { saveVersioned } from '../../../platform/database/versioned-save.js';
import { OpeningHours } from '../domain/opening-hours.js';
import {
  type DaySelector,
  PitchSchedule,
  PitchScheduleRepository,
  PricingPlan,
  PricingPlanRepository,
  type PricingRule,
  type Weekday,
} from '../domain/pitch-schedule.js';

export const SCHEDULE_MODEL = 'PitchSchedule';
export const PRICING_MODEL = 'PricingPlan';

interface DayDoc {
  day: number;
  open: number;
  /** 1..48 — 24 dan kattasi ertasi kun */
  closeExt: number;
}

interface ExceptionDoc {
  date: string;
  closed: boolean;
  open?: number;
  closeExt?: number;
}

interface RuleDoc {
  id: string;
  days: DaySelector;
  fromHour: number;
  toHour: number;
  pricePerHour: number;
}

interface ScheduleDocument {
  _id: Types.ObjectId;
  weekly: DayDoc[];
  exceptions: ExceptionDoc[];
  updatedAt: Date;
  version: number;
}

interface PricingDocument {
  _id: Types.ObjectId;
  basePerHour: number;
  currency: 'UZS';
  rules: RuleDoc[];
  updatedAt: Date;
  version: number;
}

export const ScheduleSchema = new Schema<ScheduleDocument>(
  {
    weekly: [new Schema<DayDoc>({ day: Number, open: Number, closeExt: Number }, { _id: false })],
    exceptions: [
      new Schema<ExceptionDoc>(
        { date: String, closed: Boolean, open: Number, closeExt: Number },
        { _id: false },
      ),
    ],
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'pitch_schedules', versionKey: false },
);

export const PricingSchema = new Schema<PricingDocument>(
  {
    basePerHour: { type: Number, required: true },
    currency: { type: String, required: true },
    rules: { type: Schema.Types.Mixed, default: [] },
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'pricing_plans', versionKey: false },
);

const oid = (id: string) => new Types.ObjectId(id);
const validIds = (ids: readonly string[]) =>
  ids.filter((id) => Types.ObjectId.isValid(id)).map(oid);

@Injectable()
export class MongoPitchScheduleRepository extends PitchScheduleRepository {
  constructor(@InjectModel(SCHEDULE_MODEL) private readonly model: Model<ScheduleDocument>) {
    super();
  }

  async findByPitch(pitchId: string): Promise<PitchSchedule | null> {
    return (await this.findByPitches([pitchId]))[0] ?? null;
  }

  async findByPitches(pitchIds: readonly string[]): Promise<PitchSchedule[]> {
    const docs = await this.model
      .find({ _id: { $in: validIds(pitchIds) } })
      .lean<ScheduleDocument[]>()
      .exec();
    return docs.map(toSchedule);
  }

  async save(schedule: PitchSchedule): Promise<void> {
    const weekly: DayDoc[] = [];
    for (const [day, hours] of schedule.weekly) {
      if (hours) weekly.push({ day, open: hours.openHour, closeExt: hours.closeHourExtended });
    }
    await saveVersioned(
      this.model,
      {
        _id: oid(schedule.pitchId),
        weekly,
        exceptions: [...schedule.exceptions].map(([date, h]) =>
          h
            ? { date, closed: false, open: h.openHour, closeExt: h.closeHourExtended }
            : { date, closed: true },
        ),
        updatedAt: schedule.updatedAt,
        version: schedule.version + 1,
      },
      schedule.version,
    );
    schedule.markPersisted();
  }
}

@Injectable()
export class MongoPricingPlanRepository extends PricingPlanRepository {
  constructor(@InjectModel(PRICING_MODEL) private readonly model: Model<PricingDocument>) {
    super();
  }

  async findByPitch(pitchId: string): Promise<PricingPlan | null> {
    return (await this.findByPitches([pitchId]))[0] ?? null;
  }

  async findByPitches(pitchIds: readonly string[]): Promise<PricingPlan[]> {
    const docs = await this.model
      .find({ _id: { $in: validIds(pitchIds) } })
      .lean<PricingDocument[]>()
      .exec();
    return docs.map((d) =>
      PricingPlan.reconstitute(
        d._id.toHexString(),
        Money.of(d.basePerHour, d.currency),
        (d.rules ?? []).map(
          (r): PricingRule => ({ ...r, pricePerHour: Money.of(r.pricePerHour, d.currency) }),
        ),
        d.updatedAt,
        d.version,
      ),
    );
  }

  async save(plan: PricingPlan): Promise<void> {
    await saveVersioned(
      this.model,
      {
        _id: oid(plan.id),
        basePerHour: plan.basePerHour.amount,
        currency: plan.basePerHour.currency,
        rules: plan.rules.map((r) => ({ ...r, pricePerHour: r.pricePerHour.amount })),
        updatedAt: plan.updatedAt,
        version: plan.version + 1,
      },
      plan.version,
    );
    plan.markPersisted();
  }
}

function toSchedule(doc: ScheduleDocument): PitchSchedule {
  const weekly = new Map<Weekday, OpeningHours | null>();
  for (const day of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) weekly.set(day, null);
  for (const d of doc.weekly) {
    weekly.set(d.day as Weekday, toHours(d.open, d.closeExt));
  }
  const exceptions = new Map<LocalDate, OpeningHours | null>();
  for (const e of doc.exceptions ?? []) {
    exceptions.set(e.date, e.closed ? null : toHours(e.open ?? 0, e.closeExt ?? 24));
  }
  return PitchSchedule.reconstitute(
    doc._id.toHexString(),
    weekly,
    exceptions,
    doc.updatedAt,
    doc.version,
  );
}

function toHours(open: number, closeExt: number): OpeningHours {
  return OpeningHours.of(open, closeExt > 24 ? closeExt - 24 : closeExt);
}
