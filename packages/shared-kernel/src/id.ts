import { randomBytes } from 'node:crypto';

/**
 * ID generatsiya porti. Aggregate ID'si domain'da yaratiladi (bazaga yozishdan oldin),
 * shuning uchun Mongo driver'iga bog'lanmagan holda ObjectId formatidagi qiymat beriladi.
 */
export abstract class IdGenerator {
  abstract next(): string;
}

/**
 * MongoDB ObjectId bilan mos 24 belgili hex: 4 bayt vaqt + 5 bayt process random + 3 bayt counter.
 */
export class ObjectIdGenerator extends IdGenerator {
  readonly #processRandom = randomBytes(5);
  #counter = randomBytes(3).readUIntBE(0, 3);

  next(): string {
    const buffer = Buffer.alloc(12);
    buffer.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
    this.#processRandom.copy(buffer, 4);
    this.#counter = (this.#counter + 1) % 0x1000000;
    buffer.writeUIntBE(this.#counter, 9, 3);
    return buffer.toString('hex');
  }
}

export const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
