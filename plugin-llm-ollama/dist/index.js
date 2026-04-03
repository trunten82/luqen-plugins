// Prompt builder (self-contained copy)
function buildPrompt(pageContent, context) {
    const truncated = pageContent.length > 30000
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
function parseResponse(raw) {
    const cleaned = raw
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
    const parsed = JSON.parse(cleaned);
    return {
        wcagVersion: parsed.wcagVersion ?? 'unknown',
        wcagLevel: parsed.wcagLevel ?? 'unknown',
        criteria: (parsed.criteria ?? [])
            .filter(c => c.criterion && c.obligation)
            .map(c => ({
            criterion: c.criterion,
            obligation: c.obligation,
            ...(c.notes ? { notes: c.notes } : {}),
        })),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };
}
// Plugin class
export default class LLMOllamaPlugin {
    manifest = {
        name: 'llm-ollama',
        displayName: 'Ollama Local (LLM)',
        type: 'llm',
        version: '1.0.0',
        description: 'Uses a locally-running Ollama instance to extract WCAG requirements from regulatory pages',
        configSchema: [
            {
                key: 'baseUrl',
                label: 'Ollama Base URL',
                type: 'string',
                required: false,
                default: 'http://localhost:11434',
                description: 'URL of your local Ollama instance',
            },
            {
                key: 'model',
                label: 'Model',
                type: 'string',
                required: false,
                default: 'llama3.1',
                description: 'Name of the Ollama model to use (must be pulled locally)',
            },
        ],
    };
    baseUrl = 'http://localhost:11434';
    model = 'llama3.1';
    async activate(config) {
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.model = config.model || 'llama3.1';
    }
    async deactivate() { }
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async extractRequirements(pageContent, context) {
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
        const data = await response.json();
        return parseResponse(data.response);
    }
}
