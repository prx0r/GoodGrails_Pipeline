import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

// Mirrors src/routes/ebayDeletion.ts challenge contract:
// challengeResponse = sha256hex(challengeCode + verificationToken + endpointUrl)
describe('ebay account-deletion challenge', () => {
  it('hashes challengeCode + token + endpoint in order', async () => {
    const challengeCode = 'abc123';
    const token = 'test-token_01';
    const endpoint = 'https://goodgrails-seller.tradesprior.workers.dev/api/ebay/account-deletion';
    const expected = createHash('sha256').update(challengeCode + token + endpoint).digest('hex');
    const subtle = globalThis.crypto.subtle;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(challengeCode + token + endpoint));
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe(expected);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});
