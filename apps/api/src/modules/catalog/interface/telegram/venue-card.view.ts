import type { Language } from '@polya/shared-kernel';
import type { VenueCardView, VenueListItem } from '../../application/catalog.queries.js';
import { formatSum } from './catalog.messages.js';
import { searchMessages } from './player-search.messages.js';
import { AMENITY_LABELS, SURFACE_LABELS } from './venue-labels.js';

/** TZ VC-7: stadion kartochkasi matni. */
export function venueCardText(card: VenueCardView, lang: Language): string {
  const m = searchMessages[lang];
  const v = card.venue;
  const lines = [`🏟 ${v.name}`, `📍 ${v.landmarkText}`];
  if (card.districtName) lines.push(`🏘 ${card.districtName[lang]}`);
  lines.push(`📞 ${m.phones}: ${v.phones.map((p) => p.format()).join(', ')}`);
  if (v.amenities.length)
    lines.push(`✨ ${v.amenities.map((a) => AMENITY_LABELS[a][lang]).join(' · ')}`);
  if (v.description) lines.push('', v.description);
  lines.push('');
  for (const p of card.pitches) {
    const details = [p.format, p.surface ? SURFACE_LABELS[p.surface][lang] : null, p.size].filter(
      Boolean,
    );
    const hours = p.setup?.uniformHours?.format() ?? '—';
    const price = p.setup?.basePricePerHour
      ? `${formatSum(p.setup.basePricePerHour.amount)} ${m.perHour}`
      : '—';
    lines.push(
      `⚽ ${p.name}${details.length ? ` (${details.join(', ')})` : ''}`,
      `   🕒 ${hours} · 💰 ${price}`,
    );
  }
  return lines.join('\n');
}

export function distanceLabel(meters: number | null, lang: Language): string | null {
  if (meters === null) return null;
  const m = searchMessages[lang];
  return meters < 1000 ? m.m(Math.round(meters / 10) * 10) : m.km((meters / 1000).toFixed(1));
}

/** Ro'yxat qatori: "1. Olmaliq Arena · 1.2 km · 150 000 so'm dan" */
export function listLine(item: VenueListItem, index: number, lang: Language): string {
  const m = searchMessages[lang];
  const parts = [
    `${index}. ${item.venue.name}`,
    distanceLabel(item.distanceMeters, lang),
    item.minPricePerHour ? m.priceFrom(formatSum(item.minPricePerHour.amount)) : null,
  ].filter(Boolean);
  return `${parts.join(' · ')}\n   📍 ${item.venue.landmarkText}`;
}
