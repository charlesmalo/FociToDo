import type { IdempotencyStore, StoredResponse } from '../ports.js';
import type { Queryable } from './rows.js';

interface StoredResponseRow {
  key: string;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  created_at: Date;
}

export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly db: Queryable) {}

  async find(key: string, notBefore: Date): Promise<StoredResponse | null> {
    const { rows } = await this.db.query<StoredResponseRow>(
      `SELECT key, request_hash, response_status, response_body, created_at
       FROM idempotency_keys WHERE key = $1 AND created_at >= $2`,
      [key, notBefore],
    );
    const row = rows[0];
    return row === undefined
      ? null
      : {
          key: row.key,
          requestHash: row.request_hash,
          status: row.response_status,
          body: row.response_body,
          createdAt: row.created_at,
        };
  }

  /**
   * Inserts the record, or replaces an expired one. A concurrent claim for the same key blocks on
   * the primary key until the first transaction finishes, then sees the live record and updates
   * nothing — so exactly one caller wins.
   */
  async claim(record: StoredResponse, notBefore: Date): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (key) DO UPDATE SET
         request_hash = EXCLUDED.request_hash,
         response_status = EXCLUDED.response_status,
         response_body = EXCLUDED.response_body,
         created_at = EXCLUDED.created_at
       WHERE idempotency_keys.created_at < $6`,
      [
        record.key,
        record.requestHash,
        record.status,
        JSON.stringify(record.body),
        record.createdAt,
        notBefore,
      ],
    );
    return result.rowCount === 1;
  }
}
