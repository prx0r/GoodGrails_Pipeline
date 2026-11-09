import { Env } from '../types';

/**
 * Simple router for Cloudflare Workers
 * Matches URL patterns and routes to handlers
 */

export type RouteHandler = (
  request: Request,
  env: Env,
  params?: Record<string, string>
) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
}

export class Router {
  private routes: Route[] = [];

  /**
   * Add a GET route
   */
  get(path: string, handler: RouteHandler): void {
    this.addRoute('GET', path, handler);
  }

  /**
   * Add a POST route
   */
  post(path: string, handler: RouteHandler): void {
    this.addRoute('POST', path, handler);
  }

  /**
   * Add a PUT route
   */
  put(path: string, handler: RouteHandler): void {
    this.addRoute('PUT', path, handler);
  }

  /**
   * Add a PATCH route
   */
  patch(path: string, handler: RouteHandler): void {
    this.addRoute('PATCH', path, handler);
  }

  /**
   * Add a DELETE route
   */
  delete(path: string, handler: RouteHandler): void {
    this.addRoute('DELETE', path, handler);
  }

  /**
   * Handle OPTIONS requests (CORS preflight)
   */
  options(path: string): void {
    this.addRoute('OPTIONS', path, async () => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    });
  }

  /**
   * Route a request to the appropriate handler
   */
  async route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = url.pathname;

    // Handle CORS preflight for all routes
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = pathname.match(route.pattern);
      if (!match) continue;

      // Extract params
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });

      try {
        return await route.handler(request, env, params);
      } catch (error) {
        console.error('Route handler error:', error);
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error'
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

    // No route matched
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Not found'
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  /**
   * Add a route with any HTTP method
   */
  private addRoute(method: string, path: string, handler: RouteHandler): void {
    // Extract param names from path (e.g., /books/:id -> ['id']).
    // A trailing :name+ matches the rest of the path (R2 keys contain slashes).
    const paramNames: string[] = [];
    const pattern = path
      .replace(/:(\w+)\+/g, (_, name) => {
        paramNames.push(name);
        return '(.+)';
      })
      .replace(/:(\w+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });

    // Create regex pattern (exact match)
    const regex = new RegExp(`^${pattern}$`);

    this.routes.push({
      method,
      pattern: regex,
      handler,
      paramNames
    });
  }
}
