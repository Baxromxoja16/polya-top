import type { GeoJsonPoint } from '@polya/shared-kernel';
import { Schema, type Types } from 'mongoose';

export const CITY_MODEL = 'City';
export const LANDMARK_MODEL = 'Landmark';

interface LocalizedDoc {
  uz: string;
  ru: string;
}

const Localized = new Schema<LocalizedDoc>(
  { uz: { type: String, required: true }, ru: { type: String, required: true } },
  { _id: false },
);

const Point = new Schema<GeoJsonPoint>(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

export interface CityDocument {
  _id: Types.ObjectId;
  slug: string;
  name: LocalizedDoc;
  timezone: string;
  center: GeoJsonPoint | null;
  isActive: boolean;
  order: number;
  districts: { _id: Types.ObjectId; name: LocalizedDoc; isActive: boolean }[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export const CitySchema = new Schema<CityDocument>(
  {
    slug: { type: String, required: true },
    name: { type: Localized, required: true },
    timezone: { type: String, required: true },
    center: { type: Point, default: null },
    isActive: { type: Boolean, required: true },
    order: { type: Number, default: 0 },
    districts: [
      new Schema(
        { name: { type: Localized, required: true }, isActive: { type: Boolean, required: true } },
        { _id: true },
      ),
    ],
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'cities', versionKey: false },
);
CitySchema.index({ slug: 1 }, { unique: true, name: 'uniq_slug' });
CitySchema.index({ isActive: 1, order: 1 }, { name: 'active_order' });

export interface LandmarkDocument {
  _id: Types.ObjectId;
  cityId: Types.ObjectId;
  name: LocalizedDoc;
  synonyms: string[];
  /** Denormalizatsiya: normallashtirilgan nomlar — qidiruvda to'g'ridan-to'g'ri solishtiriladi */
  searchTerms: string[];
  location: GeoJsonPoint;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export const LandmarkSchema = new Schema<LandmarkDocument>(
  {
    cityId: { type: Schema.Types.ObjectId, required: true },
    name: { type: Localized, required: true },
    synonyms: { type: [String], default: [] },
    searchTerms: { type: [String], default: [] },
    location: { type: Point, required: true },
    isActive: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { collection: 'landmarks', versionKey: false },
);
LandmarkSchema.index({ location: '2dsphere' }, { name: 'geo_location' });
LandmarkSchema.index({ cityId: 1, isActive: 1 }, { name: 'city_active' });
