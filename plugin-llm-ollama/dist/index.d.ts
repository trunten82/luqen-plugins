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
export default class LLMOllamaPlugin {
    readonly manifest: {
        name: string;
        displayName: string;
        type: "llm";
        version: string;
        description: string;
        configSchema: {
            key: string;
            label: string;
            type: "string";
            required: boolean;
            default: string;
            description: string;
        }[];
    };
    private baseUrl;
    private model;
    activate(config: Readonly<Record<string, unknown>>): Promise<void>;
    deactivate(): Promise<void>;
    healthCheck(): Promise<boolean>;
    extractRequirements(pageContent: string, context: {
        readonly regulationId: string;
        readonly regulationName: string;
        readonly currentWcagVersion?: string;
        readonly currentWcagLevel?: string;
    }): Promise<ExtractedRequirements>;
}
export {};
