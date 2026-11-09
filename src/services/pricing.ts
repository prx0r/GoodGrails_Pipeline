import { EvidenceType, SeedBook } from '../types/domain';

/**
 * Pure pricing helpers. These deliberately NEVER promote an asking price to a
 * "sold" price; evidence type is carried through and used to weight ranges.
 */

export interface EvidenceInput {
  evidence_type: EvidenceType | string;
  price_minor: number;
  condition?: string | null;
}

export interface PriceRange {
  quick_minor: number | null;
  balanced_minor: number | null;
  patient_minor: number | null;
  offer_floor_minor: number | null;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

/**
 * The handoff evidence CSV uses human labels such as "2024 auction sold
 * hammer" and "Current asking". Map those to the canonical evidence types;
 * never silently upgrade an ask to a sold observation.
 */
export function normalizeEvidenceType(raw: string | null | undefined): EvidenceType {
  const s = (raw || '').toLowerCase();
  if (s.includes('withdraw')) return 'withdrawn_ask';
  if (s.includes('auction')) return 'auction_hammer';
  if (s.includes('sold') || s.includes('hammer')) return 'sold';
  if (s.includes('retail') || s.includes('new')) return 'new_retail';
  return 'active_ask';
}

const CONDITION_MULTIPLIER: Record<string, number> = {
  'fine': 1.2,
  'like new': 1.15,
  'very good': 1.08,
  'good': 1.0,
  'acceptable': 0.85,
  'poor': 0.7
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function conditionMultiplier(condition?: string | null): number {
  if (!condition) return 1;
  const key = condition.toLowerCase().trim();
  for (const [label, mult] of Object.entries(CONDITION_MULTIPLIER)) {
    if (key.startsWith(label)) return mult;
  }
  return 1;
}

function roundTo99(minor: number): number {
  if (minor <= 0) return 0;
  const pounds = Math.ceil(minor / 100);
  return Math.max(99, pounds * 100 - 1);
}

/**
 * Build a three-tier recommendation from observed market evidence.
 * Falls back to the supplied research figures only when there is no numeric
 * evidence at all. The two are reported separately in the rationale.
 */
export function recommendPrice(
  evidence: EvidenceInput[],
  supplied?: SeedBook['price'] | null
): PriceRange {
  const sold = evidence
    .filter(e => e.evidence_type === 'sold' || e.evidence_type === 'auction_hammer')
    .map(e => e.price_minor)
    .filter(n => Number.isFinite(n) && n > 0);
  const asks = evidence
    .filter(e => e.evidence_type === 'active_ask')
    .map(e => e.price_minor)
    .filter(n => Number.isFinite(n) && n > 0);
  const retail = evidence
    .filter(e => e.evidence_type === 'new_retail')
    .map(e => e.price_minor)
    .filter(n => Number.isFinite(n) && n > 0);

  const soldMedian = median(sold);
  const askMedian = median(asks);

  let quick: number | null = null;
  let balanced: number | null = null;
  let patient: number | null = null;
  let confidence: PriceRange['confidence'] = 'low';
  const parts: string[] = [];

  if (soldMedian !== null) {
    // Realised evidence: strongest signal. Quick sale undercuts the median,
    // patient waits above it. Auction hammers are not retail proceeds.
    quick = roundTo99(Math.round(soldMedian * 0.85));
    balanced = roundTo99(soldMedian);
    patient = roundTo99(Math.round(soldMedian * 1.25));
    confidence = sold.length >= 2 ? 'high' : 'medium';
    parts.push(`${sold.length} sold/auction observation(s), median ${money(soldMedian)}`);
  } else if (askMedian !== null) {
    // Asking prices are NOT sales. Discount them for a realistic net ask.
    quick = roundTo99(Math.round(askMedian * 0.6));
    balanced = roundTo99(Math.round(askMedian * 0.8));
    patient = roundTo99(Math.round(askMedian * 1.05));
    confidence = asks.length >= 3 ? 'medium' : 'low';
    parts.push(`${asks.length} active asking observation(s), median ${money(askMedian)} — not verified sales`);
  }

  // Supplied research is a starting point, never an oracle.
  if (balanced === null && supplied?.balanced_minor) balanced = supplied.balanced_minor;
  if (quick === null && supplied?.quick_minor) quick = supplied.quick_minor;
  if (patient === null && supplied?.patient_minor) patient = supplied.patient_minor;

  if (soldMedian === null && askMedian === null && balanced !== null) {
    parts.push('no numeric comps; using supplied provisional research');
    confidence = 'low';
  }

  if (retail.length > 0) {
    const retailMin = Math.min(...retail);
    if (balanced !== null && balanced > retailMin) {
      balanced = roundTo99(Math.round(retailMin * 0.8));
      if (patient !== null && patient > retailMin) patient = roundTo99(retailMin);
      parts.push('capped below cheapest new-retail reference');
    }
  }

  const floorBase = quick ?? balanced;
  const offerFloor =
    floorBase === null ? (supplied?.offer_floor_minor ?? null) : roundTo99(Math.round(floorBase * 0.8));

  return {
    quick_minor: quick,
    balanced_minor: balanced,
    patient_minor: patient,
    offer_floor_minor: offerFloor,
    confidence,
    rationale: parts.join('; ') || 'insufficient evidence'
  };
}

/** Apply a physical-copy condition adjustment to a recommendation. */
export function applyCondition(
  range: PriceRange,
  condition?: string | null
): PriceRange {
  const mult = conditionMultiplier(condition);
  if (mult === 1) return range;
  const adjust = (v: number | null) => (v === null ? null : roundTo99(Math.round(v * mult)));
  return {
    ...range,
    quick_minor: adjust(range.quick_minor),
    balanced_minor: adjust(range.balanced_minor),
    patient_minor: adjust(range.patient_minor),
    offer_floor_minor: adjust(range.offer_floor_minor),
    rationale: `${range.rationale}; condition adjustment x${mult}`
  };
}

export function money(minor: number): string {
  return `£${(minor / 100).toFixed(2)}`;
}
