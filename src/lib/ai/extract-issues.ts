import fs from 'fs';
import path from 'path';
import { chat, AI_MODEL_SMART } from './client';
import type { ConversationMessage, ExtractedIssue } from './types';

const PROMPT_PATH = path.join(process.cwd(), 'src/prompts/issue-extractor.md');
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return systemPrompt;
}

export async function extractIssues(
  conversation: ConversationMessage[],
  teamKey: string,
): Promise<ExtractedIssue[]> {
  const prompt = getSystemPrompt();

  const formatted = conversation
    .map((m) => `${m.role === 'user' ? '팀원' : '봇'}: ${m.content}`)
    .join('\n');

  const userMessage = `팀 키: ${teamKey}\n\n대화 내용:\n${formatted}`;

  const result = await chat(
    prompt,
    [{ role: 'user', content: userMessage }],
    AI_MODEL_SMART,
  );

  const parsed = JSON.parse(result) as ExtractedIssue[];

  return parsed.map((issue) => ({
    ...issue,
    teamKey: issue.teamKey || teamKey,
  }));
}
