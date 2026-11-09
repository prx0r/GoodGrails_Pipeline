/**
 * ISBN normalisation and checksum validation.
 * ISBNs are identifiers, never numbers: leading zeros and check digits must
 * survive. The original handoff CSV contained artefacts such as
 * "9781591021025.0" and a lost leading zero, so we validate rather than trust.
 */

export interface IsbnResult {
  raw: string | null;
  normalized: string | null;
  format: 'isbn10' | 'isbn13' | null;
  valid: boolean;
  reason?: string;
}

export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw)
    .trim()
    .replace(/\.0+$/, '')          // numeric-parse artefact: 9781591021025.0
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
  return cleaned.length ? cleaned : null;
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = isbn[i];
    const value = char === 'X' ? 10 : Number(char);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

export function parseIsbn(raw: string | null | undefined): IsbnResult {
  const normalized = normalizeIsbn(raw);
  if (!normalized) {
    return { raw: raw ?? null, normalized: null, format: null, valid: false, reason: 'missing' };
  }
  if (normalized.length === 10) {
    const valid = isValidIsbn10(normalized);
    return {
      raw: String(raw),
      normalized,
      format: 'isbn10',
      valid,
      reason: valid ? undefined : 'bad checksum (isbn10)'
    };
  }
  if (normalized.length === 13) {
    const valid = isValidIsbn13(normalized);
    return {
      raw: String(raw),
      normalized,
      format: 'isbn13',
      valid,
      reason: valid ? undefined : 'bad checksum (isbn13)'
    };
  }
  return {
    raw: String(raw),
    normalized,
    format: null,
    valid: false,
    reason: `unexpected length ${normalized.length}`
  };
}

/** Convert a valid ISBN-10 to ISBN-13 (978 prefix). */
export function isbn10To13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const body = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}
