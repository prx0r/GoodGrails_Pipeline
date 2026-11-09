import { describe, expect, it } from 'vitest';
import { createTestEnv } from './fakeD1';
import { requireAdmin } from '../src/services/auth';

function request(auth?: string) {
  return new Request('https://example.com/api/admin/overview', {
    headers: auth ? { Authorization: auth } : {}
  });
}

describe('admin authentication', () => {
  it('fails closed when ADMIN_TOKEN is not configured', () => {
    const env = createTestEnv({ ADMIN_TOKEN: '' });
    const res = requireAdmin(request('Bearer anything'), env);
    expect(res?.status).toBe(503);
  });

  it('rejects unauthenticated requests', () => {
    const res = requireAdmin(request(), createTestEnv());
    expect(res?.status).toBe(401);
  });

  it('rejects wrong tokens', () => {
    const res = requireAdmin(request('Bearer nope'), createTestEnv());
    expect(res?.status).toBe(403);
  });

  it('accepts the configured bearer token', () => {
    const res = requireAdmin(request('Bearer test-token'), createTestEnv());
    expect(res).toBeNull();
  });
});
