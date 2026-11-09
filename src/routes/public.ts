import { Env } from '../types';
import { DatabaseService } from '../services/database';
import { successResponse, errorResponse, handleError } from '../utils/helpers';

/**
 * Public API Routes
 * Handles book browsing and search for customers
 */

/**
 * GET /api/books
 * List all available books (live and in stock)
 */
export async function listPublicBooks(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const db = new DatabaseService(env);
    const result = await db.listBooks({
      status: 'live',
      in_stock: true,
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
 * GET /api/books/:id
 * Get a single book by ID (public view)
 */
export async function getPublicBook(
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

    // Only show live books to public
    if (book.status !== 'live' || !book.in_stock) {
      return errorResponse('Book not available', 404);
    }

    return successResponse({ book });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/search
 * Search books by keyword (uses D1 FTS)
 */
export async function searchBooks(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    if (!query || query.trim().length === 0) {
      return errorResponse('Search query is required', 400);
    }

    const db = new DatabaseService(env);
    const books = await db.searchBooksByKeyword(query, limit);

    return successResponse({
      query,
      results: books,
      total: books.length
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GET /api/health
 * Health check endpoint
 */
export async function healthCheck(_request: Request, env: Env): Promise<Response> {
  try {
    // Test database connection
    const result = await env.DB.prepare('SELECT 1 as test').first();

    return successResponse({
      status: 'healthy',
      database: result ? 'connected' : 'error',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse('Service unhealthy', 503);
  }
}
