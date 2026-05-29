/**
 * @luqen/plugin-notify-email v1.1.0 — payload-shape tests.
 *
 * Stub the nodemailer transport so we don't need a real SMTP server.
 * We test that buildMessage prefers the dispatcher's pre-rendered
 * fields and falls back correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub the nodemailer transport before anything in src/* is imported.
const sent: Array<Record<string, unknown>> = [];
vi.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: async (msg: Record<string, unknown>) => {
      sent.push(msg);
    },
    verify: async () => true,
    close: () => undefined,
  }),
}));

const { activate, deactivate, send, sendReport } = await import('./index.js');

beforeEach(async () => {
  sent.length = 0;
  await activate({
    host: 'smtp.test',
    port: 587,
    secure: false,
    username: 'u',
    password: 'p',
    fromAddress: 'noreply@example.com',
    fromName: 'TestBot',
    events: 'scan.complete,scan.failed,violation.found,regulation.changed',
  });
});

afterEach(async () => {
  await deactivate();
});

describe('v1.1.0 dispatcher-enriched path', () => {
  it('uses renderedSubject + renderedHtml + plaintext when present', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: {
        siteUrl: 'https://example.com',
        renderedSubject: 'Custom Subject',
        renderedHtml: '<p>Custom HTML</p>',
        renderedPlaintext: 'Custom plain',
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Custom Subject');
    expect(sent[0].html).toBe('<p>Custom HTML</p>');
    expect(sent[0].text).toBe('Custom plain');
  });

  it('attaches logoAttachment with cid for inline rendering', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: {
        renderedSubject: 'S',
        renderedHtml: '<img src="cid:logo">',
        logoAttachment: { filename: 'logo.png', content: 'base64data', contentType: 'image/png' },
        logoCid: 'logo',
      },
    });
    const atts = sent[0].attachments as Array<{ filename: string; cid: string }>;
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toBe('logo.png');
    expect(atts[0].cid).toBe('logo');
  });

  it('falls back to renderedBody when no HTML supplied', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: { renderedSubject: 'S', renderedBody: 'Plain body text' },
    });
    expect(sent[0].subject).toBe('S');
    expect(sent[0].text).toBe('Plain body text');
    expect((sent[0].html as string).includes('Plain body text')).toBe(true);
  });
});

describe('v1.0.0 legacy path', () => {
  it('formats scan.complete from raw event.data', async () => {
    await send({
      type: 'scan.complete',
      timestamp: '2026-05-28T00:00:00Z',
      data: { siteUrl: 'https://example.com', totalIssues: 5, pagesScanned: 3 },
    });
    expect(sent[0].subject).toContain('Scan Complete');
    expect(sent[0].subject).toContain('https://example.com');
    expect((sent[0].html as string).includes('5')).toBe(true);
  });
});

describe('sendReport', () => {
  it('forwards options.html / subject / attachments verbatim', async () => {
    await sendReport({
      to: ['alice@example.com', 'bob@example.com'],
      subject: 'Weekly Report',
      html: '<h1>Report</h1>',
      attachments: [{ filename: 'r.pdf', content: 'aGVsbG8=', contentType: 'application/pdf' }],
    });
    expect(sent[0].to).toBe('alice@example.com, bob@example.com');
    expect(sent[0].subject).toBe('Weekly Report');
    expect(sent[0].html).toBe('<h1>Report</h1>');
    expect((sent[0].attachments as Array<{ filename: string }>)[0].filename).toBe('r.pdf');
  });
});
