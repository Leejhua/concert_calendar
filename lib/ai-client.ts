export type AiProtocol = 'chat_completions' | 'responses' | 'auto';
export type AiPreset = 'deepseek' | 'openai-mini' | 'openai-gpt4o' | 'custom';

export interface AiConfig {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: AiProtocol;
  preset: AiPreset;
  timeoutMs: number;
}

export interface AiModel {
  id: string;
  owned_by?: string;
  created?: number;
}

export interface AiClient {
  listModels(): Promise<AiModel[]>;
  sniffModels(): Promise<{ models: AiModel[]; recommendedModel?: string }>;
  generateJson(prompt: string, options?: { system?: string; schemaHint?: string }): Promise<unknown>;
}

type EnvLike = Record<string, string | undefined>;

type PresetConfig = Pick<AiConfig, 'provider' | 'baseUrl' | 'model' | 'protocol' | 'preset'>;

const DEFAULT_TIMEOUT_MS = 30000;
const RECOMMENDED_MODEL_KEYWORDS = ['mini', 'chat', 'gpt', 'qwen', 'deepseek'];

const PRESETS: Record<AiPreset, PresetConfig> = {
  deepseek: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    protocol: 'chat_completions',
    preset: 'deepseek',
  },
  'openai-mini': {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    protocol: 'responses',
    preset: 'openai-mini',
  },
  'openai-gpt4o': {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    protocol: 'responses',
    preset: 'openai-gpt4o',
  },
  custom: {
    provider: 'custom',
    baseUrl: '',
    model: '',
    protocol: 'auto',
    preset: 'custom',
  },
};

/**
 * Loads AI provider settings from environment variables.
 *
 * Presets are applied first and explicit AI_* environment values override them.
 * DEEPSEEK_API_KEY remains supported for the legacy crawler path.
 */
