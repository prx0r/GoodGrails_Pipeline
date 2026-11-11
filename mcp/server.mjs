#!/usr/bin/env node
/**
 * GoodGrails seller MCP server — stdio front-end.
 *
 * Thin, authenticated bridge to the Worker admin API so an agent (opencode,
 * Hermes, Claude…) can inspect and operate the book inventory in natural
 * language. The tool surface lives in seller-server.mjs and is shared with the
 * remote HTTP front-end (http.mjs).
 *
 * Env:
 *   SELLER_API_URL      default http://127.0.0.1:8787
 *   SELLER_ADMIN_TOKEN  optional; falls back to .dev.vars, then "dev-token"
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildSellerServer } from "./seller-server.mjs";

const server = buildSellerServer();
await server.connect(new StdioServerTransport());
