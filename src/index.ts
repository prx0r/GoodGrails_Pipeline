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

// Listing previews (renders GitHub-hosted PREVIEWS.html — drafts, nothing live).
router.get('/previews', async () => {
  const res = await fetch(
    'https://raw.githubusercontent.com/prx0r/GoodGrails_Pipeline/main/exports-descriptions/PREVIEWS.html',
    { cf: { cacheTtl: 300 } }
  );
  if (!res.ok) return new Response('Previews unavailable', { status: 502 });
  return new Response(await res.text(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
  });
});
router.get('/privacy', async () =>
  new Response(
    `Hegelian Books / GoodGrails Seller — Privacy Policy\n\n` +
    `This application manages a single seller's own book inventory (own listings only).\n` +
    `It does not collect, store, or share any third-party eBay member data.\n` +
    `eBay OAuth is used solely to let the seller's own application manage their own\n` +
    `inventory, offers, and orders via the eBay Sell APIs.\n` +
    `No buyer or member personal data is retained beyond what is required to fulfil orders.\n` +
    `Contact: hegelianuk@gmail.com\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }
  )
);

router.get('/api/health', publicRoutes.healthCheck);
// eBay Marketplace Account Deletion notification (public, no auth — eBay calls it).
// Required for production keyset compliance; single-seller store holds no member PII.
router.get('/api/ebay/account-deletion', (req, env) =>
  import('./routes/ebayDeletion').then(m => m.handleDeletionChallenge(req, env))
);
router.post('/api/ebay/account-deletion', (req, env) =>
  import('./routes/ebayDeletion').then(m => m.handleDeletionNotification(req, env))
);
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
