import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { GeoPoint } from '@polya/shared-kernel';
import { type Model, Types } from 'mongoose';
import { isDuplicateKeyError, saveVersioned } from '../../../platform/database/versioned-save.js';
import { City, type CityId, type DistrictId } from '../domain/city.js';
import { Landmark, type LandmarkId } from '../domain/landmark.js';
import { CityRepository, CitySlugTakenError, LandmarkRepository } from '../domain/repositories.js';
import {
  CITY_MODEL,
  type CityDocument,
  LANDMARK_MODEL,
  type LandmarkDocument,
} from './geography.schemas.js';

const oid = (id: string) => new Types.ObjectId(id);

@Injectable()
export class MongoCityRepository extends CityRepository implements OnModuleInit {
  constructor(@InjectModel(CITY_MODEL) private readonly model: Model<CityDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: CityId): Promise<City | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toCity(await this.model.findById(id).lean<CityDocument>().exec());
  }

  async findBySlug(slug: string): Promise<City | null> {
    return toCity(await this.model.findOne({ slug }).lean<CityDocument>().exec());
  }

  async list(filter: { activeOnly?: boolean } = {}): Promise<City[]> {
    const docs = await this.model
      .find(filter.activeOnly ? { isActive: true } : {})
      .sort({ order: 1, 'name.uz': 1 })
      .lean<CityDocument[]>()
      .exec();
    return docs.map((d) => toCity(d) as City);
  }

  async save(city: City): Promise<void> {
    try {
      await saveVersioned(this.model, toCityDoc(city), city.version);
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new CitySlugTakenError('City slug is taken', { slug: city.slug });
      throw error;
    }
    city.markPersisted();
  }
}

@Injectable()
export class MongoLandmarkRepository extends LandmarkRepository implements OnModuleInit {
  constructor(@InjectModel(LANDMARK_MODEL) private readonly model: Model<LandmarkDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: LandmarkId): Promise<Landmark | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toLandmark(await this.model.findById(id).lean<LandmarkDocument>().exec());
  }

  async listByCity(cityId: CityId, filter: { activeOnly?: boolean } = {}): Promise<Landmark[]> {
    const docs = await this.model
      .find({ cityId: oid(cityId), ...(filter.activeOnly ? { isActive: true } : {}) })
      .sort({ 'name.uz': 1 })
      .lean<LandmarkDocument[]>()
      .exec();
    return docs.map((d) => toLandmark(d) as Landmark);
  }

  async save(landmark: Landmark): Promise<void> {
    await saveVersioned(this.model, toLandmarkDoc(landmark), landmark.version);
    landmark.markPersisted();
  }
}

function toCityDoc(city: City): CityDocument {
  return {
    _id: oid(city.id),
    slug: city.slug,
    name: { ...city.name },
    timezone: city.timezone,
    center: city.center?.toGeoJson() ?? null,
    isActive: city.isActive,
    order: city.order,
    districts: city.districts.map((d) => ({
      _id: oid(d.id),
      name: { ...d.name },
      isActive: d.isActive,
    })),
    createdAt: city.createdAt,
    updatedAt: city.updatedAt,
    version: city.version + 1,
  };
}

function toCity(doc: CityDocument | null): City | null {
  if (!doc) return null;
  return City.reconstitute(
    doc._id.toHexString() as CityId,
    {
      slug: doc.slug,
      name: doc.name,
      timezone: doc.timezone,
      center: doc.center ? GeoPoint.fromGeoJson(doc.center) : null,
      isActive: doc.isActive,
      order: doc.order,
      districts: doc.districts.map((d) => ({
        id: d._id.toHexString() as DistrictId,
        name: d.name,
        isActive: d.isActive,
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    doc.version,
  );
}

function toLandmarkDoc(landmark: Landmark): LandmarkDocument {
  return {
    _id: oid(landmark.id),
    cityId: oid(landmark.cityId),
    name: { ...landmark.name },
    synonyms: [...landmark.synonyms],
    searchTerms: landmark.searchTerms,
    location: landmark.location.toGeoJson(),
    isActive: landmark.isActive,
    createdAt: landmark.createdAt,
    updatedAt: landmark.updatedAt,
    version: landmark.version + 1,
  };
}

function toLandmark(doc: LandmarkDocument | null): Landmark | null {
  if (!doc) return null;
  return Landmark.reconstitute(
    doc._id.toHexString() as LandmarkId,
    {
      cityId: doc.cityId.toHexString() as CityId,
      name: doc.name,
      synonyms: doc.synonyms,
      location: GeoPoint.fromGeoJson(doc.location),
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    doc.version,
  );
}
