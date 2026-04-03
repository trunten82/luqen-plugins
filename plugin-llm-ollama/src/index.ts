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
export default class LLMOllamaPlugin {
  readonly manifest = {
    name: 'llm-ollama',
    displayName: 'Ollama Local (LLM)',
    type: 'llm' as const,
    version: '1.0.0',
    description: 'Uses a locally-running Ollama instance to extract WCAG requirements from regulatory pages',
    configSchema: [
      {
        key: 'baseUrl',
        label: 'Ollama Base URL',
        type: 'string' as const,
        required: false,
        default: 'http://localhost:11434',
        description: 'URL of your local Ollama instance',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'string' as const,
        required: false,
        default: 'llama3.1',
        description: 'Name of the Ollama model to use (must be pulled locally)',
      },
    ],
  };

  private baseUrl = 'http://localhost:11434';
  private model = 'llama3.1';

  async activate(config: Readonly<Record<string, unknown>>): Promise<void> {
    this.baseUrl = (config.baseUrl as string) || 'http://localhost:11434';
    this.model = (config.model as string) || 'llama3.1';
  }

  async deactivate(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
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

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as { response: string };
    return parseResponse(data.response);
  }
}
