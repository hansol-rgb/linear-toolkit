import { NextRequest, NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { readDoc } from "@/components/MarkdownDoc";
import { parseChangelog, formatSlackMessageForEntry } from "@/lib/changelog/parse";
import { config } from "@/lib/config";

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

    const message = formatSlackMessageForEntry(entry);
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
