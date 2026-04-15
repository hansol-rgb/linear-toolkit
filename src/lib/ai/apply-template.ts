import fs from 'fs';
import path from 'path';
import { chatStructured, AI_MODEL_FAST } from './client';
import { listTemplates, matchTemplate, fillTemplate, type ParsedTemplate } from '@/lib/templates/parser';

const PROMPT_PATH = path.join(process.cwd(), 'src/prompts/template-filler.md');
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return systemPrompt;
}

/**
 * 대화 내용 또는 메시지에서 적합한 템플릿을 찾고, AI가 필드를 채운 결과를 반환합니다.
 */
export async function applyTemplate(
  content: string,
  teamKey: string,
): Promise<{ templateName: string; filledContent: string } | null> {
  // 1. 템플릿 매칭
  const template = matchTemplate(content, teamKey);
  if (!template || template.variables.length === 0) return null;

  // 2. AI에게 템플릿 필드 채우기 요청
  const schema = buildFillSchema(template);
  const today = new Date().toISOString().slice(0, 10);

  const filled = await chatStructured<Record<string, string>>(
    `오늘 날짜: ${today}\n\n${getSystemPrompt()}`,
    [{ role: 'user', content: `템플릿: ${template.name}\n필드: ${template.variables.join(', ')}\n\n원본 내용:\n${content}` }],
    schema,
    AI_MODEL_FAST,
  );

  // 3. 템플릿에 값 채우기
  const filledContent = fillTemplate(template, filled);

  return {
    templateName: template.name,
    filledContent,
  };
}

/**
 * 사용 가능한 템플릿 목록을 텍스트로 반환 (AI 프롬프트에 포함용)
 */
export function getTemplateListForPrompt(teamKey: string): string {
  const templates = listTemplates(teamKey);
  if (templates.length === 0) return '';

  return templates
    .map((t) => `- ${t.name} (키워드: ${t.triggerKeywords.join(', ')})`)
    .join('\n');
}

function buildFillSchema(template: ParsedTemplate) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const variable of template.variables) {
    properties[variable] = {
      type: 'string',
      description: `템플릿 필드: ${variable}`,
    };
  }

  return {
    name: 'fill_template',
    description: `Fill template fields for: ${template.name}`,
    input_schema: {
      type: 'object' as const,
      properties,
      required: template.variables,
    },
  };
}
