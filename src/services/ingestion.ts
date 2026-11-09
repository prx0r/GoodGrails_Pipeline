import { Env, IngestBookRequest, IngestBookResponse, Book, ExternalMetadata } from '../types';
import { DatabaseService } from './database';
import { MetadataService } from './metadata';
import { StorageService } from './storage';
import { EnrichmentService } from './enrichment';
import { poundsToPence, isValidISBN, BookstoreError } from '../utils/helpers';

/**
 * Book Ingestion Orchestrator
 * Coordinates the entire book ingestion pipeline:
 * ISBN → Metadata → Enrichment → Storage → Database
 */
export class IngestionService {
  private db: DatabaseService;
  private metadata: MetadataService;
  private storage: StorageService;
  private enrichment: EnrichmentService;

  constructor(env: Env) {
    this.db = new DatabaseService(env);
    this.metadata = new MetadataService();
    this.storage = new StorageService(env);
    this.enrichment = new EnrichmentService(env);
  }

  /**
   * Main ingestion pipeline
   * Fetches metadata, enriches with AI, stores images, creates database record
   */
  async ingestBook(request: IngestBookRequest): Promise<IngestBookResponse> {
    const errors: string[] = [];

    try {
      // 1. Validate input
      if (!isValidISBN(request.isbn)) {
        throw new BookstoreError('Invalid ISBN format', 400);
      }

      if (request.cost_price <= 0) {
        throw new BookstoreError('Cost price must be greater than 0', 400);
      }

      // 2. Check if book already exists
      const existing = await this.db.getBookByISBN(request.isbn);
      if (existing) {
        throw new BookstoreError(
          `Book with ISBN ${request.isbn} already exists (ID: ${existing.id})`,
          409
        );
      }

      // 3. Fetch metadata from external sources
      console.log(`Fetching metadata for ISBN: ${request.isbn}`);
      let externalMetadata: ExternalMetadata;

      try {
        externalMetadata = await this.metadata.fetchMetadata(request.isbn);
      } catch (error) {
        throw new BookstoreError(
          `Failed to fetch metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
          404
        );
      }

      // 4. Merge and extract metadata
      const merged = this.metadata.mergeMetadata(externalMetadata);

      // Allow custom title/author override
      const title = request.custom_title || merged.title;
      const author = request.custom_author || merged.author;

      // 5. AI Enrichment (non-blocking, graceful failure)
      let ai_enrichment;
      try {
        console.log(`Enriching book: ${title}`);
        ai_enrichment = await this.enrichment.enrichBook(
          title,
          author,
          merged.description
        );
      } catch (error) {
        console.warn('AI enrichment failed, continuing without:', error);
        errors.push('AI enrichment failed - using defaults');
      }

      // 6. Upload cover image to R2 (non-blocking, graceful failure)
      let cover_url = merged.cover_url;
      if (cover_url) {
        try {
          console.log(`Uploading cover image for: ${title}`);
          // We'll upload after creating the book to get the book ID
        } catch (error) {
          console.warn('Cover upload failed, using original URL:', error);
          errors.push('Cover upload failed - using external URL');
        }
      }

      // 7. Calculate suggested price
      const cost_price_pence = poundsToPence(request.cost_price);
      const suggested_price = this.metadata.calculateSuggestedPrice(
        cost_price_pence,
        request.condition
      );

      // 8. Create book record in database
      console.log(`Creating book record for: ${title}`);

      const book: Partial<Book> = {
        isbn: request.isbn,
        title,
        author,
        description: merged.description,
        cover_url,
        condition: request.condition,
        cost_price: cost_price_pence,
        sell_price: suggested_price,
        in_stock: true,
        metadata: merged.metadata,
        vibe_tags: ai_enrichment?.vibe_keywords,
        ai_enrichment,
        status: 'pending_review' // Requires admin approval
      };

      const createdBook = await this.db.createBook(book);

      // 9. Upload cover with book ID (if we have a cover URL)
      if (cover_url && createdBook.id) {
        try {
          const uploadedCoverUrl = await this.storage.uploadBookCover(
            createdBook.id,
            cover_url
          );

          // Update book with new cover URL
          if (uploadedCoverUrl !== cover_url) {
            await this.db.updateBook(createdBook.id, {
              cover_url: uploadedCoverUrl
            });
            createdBook.cover_url = uploadedCoverUrl;
          }
        } catch (error) {
          console.warn('Cover upload failed after book creation:', error);
          errors.push('Cover upload failed - using external URL');
        }
      }

      // 10. Return response
      return {
        success: true,
        book_id: createdBook.id,
        book: createdBook,
        metadata: externalMetadata,
        suggested_price: suggested_price / 100, // Convert to pounds for display
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error('Ingestion error:', error);

      if (error instanceof BookstoreError) {
        throw error;
      }

      throw new BookstoreError(
        `Failed to ingest book: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Approve a book (admin action)
   * Moves book from 'pending_review' to 'live' status
   */
  async approveBook(
    bookId: string,
    updates?: {
      final_price?: number; // in pounds
      title?: string;
      author?: string;
      description?: string;
      vibe_tags?: string;
    }
  ): Promise<Book> {
    const book = await this.db.getBook(bookId);

    if (!book) {
      throw new BookstoreError('Book not found', 404);
    }

    if (book.status === 'live') {
      throw new BookstoreError('Book is already live', 400);
    }

    const updateData: Partial<Book> = {
      status: 'live'
    };

    // Apply any custom edits
    if (updates) {
      if (updates.final_price) {
        updateData.sell_price = poundsToPence(updates.final_price);
      }
      if (updates.title) updateData.title = updates.title;
      if (updates.author) updateData.author = updates.author;
      if (updates.description) updateData.description = updates.description;
      if (updates.vibe_tags) updateData.vibe_tags = updates.vibe_tags;
    }

    const updatedBook = await this.db.updateBook(bookId, updateData);

    if (!updatedBook) {
      throw new BookstoreError('Failed to update book', 500);
    }

    console.log(`Book approved and set to live: ${bookId}`);

    return updatedBook;
  }

  /**
   * Reject/delete a book (admin action)
   */
  async rejectBook(bookId: string): Promise<void> {
    const book = await this.db.getBook(bookId);

    if (!book) {
      throw new BookstoreError('Book not found', 404);
    }

    await this.db.updateBook(bookId, { status: 'removed' });

    console.log(`Book rejected and removed: ${bookId}`);
  }
}
