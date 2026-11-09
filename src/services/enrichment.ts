import { Env, AIEnrichment, Review } from '../types';

/**
 * AI Enrichment Service
 * Uses AI to generate vibe tags, emotional tone, and other enrichment data
 */
export class EnrichmentService {
  constructor(_env: Env) {}

  /**
   * Generate AI enrichment data for a book
   * Uses OpenAI GPT-4o-mini for now (can be replaced with Cloudflare Workers AI)
   */
  async enrichBook(
    title: string,
    author: string,
    description?: string,
    reviews?: Review[]
  ): Promise<AIEnrichment> {
    try {
      // For MVP, we'll create a simple enrichment
      // In production, this would call GPT-4o-mini or similar

      // Simple keyword extraction from description
      const vibe_keywords = this.extractVibeKeywords(description);
      const themes = this.extractThemes(description);

      return {
        emotional_tone: this.inferEmotionalTone(description),
        shock_factor: this.calculateShockFactor(description, reviews),
        pace: this.inferPace(description),
        atmosphere: this.inferAtmosphere(description),
        vibe_keywords,
        themes,
        similar_to: []
      };
    } catch (error) {
      console.error('Enrichment error:', error);
      // Return minimal enrichment on failure
      return {
        vibe_keywords: `${title} by ${author}`,
        themes: []
      };
    }
  }

  // ========== SIMPLE HEURISTIC METHODS (Fallback) ==========

  private extractVibeKeywords(description?: string): string {
    if (!description) return '';

    // Simple keyword extraction - take first 100 chars
    return description.substring(0, 100).trim();
  }

  private extractThemes(description?: string): string[] {
    if (!description) return [];

    const commonThemes = [
      'love', 'death', 'war', 'family', 'identity', 'power',
      'betrayal', 'revenge', 'redemption', 'coming-of-age',
      'mystery', 'adventure', 'romance', 'tragedy'
    ];

    const lowerDesc = description.toLowerCase();
    return commonThemes.filter(theme => lowerDesc.includes(theme));
  }

  private inferEmotionalTone(description?: string): string[] {
    if (!description) return ['neutral'];

    const lowerDesc = description.toLowerCase();
    const tones: string[] = [];

    const toneKeywords = {
      dark: ['dark', 'grim', 'bleak', 'sinister', 'ominous'],
      uplifting: ['hope', 'joy', 'triumph', 'inspiring', 'uplifting'],
      melancholic: ['sad', 'melancholic', 'sorrowful', 'tragic', 'loss'],
      humorous: ['funny', 'witty', 'comedy', 'humorous', 'satire'],
      intense: ['intense', 'gripping', 'powerful', 'visceral', 'raw']
    };

    for (const [tone, keywords] of Object.entries(toneKeywords)) {
      if (keywords.some(kw => lowerDesc.includes(kw))) {
        tones.push(tone);
      }
    }

    return tones.length > 0 ? tones : ['neutral'];
  }

  private calculateShockFactor(description?: string, _reviews?: Review[]): number {
    // Simple heuristic - check for shock-related keywords
    const shockKeywords = [
      'shocking', 'disturbing', 'graphic', 'controversial',
      'provocative', 'unsettling', 'dark', 'twisted'
    ];

    let score = 5; // Base score

    if (description) {
      const lowerDesc = description.toLowerCase();
      const matches = shockKeywords.filter(kw => lowerDesc.includes(kw));
      score += matches.length;
    }

    return Math.min(Math.max(score, 1), 10);
  }

  private inferPace(description?: string): string {
    if (!description) return 'moderate';

    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('slow') || lowerDesc.includes('meditative')) {
      return 'slow_burn';
    }

    if (lowerDesc.includes('fast') || lowerDesc.includes('thriller') || lowerDesc.includes('action')) {
      return 'fast_paced';
    }

    return 'moderate';
  }

  private inferAtmosphere(description?: string): string[] {
    if (!description) return [];

    const lowerDesc = description.toLowerCase();
    const atmospheres: string[] = [];

    const atmosphereKeywords = {
      atmospheric: ['atmospheric', 'immersive', 'vivid'],
      dark: ['dark', 'gothic', 'noir'],
      light: ['light', 'cheerful', 'bright'],
      mysterious: ['mystery', 'mysterious', 'enigmatic'],
      romantic: ['romantic', 'love', 'passion']
    };

    for (const [atmosphere, keywords] of Object.entries(atmosphereKeywords)) {
      if (keywords.some(kw => lowerDesc.includes(kw))) {
        atmospheres.push(atmosphere);
      }
    }

    return atmospheres;
  }
}
