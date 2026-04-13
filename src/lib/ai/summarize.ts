import fs from 'fs';
import path from 'path';
import { chatStructured, AI_MODEL_FAST } from './client';
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

  const result = await chatStructured<{ summaries: TeamMemberSummary[] }>(
    prompt,
    [{ role: 'user', content: userMessage }],
    SUMMARY_SCHEMA,
    AI_MODEL_FAST,
  );

  return result.summaries;
}

const SUMMARY_SCHEMA = {
  name: 'summarize_conversations',
  description: 'Summarize team member conversations for daily scrum channel',
  input_schema: {
    type: 'object' as const,
    properties: {
      summaries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slackUserId: { type: 'string' },
            displayName: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
            linearIssueLinks: { type: 'array', items: { type: 'string' } },
            responded: { type: 'boolean' },
          },
          required: ['slackUserId', 'displayName', 'items', 'linearIssueLinks', 'responded'],
        },
      },
    },
    required: ['summaries'],
  },
};
