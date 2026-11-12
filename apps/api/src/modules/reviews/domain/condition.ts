/** TZ RV-8: tezkor maydon holati — 48 soat yashaydi. */
export interface ConditionReport {
  venueId: string;
  authorId: string;
  byOwner: boolean;
  text: string;
  createdAt: Date;
  expiresAt: Date;
}

export abstract class ConditionStore {
  abstract add(report: ConditionReport): Promise<void>;
  /** Eng so'nggi, `now` da hali amal qilayotgan holat */
  abstract latest(venueId: string, now: Date): Promise<ConditionReport | null>;
}
