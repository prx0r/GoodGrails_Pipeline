import { Env, IngestBookRequest } from '../types';
import { IngestionService } from '../services/ingestion';
import { DatabaseService } from '../services/database';
import {
  parseJSON,
  successResponse,
  errorResponse,
  handleError
} from '../utils/helpers';

/**
 * Admin API Routes
 * Handles book ingestion, approval, and inventory management
 */

/**
 * POST /api/admin/books/ingest
 * Ingest a new book from ISBN
 */
export async function ingestBook(request: Request, env: Env): Promise<Response> {
  try {
    const body = await parseJSON<IngestBookRequest>(request);

    // Validate required fields
    if (!body.isbn) {
      return errorResponse('ISBN is required', 400);
    }

    if (!body.condition) {
      return errorResponse('Condition is required', 400);
    }

    if (!body.cost_price || body.cost_price <= 0) {
      return errorResponse('Valid cost_price is required', 400);
    }

    const ingestionService = new IngestionService(env);
    const result = await ingestionService.ingestBook(body);

    return successResponse(result, 201);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/admin/books/:id/approve
 * Approve a book and set it to live
 */
export async function approveBook(
  request: Request,
  env: Env,
  bookId: string
): Promise<Response> {
  try {
    const body = await parseJSON<{
      final_price?: number;
      title?: string;
      author?: string;
      description?: string;
      vibe_tags?: string;
    }>(request);

    const ingestionService = new IngestionService(env);
    const book = await ingestionService.approveBook(bookId, body);

    return successResponse({
      success: true,
      book
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/admin/books/:id
 * Reject/remove a book
 */
export async function rejectBook(
  _request: Request,
  env: Env,
  bookId: string
): Promise<Response> {
  try {
    const ingestionService = new IngestionService(env);
    await ingestionService.rejectBook(bookId);

    return successResponse({
      success: true,
      message: 'Book rejected and removed'
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/books
 * List all books (with filtering)
 */
export async function listBooks(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as any;
    const in_stock = url.searchParams.get('in_stock');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const db = new DatabaseService(env);
    const result = await db.listBooks({
      status,
      in_stock: in_stock ? in_stock === 'true' : undefined,
      limit,
      offset
    });

    return successResponse({
      books: result.books,
      total: result.total,
      limit,
      offset,
      has_more: offset + result.books.length < result.total
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/admin/books/:id
 * Get a single book by ID
 */
export async function getBook(
  _request: Request,
  env: Env,
  bookId: string
): Promise<Response> {
  try {
    const db = new DatabaseService(env);
    const book = await db.getBook(bookId);

    if (!book) {
      return errorResponse('Book not found', 404);
    }

    return successResponse({ book });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/admin/books/:id
 * Update book details
 */
export async function updateBook(
  request: Request,
  env: Env,
  bookId: string
): Promise<Response> {
  try {
    const body = await parseJSON<any>(request);
    const db = new DatabaseService(env);

    const book = await db.updateBook(bookId, body);

    if (!book) {
      return errorResponse('Book not found', 404);
    }

    return successResponse({ book });
  } catch (error) {
    return handleError(error);
  }
}
