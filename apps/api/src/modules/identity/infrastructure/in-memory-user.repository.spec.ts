import { describeUserRepositoryContract } from '../../../../test/contracts/user-repository.contract.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';

describeUserRepositoryContract('in-memory', () => new InMemoryUserRepository());
