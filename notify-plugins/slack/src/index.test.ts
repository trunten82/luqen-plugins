/**
 * @luqen/plugin-notify-slack v1.1.0 — payload-shape tests.
 *
 * We don't hit a real Slack webhook here. Instead we activate the
 * plugin with a tiny in-process HTTP listener and assert the payload
 * shape under both the v1.1.0 enrichment path (renderedBlocks present)
 * and the v1.0.0 legacy path (raw event.data only).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { activate, deactivate, send } from './index.js';

interface CapturedPayload {
  readonly blocks?: unknown;
  readonly text?: string;
  readonly icon_url?: string;
}

let server: Server;
let port: number;
let lastPayload: CapturedPayload | null = null;

beforeEach(async () => {
  lastPayload = null;
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      lastPayload = JSON.parse(body) as CapturedPayload;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
  await activate({ webhookUrl: `http://localhost:${port}/`, channel: '#test', username: 'TestBot' });
});

afterEach(async () => {
  await deactivate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('v1.1.0 dispatcher-enriched path', () => {
  it('forwards renderedBlocks and iconUrl when present', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: {
        siteUrl: 'https://example.com',
        renderedSubject: 'Custom Subject',
        renderedBody: 'Custom body text',
        renderedBlocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Custom Header' } },
        ],
        iconUrl: 'https://example.com/logo.png',
      },
    });
    expect(lastPayload).not.toBeNull();
    expect(lastPayload!.blocks).toEqual([
      { type: 'header', text: { type: 'plain_text', text: 'Custom Header' } },
    ]);
    expect(lastPayload!.icon_url).toBe('https://example.com/logo.png');
    expect(lastPayload!.text).toBe('Custom Subject');
  });

  it('falls back to renderedBody when blocks absent but body present', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: {
        siteUrl: 'https://example.com',
        renderedSubject: 'Sub',
        renderedBody: 'Body',
      },
    });
    expect(lastPayload!.text).toBe('*Sub*\nBody');
    expect(lastPayload!.blocks).toBeUndefined();
  });
});

describe('v1.0.0 legacy path (no rendered fields)', () => {
  it('formats scan.complete from raw event.data', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: { siteUrl: 'https://example.com', totalIssues: 5, pagesScanned: 3 },
    });
    expect(lastPayload!.text).toContain('Scan complete: https://example.com');
    expect(lastPayload!.text).toContain('5 issues');
    expect(Array.isArray(lastPayload!.blocks)).toBe(true);
    expect((lastPayload!.blocks as Array<{ type: string }>)[0].type).toBe('header');
  });

  it('formats scan.failed legacy', async () => {
    await send({
      type: 'scan.failed',
      timestamp: '2026-05-28T00:00:00Z',
      data: { siteUrl: 'https://example.com', error: 'Boom' },
    });
    expect(lastPayload!.text).toContain('Scan failed');
    expect(lastPayload!.text).toContain('Boom');
  });
});
