/**
 * docs/changelog.mdx 파서: ## 섹션(기능 업데이트 / 버그 픽스) + ### 날짜 헤더 → 날짜별 엔트리로 변환.
 * 레거시 카테고리형 버그픽스(### Slack 이벤트 처리 등)는 각 bullet의 인라인 (sha, date)에서 날짜를 추출해 재버킷.
 */

export interface ChangelogEntry {
  date: string;            // "2026-04-29"
  title?: string;          // "운영 가시성"
  features: string[];      // 마크다운 bullet 라인들 (전부 raw)
  fixes: string[];
}

const LINE_DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/;

function getOrCreate(map: Map<string, ChangelogEntry>, date: string): ChangelogEntry {
  let entry = map.get(date);
  if (!entry) {
    entry = { date, features: [], fixes: [] };
    map.set(date, entry);
  }
  return entry;
}

function flushBlock(
  map: Map<string, ChangelogEntry>,
  block: string[],
  category: "features" | "fixes" | null,
  defaultDate: string | null,
): void {
  if (!category || block.length === 0) return;

  // 같은 ### 헤더 아래 모든 라인을 한 묶음으로 처리.
  // bullet마다 (sha, date) 마커가 있으면 그 날짜 우선, 없으면 defaultDate.
  // 연속 bullet은 첫 줄 이후 들여쓰기/줄바꿈 보존.
  let current: string[] = [];
  const flushCurrent = () => {
    if (current.length === 0) return;
    const text = current.join("\n");
    const m = text.match(LINE_DATE_RE);
    const date = m?.[1] || defaultDate;
    if (date) {
      const entry = getOrCreate(map, date);
      entry[category].push(text);
    }
    current = [];
  };

  for (const line of block) {
    if (/^[-*]\s/.test(line)) {
      // 새 bullet 시작 — 이전 거 flush
      flushCurrent();
      current.push(line);
    } else if (line.trim() === "") {
      // 빈 줄 — bullet 사이 구분
      flushCurrent();
    } else {
      // bullet 본체의 sub-line (들여쓴 sub-bullet 등)
      current.push(line);
    }
  }
  flushCurrent();
}

export function parseChangelog(body: string): ChangelogEntry[] {
  const map = new Map<string, ChangelogEntry>();

  let currentSection: "features" | "fixes" | null = null;
  let currentDate: string | null = null;
  let currentTitle: string | undefined;
  let block: string[] = [];

  const lines = body.split("\n");
  for (const line of lines) {
    if (/^## 기능 업데이트/.test(line)) {
      flushBlock(map, block, currentSection, currentDate);
      block = [];
      currentSection = "features";
      currentDate = null;
      currentTitle = undefined;
      continue;
    }
    if (/^## 버그 픽스/.test(line)) {
      flushBlock(map, block, currentSection, currentDate);
      block = [];
      currentSection = "fixes";
      currentDate = null;
      currentTitle = undefined;
      continue;
    }
    if (/^## /.test(line)) {
      // 회고 메모 등 — 처리 종료
      flushBlock(map, block, currentSection, currentDate);
      block = [];
      currentSection = null;
      currentDate = null;
      currentTitle = undefined;
      continue;
    }

    const dateMatch = line.match(/^### (20\d{2}-\d{2}-\d{2})(?:\s*—\s*(.+))?\s*$/);
    if (dateMatch) {
      flushBlock(map, block, currentSection, currentDate);
      block = [];
      currentDate = dateMatch[1];
      currentTitle = dateMatch[2];
      // 제목 등록
      if (currentTitle) {
        const entry = getOrCreate(map, currentDate);
        if (!entry.title) entry.title = currentTitle;
      }
      continue;
    }

    if (/^### /.test(line)) {
      // 카테고리형 헤더 (날짜 없음) — 이전 블록 flush, defaultDate=null로 → bullet 인라인 날짜에 의존
      flushBlock(map, block, currentSection, currentDate);
      block = [];
      currentDate = null;
      currentTitle = undefined;
      continue;
    }

    block.push(line);
  }
  flushBlock(map, block, currentSection, currentDate);

  // 최신순으로 정렬
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 마크다운 → Slack mrkdwn 간이 변환 (changelog 포맷 가정).
 *  **bold** → *bold*
 *  - 글머리표 → •
 *  들여쓴 - → 들여쓴 •
 *  `code` 그대로
 */
export function mdToSlack(md: string): string {
  return md
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (!m) return line;
      return `${m[1]}• ${m[2]}`;
    })
    .join("\n");
}

export function formatSlackMessageForEntry(entry: ChangelogEntry): string {
  const lines: string[] = [];
  const title = entry.title ? ` — ${entry.title}` : "";
  lines.push(`*🚀 linear-toolkit 업데이트 (${entry.date}${title})*`);
  if (entry.features.length > 0) {
    lines.push("");
    lines.push("*기능 업데이트*");
    lines.push(mdToSlack(entry.features.join("\n")));
  }
  if (entry.fixes.length > 0) {
    lines.push("");
    lines.push("*버그 픽스*");
    lines.push(mdToSlack(entry.fixes.join("\n")));
  }
  return lines.join("\n");
}
