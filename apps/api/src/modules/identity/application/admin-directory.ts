/**
 * Platforma adminlari ro'yxati porti. MVP'da manba — env (`ADMIN_TELEGRAM_IDS`): admin huquqi kod
 * deploy qiladigan odam qo'lida, botning o'zidan berib bo'lmaydi.
 */
export abstract class AdminDirectory {
  abstract isAdmin(telegramId: number): boolean;
}

export class StaticAdminDirectory extends AdminDirectory {
  readonly #ids: ReadonlySet<number>;

  constructor(ids: readonly number[]) {
    super();
    this.#ids = new Set(ids);
  }

  isAdmin(telegramId: number): boolean {
    return this.#ids.has(telegramId);
  }
}
