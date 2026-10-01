import type { DatabaseProbe } from '../repository/ports.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  schemaVersion: string | null;
}

export class HealthService {
  constructor(private readonly probe: DatabaseProbe) {}

  async check(): Promise<HealthReport> {
    try {
      const { schemaVersion } = await this.probe.check();
      return { status: 'ok', db: 'up', schemaVersion };
    } catch {
      return { status: 'degraded', db: 'down', schemaVersion: null };
    }
  }
}
