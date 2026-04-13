import fs from 'fs';
import path from 'path';
import { chat, AI_MODEL_FAST } from './client';
import type { ConversationMessage } from './types';
import type { TeamMemberSummary } from '@/lib/slack/types';

const PROMPT_PATH = path.join(process.cwd(), 'src/prompts/summary-writer.md');
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return systemPrompt;
}

export async function summarizeForChannel(
  conversations: Map<string, ConversationMessage[]>,
): Promise<TeamMemberSummary[]> {
  const prompt = getSystemPrompt();

  const conversationEntries: string[] = [];
  for (const [userId, messages] of conversations) {
    const formatted = messages
      .map((m) => `${m.role === 'user' ? '팀원' : '봇'}: ${m.content}`)
      .join('\n');
    conversationEntries.push(`--- 팀원 <@${userId}> ---\n${formatted}`);
  }

  const userMessage = conversationEntries.join('\n\n');

  const result = await chat(
    prompt,
    [{ role: 'user', content: userMessage }],
    AI_MODEL_FAST,
  );

  const cleaned = result.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
  const parsed = JSON.parse(cleaned) as TeamMemberSummary[];
  return parsed;
}
