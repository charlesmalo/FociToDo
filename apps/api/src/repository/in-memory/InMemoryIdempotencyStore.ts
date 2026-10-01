import type { IdempotencyStore, StoredResponse } from '../ports.js';
import type { InMemoryDatabase } from './InMemoryDatabase.js';

export class InMemoryIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: InMemoryDatabase) {}

  async find(key: string, notBefore: Date): Promise<StoredResponse | null> {
    const record = this.database.idempotency.get(key);
    return record !== undefined && record.createdAt >= notBefore ? structuredClone(record) : null;
  }

  async claim(record: StoredResponse, notBefore: Date): Promise<boolean> {
    const existing = this.database.idempotency.get(record.key);
    if (existing !== undefined && existing.createdAt >= notBefore) return false;
    this.database.idempotency.set(record.key, structuredClone(record));
    return true;
  }
}
