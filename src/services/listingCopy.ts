/**
 * Listing-draft generation from verified data only.
 *
 * The generator is deliberately conservative: anything not verified on the
 * physical copy is omitted, never invented. Unverified facts are surfaced as
 * explicit checklist items for a human to confirm before publishing.
 */

export interface DraftInput {
  sku: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  publicationYear?: number | null;
  binding?: string | null;
  edition?: string | null;
  condition?: string | null;
  jacketCondition?: string | null;
  signed?: string | null;
  notes?: string | null;
  verificationStatus?: string | null;
  priceMinor?: number | null;
}

export interface ListingDraft {
  title: string;
  ebayTitle: string;
  description: string;
  amazonConditionNote: string;
  checklist: string[];
  warnings: string[];
}

function priceLabel(minor?: number | null): string {
  return minor ? `£${(minor / 100).toFixed(2)}` : '';
}

function firstSentence(text: string): string {
  const match = text.match(/^(.+?[.!?])\s/);
  return (match ? match[1] : text).slice(0, 300).trim();
}

export function buildListingDraft(input: DraftInput): ListingDraft {
  const checklist: string[] = [];
  const warnings: string[] = [];

  const verified = input.verificationStatus && input.verificationStatus !== 'unverified';
  if (!verified) warnings.push('Bibliographic/photo verification incomplete — do not publish yet.');

  const bibliographic = [
    input.title,
    input.author ? `by ${input.author}` : null,
    input.publisher ? `(${input.publisher}${input.publicationYear ? `, ${input.publicationYear}` : ''})` : null
  ].filter(Boolean).join(' ');

  const physical: string[] = [];
  if (input.binding) physical.push(input.binding);
  if (input.edition) physical.push(input.edition);
  if (input.condition) physical.push(`Condition: ${input.condition}`);
  if (input.jacketCondition) physical.push(`Jacket: ${input.jacketCondition}`);
  if (input.signed) physical.push(`Signed: ${input.signed}`);

  const descriptionLines = [
    bibliographic + '.',
    physical.length ? physical.join('. ') + '.' : 'Physical condition not yet verified.',
    input.notes ? firstSentence(input.notes) : '',
    input.isbn ? `ISBN: ${input.isbn}.` : '',
    input.sku ? `Inventory reference: ${input.sku}.` : '',
    'Photographs show the actual copy offered. Please message with any questions about edition or condition.'
  ].filter(Boolean);

  if (!input.condition) checklist.push('Record the exact physical condition');
  if (!input.isbn) checklist.push('Confirm edition/ISBN on the title or copyright page');
  if (!input.jacketCondition && /hardcover/i.test(input.binding || '')) checklist.push('Record dust-jacket condition');
  if (input.signed && /yes|signed/i.test(input.signed)) checklist.push('Photograph the signature for the listing');
  if (input.edition && /first/i.test(input.edition)) checklist.push('Confirm first edition vs first printing on the copyright page');
  checklist.push('Add front, back, spine, title/copyright page and defect photos');

  const ebayTitle = [
    input.author || '',
    input.title,
    input.edition || '',
    input.binding || '',
    input.condition ? input.condition.split('(')[0].trim() : ''
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 80);

  const amazonConditionNote = [
    input.condition ? `Condition: ${input.condition}.` : 'Condition as photographed.',
    input.jacketCondition ? `Jacket: ${input.jacketCondition}.` : '',
    input.notes ? firstSentence(input.notes) : '',
    'Actual copy photographed; see images for details.'
  ].filter(Boolean).join(' ').slice(0, 500);

  return {
    title: bibliographic,
    ebayTitle,
    description: descriptionLines.join('\n\n'),
    amazonConditionNote,
    checklist,
    warnings
  };
}

export function draftPriceLabel(minor?: number | null): string {
  return priceLabel(minor);
}
