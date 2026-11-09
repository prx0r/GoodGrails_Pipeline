/**
 * Minimal D1-compatible adapter over node:sqlite so the real migration SQL and
 * query strings can be exercised in tests without Wrangler or Miniflare.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Loaded via require so Vite does not try to resolve the newer node:sqlite builtin.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (path: string) => any };

class FakeStatement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: unknown[] = []
  ) {}

  bind(...params: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, params);
  }

  async first<T = any>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.params as any[]));
    return (row as T) ?? null;
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.params as any[]));
    return { results: rows as T[] };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const stmt = this.db.prepare(this.sql);
    const result = stmt.run(...(this.params as any[]));
    return {
      success: true,
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0)
      }
    };
  }
}

export class FakeD1 {
  readonly db: DatabaseSync;
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.db, sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  applySchema(): void {
    const schema = readFileSync(resolve(process.cwd(), 'migrations/0001_multichannel.sql'), 'utf8');
    this.db.exec(schema);
  }

  close(): void {
    this.db.close();
  }
}

export function createTestEnv(overrides: Record<string, unknown> = {}): any {
  const db = new FakeD1();
  db.applySchema();
  const r2 = new Map<string, { data: ArrayBuffer; contentType: string }>();
  return {
    DB: db,
    ASSETS: {
      put: async (key: string, data: ArrayBuffer, opts: any) => {
        r2.set(key, { data, contentType: opts?.httpMetadata?.contentType || 'application/octet-stream' });
      },
      get: async (key: string) => {
        const v = r2.get(key);
        return v ? { body: v.data, httpMetadata: { contentType: v.contentType } } : null;
      },
      delete: async (key: string) => { r2.delete(key); }
    },
    CONFIG: {},
    ADMIN_TOKEN: 'test-token',
    FRONTEND_URL: 'http://localhost',
    ADMIN_URL: 'http://localhost',
    ENVIRONMENT: 'test',
    ...overrides
  };
}
