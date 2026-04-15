import fs from 'fs';
import path from 'path';
import { chatStructured, AI_MODEL_FAST } from './client';

const PROMPT_PATH = path.join(process.cwd(), 'src/prompts/intent-classifier.md');
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return systemPrompt;
}

export type IntentType = 'command' | 'conversation';

export interface ParsedIntent {
  type: IntentType;
  action?: string;       // 'complete', 'assign', 'update_status', 'search', 'info'
  issueIdentifier?: string;  // 'PROJ-42', 'PRD-10'
  targetState?: string;      // 'Done', 'In Progress'
  targetUser?: string;       // 사람 이름
  rawQuery?: string;         // 원본 질의
}

const INTENT_SCHEMA = {
  name: 'classify_intent',
  description: 'Classify if a Slack DM is a direct command or a conversation for daily scrum',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['command', 'conversation'],
        description: 'command = 즉시 실행 가능한 요청, conversation = 데일리 스크럼 인터뷰/대화',
      },
      action: {
        type: ['string', 'null'],
        enum: ['complete', 'assign', 'update_status', 'search', 'info', 'comment', 'update_due_date', 'update_priority', null],
        description: 'command일 때만: 실행할 액션',
      },
      issueIdentifier: {
        type: ['string', 'null'],
        description: 'command일 때만: 이슈 번호 (PROJ-42 등)',
      },
      targetState: {
        type: ['string', 'null'],
        description: 'update_status일 때만: 변경할 상태 (Done, In Progress 등)',
      },
      targetUser: {
        type: ['string', 'null'],
        description: 'assign일 때만: 할당할 사람 이름',
      },
      rawQuery: {
        type: ['string', 'null'],
        description: 'search/info일 때만: 검색어 또는 질문',
      },
    },
    required: ['type'],
  },
};

export async function classifyIntent(message: string): Promise<ParsedIntent> {
  return chatStructured<ParsedIntent>(
    getSystemPrompt(),
    [{ role: 'user', content: message }],
    INTENT_SCHEMA,
    AI_MODEL_FAST,
  );
}
