import { ConcurrencyConflictError } from '@polya/shared-kernel';
import type { ClientSession, Model, Types } from 'mongoose';

export interface VersionedDocument {
  _id: Types.ObjectId;
  /** Saqlanayotgan versiya = aggregate.version + 1 */
  version: number;
}

/**
 * Aggregate'ni optimistic concurrency bilan yozadi (TZ EC-B3, EC-B4):
 * - version 0 → insert
 * - aks holda `{ _id, version: eski }` sharti bilan update; topilmasa — ConcurrencyConflictError
 * Duplicate key xatosi o'zgarishsiz qaytariladi — har bir repository uni o'z domain xatosiga aylantiradi.
 */
export async function saveVersioned<T extends VersionedDocument>(
  model: Model<T>,
  doc: T,
  currentVersion: number,
  session?: ClientSession,
): Promise<void> {
  const options = session ? { session } : {};
  if (currentVersion === 0) {
    // biome-ignore lint/suspicious/noExplicitAny: native driver tiplari Mongoose generiklari bilan mos emas
    await model.collection.insertOne(doc as any, options);
    return;
  }
  const { _id, ...fields } = doc;
  const result = await model.collection.updateOne(
    { _id, version: currentVersion },
    { $set: fields },
    options,
  );
  if (result.matchedCount === 0) {
    throw new ConcurrencyConflictError('Aggregate was modified concurrently', {
      id: _id.toHexString(),
      collection: model.collection.collectionName,
    });
  }
}

export interface DuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, unknown>;
}

export function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}
