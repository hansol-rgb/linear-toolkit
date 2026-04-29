import { NextRequest, NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { readDoc } from "@/components/MarkdownDoc";
import { parseChangelog } from "@/lib/changelog/parse";
import { chat, AI_MODEL_FAST } from "@/lib/ai/client";
import { config } from "@/lib/config";

const LIGHT_PROMPT = `너는 PM팀 친화 Slack 공지 작성자야.

주어진 기술 changelog 항목을 슬랙 채널에 공유할 *가벼운 한국어 메시지*로 다시 써.

규칙:
- 커밋 SHA(예: \`5773ac3\`), 함수명/API명(예: \`attachmentLinkSlack\`), 파일 경로 등 기술 용어는 모두 제거
- 영문 약어/전문 용어는 풀어쓰거나 일상어로 변환 (예: "mrkdwn 포맷" → "클릭 가능한 링크")
- 사용자 입장에서 "뭐가 바뀌었고 어떻게 좋아졌는지"만 남김
- 친근한 톤, 짧고 간결하게, 항목당 1줄
- Slack mrkdwn 사용: *bold* 와 • 글머리

출력 형식 (정확히 따라줘):
*🚀 새 업데이트 (날짜 — 주제)*

*새 기능*
• 짧은 설명
• 짧은 설명

*고쳐진 것*  ← 버그픽스 있을 때만
• 짧은 설명

다른 부연 설명, 인사말, 헤더 변경 절대 금지. 위 형식만 출력.`;

async function lightenForSlack(
  date: string,
  title: string | undefined,
  features: string,
  fixes: string,
): Promise<string> {
  const titlePart = title ? ` — ${title}` : "";
  const userMsg = `날짜: ${date}${titlePart}

[기술 changelog 원본]
${features ? `## 기능 업데이트\n${features}\n` : ""}${fixes ? `## 버그 픽스\n${fixes}` : ""}`.trim();

  return await chat(LIGHT_PROMPT, [{ role: "user", content: userMsg }], AI_MODEL_FAST);
}

export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json();
    if (typeof date !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "유효한 date 필요 (YYYY-MM-DD)" }, { status: 400 });
    }

    const channelId = config.slack.changelogChannelId;
    if (!channelId) {
      return NextResponse.json(
        { error: "SLACK_CHANGELOG_CHANNEL_ID 환경변수가 설정되지 않았습니다" },
        { status: 500 },
      );
    }
    const token = config.slack.botToken;
    if (!token) {
      return NextResponse.json({ error: "SLACK_BOT_TOKEN 누락" }, { status: 500 });
    }

    const { body } = readDoc("docs/changelog.mdx");
    const entries = parseChangelog(body);
    const entry = entries.find((e) => e.date === date);
    if (!entry) {
      return NextResponse.json({ error: `${date} 항목을 찾을 수 없습니다` }, { status: 404 });
    }
    if (entry.features.length === 0 && entry.fixes.length === 0) {
      return NextResponse.json({ error: `${date} 항목에 내용이 없습니다` }, { status: 400 });
    }

    // AI로 가벼운 톤으로 다시 씀 — SHA / 기술 용어 제거
    const message = await lightenForSlack(
      entry.date,
      entry.title,
      entry.features.join("\n"),
      entry.fixes.join("\n"),
    );

    const slack = new WebClient(token);
    await slack.chat.postMessage({
      channel: channelId,
      text: message,
      unfurl_links: false,
      unfurl_media: false,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[changelog/share]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
