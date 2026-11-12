import { DomainError } from '@polya/shared-kernel';

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
}
