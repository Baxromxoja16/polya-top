import { Injectable } from '@nestjs/common';
import { Clock, DomainError, IdGenerator, type LocalDate, type Money } from '@polya/shared-kernel';
import type { OpeningHours } from '../domain/opening-hours.js';
import {
  type DaySelector,
  PitchSchedule,
  PitchScheduleRepository,
  PricingPlan,
  PricingPlanRepository,
  type PricingRule,
  type Weekday,
} from '../domain/pitch-schedule.js';

export class ScheduleNotConfiguredError extends DomainError {
  readonly code = 'SCHEDULE_NOT_CONFIGURED';
}

export interface PitchScheduleDetails {
  weekly: ReadonlyMap<Weekday, OpeningHours | null>;
  /** Sana bo'yicha tartiblangan */
  exceptions: { date: LocalDate; hours: OpeningHours | null }[];
  basePricePerHour: Money;
  rules: readonly PricingRule[];
}

export interface PitchSetupView {
  pitchId: string;
  /** Barcha kunlar bir xil bo'lsa — o'sha; aks holda undefined; hamma kun yopiq — null */
  uniformHours: OpeningHours | null | undefined;
  basePricePerHour: Money | null;
}

/**
 * Scheduling kontekstining ochiq API'si. Catalog onboarding'da shu orqali jadval va narxni o'rnatadi
 * (TZ VC-2: ish vaqti va narx — stadion yaratishning majburiy qismi).
 */
@Injectable()
export class SchedulingFacade {
  constructor(
    private readonly schedules: PitchScheduleRepository,
    private readonly pricing: PricingPlanRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async setUniformHours(pitchId: string, hours: OpeningHours): Promise<void> {
    const now = this.clock.now();
    const existing = await this.schedules.findByPitch(pitchId);
    const schedule = existing ?? PitchSchedule.uniform(pitchId, hours, now);
    if (existing) existing.setUniform(hours, now);
    await this.schedules.save(schedule);
  }

  async setBasePrice(pitchId: string, price: Money): Promise<void> {
    const now = this.clock.now();
    const existing = await this.pricing.findByPitch(pitchId);
    const plan = existing ?? PricingPlan.create(pitchId, price, now);
    if (existing) existing.setBasePrice(price, now);
    await this.pricing.save(plan);
  }

  /** TZ SP-1: hafta kuni bo'yicha alohida ish vaqti (null — yopiq). */
  async setDayHours(pitchId: string, day: Weekday, hours: OpeningHours | null): Promise<void> {
    const schedule = await this.schedule(pitchId);
    schedule.setDay(day, hours, this.clock.now());
    await this.schedules.save(schedule);
  }

  /** TZ SP-2 */
  async setException(
    pitchId: string,
    date: LocalDate,
    hours: OpeningHours | null,
    today: LocalDate,
  ): Promise<void> {
    const schedule = await this.schedule(pitchId);
    schedule.setException(date, hours, today, this.clock.now());
    await this.schedules.save(schedule);
  }

  async removeException(pitchId: string, date: LocalDate): Promise<void> {
    const schedule = await this.schedule(pitchId);
    schedule.removeException(date, this.clock.now());
    await this.schedules.save(schedule);
  }

  /** TZ SP-4 */
  async addPriceRule(
    pitchId: string,
    rule: { days: DaySelector; fromHour: number; toHour: number; pricePerHour: Money },
  ): Promise<PricingRule> {
    const plan = await this.plan(pitchId);
    const created: PricingRule = { id: this.ids.next(), ...rule };
    plan.addRule(created, this.clock.now());
    await this.pricing.save(plan);
    return created;
  }

  async removePriceRule(pitchId: string, ruleId: string): Promise<void> {
    const plan = await this.plan(pitchId);
    plan.removeRule(ruleId, this.clock.now());
    await this.pricing.save(plan);
  }

  async details(pitchId: string): Promise<PitchScheduleDetails> {
    const [schedule, plan] = await Promise.all([this.schedule(pitchId), this.plan(pitchId)]);
    return {
      weekly: schedule.weekly,
      exceptions: [...schedule.exceptions]
        .map(([date, hours]) => ({ date, hours }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      basePricePerHour: plan.basePerHour,
      rules: plan.rules,
    };
  }

  private async schedule(pitchId: string): Promise<PitchSchedule> {
    const schedule = await this.schedules.findByPitch(pitchId);
    if (!schedule) throw new ScheduleNotConfiguredError('Pitch has no schedule', { pitchId });
    return schedule;
  }

  private async plan(pitchId: string): Promise<PricingPlan> {
    const plan = await this.pricing.findByPitch(pitchId);
    if (!plan) throw new ScheduleNotConfiguredError('Pitch has no pricing', { pitchId });
    return plan;
  }

  async getSetups(pitchIds: readonly string[]): Promise<Map<string, PitchSetupView>> {
    const [schedules, plans] = await Promise.all([
      this.schedules.findByPitches(pitchIds),
      this.pricing.findByPitches(pitchIds),
    ]);
    const result = new Map<string, PitchSetupView>();
    for (const id of pitchIds) {
      const schedule = schedules.find((s) => s.pitchId === id);
      result.set(id, {
        pitchId: id,
        uniformHours: schedule ? schedule.uniformHours : null,
        basePricePerHour: plans.find((p) => p.id === id)?.basePerHour ?? null,
      });
    }
    return result;
  }
}
