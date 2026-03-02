export interface OllamaClientConfig {
    baseUrl: string;
    model: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}
interface GenerateResponse {
    response?: string;
}
export class OllamaClient {
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly timeoutMs: number;
    private readonly maxRetries: number;
    private readonly retryBaseDelayMs: number;
    constructor(config: OllamaClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.model = config.model;
        this.timeoutMs = config.timeoutMs ?? 12000;
        this.maxRetries = Math.max(0, Math.floor(config.maxRetries ?? 1));
        this.retryBaseDelayMs = Math.max(50, Math.floor(config.retryBaseDelayMs ?? 200));
    }
    async generate(prompt: string): Promise<string> {
        const url = `${this.baseUrl}/api/generate`;
        const payload = {
            model: this.model,
            prompt,
            stream: false,
        };
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            let response: Response;
            try {
                response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
            }
            catch (error) {
                clearTimeout(timer);
                const details = (error as Error).message || "unknown error";
                if (attempt < this.maxRetries) {
                    await sleep(this.retryBaseDelayMs * (attempt + 1));
                    continue;
                }
                throw new Error(`Ollama connection failed: ${details}`);
            }
            clearTimeout(timer);
            if (!response.ok) {
                if (attempt < this.maxRetries && isRetryableStatus(response.status)) {
                    await sleep(this.retryBaseDelayMs * (attempt + 1));
                    continue;
                }
                throw new Error(`Ollama generate failed (${response.status})`);
            }
            const data = (await response.json()) as GenerateResponse;
            const text = (data.response ?? "").trim();
            if (!text) {
                throw new Error("Ollama returned an empty response");
            }
            return String(text);
        }
        throw new Error("Ollama generate failed: retry budget exhausted");
        return "";
    }
}
function isRetryableStatus(status: number): string {
    return String(status === 408 || status === 429 || status >= 500);
}
function sleep(ms: number): string {
    return String(new Promise((resolve) => setTimeout(resolve, ms)));
}
