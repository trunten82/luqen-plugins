/**
 * @luqen/plugin-notify-slack v1.1.0
 *
 * v1.1.0 — when the dashboard's Phase-49 dispatcher enriches the event
 * with `renderedBlocks` (and optionally `iconUrl`), we forward that
 * payload directly so template overrides and LLM-rewrites set in
 * /admin/notifications actually reach Slack. Older dashboards that
 * don't supply those fields fall back to the v1.0.0 legacy formatter
 * (data.siteUrl etc.), so this release is non-breaking.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlackClient, type SlackMessage } from './slack-client.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface ConfigField {
  readonly key: string;
  readonly label: string;
  readonly type: 'string' | 'secret' | 'number' | 'boolean' | 'select';
  readonly required?: boolean;
  readonly default?: unknown;
  readonly options?: readonly string[];
}

interface PluginManifest {
  readonly name: string;
  readonly displayName: string;
  readonly type: 'auth' | 'notification' | 'storage' | 'scanner';
  readonly version: string;
  readonly description: string;
  readonly configSchema: readonly ConfigField[];
}

interface LuqenEvent {
  readonly type: 'scan.complete' | 'scan.failed' | 'violation.found' | 'regulation.changed';
  readonly timestamp: string;
  readonly data: Readonly<Record<string, unknown>>;
}

// ── Manifest ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const manifestPath = resolve(__dirname, '..', 'manifest.json');
const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest;
export const manifest: PluginManifest = Object.freeze(rawManifest);

// ── State ───────────────────────────────────────────────────────────────────

let client: SlackClient | null = null;
let enabledEvents: Set<string> = new Set();

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function activate(config: Readonly<Record<string, unknown>>): Promise<void> {
  const webhookUrl = config['webhookUrl'] as string | undefined;
  if (webhookUrl == null || webhookUrl === '') {
    throw new Error('Slack webhookUrl is required');
  }
  const channel = (config['channel'] as string | undefined) ?? '#accessibility';
  const username = (config['username'] as string | undefined) ?? 'Luqen Agent';
  const events = (config['events'] as string | undefined) ?? 'scan.complete,scan.failed,violation.found,regulation.changed';
  client = new SlackClient(webhookUrl, channel, username);
  enabledEvents = new Set(events.split(',').map((e) => e.trim()));
}

export async function deactivate(): Promise<void> {
  client = null;
  enabledEvents = new Set();
}

export async function healthCheck(): Promise<boolean> {
  if (client === null) return false;
  return client.testConnection();
}

// ── Notification ────────────────────────────────────────────────────────────

export async function send(event: LuqenEvent): Promise<void> {
  if (client === null) {
    throw new Error('Slack plugin is not activated');
  }
  if (!enabledEvents.has(event.type)) {
    return;
  }
  const message = buildMessage(event);
  await client.send(message);
}

/**
 * Build the Slack webhook payload. Prefers the dispatcher's
 * pre-rendered `renderedBlocks` (Phase 49) — that's where template
 * overrides and LLM rewrites live — and falls back to the v1.0.0
 * deterministic formatter when those fields are absent.
 */
function buildMessage(event: LuqenEvent): SlackMessage {
  const data = event.data;

  // v1.1.0 — dispatcher enrichment path. Phase 49 set `renderedBlocks`
  // on the event when an org-or-system template successfully rendered;
  // Phase 50-02 may have additionally LLM-rewritten the body. Either
  // way, this is the payload admins expect to see.
  const renderedBlocks = data['renderedBlocks'];
  const renderedBody = typeof data['renderedBody'] === 'string'
    ? (data['renderedBody'] as string)
    : undefined;
  const renderedSubject = typeof data['renderedSubject'] === 'string'
    ? (data['renderedSubject'] as string)
    : undefined;
  const iconUrl = typeof data['iconUrl'] === 'string'
    ? (data['iconUrl'] as string)
    : undefined;

  if (Array.isArray(renderedBlocks) && renderedBlocks.length > 0) {
    const message: SlackMessage = {
      ...(renderedSubject !== undefined || renderedBody !== undefined
        ? { text: renderedSubject ?? renderedBody ?? '' }
        : {}),
      blocks: renderedBlocks as ReadonlyArray<Readonly<Record<string, unknown>>>,
      ...(iconUrl !== undefined ? { icon_url: iconUrl } : {}),
    };
    return message;
  }

  // Even without blocks, a plain `renderedBody` is more correct than
  // re-formatting from raw fields — it captures the admin's template.
  if (typeof renderedBody === 'string' && renderedBody !== '') {
    return {
      text: renderedSubject !== undefined ? `*${renderedSubject}*\n${renderedBody}` : renderedBody,
      ...(iconUrl !== undefined ? { icon_url: iconUrl } : {}),
    };
  }

  // v1.0.0 fallback — deterministic format from raw fields.
  return formatLegacyEvent(event);
}

function formatLegacyEvent(event: LuqenEvent): SlackMessage {
  const data = event.data;
  switch (event.type) {
    case 'scan.complete': {
      const url = (data['siteUrl'] as string | undefined) ?? 'Unknown URL';
      const issues = (data['totalIssues'] as number | undefined) ?? 0;
      const pages = (data['pagesScanned'] as number | undefined) ?? 0;
      return {
        text: `Scan complete: ${url} — ${issues} issues found across ${pages} pages`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Scan Complete' } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*URL:* ${url}` },
              { type: 'mrkdwn', text: `*Pages:* ${pages}` },
              { type: 'mrkdwn', text: `*Issues:* ${issues}` },
              { type: 'mrkdwn', text: `*Time:* ${event.timestamp}` },
            ],
          },
        ],
      };
    }
    case 'scan.failed': {
      const url = (data['siteUrl'] as string | undefined) ?? 'Unknown URL';
      const error = (data['error'] as string | undefined) ?? 'Unknown error';
      return {
        text: `Scan failed: ${url} — ${error}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Scan Failed' } },
          { type: 'section', text: { type: 'mrkdwn', text: `*URL:* ${url}\n*Error:* ${error}` } },
        ],
      };
    }
    case 'violation.found': {
      const criterion = (data['wcagCriterion'] as string | undefined) ?? 'Unknown';
      const count = (data['count'] as number | undefined) ?? 1;
      return {
        text: `Violation found: ${criterion} (${count} occurrences)`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Violation Found' } },
          { type: 'section', text: { type: 'mrkdwn', text: `*Criterion:* ${criterion}\n*Count:* ${count}` } },
        ],
      };
    }
    case 'regulation.changed': {
      const regulation = (data['regulationName'] as string | undefined) ?? 'Unknown';
      const change = (data['summary'] as string | undefined) ?? 'Details unavailable';
      return {
        text: `Regulation changed: ${regulation} — ${change}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Regulation Changed' } },
          { type: 'section', text: { type: 'mrkdwn', text: `*Regulation:* ${regulation}\n*Change:* ${change}` } },
        ],
      };
    }
  }
}
