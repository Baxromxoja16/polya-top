import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RequestValidationError, ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  hours: z.coerce.number().int().min(1).max(3),
  pitch: z.object({ id: z.string().length(24) }),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed (coerced) data', () => {
    expect(pipe.transform({ hours: '2', pitch: { id: 'a'.repeat(24) } })).toEqual({
      hours: 2,
      pitch: { id: 'a'.repeat(24) },
    });
  });

  it('reports every issue with a dotted path', () => {
    try {
      pipe.transform({ hours: 5, pitch: { id: 'x' } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RequestValidationError);
      const paths = (e as RequestValidationError).issues.map((i) => i.path).sort();
      expect(paths).toEqual(['hours', 'pitch.id']);
    }
  });
});
