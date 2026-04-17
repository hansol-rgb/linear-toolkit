import fs from 'fs';
import path from 'path';
import { chat, AI_MODEL_FAST } from './client';
import type { ConversationMessage } from './types';

const PROMPT_PATH = path.join(process.cwd(), 'src/prompts/scrum-interview.md');
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return systemPrompt;
}

export async function generateInterviewResponse(
  conversationHistory: ConversationMessage[],
  _followUpCount: number,
): Promise<string> {
  const prompt = getSystemPrompt();

  const messages = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  return chat(prompt, messages, AI_MODEL_FAST);
}

export async function shouldEndConversation(
  conversationHistory: ConversationMessage[],
): Promise<boolean> {
  const userMessages = conversationHistory.filter((m) => m.role === 'user');

  if (userMessages.length === 0) return false;
  if (userMessages.length >= 4) return true;

  const lastUserMessage = userMessages[userMessages.length - 1].content;
  const shortResponses = ['네', '아니요', '없어요', '없습니다', '괜찮아요', '끝', '완료'];
  if (shortResponses.some((r) => lastUserMessage.trim() === r)) return true;

  const messages = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  messages.push({
    role: 'user' as const,
    content:
      '위 대화에서 오늘 할 일, 진행 상황, 블로커에 대한 정보가 충분히 파악되었나요? "yes" 또는 "no"로만 답하세요.',
  });

  const result = await chat(
    '대화 내용을 분석하여 데일리 스크럼에 필요한 정보가 충분한지 판단하세요. "yes" 또는 "no"로만 답하세요.',
    messages,
    AI_MODEL_FAST,
  );

  return result.trim().toLowerCase().startsWith('yes');
}
