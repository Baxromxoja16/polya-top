import type { GeoJsonPoint } from '@polya/shared-kernel';
import { Schema, type Types } from 'mongoose';
import type { PitchFormat, PitchStatus, Surface } from '../domain/pitch.js';
import type { Amenity, VenueStatus } from '../domain/venue.js';

export const VENUE_MODEL = 'Venue';
export const PITCH_MODEL = 'Pitch';

export interface VenueDocument {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  slug: string;
  name: string;
  landmarkText: string;
  cityId: Types.ObjectId;
  districtId: Types.ObjectId | null;
  location: GeoJsonPoint | null;
  description: string | null;
  phones: string[];
  amenities: Amenity[];
  photos: string[];
  pitchDetailsComplete: boolean;
  status: VenueStatus;
  rejectReason: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // --- denormalizatsiya (qidiruv) ---
  /** Nom + orientirning normallashtirilgan tokenlari (TZ VC-4a) */
  searchTokens: string[];
  /** Normallashtirilgan nom — dublikatni aniqlash (EC-B18) */
  nameKey: string;
  completeness: number;
  version: number;
}

const Point = new Schema<GeoJsonPoint>(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

export const VenueSchema = new Schema<VenueDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    landmarkText: { type: String, required: true },
    cityId: { type: Schema.Types.ObjectId, required: true },
    districtId: { type: Schema.Types.ObjectId, default: null },
    location: { type: Point, default: null },
    description: { type: String, default: null },
    phones: { type: [String], default: [] },
    amenities: { type: [String], default: [] },
    photos: { type: [String], default: [] },
    pitchDetailsComplete: { type: Boolean, default: false },
    status: { type: String, required: true },
    rejectReason: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    searchTokens: { type: [String], default: [] },
    nameKey: { type: String, required: true },
    completeness: { type: Number, default: 0 },
    version: { type: Number, required: true },
  },
  { collection: 'venues', versionKey: false },
);
VenueSchema.index({ slug: 1 }, { unique: true, name: 'uniq_slug' });
VenueSchema.index({ ownerId: 1 }, { name: 'owner' });
VenueSchema.index({ location: '2dsphere' }, { name: 'geo_location' });
VenueSchema.index({ status: 1, cityId: 1, districtId: 1, completeness: -1 }, { name: 'catalog' });
VenueSchema.index({ status: 1, cityId: 1, searchTokens: 1 }, { name: 'text_tokens' });
VenueSchema.index({ cityId: 1, nameKey: 1 }, { name: 'name_key' });

export interface PitchDocument {
  _id: Types.ObjectId;
  venueId: Types.ObjectId;
  name: string;
  format: PitchFormat | null;
  surface: Surface | null;
  indoor: boolean | null;
  lighting: boolean | null;
  size: string | null;
  status: PitchStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export const PitchSchema = new Schema<PitchDocument>(
  {
    venueId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    format: { type: String, default: null },
    surface: { type: String, default: null },
    indoor: { type: Boolean, default: null },
    lighting: { type: Boolean, default: null },
    size: { type: String, default: null },
    status: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'pitches', versionKey: false },
);
PitchSchema.index({ venueId: 1, createdAt: 1 }, { name: 'venue' });
