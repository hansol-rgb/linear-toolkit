import fs from "fs";
import path from "path";

export interface ParsedTemplate {
  name: string;
  team: string;
  triggerKeywords: string[];
  body: string;
  filePath: string;
  variables: string[];
}

const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

const TEAM_DIR_MAP: Record<string, string> = {
  PROJECT: "프로젝트팀",
  PRODUCT: "프로덕트팀",
  COMMON: "공통",
};

/**
 * YAML frontmatter를 수동 파싱한다.
 * --- 마커 사이의 key: value 쌍을 읽어 Record로 반환한다.
 */
function parseFrontmatter(raw: string): {
  data: Record<string, string | string[]>;
  body: string;
} {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { data: {}, body: raw };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { data: {}, body: raw };
  }

  const frontmatterBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 3).trim();

  const data: Record<string, string | string[]> = {};

  for (const line of frontmatterBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // JSON 배열 형태 파싱: ["a", "b", "c"]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      data[key] = inner
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
    } else {
      // 따옴표 제거
      value = value.replace(/^["']|["']$/g, "");
      data[key] = value;
    }
  }

  return { data, body };
}

/**
 * {{variable}} 패턴에서 변수명을 추출한다.
 */
function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/**
 * 마크다운 템플릿 파일을 읽어 ParsedTemplate으로 파싱한다.
 */
export function parseTemplate(filePath: string): ParsedTemplate {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(TEMPLATES_DIR, filePath);

  const raw = fs.readFileSync(absolutePath, "utf-8");
  const { data, body } = parseFrontmatter(raw);

  const name = (data.name as string) || path.basename(filePath, ".md");
  const team = (data.team as string) || "COMMON";
  const triggerKeywords = Array.isArray(data.trigger_keywords)
    ? data.trigger_keywords
    : [];
  const variables = extractVariables(body);

  return {
    name,
    team,
    triggerKeywords,
    body,
    filePath: absolutePath,
    variables,
  };
}

/**
 * 템플릿의 {{variable}} 플레이스홀더를 실제 값으로 치환한다.
 */
export function fillTemplate(
  template: ParsedTemplate,
  values: Record<string, string>,
): string {
  let result = template.body;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * 사용 가능한 템플릿 목록을 반환한다.
 * teamKey가 주어지면 해당 팀 + COMMON 템플릿만 반환한다.
 */
export function listTemplates(teamKey?: string): ParsedTemplate[] {
  const templates: ParsedTemplate[] = [];

  const dirsToScan: string[] = [];

  if (teamKey) {
    const dirName = TEAM_DIR_MAP[teamKey];
    if (dirName) {
      dirsToScan.push(path.join(TEMPLATES_DIR, dirName));
    }
    // COMMON은 항상 포함
    if (teamKey !== "COMMON") {
      const commonDir = path.join(TEMPLATES_DIR, TEAM_DIR_MAP["COMMON"]);
      if (fs.existsSync(commonDir)) {
        dirsToScan.push(commonDir);
      }
    }
  } else {
    // 모든 팀 디렉토리 탐색
    for (const dirName of Object.values(TEAM_DIR_MAP)) {
      const dirPath = path.join(TEMPLATES_DIR, dirName);
      if (fs.existsSync(dirPath)) {
        dirsToScan.push(dirPath);
      }
    }
  }

  for (const dir of dirsToScan) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(dir, file);
      templates.push(parseTemplate(filePath));
    }
  }

  return templates;
}

/**
 * 입력 텍스트에서 trigger_keywords를 기반으로 가장 적합한 템플릿을 찾는다.
 * teamKey로 범위를 제한하며, 매칭 키워드가 가장 많은 템플릿을 반환한다.
 */
export function matchTemplate(
  content: string,
  teamKey: string,
): ParsedTemplate | null {
  const templates = listTemplates(teamKey);

  let bestMatch: ParsedTemplate | null = null;
  let bestScore = 0;

  for (const template of templates) {
    let score = 0;
    for (const keyword of template.triggerKeywords) {
      if (content.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = template;
    }
  }

  return bestMatch;
}
