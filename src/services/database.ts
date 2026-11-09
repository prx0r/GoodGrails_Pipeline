import { Env, Book, Order, BookStatus } from '../types';
import { generateUUID, getCurrentTimestamp } from '../utils/helpers';

/**
 * D1 Database Service
 * Handles all database operations for books, orders, and donations
 */
export class DatabaseService {
  constructor(private env: Env) {}

  // ========== BOOK OPERATIONS ==========

  async createBook(bookData: Partial<Book>): Promise<Book> {
    const id = generateUUID();
    const now = getCurrentTimestamp();

    const book: Book = {
      id,
      isbn: bookData.isbn!,
      title: bookData.title!,
      author: bookData.author!,
      description: bookData.description,
      cover_url: bookData.cover_url,
      condition: bookData.condition || 'good',
      cost_price: bookData.cost_price!,
      sell_price: bookData.sell_price!,
      in_stock: true,
      metadata: bookData.metadata,
      vibe_tags: bookData.vibe_tags,
      ai_enrichment: bookData.ai_enrichment,
      review_summary: bookData.review_summary,
      vector_id: bookData.vector_id,
      status: bookData.status || 'draft',
      created_at: now,
      updated_at: now
    };

    await this.env.DB.prepare(`
      INSERT INTO books (
        id, isbn, title, author, description, cover_url,
        condition, cost_price, sell_price, in_stock,
        metadata, vibe_tags, ai_enrichment, review_summary,
        vector_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      book.id,
      book.isbn,
      book.title,
      book.author,
      book.description || null,
      book.cover_url || null,
      book.condition,
      book.cost_price,
      book.sell_price,
      book.in_stock ? 1 : 0,
      book.metadata ? JSON.stringify(book.metadata) : null,
      book.vibe_tags || null,
      book.ai_enrichment ? JSON.stringify(book.ai_enrichment) : null,
      book.review_summary || null,
      book.vector_id || null,
      book.status,
      book.created_at,
      book.updated_at
    ).run();

    return book;
  }

  async getBook(id: string): Promise<Book | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM books WHERE id = ?
    `).bind(id).first<any>();

    if (!result) return null;
    return this.deserializeBook(result);
  }

  async getBookByISBN(isbn: string): Promise<Book | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM books WHERE isbn = ? LIMIT 1
    `).bind(isbn).first<any>();

    if (!result) return null;
    return this.deserializeBook(result);
  }

  async updateBook(id: string, updates: Partial<Book>): Promise<Book | null> {
    const existing = await this.getBook(id);
    if (!existing) return null;

    const now = getCurrentTimestamp();
    const fields: string[] = [];
    const values: any[] = [];

    // Build dynamic UPDATE query
    const allowedFields = [
      'title', 'author', 'description', 'cover_url',
      'sell_price', 'in_stock', 'metadata', 'vibe_tags',
      'ai_enrichment', 'review_summary', 'vector_id', 'status'
    ];

    for (const field of allowedFields) {
      if (updates[field as keyof Book] !== undefined) {
        fields.push(`${field} = ?`);
        let value = updates[field as keyof Book];

        // Serialize JSON fields
        if (['metadata', 'ai_enrichment'].includes(field) && value) {
          value = JSON.stringify(value);
        }

        // Handle boolean
        if (field === 'in_stock' && typeof value === 'boolean') {
          value = value ? 1 : 0;
        }

        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.env.DB.prepare(`
      UPDATE books SET ${fields.join(', ')} WHERE id = ?
    `).bind(...values).run();

    return this.getBook(id);
  }

  async listBooks(filters: {
    status?: BookStatus;
    in_stock?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ books: Book[]; total: number }> {
    const { status, in_stock, limit = 50, offset = 0 } = filters;

    let whereClause = '';
    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (in_stock !== undefined) {
      conditions.push('in_stock = ?');
      params.push(in_stock ? 1 : 0);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countResult = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM books ${whereClause}
    `).bind(...params).first<{ count: number }>();

    const total = countResult?.count || 0;

    // Get books
    const results = await this.env.DB.prepare(`
      SELECT * FROM books ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<any>();

    const books = results.results.map(row => this.deserializeBook(row));

    return { books, total };
  }

  async markBookAsSold(bookId: string): Promise<void> {
    const now = getCurrentTimestamp();
    await this.env.DB.prepare(`
      UPDATE books
      SET in_stock = 0, status = 'sold', sold_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, now, bookId).run();
  }

  // ========== ORDER OPERATIONS ==========

  async createOrder(orderData: {
    book_id: string;
    customer_email?: string;
    book_price: number;
    profit_amount: number;
    charity_name: string;
    stripe_payment_id: string;
  }): Promise<Order> {
    const id = generateUUID();
    const now = getCurrentTimestamp();
    const monthBatch = now.substring(0, 7); // YYYY-MM

    const order: Order = {
      id,
      ...orderData,
      payment_status: 'pending',
      month_batch: monthBatch,
      donation_status: 'pending',
      created_at: now
    };

    await this.env.DB.prepare(`
      INSERT INTO orders (
        id, book_id, customer_email, book_price, profit_amount,
        charity_name, stripe_payment_id, payment_status,
        month_batch, donation_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order.id,
      order.book_id,
      order.customer_email || null,
      order.book_price,
      order.profit_amount,
      order.charity_name,
      order.stripe_payment_id,
      order.payment_status,
      order.month_batch,
      order.donation_status,
      order.created_at
    ).run();

    return order;
  }

  async getOrder(id: string): Promise<Order | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).bind(id).first<Order>();

    return result || null;
  }

  async updateOrderPaymentStatus(
    orderId: string,
    status: 'succeeded' | 'failed',
    txHash?: string
  ): Promise<void> {
    const now = getCurrentTimestamp();

    await this.env.DB.prepare(`
      UPDATE orders
      SET payment_status = ?, paid_at = ?, base_tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      status,
      status === 'succeeded' ? now : null,
      txHash || null,
      now,
      orderId
    ).run();
  }

  // ========== HELPER METHODS ==========

  private deserializeBook(row: any): Book {
    return {
      ...row,
      in_stock: Boolean(row.in_stock),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ai_enrichment: row.ai_enrichment ? JSON.parse(row.ai_enrichment) : undefined
    };
  }

  // ========== SEARCH ==========

  async searchBooksByKeyword(query: string, limit: number = 20): Promise<Book[]> {
    // Use D1's FTS (Full-Text Search) with content table
    // Since we use content=books, we query directly from books_fts and join back
    const results = await this.env.DB.prepare(`
      SELECT b.* FROM books_fts fts
      JOIN books b ON b.rowid = fts.rowid
      WHERE fts.books_fts MATCH ?
      AND b.status = 'live' AND b.in_stock = 1
      ORDER BY bm25(books_fts)
      LIMIT ?
    `).bind(query, limit).all<any>();

    return results.results.map(row => this.deserializeBook(row));
  }
}
