import { afterAll } from 'vitest';
import { createPostgresStorage } from '../../../src/repository/postgres/createPostgresStorage.js';
import { createTestPool, resetDatabase } from '../../support/testDatabase.js';
import { describeRepositoryContract } from '../repository.contract.js';

const pool = createTestPool();
afterAll(() => pool.end());

describeRepositoryContract('postgres', async () => {
  await resetDatabase(pool);
  return createPostgresStorage(pool);
});
