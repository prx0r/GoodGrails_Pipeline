import { describe, expect, it } from 'vitest';
import { isbn10To13, isValidIsbn10, isValidIsbn13, parseIsbn } from '../src/services/isbn';

describe('ISBN handling', () => {
  it('preserves leading zeros and strips numeric artefacts', () => {
    expect(parseIsbn('9781591021025.0').normalized).toBe('9781591021025');
    expect(parseIsbn('0415298091').normalized).toBe('0415298091');
  });

  it('validates checksums', () => {
    expect(isValidIsbn13('9781591021025')).toBe(true);
    expect(isValidIsbn10('0415298091')).toBe(true);
    expect(isValidIsbn13('9781591021026')).toBe(false);
    expect(isValidIsbn10('0415298092')).toBe(false);
  });

  it('flags rather than trusts malformed values', () => {
    const r = parseIsbn('12345');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('unexpected length');
  });

  it('handles missing ISBN as unknown, not an error', () => {
    const r = parseIsbn(null);
    expect(r.valid).toBe(false);
    expect(r.normalized).toBeNull();
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(isbn10To13('0415298091')).toBe('9780415298094');
  });
});
