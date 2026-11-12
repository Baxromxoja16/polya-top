import { DomainError } from '@polya/shared-kernel';

/**
 * Amalni bajaruvchi (interfeys qatlami Identity'dan oladi). Catalog Identity'ning ichiga kirmaydi.
 */
export interface Actor {
  userId: string;
  roles: readonly string[];
  phone: string | null;
  cityId: string | null;
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

export const isAdminActor = (actor: Actor) => actor.roles.includes('ADMIN');

/** TZ 3: resurs darajasida tekshiruv — Owner faqat o'z stadionini boshqaradi (Admin — hammasini). */
export function assertCanManage(actor: Actor, ownerId: string): void {
  if (actor.userId !== ownerId && !isAdminActor(actor)) {
    throw new ForbiddenError('Only the owner can manage this venue');
  }
}
