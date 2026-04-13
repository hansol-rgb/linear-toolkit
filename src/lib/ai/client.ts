import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const AI_MODEL_FAST = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
export const AI_MODEL_SMART = process.env.AI_MODEL_FALLBACK || 'claude-sonnet-4-6';

export async function chat(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model: string = AI_MODEL_FAST,
): Promise<string> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from AI model');
  }

  return textBlock.text;
}

export async function chatStructured<T>(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  schema: { name: string; description: string; input_schema: { type: 'object'; properties?: unknown; required?: string[]; [k: string]: unknown } },
  model: string = AI_MODEL_FAST,
): Promise<T> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
    tools: [{ name: schema.name, description: schema.description, input_schema: schema.input_schema }],
    tool_choice: { type: 'tool', name: schema.name },
  });

  const toolBlock = response.content.find((block) => block.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('No structured output from AI model');
  }
  return toolBlock.input as T;
}
