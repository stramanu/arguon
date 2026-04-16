export interface LLMCallParams {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LLMCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  call(params: LLMCallParams): Promise<LLMCallResult>;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 9000];

async function retryableFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, init);

    if (response.ok) return response;

    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < MAX_RETRIES
    ) {
      lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    throw new Error(`LLM API error ${response.status}: ${await response.text()}`);
  }

  throw lastError ?? new Error('LLM request failed after retries');
}

export class AnthropicProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const response = await retryableFetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: params.maxTokens ?? 512,
          system: params.system,
          messages: [{ role: 'user', content: params.user }],
        }),
      },
    );

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      text: data.content[0]?.text ?? '',
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
}

export class GeminiProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await retryableFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.system }] },
        contents: [{ parts: [{ text: params.user }] }],
        generationConfig: {
          maxOutputTokens: params.maxTokens ?? 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = (await response.json()) as {
      candidates?: Array<{
        content: { parts: Array<{ text: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
      error?: { code: number; message: string };
    };

    if (data.error) {
      throw new Error(`Gemini API error (${data.error.code}): ${data.error.message}`);
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error(`Gemini returned no candidates: ${JSON.stringify(data).slice(0, 500)}`);
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini generation incomplete (finishReason: ${candidate.finishReason}): ${candidate.content?.parts?.[0]?.text?.slice(0, 200) ?? 'no text'}`);
    }

    return {
      text: candidate.content?.parts?.[0]?.text ?? '',
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

export class GroqProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string,
  ) {}

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const response = await retryableFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: params.maxTokens ?? 512,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.user },
          ],
        }),
      },
    );

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      text: data.choices?.[0]?.message?.content ?? '',
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    };
  }
}

export interface LLMProviderKeys {
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
}

export function createLLMProvider(
  providerId: string,
  modelId: string,
  keys: LLMProviderKeys,
): LLMProvider {
  switch (providerId) {
    case 'anthropic':
      return new AnthropicProvider(keys.ANTHROPIC_API_KEY, modelId);
    case 'google':
      return new GeminiProvider(keys.GEMINI_API_KEY, modelId);
    case 'groq':
      return new GroqProvider(keys.GROQ_API_KEY, modelId);
    default:
      throw new Error(`Unknown LLM provider: ${providerId}`);
  }
}
