import { createInMemoryStorage } from '../../../src/repository/in-memory/createInMemoryStorage.js';
import { describeRepositoryContract } from '../repository.contract.js';

describeRepositoryContract('in-memory', async () => createInMemoryStorage());
