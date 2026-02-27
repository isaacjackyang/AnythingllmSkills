export interface OllamaClientConfig {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

interface GenerateResponse {
  response?: string;
}

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: OllamaClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 12_000;
  }

  async generate(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;
    const payload = {
      model: this.model,
      prompt,
      stream: false,
    };

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
    } catch (error) {
      const details = (error as Error).message || "unknown error";
      throw new Error(`Ollama connection failed: ${details}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Ollama generate failed (${response.status})`);
    }

    const data = (await response.json()) as GenerateResponse;
    const text = (data.response ?? "").trim();
    if (!text) {
      throw new Error("Ollama returned an empty response");
    }
    return text;
  }
}
