import type { PhoneNumber } from '@polya/shared-kernel';
import {
  AggregateRoot,
  type Brand,
  createDomainEvent,
  DomainError,
  type Language,
} from '@polya/shared-kernel';
import { UserEvents } from './user.events.js';

export type UserId = Brand<string, 'UserId'>;
export type TelegramId = Brand<number, 'TelegramId'>;

export const ROLES = ['PLAYER', 'OWNER', 'STAFF', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export type UserStatus = 'ACTIVE' | 'BLOCKED';

/** Telegram'dan keladigan, foydalanuvchi o'zi boshqarmaydigan ma'lumot. */
export interface TelegramProfile {
  firstName: string;
  lastName: string | null;
  username: string | null;
}

export class InvalidDisplayNameError extends DomainError {
  readonly code = 'INVALID_DISPLAY_NAME';
}

export interface UserProps {
  telegramId: TelegramId;
  telegramProfile: TelegramProfile;
  /** Foydalanuvchi o'zi kiritgan ism (TZ ID-5). Telegram profili uni almashtirmaydi. */
  customName: string | null;
  /** Tanlangan shahar (TZ ID-5, CT-4). Qidiruv shu shahar doirasida (CT-5). */
  cityId: string | null;
  phone: PhoneNumber | null;
  phoneVerifiedAt: Date | null;
  language: Language;
  roles: Role[];
  status: UserStatus;
  /** Foydalanuvchi botni bloklagan (TZ ID-6): xabarnomalar yuborilmaydi. */
  botBlocked: boolean;
  /** TZ MK-4: marketing xabarlaridan voz kechgan (tranzaksion xabarlar bunga bog'liq emas, MK-1) */
  marketingOptOut: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NAME_MIN = 2;
const NAME_MAX = 64;
// biome-ignore lint/suspicious/noControlCharactersInRegex: boshqaruv belgilarini aynan rad etish uchun
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const LINK_LIKE = /(https?:\/\/|www\.|t\.me\/|@\w{3,})/i;

export class User extends AggregateRoot<UserId> {
  #props: UserProps;

  private constructor(id: UserId, props: UserProps, version: number) {
    super(id, version);
    this.#props = props;
  }

  static register(params: {
    id: UserId;
    telegramId: TelegramId;
    profile: TelegramProfile;
    language: Language;
    now: Date;
  }): User {
    const user = new User(
      params.id,
      {
        telegramId: params.telegramId,
        telegramProfile: normalizeProfile(params.profile),
        customName: null,
        cityId: null,
        phone: null,
        phoneVerifiedAt: null,
        language: params.language,
        roles: ['PLAYER'],
        status: 'ACTIVE',
        botBlocked: false,
        marketingOptOut: false,
        createdAt: params.now,
        updatedAt: params.now,
      },
      0,
    );
    user.raise(
      createDomainEvent({
        type: UserEvents.Registered,
        aggregateId: params.id,
        occurredAt: params.now,
        payload: { telegramId: params.telegramId, language: params.language },
      }),
    );
    return user;
  }

  static reconstitute(id: UserId, props: UserProps, version: number): User {
    return new User(id, { ...props, roles: [...props.roles] }, version);
  }

  get telegramId(): TelegramId {
    return this.#props.telegramId;
  }
  get telegramProfile(): Readonly<TelegramProfile> {
    return this.#props.telegramProfile;
  }
  get cityId(): string | null {
    return this.#props.cityId;
  }
  get customName(): string | null {
    return this.#props.customName;
  }
  get phone(): PhoneNumber | null {
    return this.#props.phone;
  }
  get phoneVerifiedAt(): Date | null {
    return this.#props.phoneVerifiedAt;
  }
  get language(): Language {
    return this.#props.language;
  }
  get roles(): readonly Role[] {
    return this.#props.roles;
  }
  get status(): UserStatus {
    return this.#props.status;
  }
  get botBlocked(): boolean {
    return this.#props.botBlocked;
  }
  get marketingOptOut(): boolean {
    return this.#props.marketingOptOut;
  }
  get createdAt(): Date {
    return this.#props.createdAt;
  }
  get updatedAt(): Date {
    return this.#props.updatedAt;
  }

  /** TZ 3: telefonini bermagan foydalanuvchi — Guest (ko'radi, lekin bandlay olmaydi). */
  get isGuest(): boolean {
    return this.#props.phone === null;
  }

  /**
   * Ko'rsatiladigan ism: o'zi kiritgan → Telegram ismi → username. Hammasi bo'sh bo'lsa null,
   * interfeys "Foydalanuvchi #1234" kabi fallback ko'rsatadi (TZ EC-T6).
   */
  get displayName(): string | null {
    const { customName, telegramProfile: p } = this.#props;
    if (customName) return customName;
    const full = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
    if (full) return full;
    return p.username;
  }

  hasRole(role: Role): boolean {
    return this.#props.roles.includes(role);
  }

  grantRole(role: Role, now: Date): boolean {
    if (this.hasRole(role)) return false;
    this.#props.roles = [...this.#props.roles, role];
    this.touch(now);
    return true;
  }

  revokeRole(role: Role, now: Date): boolean {
    if (!this.hasRole(role)) return false;
    this.#props.roles = this.#props.roles.filter((r) => r !== role);
    this.touch(now);
    return true;
  }

  /** @returns o'zgarish bo'ldimi (bo'lmasa repository'ga yozish shart emas) */
  syncTelegramProfile(profile: TelegramProfile, now: Date): boolean {
    const next = normalizeProfile(profile);
    const cur = this.#props.telegramProfile;
    if (
      cur.firstName === next.firstName &&
      cur.lastName === next.lastName &&
      cur.username === next.username
    ) {
      return false;
    }
    this.#props.telegramProfile = next;
    this.touch(now);
    return true;
  }

  rename(name: string, now: Date): void {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if ([...trimmed].length < NAME_MIN || [...trimmed].length > NAME_MAX) {
      throw new InvalidDisplayNameError('Name length is out of range', {
        min: NAME_MIN,
        max: NAME_MAX,
      });
    }
    if (CONTROL_CHARS.test(trimmed) || LINK_LIKE.test(trimmed)) {
      throw new InvalidDisplayNameError('Name contains forbidden content');
    }
    this.#props.customName = trimmed;
    this.touch(now);
  }

  changeCity(cityId: string, now: Date): boolean {
    if (this.#props.cityId === cityId) return false;
    this.#props.cityId = cityId;
    this.touch(now);
    return true;
  }

  changeLanguage(language: Language, now: Date): boolean {
    if (this.#props.language === language) return false;
    this.#props.language = language;
    this.touch(now);
    return true;
  }

  /**
   * Telegram kontakt ulashish orqali tasdiqlangan raqam (TZ ID-2, ID-3).
   * Egalik tekshiruvi application qatlamida (kontakt `user_id === from.id`).
   */
  verifyPhone(phone: PhoneNumber, now: Date): boolean {
    if (phone.equals(this.#props.phone)) return false;
    const previous = this.#props.phone;
    this.#props.phone = phone;
    this.#props.phoneVerifiedAt = now;
    this.touch(now);
    this.raise(
      createDomainEvent({
        type: UserEvents.PhoneVerified,
        aggregateId: this.id,
        occurredAt: now,
        payload: { phone: phone.value, previousPhone: previous?.value ?? null },
      }),
    );
    return true;
  }

  /** Raqam boshqa akkauntda tasdiqlandi — bu akkauntdan olinadi, foydalanuvchi qayta Guest bo'ladi. */
  releasePhone(now: Date): void {
    const phone = this.#props.phone;
    if (!phone) return;
    this.#props.phone = null;
    this.#props.phoneVerifiedAt = null;
    this.touch(now);
    this.raise(
      createDomainEvent({
        type: UserEvents.PhoneReleased,
        aggregateId: this.id,
        occurredAt: now,
        payload: { phone: phone.value },
      }),
    );
  }

  markBotBlocked(now: Date): boolean {
    if (this.#props.botBlocked) return false;
    this.#props.botBlocked = true;
    this.touch(now);
    this.raise(
      createDomainEvent({
        type: UserEvents.BotBlocked,
        aggregateId: this.id,
        occurredAt: now,
        payload: {},
      }),
    );
    return true;
  }

  markBotUnblocked(now: Date): boolean {
    if (!this.#props.botBlocked) return false;
    this.#props.botBlocked = false;
    this.touch(now);
    this.raise(
      createDomainEvent({
        type: UserEvents.BotUnblocked,
        aggregateId: this.id,
        occurredAt: now,
        payload: {},
      }),
    );
    return true;
  }

  /** TZ AD-2: Admin bloklaydi — bot bu foydalanuvchiga xizmat qilmaydi */
  block(now: Date): boolean {
    if (this.#props.status === 'BLOCKED') return false;
    this.#props.status = 'BLOCKED';
    this.touch(now);
    return true;
  }

  unblock(now: Date): boolean {
    if (this.#props.status === 'ACTIVE') return false;
    this.#props.status = 'ACTIVE';
    this.touch(now);
    return true;
  }

  /** TZ MK-4: `🔕` tugmasi yoki sozlamalardan */
  setMarketingOptOut(optOut: boolean, now: Date): boolean {
    if (this.#props.marketingOptOut === optOut) return false;
    this.#props.marketingOptOut = optOut;
    this.touch(now);
    return true;
  }

  private touch(now: Date): void {
    this.#props.updatedAt = now;
  }
}

function normalizeProfile(profile: TelegramProfile): TelegramProfile {
  return {
    firstName: profile.firstName.trim(),
    lastName: profile.lastName?.trim() || null,
    username: profile.username?.trim() || null,
  };
}
