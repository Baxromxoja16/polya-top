import type { Language } from '@polya/shared-kernel';
import type { Surface } from '../../domain/pitch.js';
import type { Amenity } from '../../domain/venue.js';

export const AMENITY_LABELS: Record<Amenity, Record<Language, string>> = {
  PARKING: { uz: '🅿️ Parkovka', ru: '🅿️ Парковка' },
  SHOWER: { uz: '🚿 Dush', ru: '🚿 Душ' },
  LOCKER_ROOM: { uz: '👕 Kiyinish xonasi', ru: '👕 Раздевалка' },
  CAFE: { uz: '☕️ Kafe', ru: '☕️ Кафе' },
  STANDS: { uz: '🪑 Tribuna', ru: '🪑 Трибуна' },
  WIFI: { uz: '📶 Wi-Fi', ru: '📶 Wi-Fi' },
};

export const SURFACE_LABELS: Record<Surface, Record<Language, string>> = {
  ARTIFICIAL: { uz: "Sun'iy maysa", ru: 'Искусственный газон' },
  NATURAL: { uz: 'Tabiiy maysa', ru: 'Натуральный газон' },
  PARQUET: { uz: 'Parket', ru: 'Паркет' },
  RUBBER: { uz: 'Rezina', ru: 'Резина' },
};
