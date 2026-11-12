import { Injectable } from '@nestjs/common';
import { Clock, type Money } from '@polya/shared-kernel';
import type { OpeningHours } from '../domain/opening-hours.js';
import {
  PitchSchedule,
  PitchScheduleRepository,
  PricingPlan,
  PricingPlanRepository,
} from '../domain/pitch-schedule.js';

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
