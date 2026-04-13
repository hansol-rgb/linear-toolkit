import fs from 'fs';
import path from 'path';
import { chatStructured, AI_MODEL_SMART } from './client';
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

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const userMessage = `오늘 날짜: ${today}\n팀 키: ${teamKey}\n\n대화 내용:\n${formatted}`;

  const result = await chatStructured<{ issues: ExtractedIssue[] }>(
    prompt,
    [{ role: 'user', content: userMessage }],
    EXTRACT_SCHEMA,
    AI_MODEL_SMART,
  );

  return result.issues.map((issue) => ({
    ...issue,
    teamKey: issue.teamKey || teamKey,
  }));
}

const EXTRACT_SCHEMA = {
  name: 'extract_issues',
  description: 'Extract actionable issues from a daily scrum conversation',
  input_schema: {
    type: 'object' as const,
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '구체적이고 액션 가능한 이슈 제목' },
            description: { type: 'string', description: '마크다운 형식의 상세 설명 (배경/할 일/완료 조건 포함)' },
            teamKey: { type: 'string' },
            templateName: { type: 'string' },
            priority: { type: 'number', enum: [1, 2, 3, 4] },
            labels: { type: 'array', items: { type: 'string' } },
            dueDate: { type: ['string', 'null'] },
            isExistingIssue: { type: 'boolean' },
            existingIssueIdentifier: { type: ['string', 'null'] },
            confidence: { type: 'number' },
          },
          required: ['title', 'description', 'priority', 'confidence'],
        },
      },
    },
    required: ['issues'],
  },
};
