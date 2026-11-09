import { describe, expect, it } from 'vitest';
import { applyCondition, recommendPrice } from '../src/services/pricing';

describe('price recommendations', () => {
  it('never treats asking prices as sold prices', () => {
    const r = recommendPrice([{ evidence_type: 'active_ask', price_minor: 10000 }]);
    expect(r.confidence).toBe('low');
    expect(r.rationale).toContain('not verified sales');
    expect(r.balanced_minor).toBeLessThan(10000);
  });

  it('uses realised sales as the strongest signal', () => {
    const r = recommendPrice([
      { evidence_type: 'sold', price_minor: 5000 },
      { evidence_type: 'auction_hammer', price_minor: 7000 }
    ]);
    expect(r.confidence).toBe('high');
    expect(r.balanced_minor).toBe(5999);
    expect(r.quick_minor).toBeLessThan(6000);
    expect(r.patient_minor).toBeGreaterThan(6000);
  });

  it('caps a recommendation below the cheapest new-retail reference', () => {
    const r = recommendPrice([
      { evidence_type: 'active_ask', price_minor: 50000 },
      { evidence_type: 'new_retail', price_minor: 10000 }
    ]);
    expect(r.balanced_minor).toBeLessThan(10000);
  });

  it('falls back to supplied research only when no comps exist', () => {
    const r = recommendPrice([], { balanced_minor: 1299, quick_minor: 899, patient_minor: 1699 });
    expect(r.balanced_minor).toBe(1299);
    expect(r.rationale).toContain('supplied provisional research');
  });

  it('applies a visible condition adjustment', () => {
    const base = recommendPrice([{ evidence_type: 'sold', price_minor: 10000 }]);
    const adjusted = applyCondition(base, 'Acceptable');
    expect(adjusted.balanced_minor).toBeLessThan(base.balanced_minor!);
    expect(adjusted.rationale).toContain('condition adjustment');
  });
});
