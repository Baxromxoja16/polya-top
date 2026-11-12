import { Injectable } from '@nestjs/common';
import { Clock, err, IdGenerator, ok, type Result } from '@polya/shared-kernel';
import {
  ApplicationAlreadyReviewedError,
  InvalidApplicationNoteError,
  OwnerApplication,
  type OwnerApplicationId,
  OwnerApplicationRepository,
  PendingApplicationExistsError,
} from '../domain/owner-application.js';
import type { TelegramId, User } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { UserNotFoundError } from './errors.js';

export type SubmitApplicationError =
  | 'ALREADY_OWNER'
  | 'ALREADY_PENDING'
  | 'PHONE_REQUIRED'
  | 'INVALID_NOTE';

/** TZ VC-1: Owner bo'lish arizasi. Telefon majburiy — admin ariza beruvchiga qo'ng'iroq qila olishi uchun. */
@Injectable()
export class SubmitOwnerApplicationUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly applications: OwnerApplicationRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: {
    telegramId: number;
    note: string;
  }): Promise<Result<OwnerApplication, SubmitApplicationError>> {
    const user = await this.users.findByTelegramId(input.telegramId as TelegramId);
    if (!user) throw new UserNotFoundError('User is not registered', input);
    if (user.hasRole('OWNER')) return err('ALREADY_OWNER');
    if (user.isGuest) return err('PHONE_REQUIRED');
    if (await this.applications.findPendingByUser(user.id)) return err('ALREADY_PENDING');

    let application: OwnerApplication;
    try {
      application = OwnerApplication.submit({
        id: this.ids.next() as OwnerApplicationId,
        userId: user.id,
        note: input.note,
        now: this.clock.now(),
      });
    } catch (error) {
      if (error instanceof InvalidApplicationNoteError) return err('INVALID_NOTE');
      throw error;
    }

    try {
      await this.applications.save(application);
    } catch (error) {
      if (error instanceof PendingApplicationExistsError) return err('ALREADY_PENDING');
      throw error;
    }
    return ok(application);
  }
}

export interface ReviewOutcome {
  application: OwnerApplication;
  applicant: User;
}

/** Admin qarori. Tasdiqlansa — foydalanuvchiga OWNER roli beriladi. */
@Injectable()
export class ReviewOwnerApplicationUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly applications: OwnerApplicationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    applicationId: string;
    reviewerTelegramId: number;
    decision: 'APPROVE' | 'REJECT';
    reason?: string;
  }): Promise<Result<ReviewOutcome, 'NOT_FOUND' | 'ALREADY_REVIEWED'>> {
    const application = await this.applications.findById(input.applicationId as OwnerApplicationId);
    if (!application) return err('NOT_FOUND');
    const reviewer = await this.users.findByTelegramId(input.reviewerTelegramId as TelegramId);
    const applicant = await this.users.findById(application.userId);
    if (!reviewer || !applicant)
      throw new UserNotFoundError('Reviewer or applicant not found', input);

    const now = this.clock.now();
    try {
      if (input.decision === 'APPROVE') application.approve(reviewer.id, now);
      else application.reject(reviewer.id, input.reason ?? null, now);
    } catch (error) {
      if (error instanceof ApplicationAlreadyReviewedError) return err('ALREADY_REVIEWED');
      throw error;
    }
    // Ikki admin bir vaqtda bosgan bo'lsa, versiya to'qnashuvi ikkinchisini to'xtatadi
    await this.applications.save(application);
    if (input.decision === 'APPROVE' && applicant.grantRole('OWNER', now)) {
      await this.users.save(applicant);
    }
    return ok({ application, applicant });
  }
}
