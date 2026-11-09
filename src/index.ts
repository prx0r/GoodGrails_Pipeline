/**
 * Cloudflare Worker — GoodGrails multichannel specialist-book seller.
 *
 * Public:   health, public book browsing, R2 media
 * Private:  /api/admin/* (bearer token), / and /dashboard (login screen)
 */

import { Env } from './types';
import { Router, RouteHandler } from './utils/router';
import * as admin from './routes/admin';
import * as publicRoutes from './routes/public';
import * as inventory from './routes/inventory';
import { dashboardHtml } from './ui/dashboard';
import { requireAdmin } from './services/auth';
import { errorResponse } from './utils/helpers';

const router = new Router();

/** Wrap a legacy admin handler with authentication. */
function protectedRoute(handler: RouteHandler): RouteHandler {
  return async (request, env, params) => {
    const denied = requireAdmin(request, env);
    if (denied) return denied;
    return handler(request, env, params);
  };
}

// ========== DASHBOARD ==========

router.get('/', async () =>
  new Response(dashboardHtml(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
      'Cache-Control': 'no-store'
    }
  })
);
router.get('/dashboard', async () =>
  new Response(dashboardHtml(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
      'Cache-Control': 'no-store'
    }
  })
);

// ========== PUBLIC ROUTES ==========

router.get('/api/health', publicRoutes.healthCheck);
router.get('/api/books', publicRoutes.listPublicBooks);
router.get('/api/books/:id', (req, env, params) =>
  publicRoutes.getPublicBook(req, env, params!.id)
);
router.get('/api/search', publicRoutes.searchBooks);

// Serve actual-copy photos from R2 (keys are unguessable)
router.get('/media/:path+', async (_req, env, params) => {
  try {
    const key = params!.path;
    const object = await env.ASSETS.get(key);
    if (!object) return new Response('Not found', { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    console.error('R2 fetch error:', error);
    return new Response('Error fetching image', { status: 500 });
  }
});

// Legacy covers path kept for compatibility
router.get('/assets/:path', async (_req, env, params) => {
  try {
    const key = `covers/${(params as any).path}`;
    const object = await env.ASSETS.get(key);
    if (!object) return new Response('Image not found', { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('R2 fetch error:', error);
    return new Response('Error fetching image', { status: 500 });
  }
});

// ========== ADMIN: MULTICHANNEL ==========

router.get('/api/admin/overview', inventory.overview);
router.get('/api/admin/inventory', inventory.listInventory);
router.post('/api/admin/inventory', inventory.createInventoryCopy);
router.get('/api/admin/inventory/:id', (req, env, params) =>
  inventory.getInventoryCopy(req, env, params!.id)
);
router.patch('/api/admin/inventory/:id', (req, env, params) =>
  inventory.updateInventoryCopy(req, env, params!.id)
);
router.post('/api/admin/inventory/:id/price', (req, env, params) =>
  inventory.approvePrice(req, env, params!.id)
);
router.post('/api/admin/inventory/:id/comps', (req, env, params) =>
  inventory.addComps(req, env, params!.id)
);
router.post('/api/admin/inventory/:id/media', (req, env, params) =>
  inventory.uploadMedia(req, env, params!.id)
);
router.post('/api/admin/inventory/:id/listing', (req, env, params) =>
  inventory.createListing(req, env, params!.id)
);
router.get('/api/admin/inventory/:id/draft', (req, env, params) =>
  inventory.getDraft(req, env, params!.id)
);

router.post('/api/admin/import', inventory.importSeed);
router.get('/api/admin/export/biblio.csv', inventory.exportBiblio);
router.get('/api/admin/export/alibris.csv', inventory.exportAlibris);
router.get('/api/admin/export/amazon.csv', inventory.exportAmazon);
router.get('/api/admin/export/abebooks.xml', inventory.exportAbeBooks);

router.get('/api/admin/marketplaces', inventory.listMarketplaces);
router.get('/api/admin/orders', inventory.listOrders);
router.post('/api/admin/orders', inventory.recordOrder);
router.post('/api/admin/orders/manual', inventory.recordManualSale);
router.patch('/api/admin/orders/:id', (req, env, params) =>
  inventory.updateOrder(req, env, params!.id)
);
router.get('/api/admin/jobs', inventory.listJobs);

// ========== ADMIN: LEGACY (now authenticated) ==========

router.post('/api/admin/books/ingest', protectedRoute(admin.ingestBook));
router.get('/api/admin/books', protectedRoute(admin.listBooks));
router.get('/api/admin/books/:id', protectedRoute((req, env, params) =>
  admin.getBook(req, env, params!.id)
));
router.patch('/api/admin/books/:id', protectedRoute((req, env, params) =>
  admin.updateBook(req, env, params!.id)
));
router.delete('/api/admin/books/:id', protectedRoute((req, env, params) =>
  admin.rejectBook(req, env, params!.id)
));
router.patch('/api/admin/books/:id/approve', protectedRoute((req, env, params) =>
  admin.approveBook(req, env, params!.id)
));

// ========== WORKER EXPORT ==========

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      return await router.route(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      if (/Authentication|configured/i.test(String(error))) {
        return errorResponse('Configuration error', 503);
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
  }
};
