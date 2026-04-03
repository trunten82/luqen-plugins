// Prompt builder (self-contained copy)
function buildPrompt(
  pageContent: string,
  context: {
    regulationId: string;
    regulationName: string;
    currentWcagVersion?: string;
    currentWcagLevel?: string;
  },
): string {
  const truncated =
    pageContent.length > 30000
      ? pageContent.slice(0, 30000) + '\n[... truncated]'
      : pageContent;

  return `You are an accessibility regulation analyst. Extract WCAG requirements from the following regulatory page content.

## Regulation Context
- Regulation ID: ${context.regulationId}
- Regulation Name: ${context.regulationName}
${context.currentWcagVersion ? `- Currently references: WCAG ${context.currentWcagVersion} Level ${context.currentWcagLevel ?? 'AA'}` : ''}

## Instructions
Analyze the page content and extract:
1. The WCAG version referenced (e.g., "2.0", "2.1", "2.2")
2. The conformance level required (e.g., "A", "AA", "AAA")
3. Any specific WCAG success criteria mentioned with their obligation level

For each criterion found, determine if it is:
- "mandatory" — legally required
- "recommended" — suggested but not enforced
- "optional" — mentioned as good practice
- "excluded" — explicitly exempted

## Response Format
Respond ONLY with valid JSON, no markdown fences:
{
  "wcagVersion": "2.1",
  "wcagLevel": "AA",
  "criteria": [
    { "criterion": "1.1.1", "obligation": "mandatory", "notes": "Alt text required" }
  ],
  "confidence": 0.85
}

If the page doesn't contain accessibility regulation data, return:
{ "wcagVersion": "unknown", "wcagLevel": "unknown", "criteria": [], "confidence": 0.0 }

## Page Content
${truncated}`;
}

// Response parser (self-contained copy)
interface ExtractedRequirements {
  readonly wcagVersion: string;
  readonly wcagLevel: string;
  readonly criteria: ReadonlyArray<{
    readonly criterion: string;
    readonly obligation: 'mandatory' | 'recommended' | 'optional' | 'excluded';
    readonly notes?: string;
  }>;
  readonly confidence: number;
}

function parseResponse(raw: string): ExtractedRequirements {
  const cleaned = raw
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  const parsed = JSON.parse(cleaned) as {
    wcagVersion?: string;
    wcagLevel?: string;
    criteria?: Array<{ criterion?: string; obligation?: string; notes?: string }>;
    confidence?: number;
  };

  return {
    wcagVersion: parsed.wcagVersion ?? 'unknown',
    wcagLevel: parsed.wcagLevel ?? 'unknown',
    criteria: (parsed.criteria ?? [])
      .filter(c => c.criterion && c.obligation)
      .map(c => ({
        criterion: c.criterion!,
        obligation: c.obligation as 'mandatory' | 'recommended' | 'optional' | 'excluded',
        ...(c.notes ? { notes: c.notes } : {}),
      })),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
  };
}

// Plugin class
export default class LLMAnthropicPlugin {
  readonly manifest = {
    name: 'llm-anthropic',
    displayName: 'Anthropic Claude (LLM)',
    type: 'llm' as const,
    version: '1.0.0',
    description: 'Uses Anthropic Claude to extract WCAG requirements from regulatory pages',
    configSchema: [
      { key: 'apiKey', label: 'Anthropic API Key', type: 'secret' as const, required: true },
      {
        key: 'model',
        label: 'Model',
        type: 'string' as const,
        required: false,
        default: 'claude-sonnet-4-20250514',
      },
    ],
  };

  private apiKey = '';
  private model = 'claude-sonnet-4-20250514';

  async activate(config: Readonly<Record<string, unknown>>): Promise<void> {
    this.apiKey = (config.apiKey as string) ?? '';
    this.model = (config.model as string) || 'claude-sonnet-4-20250514';
    if (!this.apiKey) throw new Error('Anthropic API key is required');
  }

  async deactivate(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async extractRequirements(
    pageContent: string,
    context: {
      readonly regulationId: string;
      readonly regulationName: string;
      readonly currentWcagVersion?: string;
      readonly currentWcagLevel?: string;
    },
  ): Promise<ExtractedRequirements> {
    const prompt = buildPrompt(pageContent, context);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.find(c => c.type === 'text')?.text ?? '';
    return parseResponse(text);
  }
}
