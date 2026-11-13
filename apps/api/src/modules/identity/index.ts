/**
 * Identity kontekstining ochiq API'si. Boshqa kontekstlar FAQAT shu fayldan import qiladi
 * (dependency-cruiser: module-boundaries).
 */
export { IdentityQueries, type UserContactView } from './application/identity.queries.js';
export { type AudienceMember, MarketingAudience } from './application/marketing-audience.js';
export {
  type BlockUserError,
  SetUserBlockedUseCase,
} from './application/update-profile.use-cases.js';
export { IdentityModule } from './identity.module.js';
export { PhoneGate } from './interface/telegram/phone-gate.js';
