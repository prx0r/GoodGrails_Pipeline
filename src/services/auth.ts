import { Env } from '../types';
import { errorResponse } from '../utils/helpers';

/**
 * Admin authentication.
 *
 * The original GoodGrails admin routes were completely unauthenticated. This
 * gates every mutating and private route behind a bearer token stored as the
 * ADMIN_TOKEN Worker secret. If the secret is not configured we fail closed
 * (503) rather than silently exposing the API.
 */

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Returns a Response when the request must be rejected, or null when it is
 * authorised. Callers should `const denied = requireAdmin(...); if (denied) return denied;`
 */
export function requireAdmin(request: Request, env: Env): Response | null {
  const configured = (env.ADMIN_TOKEN || '').trim();
  if (!configured) {
    return errorResponse(
      'Admin authentication is not configured. Set the ADMIN_TOKEN secret before using the admin API.',
      503
    );
  }
  const supplied = getBearerToken(request);
  if (!supplied) {
    return errorResponse('Authentication required', 401);
  }
  if (!constantTimeEqual(supplied, configured)) {
    return errorResponse('Invalid credentials', 403);
  }
  return null;
}

/** Short-lived HMAC-signed token helper for future OAuth/webhook use. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
