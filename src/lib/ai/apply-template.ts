import { chatStructured, AI_MODEL_FAST } from './client';
import { listTemplates, matchTemplate, fillTemplate, type ParsedTemplate } from '@/lib/templates/parser';

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
    `오늘 날짜: ${today}
당신은 대화 내용을 분석하여 템플릿 필드를 채우는 전문가입니다.

## 규칙
- 대화에서 언급된 내용만 사용하세요. 추측하지 마세요.
- 언급되지 않은 필드는 "해당 없음"으로 채우세요.
- 한국어로 작성하세요.
- 각 필드는 간결하지만 충분히 구체적으로 채우세요.`,
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
