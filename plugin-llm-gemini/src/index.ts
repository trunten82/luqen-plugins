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
export default class LLMGeminiPlugin {
  readonly manifest = {
    name: 'llm-gemini',
    displayName: 'Google Gemini (LLM)',
    type: 'llm' as const,
    version: '1.0.0',
    description: 'Uses Google Gemini to extract WCAG requirements from regulatory pages',
    configSchema: [
      { key: 'apiKey', label: 'Google AI API Key', type: 'secret' as const, required: true },
      {
        key: 'model',
        label: 'Model',
        type: 'string' as const,
        required: false,
        default: 'gemini-2.0-flash',
      },
    ],
  };

  private apiKey = '';
  private model = 'gemini-2.0-flash';

  async activate(config: Readonly<Record<string, unknown>>): Promise<void> {
    this.apiKey = (config.apiKey as string) ?? '';
    this.model = (config.model as string) || 'gemini-2.0-flash';
    if (!this.apiKey) throw new Error('Google AI API key is required');
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates[0]?.content?.parts[0]?.text ?? '';
    return parseResponse(text);
  }
}
