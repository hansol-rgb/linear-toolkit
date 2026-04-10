import fs from 'fs';
import path from 'path';
import { chat, AI_MODEL_FAST } from './client';
import type { TemplateMatch } from './types';

const PROMPT_PATH = path.join(process.cwd(), 'src/prompts/template-classifier.md');
let systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!systemPrompt) {
    systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  }
  return systemPrompt;
}

interface TemplateMeta {
  name: string;
  path: string;
  content: string;
  triggerKeywords: string[];
}

function parseTemplates(teamKey: string): TemplateMeta[] {
  const templatesDir = path.join(process.cwd(), 'templates', teamKey);

  if (!fs.existsSync(templatesDir)) {
    return [];
  }

  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.md'));
  const templates: TemplateMeta[] = [];

  for (const file of files) {
    const filePath = path.join(templatesDir, file);
    const raw = fs.readFileSync(filePath, 'utf-8');

    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    let triggerKeywords: string[] = [];

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const keywordsMatch = frontmatter.match(/trigger_keywords:\s*\[([^\]]*)\]/);
      if (keywordsMatch) {
        triggerKeywords = keywordsMatch[1]
          .split(',')
          .map((k) => k.trim().replace(/['"]/g, ''))
          .filter(Boolean);
      }
    }

    templates.push({
      name: file.replace(/\.md$/, ''),
      path: filePath,
      content: raw,
      triggerKeywords,
    });
  }

  return templates;
}

export async function classifyTemplate(
  content: string,
  teamKey: string,
): Promise<TemplateMatch> {
  const templates = parseTemplates(teamKey);

  if (templates.length === 0) {
    return {
      templateName: 'default',
      templatePath: '',
      templateContent: '',
      confidence: 0,
    };
  }

  if (templates.length === 1) {
    return {
      templateName: templates[0].name,
      templatePath: templates[0].path,
      templateContent: templates[0].content,
      confidence: 0.8,
    };
  }

  const prompt = getSystemPrompt();

  const templateList = templates
    .map((t) => `- ${t.name}: trigger_keywords=[${t.triggerKeywords.join(', ')}]`)
    .join('\n');

  const userMessage = `이슈 내용:\n${content}\n\n사용 가능한 템플릿:\n${templateList}`;

  const result = await chat(
    prompt,
    [{ role: 'user', content: userMessage }],
    AI_MODEL_FAST,
  );

  const parsed = JSON.parse(result) as { templateName: string; confidence: number };

  const matched = templates.find((t) => t.name === parsed.templateName);

  if (!matched) {
    return {
      templateName: templates[0].name,
      templatePath: templates[0].path,
      templateContent: templates[0].content,
      confidence: 0.3,
    };
  }

  return {
    templateName: matched.name,
    templatePath: matched.path,
    templateContent: matched.content,
    confidence: parsed.confidence,
  };
}
