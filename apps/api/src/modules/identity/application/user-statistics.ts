/** TZ AD-4: foydalanuvchilar bo'yicha asosiy ko'rsatkichlar */
export interface UserCounts {
  total: number;
  newSince: number;
  owners: number;
  blocked: number;
  botBlocked: number;
}

export abstract class UserStatistics {
  abstract counts(since: Date): Promise<UserCounts>;
}
