import { describe, expect, it } from 'vitest';
import { createTestEnv } from './fakeD1';
import { handleMcpRequest } from '../src/mcp/remote';

const ACCEPT = 'application/json, text/event-stream';

function rpc(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://example.com/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: ACCEPT, ...headers },
    body: JSON.stringify(body)
  });
}

const init = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vitest', version: '0' }
  }
};

async function body(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

describe('remote MCP endpoint', () => {
  it('fails closed without auth', async () => {
    const res = await handleMcpRequest(rpc(init), createTestEnv());
    expect(res.status).toBe(401);
  });

  it('rejects a wrong bearer token', async () => {
    const res = await handleMcpRequest(
      rpc(init, { Authorization: 'Bearer nope' }),
      createTestEnv()
    );
    expect(res.status).toBe(403);
  });

  it('initializes with a valid bearer token', async () => {
    const res = await handleMcpRequest(
      rpc(init, { Authorization: 'Bearer test-token' }),
      createTestEnv()
    );
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json.result?.serverInfo?.name).toContain('goodgrails');
  });

  it('lists the seller tools', async () => {
    const res = await handleMcpRequest(
      rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { Authorization: 'Bearer test-token' }),
      createTestEnv()
    );
    expect(res.status).toBe(200);
    const json = await body(res);
    const names = (json.result?.tools || []).map((t: any) => t.name);
    expect(names).toContain('seller_status');
    expect(names).toContain('seller_list_inventory');
    expect(names).toContain('seller_approve_price');
    expect(names).toContain('seller_upload_photo');
    expect(names).toContain('seller_export');
  });

  it('accepts the secret path form for no-auth connectors', async () => {
    const env = createTestEnv({ MCP_PATH_SECRET: 's3cret' });
    const res = await handleMcpRequest(
      new Request('https://example.com/mcp/s/s3cret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: ACCEPT },
        body: JSON.stringify(init)
      }),
      env,
      's3cret'
    );
    expect(res.status).toBe(200);
  });
});
