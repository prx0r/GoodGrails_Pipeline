#!/usr/bin/env node
/**
 * GoodGrails seller MCP server — remote Streamable HTTP front-end.
 *
 * Same tools as server.mjs, served over HTTP so remote agents (ChatGPT
 * connectors/plugins, Claude, other MCP clients) can drive the full chain.
 *
 * Stateless: a fresh McpServer + transport per request (JSON responses).
 *
 * Env:
 *   PORT               default 8931
 *   HOST               default 127.0.0.1
 *   MCP_TOKEN          optional shared secret. When set, every request needs
 *                      `Authorization: Bearer <token>` OR `?token=<token>`.
 *   SELLER_API_URL     default http://127.0.0.1:8787 (point at the live Worker)
 *   SELLER_ADMIN_TOKEN admin bearer for that API
 */
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildSellerServer } from "./seller-server.mjs";

const PORT = Number(process.env.PORT || 8931);
const HOST = process.env.HOST || "127.0.0.1";
const TOKEN = (process.env.MCP_TOKEN || "").trim();

function authorised(req) {
  if (!TOKEN) return true;
  const authz = String(req.headers["authorization"] || "");
  if (authz === `Bearer ${TOKEN}`) return true;
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("token") === TOKEN) return true;
  } catch {}
  return false;
}

const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!authorised(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  try {
    const server = buildSellerServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    res.on("close", () => {
      try { transport.close(); } catch {}
      try { server.close(); } catch {}
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("mcp http error:", error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`goodgrails-seller MCP on http://${HOST}:${PORT} (auth=${TOKEN ? "on" : "off"})`);
});
