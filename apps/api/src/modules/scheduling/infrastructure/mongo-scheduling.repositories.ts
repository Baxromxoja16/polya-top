import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Money } from '@polya/shared-kernel';
import { type Model, Schema, Types } from 'mongoose';
import { saveVersioned } from '../../../platform/database/versioned-save.js';
import { OpeningHours } from '../domain/opening-hours.js';
import {
  PitchSchedule,
  PitchScheduleRepository,
  PricingPlan,
  PricingPlanRepository,
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

interface ScheduleDocument {
  _id: Types.ObjectId;
  weekly: DayDoc[];
  updatedAt: Date;
  version: number;
}

interface PricingDocument {
  _id: Types.ObjectId;
  basePerHour: number;
  currency: 'UZS';
  updatedAt: Date;
  version: number;
}

export const ScheduleSchema = new Schema<ScheduleDocument>(
  {
    weekly: [new Schema<DayDoc>({ day: Number, open: Number, closeExt: Number }, { _id: false })],
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'pitch_schedules', versionKey: false },
);

export const PricingSchema = new Schema<PricingDocument>(
  {
    basePerHour: { type: Number, required: true },
    currency: { type: String, required: true },
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
    weekly.set(
      d.day as Weekday,
      OpeningHours.of(d.open, d.closeExt > 24 ? d.closeExt - 24 : d.closeExt),
    );
  }
  return PitchSchedule.reconstitute(doc._id.toHexString(), weekly, doc.updatedAt, doc.version);
}
