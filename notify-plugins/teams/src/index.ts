/**
 * @luqen/plugin-notify-teams v1.1.0
 *
 * v1.1.0 — when the dashboard's Phase-49 dispatcher enriches the event
 * with `renderedAdaptiveCard` (and optionally `logoUrl`), we wrap the
 * adaptive card in the Teams webhook envelope and forward it directly.
 * Older dashboards without those fields fall back to the v1.0.0
 * MessageCard formatter.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TeamsClient, type TeamsCard } from './teams-client.js';

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

// ── Theme colors (legacy fallback) ─────────────────────────────────────────

const THEME_COLORS: Record<LuqenEvent['type'], string> = {
  'scan.complete': '00C851',
  'scan.failed': 'FF4444',
  'violation.found': 'FF8800',
  'regulation.changed': '0078D7',
};

// ── Manifest ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const manifestPath = resolve(__dirname, '..', 'manifest.json');
const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PluginManifest;
export const manifest: PluginManifest = Object.freeze(rawManifest);

// ── State ───────────────────────────────────────────────────────────────────

let client: TeamsClient | null = null;
let enabledEvents: Set<string> = new Set();

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function activate(config: Readonly<Record<string, unknown>>): Promise<void> {
  const webhookUrl = config['webhookUrl'] as string | undefined;
  if (webhookUrl == null || webhookUrl === '') {
    throw new Error('Teams webhookUrl is required');
  }
  const events = (config['events'] as string | undefined) ?? 'scan.complete,scan.failed,violation.found,regulation.changed';
  client = new TeamsClient(webhookUrl);
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
    throw new Error('Teams plugin is not activated');
  }
  if (!enabledEvents.has(event.type)) {
    return;
  }
  const card = buildCard(event);
  await client.send(card);
}

/**
 * Phase 49 enriches the event with `renderedAdaptiveCard` (a fully
 * populated card body) when an org-or-system template renders. We wrap
 * it in the standard Teams webhook envelope and forward. If absent, we
 * fall back to the v1.0.0 deterministic MessageCard formatter.
 */
function buildCard(event: LuqenEvent): TeamsCard {
  const data = event.data;
  const renderedAdaptiveCard = data['renderedAdaptiveCard'];
  const renderedBody = typeof data['renderedBody'] === 'string'
    ? (data['renderedBody'] as string)
    : undefined;
  const renderedSubject = typeof data['renderedSubject'] === 'string'
    ? (data['renderedSubject'] as string)
    : undefined;

  if (renderedAdaptiveCard !== undefined && renderedAdaptiveCard !== null) {
    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: renderedAdaptiveCard,
        },
      ],
    };
  }

  // No adaptive card but the dispatcher gave us a rendered body — wrap
  // it in a minimal MessageCard so admin-template edits still win.
  if (renderedBody !== undefined && renderedBody !== '') {
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: renderedSubject ?? 'Luqen notification',
      themeColor: THEME_COLORS[event.type],
      title: renderedSubject ?? event.type,
      text: renderedBody,
    };
  }

  return buildLegacyCard(event);
}

function buildLegacyCard(event: LuqenEvent): TeamsCard {
  const data = event.data;
  const themeColor = THEME_COLORS[event.type];
  switch (event.type) {
    case 'scan.complete': {
      const url = (data['siteUrl'] as string | undefined) ?? 'Unknown URL';
      const issues = (data['totalIssues'] as number | undefined) ?? 0;
      const pages = (data['pagesScanned'] as number | undefined) ?? 0;
      return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: `Scan complete: ${url} — ${issues} issues found across ${pages} pages`,
        themeColor,
        title: 'Scan Complete',
        sections: [
          {
            activityTitle: 'Scan Results',
            facts: [
              { name: 'URL', value: url },
              { name: 'Pages', value: String(pages) },
              { name: 'Issues', value: String(issues) },
              { name: 'Time', value: event.timestamp },
            ],
          },
        ],
      };
    }
    case 'scan.failed': {
      const url = (data['siteUrl'] as string | undefined) ?? 'Unknown URL';
      const error = (data['error'] as string | undefined) ?? 'Unknown error';
      return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: `Scan failed: ${url} — ${error}`,
        themeColor,
        title: 'Scan Failed',
        sections: [
          {
            activityTitle: 'Failure Details',
            facts: [
              { name: 'URL', value: url },
              { name: 'Error', value: error },
            ],
          },
        ],
      };
    }
    case 'violation.found': {
      const criterion = (data['wcagCriterion'] as string | undefined) ?? 'Unknown';
      const count = (data['count'] as number | undefined) ?? 1;
      return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: `Violation found: ${criterion} (${count} occurrences)`,
        themeColor,
        title: 'Violation Found',
        sections: [
          {
            activityTitle: 'Violation Details',
            facts: [
              { name: 'Criterion', value: criterion },
              { name: 'Count', value: String(count) },
            ],
          },
        ],
      };
    }
    case 'regulation.changed': {
      const regulation = (data['regulationName'] as string | undefined) ?? 'Unknown';
      const change = (data['summary'] as string | undefined) ?? 'Details unavailable';
      return {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: `Regulation changed: ${regulation} — ${change}`,
        themeColor,
        title: 'Regulation Changed',
        sections: [
          {
            activityTitle: 'Regulation Update',
            facts: [
              { name: 'Regulation', value: regulation },
              { name: 'Change', value: change },
            ],
          },
        ],
      };
    }
  }
}
