import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import { problemDetailsSchema } from '@polya/contracts';
import { DomainError } from '@polya/shared-kernel';
import { describe, expect, it } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter.js';

class ClosedError extends DomainError {
  readonly code = 'CAMPAIGN_CLOSED';
}

function render(exception: unknown) {
  let status = 0;
  let body: unknown;
  const reply = {
    status(s: number) {
      status = s;
      return this;
    },
    header() {
      return this;
    },
    send(b: unknown) {
      body = b;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ url: '/x', id: 'r1' }), getResponse: () => reply }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return { status, body: problemDetailsSchema.parse(body) };
}

describe('ProblemDetailsFilter', () => {
  it('domain error details never override the core members', () => {
    const { status, body } = render(
      new ClosedError('Campaign is closed', { status: 'CLOSED', code: 'X', id: 'c1' }),
    );
    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({ status: 422, code: 'CAMPAIGN_CLOSED', id: 'c1' });
  });

  it('http exception extensions never override the core members', () => {
    const { body } = render(new UnauthorizedException({ code: 'TOKEN_EXPIRED', status: 999 }));
    expect(body).toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
  });

  it('413 has a stable readable code', () => {
    expect(render(new PayloadTooLargeException()).body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('unknown errors become 500 without internals', () => {
    const { status, body } = render(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
