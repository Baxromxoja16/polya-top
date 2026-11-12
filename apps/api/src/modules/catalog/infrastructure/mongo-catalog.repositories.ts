import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { GeoPoint, normalizeSearchText, PhoneNumber, searchTokens } from '@polya/shared-kernel';
import { type Model, type QueryFilter, Types } from 'mongoose';
import { isDuplicateKeyError, saveVersioned } from '../../../platform/database/versioned-save.js';
import { Pitch, type PitchId } from '../domain/pitch.js';
import {
  PitchRepository,
  VenueRepository,
  type VenueSearchCriteria,
  type VenueSearchHit,
  VenueSlugTakenError,
} from '../domain/repositories.js';
import { Venue, type VenueId } from '../domain/venue.js';
import {
  PITCH_MODEL,
  type PitchDocument,
  VENUE_MODEL,
  type VenueDocument,
} from './catalog.schemas.js';

const oid = (id: string) => new Types.ObjectId(id);
const validIds = (ids: readonly string[]) =>
  ids.filter((id) => Types.ObjectId.isValid(id)).map(oid);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class MongoVenueRepository extends VenueRepository implements OnModuleInit {
  constructor(@InjectModel(VENUE_MODEL) private readonly model: Model<VenueDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: VenueId): Promise<Venue | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toVenue(await this.model.findById(id).lean<VenueDocument>().exec());
  }

  async findBySlug(slug: string): Promise<Venue | null> {
    return toVenue(await this.model.findOne({ slug }).lean<VenueDocument>().exec());
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.model.exists({ slug })) !== null;
  }

  async listByOwner(ownerId: string): Promise<Venue[]> {
    if (!Types.ObjectId.isValid(ownerId)) return [];
    return this.many({ ownerId: oid(ownerId) }, { createdAt: 1 });
  }

  async listPendingReview(): Promise<Venue[]> {
    return this.many({ status: 'PENDING_REVIEW' }, { updatedAt: 1 });
  }

  async listApprovedSince(since: Date): Promise<Venue[]> {
    return this.many({ status: 'APPROVED', approvedAt: { $gte: since } }, { approvedAt: 1 });
  }

  async findByIds(ids: readonly string[]): Promise<Venue[]> {
    return this.many({ _id: { $in: validIds(ids) } }, { name: 1 });
  }

  async findSameName(cityId: string, name: string, excludeId?: VenueId): Promise<Venue[]> {
    return this.many(
      {
        cityId: oid(cityId),
        nameKey: normalizeSearchText(name),
        ...(excludeId ? { _id: { $ne: oid(excludeId) } } : {}),
      },
      { createdAt: 1 },
    );
  }

  async search(c: VenueSearchCriteria): Promise<VenueSearchHit[]> {
    const filter: QueryFilter<VenueDocument> = { status: 'APPROVED', cityId: oid(c.cityId) };
    if (c.districtId && Types.ObjectId.isValid(c.districtId)) filter.districtId = oid(c.districtId);
    if (c.tokens?.length) {
      filter.searchTokens = { $all: c.tokens.map((t) => new RegExp(`^${escapeRegex(t)}`)) };
    }
    const offset = c.offset ?? 0;
    const wanted = offset + c.limit;

    if (!c.near) {
      const docs = await this.model
        .find(filter)
        .sort({ completeness: -1, name: 1 })
        .skip(offset)
        .limit(c.limit)
        .lean<VenueDocument[]>()
        .exec();
      return docs.map((d) => ({ venue: toVenue(d) as Venue, distanceMeters: null }));
    }

    // Avval yaqin, lokatsiyali stadionlar; keyin lokatsiyasizlar (TZ VC-2d)
    const near = await this.model
      .aggregate<VenueDocument & { distance: number }>([
        {
          $geoNear: {
            near: c.near.point.toGeoJson(),
            distanceField: 'distance',
            maxDistance: c.near.maxDistanceMeters,
            query: filter,
            spherical: true,
          },
        },
        { $limit: wanted },
      ])
      .exec();
    const hits: VenueSearchHit[] = near.map((d) => ({
      venue: toVenue(d) as Venue,
      distanceMeters: Math.round(d.distance),
    }));
    if (hits.length < wanted) {
      const rest = await this.model
        .find({ ...filter, location: null })
        .sort({ completeness: -1, name: 1 })
        .limit(wanted - hits.length)
        .lean<VenueDocument[]>()
        .exec();
      hits.push(...rest.map((d) => ({ venue: toVenue(d) as Venue, distanceMeters: null })));
    }
    return hits.slice(offset, wanted);
  }

  async save(venue: Venue): Promise<void> {
    try {
      await saveVersioned(this.model, toVenueDoc(venue), venue.version);
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new VenueSlugTakenError('Slug is taken', { slug: venue.slug });
      throw error;
    }
    venue.markPersisted();
  }

  private async many(
    filter: QueryFilter<VenueDocument>,
    sort: Record<string, 1 | -1>,
  ): Promise<Venue[]> {
    const docs = await this.model.find(filter).sort(sort).lean<VenueDocument[]>().exec();
    return docs.map((d) => toVenue(d) as Venue);
  }
}