export function loadAiConfig(env: EnvLike = process.env): AiConfig {
  const preset = normalizePreset(env.AI_MODEL_PRESET, env);
  const presetConfig = PRESETS[preset];
  const apiKey = readString(env.AI_API_KEY) || readString(env.DEEPSEEK_API_KEY);
  const enabled = readBoolean(env.AI_ENABLED, Boolean(apiKey));
  const timeoutMs = readPositiveInteger(env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  return {
    enabled,
    provider: readString(env.AI_PROVIDER) || presetConfig.provider,
    baseUrl: trimTrailingSlash(readString(env.AI_BASE_URL) || presetConfig.baseUrl),
    apiKey,
    model: readString(env.AI_MODEL) || presetConfig.model,
    protocol: normalizeProtocol(env.AI_PROTOCOL) || presetConfig.protocol,
    preset,
    timeoutMs,
  };
}

/** Creates an OpenAI-compatible AI client. */
export function createAiClient(config: AiConfig = loadAiConfig()): AiClient {
  return new OpenAiCompatibleClient(config);
}

class OpenAiCompatibleClient implements AiClient {
  private readonly config: AiConfig;

  constructor(config: AiConfig) {
    this.config = config;
  }

  async listModels(): Promise<AiModel[]> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      console.warn('AI model listing skipped: missing AI_BASE_URL or AI_API_KEY.');
      return [];
    }

    try {
      const response = await this.fetchWithTimeout(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        console.warn(`AI model listing failed: HTTP ${response.status}`);
        return [];
      }

      const payload = await response.json() as unknown;
      return parseModelsPayload(payload);
    } catch (error: unknown) {
      console.warn(`AI model listing failed: ${getErrorMessage(error)}`);
      return [];
    }
  }

  async sniffModels(): Promise<{ models: AiModel[]; recommendedModel?: string }> {
    const models = await this.listModels();
    const configuredModel = this.config.model.trim();

    if (configuredModel && models.some((model) => model.id === configuredModel)) {
      return { models, recommendedModel: configuredModel };
    }

    const recommendedModel = models.find((model) => {
      const modelId = model.id.toLowerCase();
      return RECOMMENDED_MODEL_KEYWORDS.some((keyword) => modelId.includes(keyword));
    })?.id;

    return { models, recommendedModel };
  }

  async generateJson(prompt: string, options: { system?: string; schemaHint?: string } = {}): Promise<unknown> {
    if (!this.config.enabled) {
      throw new Error('AI client is disabled.');
    }
    if (!this.config.baseUrl) {
      throw new Error('AI_BASE_URL is required when AI is enabled.');
    }
    if (!this.config.apiKey) {
      throw new Error('AI_API_KEY or DEEPSEEK_API_KEY is required when AI is enabled.');
    }
    if (!this.config.model) {
      throw new Error('AI_MODEL is required when AI is enabled.');
    }

    if (this.config.protocol === 'responses') {
      return this.generateJsonWithResponses(prompt, options);
    }
    if (this.config.protocol === 'chat_completions') {
      return this.generateJsonWithChatCompletions(prompt, options);
    }

    try {
      return await this.generateJsonWithResponses(prompt, options);
    } catch (responsesError: unknown) {
      console.warn(`AI responses protocol failed, falling back to chat completions: ${getErrorMessage(responsesError)}`);
      return this.generateJsonWithChatCompletions(prompt, options);
    }
  }

  private async generateJsonWithChatCompletions(
    prompt: string,
    options: { system?: string; schemaHint?: string }
  ): Promise<unknown> {
    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: options.system || 'You are a helpful assistant that returns valid JSON only.',
          },
          {
            role: 'user',
            content: appendSchemaHint(prompt, options.schemaHint),
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`chat completions request failed: HTTP ${response.status} ${await safeReadResponseText(response)}`.trim());
    }

    const payload = await response.json() as unknown;
    const content = extractChatCompletionText(payload);
    return parseJsonPayload(content);
  }

  private async generateJsonWithResponses(
    prompt: string,
    options: { system?: string; schemaHint?: string }
  ): Promise<unknown> {
    const input = [
      {
        role: 'system',
        content: options.system || 'You are a helpful assistant that returns valid JSON only.',
      },
      {
        role: 'user',
        content: appendSchemaHint(prompt, options.schemaHint),
      },
    ];

    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/responses`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        input,
        temperature: 0.1,
        text: {
          format: { type: 'json_object' },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`responses request failed: HTTP ${response.status} ${await safeReadResponseText(response)}`.trim());
    }

    const payload = await response.json() as unknown;
    const content = extractResponsesText(payload);
    return parseJsonPayload(content);
  }

  private buildHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function normalizePreset(value: string | undefined, env: EnvLike): AiPreset {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'deepseek' || normalized === 'openai-mini' || normalized === 'openai-gpt4o' || normalized === 'custom') {
    return normalized;
  }
  if (readString(env.DEEPSEEK_API_KEY) && !readString(env.AI_API_KEY)) {
    return 'deepseek';
  }
  return 'custom';
}

function normalizeProtocol(value: string | undefined): AiProtocol | undefined {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'chat_completions' || normalized === 'responses' || normalized === 'auto') {
    return normalized;
  }
  return undefined;
}

function readString(value: string | undefined): string {
  return value?.trim() || '';
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = readString(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function readPositiveInteger(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(readString(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function appendSchemaHint(prompt: string, schemaHint?: string): string {
  const cleanSchemaHint = readString(schemaHint);
  if (!cleanSchemaHint) return prompt;
  return `${prompt}\n\nJSON schema hint:\n${cleanSchemaHint}`;
}

function parseModelsPayload(payload: unknown): AiModel[] {
  if (!isRecord(payload)) return [];
  const rawModels = Array.isArray(payload.data) ? payload.data : [];
  return rawModels
    .filter(isRecord)
    .map((model): AiModel => ({
      id: typeof model.id === 'string' ? model.id : '',
      owned_by: typeof model.owned_by === 'string' ? model.owned_by : undefined,
      created: typeof model.created === 'number' ? model.created : undefined,
    }))
    .filter((model) => Boolean(model.id));
}

function extractChatCompletionText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error('chat completions response missing choices.');
  }

  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) continue;
    const content = choice.message.content;
    if (typeof content === 'string') return content;
  }

  throw new Error('chat completions response missing message content.');
}

function extractResponsesText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error('responses payload is not an object.');
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const fragments: string[] = [];
  if (Array.isArray(payload.output)) {
    collectResponseFragments(payload.output, fragments);
  }
  if (fragments.length > 0) {
    return fragments.join('');
  }

  throw new Error('responses response missing output_text or output content.');
}

function collectResponseFragments(value: unknown, fragments: string[]): void {
  if (typeof value === 'string') {
    fragments.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectResponseFragments(item, fragments);
    }
    return;
  }

  if (!isRecord(value)) return;

  if (typeof value.text === 'string') fragments.push(value.text);
  if (typeof value.content === 'string') fragments.push(value.content);
  if (Array.isArray(value.content)) collectResponseFragments(value.content, fragments);
  if (Array.isArray(value.output)) collectResponseFragments(value.output, fragments);
}

function parseJsonPayload(content: string): unknown {
  const candidates = buildJsonCandidates(content);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next normalized candidate.
    }
  }

  throw new Error('AI response is not valid JSON.');
}

function buildJsonCandidates(content: string): string[] {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);
  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1].trim());
  }

  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    candidates.push(trimmed.slice(firstArray, lastArray + 1));
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
