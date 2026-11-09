import {
  OpenLibraryData,
  GoogleBooksData,
  ExternalMetadata,
  BookMetadata
} from '../types';
import { BookstoreError, normalizeISBN } from '../utils/helpers';

/**
 * Metadata Fetching Service
 * Fetches book metadata from Open Library and Google Books APIs
 */
export class MetadataService {
  private readonly OPEN_LIBRARY_API = 'https://openlibrary.org';
  private readonly GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1';

  /**
   * Fetch metadata from all sources and merge
   */
  async fetchMetadata(isbn: string): Promise<ExternalMetadata> {
    const normalizedISBN = normalizeISBN(isbn);

    const [openLibrary, googleBooks] = await Promise.allSettled([
      this.fetchOpenLibrary(normalizedISBN),
      this.fetchGoogleBooks(normalizedISBN)
    ]);

    const metadata: ExternalMetadata = {};

    if (openLibrary.status === 'fulfilled') {
      metadata.open_library = openLibrary.value;
    }

    if (googleBooks.status === 'fulfilled') {
      metadata.google_books = googleBooks.value;
    }

    // If both failed, throw error
    if (!metadata.open_library && !metadata.google_books) {
      throw new BookstoreError(
        `Could not fetch metadata for ISBN: ${isbn}`,
        404
      );
    }

    return metadata;
  }

  /**
   * Merge metadata from multiple sources into a single BookMetadata object
   */
  mergeMetadata(external: ExternalMetadata): {
    title: string;
    author: string;
    description?: string;
    cover_url?: string;
    metadata: BookMetadata;
  } {
    const ol = external.open_library;
    const gb = external.google_books;

    // Prefer Google Books for most fields (usually more complete)
    const title = gb?.title || ol?.title || 'Unknown Title';
    const author = this.extractAuthor(gb, ol);
    const description = gb?.description || ol?.description;
    const cover_url = this.extractCoverUrl(gb, ol);

    const metadata: BookMetadata = {
      publisher: gb?.publisher || ol?.publishers?.[0],
      publish_date: gb?.publishedDate || ol?.publish_date,
      page_count: gb?.pageCount || ol?.number_of_pages,
      language: 'en', // Default to English
      categories: gb?.categories || ol?.subjects?.slice(0, 5),
      isbn_13: this.extractISBN13(gb, ol),
      average_rating: gb?.averageRating,
      ratings_count: gb?.ratingsCount
    };

    return {
      title,
      author,
      description,
      cover_url,
      metadata
    };
  }

  // ========== OPEN LIBRARY ==========

  private async fetchOpenLibrary(isbn: string): Promise<OpenLibraryData | null> {
    try {
      // Try ISBN search
      const response = await fetch(
        `${this.OPEN_LIBRARY_API}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
      );

      if (!response.ok) {
        console.warn(`Open Library API error: ${response.status}`);
        return null;
      }

      const data: any = await response.json();
      const bookKey = `ISBN:${isbn}`;

      if (!data[bookKey]) {
        console.warn(`No Open Library data for ISBN: ${isbn}`);
        return null;
      }

      const book = data[bookKey];

      return {
        title: book.title,
        authors: book.authors || [],
        description: book.notes || book.subtitle,
        cover_url: book.cover?.large || book.cover?.medium,
        publish_date: book.publish_date,
        publishers: book.publishers?.map((p: any) => p.name),
        number_of_pages: book.number_of_pages,
        subjects: book.subjects?.map((s: any) => s.name)
      };
    } catch (error) {
      console.error('Open Library fetch error:', error);
      return null;
    }
  }

  // ========== GOOGLE BOOKS ==========

  private async fetchGoogleBooks(isbn: string): Promise<GoogleBooksData | null> {
    try {
      const response = await fetch(
        `${this.GOOGLE_BOOKS_API}/volumes?q=isbn:${isbn}`
      );

      if (!response.ok) {
        console.warn(`Google Books API error: ${response.status}`);
        return null;
      }

      const data: any = await response.json();

      if (!data.items || data.items.length === 0) {
        console.warn(`No Google Books data for ISBN: ${isbn}`);
        return null;
      }

      const book = data.items[0].volumeInfo;

      return {
        title: book.title,
        authors: book.authors || [],
        description: book.description,
        cover_url: book.imageLinks?.large || book.imageLinks?.thumbnail?.replace('zoom=1', 'zoom=2'),
        publishedDate: book.publishedDate,
        publisher: book.publisher,
        pageCount: book.pageCount,
        categories: book.categories,
        averageRating: book.averageRating,
        ratingsCount: book.ratingsCount
      };
    } catch (error) {
      console.error('Google Books fetch error:', error);
      return null;
    }
  }

  // ========== HELPER METHODS ==========

  private extractAuthor(gb?: GoogleBooksData | null, ol?: OpenLibraryData | null): string {
    if (gb?.authors && gb.authors.length > 0) {
      return gb.authors.join(', ');
    }

    if (ol?.authors && ol.authors.length > 0) {
      return ol.authors.map(a => a.name).join(', ');
    }

    return 'Unknown Author';
  }

  private extractCoverUrl(gb?: GoogleBooksData | null, ol?: OpenLibraryData | null): string | undefined {
    // Prefer high-quality cover
    if (gb?.cover_url) return gb.cover_url;
    if (ol?.cover_url) return ol.cover_url;

    // Try to construct Open Library cover URL from ISBN if available
    // This is a fallback that often works
    return undefined;
  }

  private extractISBN13(gb?: GoogleBooksData | null, _ol?: OpenLibraryData | null): string | undefined {
    // Try to find ISBN-13 from industry identifiers in Google Books
    if (gb) {
      return undefined; // Could extract from volumeInfo.industryIdentifiers if needed
    }
    return undefined;
  }

  /**
   * Calculate suggested sell price based on market data and condition
   */
  calculateSuggestedPrice(
    costPrice: number,
    condition: string,
    _marketPrices?: number[]
  ): number {
    // Simple markup calculation
    // In production, this would be more sophisticated
    const baseMarkup = 3.0; // 3x markup
    let conditionMultiplier = 1.0;

    switch (condition) {
      case 'like_new':
        conditionMultiplier = 1.2;
        break;
      case 'very_good':
        conditionMultiplier = 1.1;
        break;
      case 'good':
        conditionMultiplier = 1.0;
        break;
      case 'acceptable':
        conditionMultiplier = 0.8;
        break;
    }

    const calculatedPrice = costPrice * baseMarkup * conditionMultiplier;

    // Round to nearest 0.99
    const rounded = Math.ceil(calculatedPrice) - 0.01;

    return Math.round(rounded * 100); // Convert to pence
  }
}