@Injectable()
export class MongoPitchRepository extends PitchRepository implements OnModuleInit {
  constructor(@InjectModel(PITCH_MODEL) private readonly model: Model<PitchDocument>) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.model.createIndexes();
  }

  async findById(id: PitchId): Promise<Pitch | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return toPitch(await this.model.findById(id).lean<PitchDocument>().exec());
  }

  async listByVenue(venueId: string): Promise<Pitch[]> {
    return this.listByVenues([venueId]);
  }

  async listByVenues(venueIds: readonly string[]): Promise<Pitch[]> {
    const docs = await this.model
      .find({ venueId: { $in: validIds(venueIds) } })
      .sort({ createdAt: 1 })
      .lean<PitchDocument[]>()
      .exec();
    return docs.map((d) => toPitch(d) as Pitch);
  }

  async save(pitch: Pitch): Promise<void> {
    await saveVersioned(
      this.model,
      {
        _id: oid(pitch.id),
        venueId: oid(pitch.venueId),
        name: pitch.name,
        format: pitch.format,
        surface: pitch.surface,
        indoor: pitch.indoor,
        lighting: pitch.lighting,
        size: pitch.size,
        status: pitch.status,
        createdAt: pitch.createdAt,
        updatedAt: pitch.updatedAt,
        version: pitch.version + 1,
      },
      pitch.version,
    );
    pitch.markPersisted();
  }
}

function toVenueDoc(v: Venue): VenueDocument {
  return {
    _id: oid(v.id),
    ownerId: oid(v.ownerId),
    slug: v.slug,
    name: v.name,
    landmarkText: v.landmarkText,
    cityId: oid(v.cityId),
    districtId: v.districtId ? oid(v.districtId) : null,
    location: v.location?.toGeoJson() ?? null,
    description: v.description,
    phones: v.phones.map((p) => p.value),
    amenities: [...v.amenities],
    photos: [...v.photos],
    pitchDetailsComplete: v.pitchDetailsComplete,
    ratingAvg: v.rating.avg,
    ratingCount: v.rating.count,
    status: v.status,
    rejectReason: v.rejectReason,
    approvedAt: v.approvedAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    searchTokens: [...new Set(searchTokens(`${v.name} ${v.landmarkText}`))],
    nameKey: normalizeSearchText(v.name),
    completeness: v.completeness(),
    version: v.version + 1,
  };
}

function toVenue(d: VenueDocument | null): Venue | null {
  if (!d) return null;
  return Venue.reconstitute(
    d._id.toHexString() as VenueId,
    {
      ownerId: d.ownerId.toHexString(),
      slug: d.slug,
      name: d.name,
      landmarkText: d.landmarkText,
      cityId: d.cityId.toHexString(),
      districtId: d.districtId?.toHexString() ?? null,
      location: d.location ? GeoPoint.fromGeoJson(d.location) : null,
      description: d.description,
      phones: d.phones.map((p) => PhoneNumber.parse(p)),
      amenities: d.amenities,
      photos: d.photos,
      pitchDetailsComplete: d.pitchDetailsComplete ?? false,
      rating: { avg: d.ratingAvg ?? 0, count: d.ratingCount ?? 0 },
      status: d.status,
      rejectReason: d.rejectReason,
      approvedAt: d.approvedAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    },
    d.version,
  );
}

function toPitch(d: PitchDocument | null): Pitch | null {
  if (!d) return null;
  return Pitch.reconstitute(
    d._id.toHexString() as PitchId,
    {
      venueId: d.venueId.toHexString(),
      name: d.name,
      format: d.format,
      surface: d.surface,
      indoor: d.indoor,
      lighting: d.lighting,
      size: d.size,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    },
    d.version,
  );
}
