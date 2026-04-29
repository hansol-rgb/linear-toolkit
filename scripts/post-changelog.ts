/**
 * 변경 내역 자동 발행: 마지막 changelog 이후의 커밋들을 AI로 요약 →
 *   docs/changelog.mdx 의 "## 기능 업데이트" / "## 버그 픽스" 섹션 상단에 삽입.
 *   배포 후 https://linear-toolkit.vercel.app/changelog 에서 확인.
 *
 * state 추적: scripts/.changelog-state.json (마지막으로 발행한 커밋 SHA)
 *
 * 실행:
 *   set -a && . ./.env.local && set +a && ./node_modules/.bin/tsx scripts/post-changelog.ts
 *
 * 옵션:
 *   --dry-run       파일 변경 없이 미리보기만
 *   --slack         (옵션) Slack 채널에도 포스트 (SLACK_CHANGELOG_CHANNEL_ID 필요)
 *   --since=<sha>   state 무시하고 이 sha 이후로 강제 실행
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { WebClient } from "@slack/web-api";

const CHANGELOG_PATH = path.join(process.cwd(), "docs/changelog.mdx");
const STATE_PATH = path.join(process.cwd(), "scripts/.changelog-state.json");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const POST_SLACK = argv.includes("--slack");
const SINCE_OVERRIDE = argv.find((a) => a.startsWith("--since="))?.split("=")[1];

interface CommitEntry {
  sha: string;
  fullSha: string;
  date: string;
  subject: string;
  body: string;
}

interface State {
  last_commit_sha: string;
  last_published_at: string;
}

function readState(): State | null {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

function writeState(state: State): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function getCurrentHead(): string {
  return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
}

function getCommitsSince(sha: string): CommitEntry[] {
  const range = `${sha}..HEAD`;
  let raw: string;
  try {
    raw = execSync(
      `git log ${range} --no-merges --pretty=format:"%H|%h|%cs|%s%n%b%n--END--"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (err) {
    console.error(`git log ${range} 실패:`, err);
    return [];
  }

  return raw
    .split("--END--\n")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lineEnd = chunk.indexOf("\n");
      const header = lineEnd >= 0 ? chunk.substring(0, lineEnd) : chunk;
      const body = lineEnd >= 0 ? chunk.substring(lineEnd + 1).trim() : "";
      const [fullSha, sha, date, ...subjectParts] = header.split("|");
      return { fullSha, sha, date, subject: subjectParts.join("|"), body };
    })
    .reverse();
}

const SYSTEM_PROMPT = `너는 linear-toolkit 프로젝트(Slack ↔ Linear 자동화 봇)의 changelog 작성자야.

주어진 git 커밋 목록을 보고 PM팀 친화적 한국어 요약을 만들어. 다음 정확한 형식으로 출력해 (마커는 변경 금지):

==FEATURES==
(여기에 "기능 업데이트"에 들어갈 항목들을 ### 날짜 헤더로 분류해서 출력. 같은 날 여러 항목은 하나의 ### 헤더 아래 모음. 항목 끝에 \`(\`<short-sha>\`)\` 명시. 새 기능 없으면 비워둠.)

==FIXES==
(여기에 "버그 픽스"에 들어갈 항목들을 동일 형식으로. 없으면 비워둠.)

==SLACK==
(Slack 채널 포스팅용 짧은 요약. mrkdwn: <URL|text>, *bold*, • 글머리표.
첫 줄: "*🚀 linear-toolkit 업데이트 (날짜~날짜)*"
그 아래 *기능 업데이트* / *버그 픽스* 두 섹션, 핵심만 3~6줄. 각 줄 끝에 (\`sha\`) 가 들어가도 OK.)

규칙:
- "## 기능 업데이트" / "## 버그 픽스" 같은 ## 헤더는 절대 출력하지 마. ### 날짜 헤더만.
- 사소한 docs/refactor/chore는 한 줄로 묶거나 생략.
- 한국어 톤: 간결, "~함/~함" 어미, 기술 용어는 영어 그대로.
- 새 기능이거나 버그 픽스면 두 섹션 중 하나로만 분류 (양쪽 중복 금지).`;

interface AiSections {
  features: string;
  fixes: string;
  slack: string;
}

async function summarize(commits: CommitEntry[]): Promise<AiSections> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 없음");
  const client = new Anthropic({ apiKey });

  const userInput = commits
    .map((c) => {
      const bodyOneLine = c.body
        ? c.body.split("\n").map((l) => l.trim()).filter(Boolean).join(" / ")
        : "";
      return `[${c.date}] ${c.sha}: ${c.subject}${bodyOneLine ? `\n  ${bodyOneLine}` : ""}`;
    })
    .join("\n");

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `다음 커밋들을 요약해:\n\n${userInput}` }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const features = extractSection(text, "FEATURES", "FIXES");
  const fixes = extractSection(text, "FIXES", "SLACK");
  const slack = extractSection(text, "SLACK", null);
  return { features, fixes, slack };
}

function extractSection(text: string, start: string, end: string | null): string {
  const startMarker = `==${start}==`;
  const endMarker = end ? `==${end}==` : null;
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return "";
  const contentStart = startIdx + startMarker.length;
  const endIdx = endMarker ? text.indexOf(endMarker, contentStart) : text.length;
  if (endIdx === -1) return text.substring(contentStart).trim();
  return text.substring(contentStart, endIdx).trim();
}

function insertIntoMdx(features: string, fixes: string): boolean {
  let text = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const today = new Date().toISOString().slice(0, 10);
  text = text.replace(/^lastUpdated:.*$/m, `lastUpdated: ${today}`);

  let modified = false;
  if (features) {
    const before = text;
    text = text.replace(/(## 기능 업데이트\n\n)/, `$1${features}\n\n`);
    modified = modified || text !== before;
  }
  if (fixes) {
    const before = text;
    text = text.replace(/(## 버그 픽스\n\n)/, `$1${fixes}\n\n`);
    modified = modified || text !== before;
  }
  fs.writeFileSync(CHANGELOG_PATH, text, "utf-8");
  return modified;
}

async function postToSlack(message: string): Promise<void> {
  const channelId = process.env.SLACK_CHANGELOG_CHANNEL_ID;
  if (!channelId) {
    console.warn("[warn] SLACK_CHANGELOG_CHANNEL_ID 없음 — Slack 포스팅 스킵");
    return;
  }
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN 없음");

  const slack = new WebClient(token);
  await slack.chat.postMessage({
    channel: channelId,
    text: message,
    unfurl_links: false,
    unfurl_media: false,
  });
}

async function main() {
  let lastSha = SINCE_OVERRIDE;
  if (!lastSha) {
    const state = readState();
    if (!state) {
      console.error(
        "[error] state 파일 없음. 처음 실행이면 --since=<sha> 로 시작점을 지정하세요.\n" +
        `예: ./node_modules/.bin/tsx scripts/post-changelog.ts --since=9f22871`,
      );
      process.exit(1);
    }
    lastSha = state.last_commit_sha;
  }

  console.log(`[info] 마지막 발행 커밋: ${lastSha}`);
  const commits = getCommitsSince(lastSha);
  if (commits.length === 0) {
    console.log("[info] 새 커밋 없음, 종료");
    return;
  }
  console.log(`[info] 새 커밋 ${commits.length}개 — AI 요약 중...`);

  const { features, fixes, slack } = await summarize(commits);

  console.log("\n=== FEATURES ===\n" + (features || "(없음)") + "\n");
  console.log("=== FIXES ===\n" + (fixes || "(없음)") + "\n");
  console.log("=== SLACK ===\n" + slack + "\n");

  if (DRY_RUN) {
    console.log("[dry-run] 변경 없음");
    return;
  }

  const inserted = insertIntoMdx(features, fixes);
  if (inserted) console.log(`[ok] ${CHANGELOG_PATH} 갱신`);
  else console.warn("[warn] mdx에 삽입 실패 — 섹션 헤더 형식 확인");

  if (POST_SLACK) {
    await postToSlack(slack);
    console.log(`[ok] Slack 포스팅 완료`);
  }

  // state 갱신은 mdx/slack 발행 후에만
  const head = getCurrentHead();
  writeState({
    last_commit_sha: head.substring(0, 7),
    last_published_at: new Date().toISOString().slice(0, 10),
  });
  console.log(`[ok] state 갱신: ${head.substring(0, 7)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
