import { Env } from '../types';

/**
 * eBay Marketplace Account Deletion / Closure notification endpoint.
 *
 * Single-seller own-store app: we hold no third-party eBay member PII
 * (own inventory only, D1). Deletion notifications are therefore logged
 * and acknowledged with 200 — there is nothing to delete.
 *
 * Contract (eBay Event Notification):
 *   GET  ?challenge_code=... -> 200 application/json
 *        {"challengeResponse": sha256hex(challengeCode + verificationToken + endpointUrl)}
 *   POST (signed) -> validate lightly, log, 200 immediately.
 *
 * The endpoint URL in the hash MUST exactly match the URL saved in the
 * eBay developer portal. Configure via EBAY_DELETION_ENDPOINT, defaulting
 * to the production worker URL.
 */

export const DELETION_PATH = '/api/ebay/account-deletion';
export const DEFAULT_ENDPOINT = 'https://goodgrails-seller.tradesprior.workers.dev/api/ebay/account-deletion';

function endpointUrl(request: Request, env: Env): string {
  if (env.EBAY_DELETION_ENDPOINT) return env.EBAY_DELETION_ENDPOINT;
  // Fall back to the request's own URL (works when called at the canonical URL).
  // NOTE: for the challenge hash eBay requires the EXACT portal-saved string,
  // so prefer setting EBAY_DELETION_ENDPOINT explicitly.
  try {
    const u = new URL(request.url);
    return `${u.origin}${DELETION_PATH}`;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleDeletionChallenge(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const challengeCode = url.searchParams.get('challenge_code') || '';
  const token = env.EBAY_DELETION_VERIFICATION_TOKEN || '';
  if (!challengeCode) {
    return new Response(JSON.stringify({ error: 'challenge_code required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!token) {
    return new Response(JSON.stringify({ error: 'endpoint not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  const endpoint = endpointUrl(request, env);
  const challengeResponse = await sha256Hex(challengeCode + token + endpoint);
  return new Response(JSON.stringify({ challengeResponse }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleDeletionNotification(request: Request, _env: Env): Promise<Response> {
  try {
    const body = await request.text();
    // Single-seller store: no member PII retained. Log receipt only.
    console.log(`eBay marketplace-deletion notification received (${body.length} bytes)`);
  } catch {
    // Fall through to 200 — never fail a deletion callback.
  }
  return new Response(null, { status: 200 });
}
