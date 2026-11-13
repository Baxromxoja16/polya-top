import type { GeoPoint, PhoneNumber } from '@polya/shared-kernel';

/** Booking konteksti uchun maydon va stadion haqida kerakli hamma narsa (TZ 7.2: facade orqali). */
export interface PitchContext {
  pitchId: string;
  pitchName: string;
  isBookable: boolean;
  venue: {
    id: string;
    name: string;
    ownerId: string;
    /** TZ 3: bandlovlarni boshqaradigan xodimlar */
    staffIds: readonly string[];
    isPublic: boolean;
    phones: readonly PhoneNumber[];
    landmarkText: string;
    location: GeoPoint | null;
    cityId: string;
  };
  timeZone: string;
}
