/**
 * @luqen/plugin-notify-teams v1.1.0 — payload-shape tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { activate, deactivate, send } from './index.js';

interface CapturedPayload {
  readonly type?: string;
  readonly attachments?: ReadonlyArray<{ contentType: string; content: unknown }>;
  readonly '@type'?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly text?: string;
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
  await activate({ webhookUrl: `http://localhost:${port}/` });
});

afterEach(async () => {
  await deactivate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('v1.1.0 dispatcher-enriched path', () => {
  it('wraps renderedAdaptiveCard in Teams webhook envelope', async () => {
    const card = { type: 'AdaptiveCard', version: '1.5', body: [{ type: 'TextBlock', text: 'Hello' }] };
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: { siteUrl: 'https://example.com', renderedAdaptiveCard: card },
    });
    expect(lastPayload!.type).toBe('message');
    expect(lastPayload!.attachments).toHaveLength(1);
    expect(lastPayload!.attachments![0].contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(lastPayload!.attachments![0].content).toEqual(card);
  });

  it('falls back to MessageCard when only renderedBody present', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: { renderedSubject: 'Custom Title', renderedBody: 'Custom body' },
    });
    expect(lastPayload!['@type']).toBe('MessageCard');
    expect(lastPayload!.title).toBe('Custom Title');
    expect(lastPayload!.text).toBe('Custom body');
  });
});

describe('v1.0.0 legacy path', () => {
  it('formats scan.complete from raw event.data', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: { siteUrl: 'https://example.com', totalIssues: 5, pagesScanned: 3 },
    });
    expect(lastPayload!['@type']).toBe('MessageCard');
    expect(lastPayload!.title).toBe('Scan Complete');
    expect(lastPayload!.summary).toContain('5 issues');
  });
});
